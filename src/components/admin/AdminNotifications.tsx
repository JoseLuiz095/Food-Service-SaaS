import { Bell, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../contexts/StoreContext';
import { useAuth } from '../../contexts/AuthContext';
import { formatDateTimeBR } from '../../utils/format';
import { pwaPushStatus, requestPwaNotificationPermission, showPwaNotification, subscribeToPwaPush } from '../../services/pwaNotifications';
import { inventoryApi } from '../../services/inventoryApi';
import type { Order } from '../../types';

const seenReminderKey = (storeId: string, orderId: string, scheduledFor: string) => `foodweb-notification-reminder:${storeId}:${orderId}:${scheduledFor}`;

const playAlertSound = () => {
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 740;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.24);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.26);
    window.setTimeout(() => void context.close(), 400);
  } catch { /* Alguns navegadores bloqueiam áudio sem uma interação prévia. */ }
};

export function AdminNotifications() {
  const { settings, orders, loading, reloadAdmin } = useStore();
  const { user, membership } = useAuth();
  const initialized = useRef(false);
  const initializedStoreId = useRef('');
  const knownOrderIds = useRef(new Set<string>());
  const knownPaymentStatus = useRef(new Map<string, Order['paymentStatus']>());
  const pushSynced = useRef(false);
  const permissionAttemptedFor = useRef('');
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    // Aguarda o primeiro snapshot completo. Antes disso o contexto ainda tem
    // uma lista vazia; tratá-la como base fazia todos os pedidos históricos
    // parecerem novos assim que chegavam do Supabase.
    if (!settings.id || loading) return;
    if (!initialized.current || initializedStoreId.current !== settings.id) {
      initializedStoreId.current = settings.id;
      knownOrderIds.current = new Set(orders.map((order) => order.id));
      knownPaymentStatus.current = new Map(orders.map((order) => [order.id, order.paymentStatus]));
      initialized.current = true;
      return;
    }

    const freshOrders = orders.filter((order) => !knownOrderIds.current.has(order.id));
    const newlyPaidOrders = orders.filter((order) => (
      order.status !== 'cancelled'
      && order.paymentStatus === 'paid'
      && knownPaymentStatus.current.get(order.id) === 'pending'
    ));
    // Atualiza a base com todos os registros, inclusive cancelados, para que
    // uma alteração de status nunca seja interpretada como um novo pedido.
    orders.forEach((order) => {
      knownOrderIds.current.add(order.id);
      knownPaymentStatus.current.set(order.id, order.paymentStatus);
    });
    freshOrders.forEach((order) => {
      // Pedidos cancelados/testes não devem gerar alerta de pedido novo.
      if (order.status === 'cancelled') return;
      if (!settings.notificationsNewOrderEnabled) return;
      const label = `Pedido #${order.orderNumber || order.id.slice(0, 8)}`;
      const detail = `${order.customerName} · R$ ${order.total.toFixed(2).replace('.', ',')}`;
      setUnread((value) => value + 1);
      if (settings.notificationsSoundEnabled) playAlertSound();
      if (settings.notificationsDesktopEnabled) void showPwaNotification('Novo pedido na loja', `${label} · ${detail}`, { tag: `new-order:${order.id}` });
    });

    // O recebimento do PIX altera apenas o pagamento do pedido. Ele não cria
    // um novo registro e, por isso, não passava pelo alerta de pedido novo.
    // Detectamos somente a transição pendente -> pago, evitando repetir avisos
    // em cada recarga ou para pedidos já pagos no snapshot inicial.
    newlyPaidOrders.forEach((order) => {
      if (!settings.notificationsDesktopEnabled) return;
      const label = `Pedido #${order.orderNumber || order.id.slice(0, 8)}`;
      const detail = `${order.customerName} · R$ ${order.total.toFixed(2).replace('.', ',')}`;
      setUnread((value) => value + 1);
      if (settings.notificationsSoundEnabled) playAlertSound();
      void showPwaNotification('Pagamento confirmado', `${label} · ${detail}`, { tag: `payment-confirmed:${order.id}` });
    });

    if (settings.notificationsScheduledEnabled) {
      const now = Date.now();
      const lead = settings.notificationsScheduledLeadMinutes * 60_000;
      orders.forEach((order) => {
        if (!order.scheduledFor || order.status === 'cancelled') return;
        const scheduled = new Date(order.scheduledFor).getTime();
        if (!Number.isFinite(scheduled) || scheduled <= now || scheduled - now > lead) return;
        const key = seenReminderKey(settings.id, order.id, order.scheduledFor);
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, '1');
        const label = `Pedido #${order.orderNumber || order.id.slice(0, 8)}`;
        const detail = `${order.customerName} · ${formatDateTimeBR(order.scheduledFor)}`;
        setUnread((value) => value + 1);
        if (settings.notificationsSoundEnabled) playAlertSound();
        if (settings.notificationsDesktopEnabled) void showPwaNotification('Pedido agendado próximo', `${label} · ${detail}`, { tag: `scheduled-order:${order.id}` });
      });
    }
  }, [loading, orders, settings]);

  useEffect(() => {
    // Verifica a permissão na abertura do painel. Quando ela ainda está em
    // estado default, o navegador recebe uma única solicitação por abertura;
    // quando já foi concedida, a assinatura é sincronizada automaticamente.
    // O ajuste respeita o botão de notificações da loja e não mostra toasts
    // durante a inicialização do painel.
    if (!settings.id || loading || !membership?.storeId || !user?.id || !settings.notificationsDesktopEnabled) return;
    const syncKey = `${settings.id}:${membership.storeId}:${user.id}`;
    if (permissionAttemptedFor.current === syncKey) return;
    permissionAttemptedFor.current = syncKey;
    pushSynced.current = false;
    let cancelled = false;

    const ensurePermissionAndSubscription = async () => {
      if (typeof Notification === 'undefined') return;
      let permission: NotificationPermission | null = null;
      try {
        permission = await requestPwaNotificationPermission();
      } catch {
        // Alguns navegadores bloqueiam requestPermission sem gesto do usuário.
        // A configuração manual em Configurações continua disponível.
        return;
      }
      if (cancelled || permission !== 'granted') return;

      // Mesmo sem VAPID configurado, pedir a permissão é útil para alertas
      // locais enquanto o painel estiver aberto. A assinatura em segundo
      // plano só é criada quando o servidor e o navegador estiverem aptos.
      const status = pwaPushStatus();
      if (status === 'not_configured' || status === 'unsupported' || status === 'blocked') return;
      if (pushSynced.current) return;
      pushSynced.current = true;
      void subscribeToPwaPush(membership.storeId, user.id).catch(() => {
        // O alerta local continua funcionando quando o servidor VAPID ainda
        // não foi configurado ou quando a assinatura antiga foi revogada.
        pushSynced.current = false;
      });
    };

    void ensurePermissionAndSubscription();
    return () => { cancelled = true; };
  }, [loading, membership?.storeId, settings.id, settings.notificationsDesktopEnabled, user?.id]);

  useEffect(() => {
    const interval = window.setInterval(() => { void reloadAdmin({ silent: true }).catch(() => undefined); }, 30_000);
    return () => window.clearInterval(interval);
  }, [reloadAdmin]);

  useEffect(() => {
    // O painel administrativo também verifica insumos em segundo plano. O
    // estado local evita repetir o mesmo aviso enquanto o saldo continuar
    // abaixo do mínimo configurado.
    if (!settings.id || loading || !settings.notificationsDesktopEnabled) return;
    let cancelled = false;
    const checkLowStock = async () => {
      try {
        const items = await inventoryApi.listLowStock(settings.id);
        if (cancelled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        for (const item of items) {
          const key = `foodweb:low-stock-alert:${settings.id}:${item.id}`;
          let previous = '';
          try { previous = window.localStorage.getItem(key) || ''; } catch { /* segue sem deduplicação local */ }
          if (previous === 'low') continue;
          try { window.localStorage.setItem(key, 'low'); } catch { /* o alerta ainda é útil */ }
          void showPwaNotification('Estoque baixo', `${item.name}: ${item.currentQuantity} ${item.unit} · mínimo ${item.reorderPoint} ${item.unit}`, { tag: `low-stock:${settings.id}:${item.id}`, url: '/admin/estoque' });
        }
      } catch {
        // Instalações antigas sem a migration de estoque continuam usando os
        // demais avisos do painel normalmente.
      }
    };
    void checkLowStock();
    const interval = window.setInterval(() => { void checkLowStock(); }, 30_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [loading, settings.id, settings.notificationsDesktopEnabled]);

  if (!unread) return null;
  return <button type="button" className="admin-notification-badge" onClick={() => setUnread(0)} title="Marcar alertas como lidos" aria-label={`${unread} alerta${unread === 1 ? '' : 's'} nova${unread === 1 ? '' : 's'}`}><Bell size={16}/><span>{unread > 9 ? '9+' : unread}</span><X size={12}/></button>;
}
