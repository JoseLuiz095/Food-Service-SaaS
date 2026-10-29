import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const origin = 'https://www.vendeweb.com.br';
const response = (body, headers = {}) => {
  const value = new Response(body, { headers });
  Object.defineProperty(value, 'type', { value: 'basic' });
  return value;
};

function harness({ offline = false, quota = false, body = 'asset', headers = {} } = {}) {
  const handlers = new Map();
  const buckets = new Map();
  const puts = [];
  const notifications = [];
  const opened = [];
  const key = input => new URL(typeof input === 'string' ? input : input.url, origin).href;
  const caches = {
    keys: async () => [...buckets.keys()],
    delete: async name => buckets.delete(name),
    open: async name => {
      if (!buckets.has(name)) buckets.set(name, new Map());
      const bucket = buckets.get(name);
      return {
        match: async input => bucket.get(key(input))?.clone(),
        put: async (input, value) => { if (quota) throw new Error('QuotaExceededError'); puts.push(key(input)); bucket.set(key(input), value.clone()); },
        keys: async () => [...bucket.keys()].map(url => new Request(url)),
        delete: async input => bucket.delete(key(input)),
      };
    },
  };
  vm.runInNewContext(source, {
    URL, Request, Response, AbortController, setTimeout, clearTimeout, caches,
    fetch: async () => { if (offline) throw new Error('offline'); return response(body, headers); },
    self: {
      location: { origin }, addEventListener: (name, handler) => handlers.set(name, handler),
      skipWaiting: async () => {},
      registration: { showNotification: async (title, options) => notifications.push({ title, ...options }) },
      clients: { claim: async () => {}, matchAll: async () => [], openWindow: async url => opened.push(url) },
    },
  });
  const dispatch = async (name, values = {}) => {
    const waits = [];
    let result;
    handlers.get(name)({ ...values, waitUntil: promise => waits.push(promise), respondWith: promise => { result = promise; } });
    const output = await result;
    await Promise.all(waits);
    return output;
  };
  const request = (path, options = {}) => new Request(`${origin}${path}`, options);
  return { dispatch, request, caches, puts, notifications, opened, buckets };
}

test('navegação privada nunca substitui o shell público', async () => {
  const app = harness({ body: 'segredo da loja', headers: { 'Content-Type': 'text/html' } });
  const req = app.request('/admin/pedidos?access_token=segredo');
  Object.defineProperty(req, 'mode', { value: 'navigate' });
  assert.equal(await (await app.dispatch('fetch', { request: req })).text(), 'segredo da loja');
  assert.deepEqual(app.puts, []);
});

test('API, JSON, origem externa e requisições autenticadas não entram no cache', async () => {
  const app = harness();
  for (const req of [app.request('/api/private.json'), app.request('/assets/private.json'),
    app.request('/assets/private.png?token=example'),
    app.request('/assets/private.png', { headers: { Authorization: 'Bearer example' } }),
    app.request('/assets/private.png', { cache: 'no-store' }), new Request('https://other.example/image.png')]) {
    assert.equal(await app.dispatch('fetch', { request: req }), undefined);
  }
  assert.deepEqual(app.puts, []);
});

test('quota não impede resposta online e política private/no-store é respeitada', async () => {
  for (const options of [{ quota: true }, { headers: { 'Cache-Control': 'private' } }, { headers: { 'Cache-Control': 'no-store' } }]) {
    const app = harness(options);
    assert.equal(await (await app.dispatch('fetch', { request: app.request('/assets/test.js') })).text(), 'asset');
    assert.deepEqual(app.puts, []);
  }
});

test('fallback HTML nunca envenena cache de bundle', async () => {
  const app = harness({ body: '<html>SPA fallback</html>', headers: { 'Content-Type': 'text/html' } });
  await app.dispatch('fetch', { request: app.request('/assets/missing.js') });
  assert.deepEqual(app.puts, []);
});

test('offline sem cache devolve Response 503 válido para navegação e assets', async () => {
  const app = harness({ offline: true });
  const navigation = app.request('/admin');
  Object.defineProperty(navigation, 'mode', { value: 'navigate' });
  const page = await app.dispatch('fetch', { request: navigation });
  assert.equal(page.status, 503);
  assert.match(await page.text(), /Você está sem conexão/);
  assert.equal((await app.dispatch('fetch', { request: app.request('/assets/missing.js') })).status, 503);
});

test('offline usa apenas o HTML público instalado e limpeza remove cache legado', async () => {
  const app = harness({ offline: true });
  await (await app.caches.open('vendeweb-shell-v2')).put('/index.html', response('shell público'));
  await app.caches.open('foodweb-shell-v3');
  await app.caches.open('vendeweb-runtime-v1');
  const navigation = app.request('/admin');
  Object.defineProperty(navigation, 'mode', { value: 'navigate' });
  assert.equal(await (await app.dispatch('fetch', { request: navigation })).text(), 'shell público');
  await app.dispatch('activate');
  assert.deepEqual(await app.caches.keys(), ['vendeweb-shell-v2']);
});

test('push e clique rejeitam URL externa, javascript e protocolo relativo', async () => {
  const app = harness();
  for (const url of ['https://evil.example/pedido', '//evil.example/pedido', 'javascript:alert(1)', 'https://user:password@www.vendeweb.com.br/admin']) {
    await app.dispatch('push', { data: { json: () => ({ url, title: 'Pedido' }) } });
    assert.equal(app.notifications.at(-1).data.url, `${origin}/admin/pedidos`);
    await app.dispatch('notificationclick', { notification: { close: () => {}, data: { url } } });
    assert.equal(app.opened.at(-1), `${origin}/admin/pedidos`);
  }
  await app.dispatch('push', { data: { json: () => ({ url: '/admin/estoque?item=123' }) } });
  assert.equal(app.notifications.at(-1).data.url, `${origin}/admin/estoque?item=123`);
});

test('manifest padrão da plataforma oferece ícones PNG válidos para instalação', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.id, '/_pwa/platform');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  for (const icon of manifest.icons.filter(icon => icon.type === 'image/png')) {
    const file = new URL(`../public${icon.src}`, import.meta.url);
    assert.ok(existsSync(file));
    const png = readFileSync(file);
    assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));
  const apple = readFileSync(new URL('../public/assets/vendeweb-apple-touch-180.png', import.meta.url));
  assert.equal(apple.readUInt32BE(16), 180);
});
