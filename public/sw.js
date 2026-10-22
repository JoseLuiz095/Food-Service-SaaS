const CACHE_NAME = 'vendeweb-shell-v2';
const RUNTIME_CACHE = 'vendeweb-runtime-v2';
const VENDEWEB_ICON = '/assets/vendeweb-icon-192.png';
const VENDEWEB_BADGE = '/assets/vendeweb-badge-96.png';
const STATIC_ASSET = /^\/assets\/[^?#]+\.(?:js|css|woff2?|png|jpe?g|webp|avif|svg|ico)$/i;
const MAX_RUNTIME_ENTRIES = 80;
const DEFAULT_NOTIFICATION_PATH = '/admin/pedidos';

// Cache Storage é opcional: indisponibilidade ou quota nunca invalida a rede.
const matchCache = async (cacheName, request) => {
  try { return await (await caches.open(cacheName)).match(request); } catch { return undefined; }
};

const cacheResponse = async (cacheName, request, response) => {
  if (!response?.ok || response.type !== 'basic' || response.redirected) return;
  if (/\b(?:private|no-store)\b/i.test(response.headers.get('cache-control') || '')) return;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
    const requests = await cache.keys();
    await Promise.all(requests.slice(0, Math.max(0, requests.length - MAX_RUNTIME_ENTRIES)).map(key => cache.delete(key)));
  } catch { /* modo privado, armazenamento cheio ou cache desativado */ }
};

const fetchWithTimeout = async (request, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(request, { signal: controller.signal }); } finally { clearTimeout(timer); }
};

const offlineResponse = (navigation = false) => new Response(navigation
  ? '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VendeWeb · Sem conexão</title><main><h1>Você está sem conexão</h1><p>Conecte-se à internet e tente novamente. Pedidos e pagamentos precisam de conexão para serem confirmados.</p><a href="/admin">Tentar novamente</a></main></html>'
  : '', { status: 503, headers: { 'Content-Type': navigation ? 'text/html; charset=utf-8' : 'text/plain', 'Cache-Control': 'no-store' } });

const notificationUrl = (value, fallback = DEFAULT_NOTIFICATION_PATH) => {
  try {
    const url = new URL(typeof value === 'string' ? value : fallback, self.location.origin);
    if (url.origin === self.location.origin && !url.username && !url.password) return url.href;
  } catch { /* payload inválido volta para a área de pedidos */ }
  return new URL(fallback, self.location.origin).href;
};

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Somente HTML público estático. Nunca gravar a resposta de /admin,
    // checkout, autenticação, APIs ou URLs com tokens como shell compartilhado.
    await Promise.allSettled(['/index.html', '/manifest.webmanifest', VENDEWEB_ICON, VENDEWEB_BADGE].map(async path => {
      const response = await fetchWithTimeout(new Request(new URL(path, self.location.origin), { cache: 'reload', credentials: 'omit' }));
      if (path === '/index.html' && !response.headers.get('content-type')?.includes('text/html')) return;
      await cacheResponse(CACHE_NAME, path, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      await Promise.all((await caches.keys())
        .filter(key => /^(?:foodweb|vendeweb)-/.test(key) && ![CACHE_NAME, RUNTIME_CACHE].includes(key))
        .map(key => caches.delete(key)));
    } catch { /* o funcionamento online permanece independente do cache */ }
    await self.clients.claim();
  })());
});

self.addEventListener('push', event => {
  let payload = {};
  try { const data = event.data?.json(); if (data && typeof data === 'object' && !Array.isArray(data)) payload = data; }
  catch { payload = { body: event.data?.text() || '' }; }
  const title = typeof payload.title === 'string' ? payload.title : 'VendeWeb';
  const body = typeof payload.body === 'string' ? payload.body : 'Há uma atualização na operação da loja.';
  const notificationId = payload.id || payload.orderId || payload.tag || `${title}:${body}`;
  event.waitUntil(self.registration.showNotification(title, {
    body, icon: VENDEWEB_ICON, badge: VENDEWEB_BADGE,
    tag: typeof payload.tag === 'string' ? payload.tag : `vendeweb:${notificationId}`,
    renotify: false,
    data: { id: notificationId, url: notificationUrl(payload.url) },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = notificationUrl(event.notification.data?.url);
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const sameOrigin = clients.filter(client => new URL(client.url).origin === self.location.origin && 'focus' in client);
    const existing = sameOrigin.find(client => new URL(client.url).pathname.startsWith('/admin')) || sameOrigin[0];
    if (existing) {
      try { await existing.navigate(targetUrl); return await existing.focus(); } catch { /* janela encerrada durante o clique */ }
    }
    return self.clients.openWindow(targetUrl);
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('authorization')) return;
  if (request.cache === 'no-store') return;

  if (request.mode === 'navigate') {
    event.respondWith(fetchWithTimeout(request).catch(async () =>
      (await matchCache(CACHE_NAME, '/index.html')) || offlineResponse(true)));
    return;
  }

  // Apenas arte e bundles públicos de /assets/. JSON, APIs e uploads privados
  // ficam na rede e continuam sujeitos à autenticação e à política do servidor.
  if (STATIC_ASSET.test(url.pathname) && [...url.searchParams.keys()].every(key => key === 'v')) {
    const refresh = fetchWithTimeout(request).then(async response => {
      // Evita gravar fallback HTML da SPA no lugar de um bundle ou imagem.
      if (!response.headers.get('content-type')?.includes('text/html')) await cacheResponse(RUNTIME_CACHE, request, response);
      return response;
    }).catch(() => undefined);
    event.waitUntil(refresh);
    event.respondWith((async () => (await matchCache(RUNTIME_CACHE, request)) || (await refresh) || offlineResponse())());
  }
});
