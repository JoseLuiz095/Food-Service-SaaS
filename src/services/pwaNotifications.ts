import { appConfig, isSupabaseConfigured } from '../lib/config';
import { restFetch } from '../lib/supabaseRest';

type PwaNotificationOptions = {
  tag?: string;
  url?: string;
};

export type CustomerOrderNotificationStatus = 'unsupported' | 'blocked' | 'prompt' | 'enabled';

const CUSTOMER_ORDER_NOTIFICATION_PREFIX = 'foodweb_customer_order_notification_v1_';
const recentNotificationAt = new Map<string, number>();
const pendingNotifications = new Map<string, Promise<boolean>>();
const NOTIFICATION_DEDUP_WINDOW_MS = 3_000;

const canNotify = () => typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';

const readyPwaRegistration = (): Promise<ServiceWorkerRegistration> => new Promise((resolve, reject) => {
  const timer = window.setTimeout(() => reject(new Error('O app de notificações ainda não está pronto. Reabra a página e tente novamente.')), 10_000);
  navigator.serviceWorker.ready.then(registration => { window.clearTimeout(timer); resolve(registration); }, error => {
    window.clearTimeout(timer);
    reject(error);
  });
});

const safeNotificationUrl = (value?: string): string => {
  const fallback = '/admin/pedidos';
  try {
    const url = new URL(value || fallback, window.location.origin);
    if (url.origin === window.location.origin && !url.username && !url.password) return url.href;
  } catch { /* URLs inválidas voltam à área interna de pedidos. */ }
  return new URL(fallback, window.location.origin).href;
};

export const requestPwaNotificationPermission = async (): Promise<NotificationPermission | null> => {
  if (typeof window === 'undefined' || !('Notification' in window)) return null;
  if (Notification.permission === 'default') return Notification.requestPermission();
  return Notification.permission;
};

/**
 * Estado local da permissão para o acompanhamento de um pedido pelo cliente.
 * Não cria uma assinatura push no servidor: as assinaturas existentes são
 * exclusivas dos administradores autenticados da loja.
 */
export const customerOrderNotificationStatus = (orderId: string): CustomerOrderNotificationStatus => {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') return 'prompt';
  try {
    return localStorage.getItem(`${CUSTOMER_ORDER_NOTIFICATION_PREFIX}${orderId}`) === 'enabled' ? 'enabled' : 'prompt';
  } catch {
    return 'prompt';
  }
};

/**
 * Pede permissão apenas após o pedido já existir e registra a escolha neste
 * aparelho. Atualizações em segundo plano exigem uma assinatura push pública
 * específica para clientes, que ainda não faz parte da infraestrutura atual.
 */
export const enableCustomerOrderNotifications = async ({
  orderId,
  orderNumber,
  url,
}: {
  orderId: string;
  orderNumber: number;
  url: string;
}): Promise<CustomerOrderNotificationStatus> => {
  const permission = await requestPwaNotificationPermission();
  if (permission !== 'granted') return customerOrderNotificationStatus(orderId);

  try {
    localStorage.setItem(`${CUSTOMER_ORDER_NOTIFICATION_PREFIX}${orderId}`, 'enabled');
  } catch {
    // A confirmação visual continua válida mesmo se o navegador bloquear o storage local.
  }

  await showPwaNotification(
    `Pedido #${String(orderNumber).padStart(5, '0')} registrado`,
    'As notificações foram autorizadas neste aparelho.',
    { tag: `foodweb:customer-order:${orderId}`, url },
  );
  return 'enabled';
};

const decodeVapidKey = (value: string): Uint8Array => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value.replace(/-/g, '+').replace(/_/g, '/')}${padding}`;
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
};

export const pwaPushStatus = () => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported' as const;
  if (!appConfig.vapidPublicKey) return 'not_configured' as const;
  if (!('Notification' in window)) return 'unsupported' as const;
  if (Notification.permission === 'denied') return 'blocked' as const;
  return 'available' as const;
};

/** Solicita permissão, cria a assinatura Web Push e a vincula à loja/usuário autenticado. */
export const subscribeToPwaPush = async (storeId?: string, userId?: string, audience: 'admin' | 'student' = 'admin'): Promise<PushSubscription> => {
  const status = pwaPushStatus();
  if (status === 'unsupported') throw new Error('Este navegador não oferece notificações push. No iPhone/iPad, adicione o app à Tela de Início pelo Safari; no Android, instale pelo Chrome ou Edge.');
  if (status === 'not_configured') throw new Error('As notificações do telefone ainda não foram configuradas no servidor (VAPID).');
  const permission = await requestPwaNotificationPermission();
  if (permission !== 'granted') throw new Error('Permissão de notificações não concedida no telefone.');
  const registration = await readyPwaRegistration();
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(appConfig.vapidPublicKey) as unknown as BufferSource });

  if (storeId && userId && isSupabaseConfigured) {
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('O navegador não retornou uma assinatura push válida.');
    const subscriptionTable = audience === 'student' ? 'food_fitness_student_push_subscriptions' : 'food_push_subscriptions';
    await restFetch(`${subscriptionTable}?on_conflict=store_id,endpoint`, {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: {
        store_id: storeId,
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent.slice(0, 500),
        active: true,
      },
    });
  }
  return subscription;
};

/** Usa o service worker para seguir o padrão de notificações do PWA instalado. */
export const showPwaNotification = async (title: string, body: string, options: PwaNotificationOptions = {}): Promise<boolean> => {
  if (!canNotify()) return false;
  const tag = options.tag || title;
  const now = Date.now();
  const previous = recentNotificationAt.get(tag) || 0;
  // Realtime, polling e retry podem entregar o mesmo evento quase juntos.
  // O tag do navegador já substitui avisos antigos; este mapa evita sequer
  // abrir duas notificações durante a mesma janela de reconexão.
  if (now - previous < NOTIFICATION_DEDUP_WINDOW_MS) return true;
  const pending = pendingNotifications.get(tag);
  if (pending) return pending;
  if (recentNotificationAt.size > 200) {
    const cutoff = now - NOTIFICATION_DEDUP_WINDOW_MS;
    for (const [key, timestamp] of recentNotificationAt) if (timestamp < cutoff) recentNotificationAt.delete(key);
  }
  const notificationOptions: NotificationOptions & { data?: { url: string }; renotify?: boolean } = {
    body,
    icon: '/assets/vendeweb-icon-192.png',
    badge: '/assets/vendeweb-badge-96.png',
    tag,
    renotify: false,
    data: { url: safeNotificationUrl(options.url) },
  };

  // Compartilha a tentativa em andamento; uma falha não bloqueia nova tentativa.
  const delivery = Promise.resolve().then(async () => { try {
    if ('serviceWorker' in navigator) {
      const registration = await readyPwaRegistration();
      if (typeof registration.showNotification === 'function') {
        await registration.showNotification(title, notificationOptions);
        recentNotificationAt.set(tag, Date.now());
        return true;
      }
    }
    new Notification(title, notificationOptions);
    recentNotificationAt.set(tag, Date.now());
    return true;
  } catch {
    // A permissão pode ser revogada pelo sistema entre a checagem e a exibição.
    return false;
  } }).finally(() => { pendingNotifications.delete(tag); });
  pendingNotifications.set(tag, delivery);
  return delivery;
};
