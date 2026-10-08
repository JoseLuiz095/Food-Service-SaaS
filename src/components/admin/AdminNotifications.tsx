import { Bell, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import { formatDateTimeBR } from '../../utils/format';
import { showPwaNotification } from '../../services/pwaNotifications';

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
  const { settings, orders, reloadAdmin } = useStore();
  const { showToast } = useToast();
  const initialized = useRef(false);
  const knownOrderIds = useRef(new Set<string>());
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!settings.id) return;
    if (!initialized.current) {
      knownOrderIds.current = new Set(orders.map((order) => order.id));
      initialized.current = true;
      return;
    }

    const freshOrders = orders.filter((order) => !knownOrderIds.current.has(order.id));
    freshOrders.forEach((order) => {
      knownOrderIds.current.add(order.id);
      if (!settings.notificationsNewOrderEnabled) return;
      const label = `Pedido #${order.orderNumber || order.id.slice(0, 8)}`;
      const detail = `${order.customerName} · R$ ${order.total.toFixed(2).replace('.', ',')}`;
      showToast(`${label} recebido · ${detail}`, 'success');
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
        showToast(`${label} agendado para breve · ${detail}`, 'info');
        setUnread((value) => value + 1);
        if (settings.notificationsSoundEnabled) playAlertSound();
        if (settings.notificationsDesktopEnabled) void showPwaNotification('Pedido agendado próximo', `${label} · ${detail}`, { tag: `scheduled-order:${order.id}` });
      });
    }
  }, [orders, settings, showToast]);

  useEffect(() => {
    const interval = window.setInterval(() => { void reloadAdmin({ silent: true }).catch(() => undefined); }, 30_000);
    return () => window.clearInterval(interval);
  }, [reloadAdmin]);

  if (!unread) return null;
  return <button type="button" className="admin-notification-badge" onClick={() => setUnread(0)} title="Marcar alertas como lidos" aria-label={`${unread} alerta${unread === 1 ? '' : 's'} nova${unread === 1 ? '' : 's'}`}><Bell size={16}/><span>{unread > 9 ? '9+' : unread}</span><X size={12}/></button>;
}
