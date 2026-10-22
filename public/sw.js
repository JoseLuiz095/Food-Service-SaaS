const CACHE_NAME = 'vendeweb-shell-v1';
// Incrementado para invalidar bundles antigos que podiam esconder ajustes do
// cabeçalho e do painel após uma publicação do PWA.
const RUNTIME_CACHE = 'vendeweb-runtime-v1';
const VENDEWEB_ICON = '/assets/vendeweb-mark.svg?v=20261022';
const STATIC_ASSET = /\.(?:js|css|woff2?|png|jpe?g|webp|svg|ico|json)$/i;
const MAX_RUNTIME_ENTRIES = 80;

const trimCache = async (cacheName, limit = MAX_RUNTIME_ENTRIES) => {
  const cache = await caches.open(cacheName);
  const requests = await cache.keys();
  if (requests.length <= limit) return;
  await Promise.all(requests.slice(0, requests.length - limit).map((request) => cache.delete(request)));
};

const cacheResponse = async (cacheName, request, response) => {
  if (!response || !response.ok || response.type !== 'basic') return response;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  await trimCache(cacheName);
  return response;
};

const fetchWithTimeout = async (request, timeoutMs = 3500) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Uma falha de rede no install não impede a atualização do service worker.
    await Promise.allSettled(['/index.html', '/manifest.webmanifest'].map(async (url) => {
      try { await cache.add(url); } catch { /* será buscado na próxima abertura */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys())
      .filter((key) => /^(?:foodweb|vendeweb)-/.test(key) && ![CACHE_NAME, RUNTIME_CACHE].includes(key))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() || '' }; }
  const title = payload.title || 'VendeWeb';
  const notificationId = payload.id || payload.orderId || payload.tag || `${title}:${payload.body || ''}`;
  const tag = payload.tag || `vendeweb:${notificationId}`;
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || 'Há uma atualização na operação da loja.',
    icon: payload.icon || VENDEWEB_ICON,
    badge: payload.badge || VENDEWEB_ICON,
    tag,
    // O mesmo pedido atualiza um aviso existente, sem gerar pilhas de alertas.
    renotify: false,
    data: { id: notificationId, url: payload.url || '/admin/pedidos' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/admin/pedidos', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url.includes('/admin') && 'focus' in client)
      || clients.find((client) => 'focus' in client);
    if (existing) {
      void existing.navigate(targetUrl);
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl);
  }));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Navegação tenta a versão mais recente; em rede ruim, usa o shell salvo.
  if (request.mode === 'navigate') {
    event.respondWith(fetchWithTimeout(request).then((response) => {
      void cacheResponse(CACHE_NAME, new Request('/index.html'), response.clone());
      return response;
    }).catch(() => caches.match('/index.html')));
    return;
  }

  // JS/CSS e imagens são cache-first com atualização em segundo plano. Isso
  // reduz a espera nas telas seguintes sem prender dados administrativos antigos.
  if (STATIC_ASSET.test(url.pathname) || url.pathname.startsWith('/assets/')) {
    const refresh = fetchWithTimeout(request, 6000)
      .then((response) => cacheResponse(RUNTIME_CACHE, request, response))
      .catch(() => undefined);
    // Registra a atualização enquanto o evento ainda está ativo para que o
    // navegador não encerre o worker antes de gravar o recurso em cache.
    event.waitUntil(refresh);
    event.respondWith(caches.match(request).then((cached) => cached || refresh.then((response) => response || caches.match(request))));
  }
});
