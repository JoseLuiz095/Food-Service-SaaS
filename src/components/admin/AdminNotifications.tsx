import { Bell, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../contexts/StoreContext';
import { useAuth } from '../../contexts/AuthContext';
import { formatDateTimeBR } from '../../utils/format';
import { pwaPushStatus, showPwaNotification, subscribeToPwaPush } from '../../services/pwaNotifications';

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
  const pushSynced = useRef(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    // Aguarda o primeiro snapshot completo. Antes disso o contexto ainda tem
    // uma lista vazia; tratá-la como base fazia todos os pedidos históricos
    // parecerem novos assim que chegavam do Supabase.
    if (!settings.id || loading) return;
    if (!initialized.current || initializedStoreId.current !== settings.id) {
      initializedStoreId.current = settings.id;
      knownOrderIds.current = new Set(orders.map((order) => order.id));
      initialized.current = true;
      return;
    }

    const freshOrders = orders.filter((order) => !knownOrderIds.current.has(order.id));
    // Atualiza a base com todos os registros, inclusive cancelados, para que
    // uma alteração de status nunca seja interpretada como um novo pedido.
    orders.forEach((order) => knownOrderIds.current.add(order.id));
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
    // Se a permissão já foi aceita anteriormente, garante a assinatura da
    // loja mesmo que o admin não tenha voltado à tela de configurações.
    if (!settings.id || !membership?.storeId || !user?.id || !settings.notificationsDesktopEnabled || pushSynced.current) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (pwaPushStatus() === 'not_configured' || pwaPushStatus() === 'unsupported' || pwaPushStatus() === 'blocked') return;
    pushSynced.current = true;
    void subscribeToPwaPush(membership.storeId, user.id).catch(() => {
      // O alerta local continua funcionando quando o servidor VAPID ainda não
      // foi configurado ou quando a assinatura antiga foi revogada.
      pushSynced.current = false;
    });
  }, [membership?.storeId, settings.id, settings.notificationsDesktopEnabled, user?.id]);

  useEffect(() => {
    const interval = window.setInterval(() => { void reloadAdmin({ silent: true }).catch(() => undefined); }, 30_000);
    return () => window.clearInterval(interval);
  }, [reloadAdmin]);

  if (!unread) return null;
  return <button type="button" className="admin-notification-badge" onClick={() => setUnread(0)} title="Marcar alertas como lidos" aria-label={`${unread} alerta${unread === 1 ? '' : 's'} nova${unread === 1 ? '' : 's'}`}><Bell size={16}/><span>{unread > 9 ? '9+' : unread}</span><X size={12}/></button>;
}
