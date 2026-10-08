type PwaNotificationOptions = {
  tag?: string;
  url?: string;
};

const canNotify = () => typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';

export const requestPwaNotificationPermission = async (): Promise<NotificationPermission | null> => {
  if (typeof window === 'undefined' || !('Notification' in window)) return null;
  if (Notification.permission === 'default') return Notification.requestPermission();
  return Notification.permission;
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
