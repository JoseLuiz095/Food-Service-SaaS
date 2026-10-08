const CACHE_NAME = 'foodweb-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() || '' }; }
  const title = payload.title || 'FoodWeb';
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || 'Há uma atualização na operação da loja.',
    icon: payload.icon || '/assets/food-logo.svg',
    badge: payload.badge || '/assets/food-logo.svg',
    tag: payload.tag || 'foodweb-admin',
    renotify: true,
    data: { url: payload.url || '/admin/pedidos' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/admin/pedidos', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => 'focus' in client);
    if (existing) {
      void existing.navigate(targetUrl);
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl);
  }));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Navegação usa rede primeiro para não deixar o painel preso em dados antigos.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }

  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match(request)),
  );
});
