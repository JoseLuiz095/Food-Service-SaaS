import { appConfig, isSupabaseConfigured } from '../lib/config';
import { restFetch } from '../lib/supabaseRest';

type PwaNotificationOptions = {
  tag?: string;
  url?: string;
};

export type CustomerOrderNotificationStatus = 'unsupported' | 'blocked' | 'prompt' | 'enabled';

const CUSTOMER_ORDER_NOTIFICATION_PREFIX = 'foodweb_customer_order_notification_v1_';

const canNotify = () => typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';

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
export const subscribeToPwaPush = async (storeId?: string, userId?: string): Promise<PushSubscription> => {
  const status = pwaPushStatus();
  if (status === 'unsupported') throw new Error('Este navegador não oferece notificações push para o PWA. Instale o app pelo Chrome/Edge no Android.');
  if (status === 'not_configured') throw new Error('As notificações do telefone ainda não foram configuradas no servidor (VAPID).');
  const permission = await requestPwaNotificationPermission();
  if (permission !== 'granted') throw new Error('Permissão de notificações não concedida no telefone.');
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(appConfig.vapidPublicKey) as unknown as BufferSource });

  if (storeId && userId && isSupabaseConfigured) {
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('O navegador não retornou uma assinatura push válida.');
    await restFetch('food_push_subscriptions?on_conflict=store_id,endpoint', {
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
export const showPwaNotification = async (title: string, body: string, options: PwaNotificationOptions = {}): Promise<void> => {
  if (!canNotify()) return;
  const notificationOptions: NotificationOptions & { data?: { url: string } } = {
    body,
    icon: '/assets/food-logo.svg',
    badge: '/assets/food-logo.svg',
    tag: options.tag || title,
    data: { url: options.url || '/admin/pedidos' },
  };

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if (typeof registration.showNotification === 'function') {
        await registration.showNotification(title, notificationOptions);
        return;
      }
    }
    new Notification(title, notificationOptions);
  } catch {
    // A permissão pode ser revogada pelo sistema entre a checagem e a exibição.
  }
};
