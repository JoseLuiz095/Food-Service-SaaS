import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import worker from '../worker/seo-home.js';

const html = '<!doctype html><html><head><title>VendeWeb</title></head><body><div id="foodweb-splash-screen">Splash</div><div id="root"></div></body></html>';
const requests = [];
const assets = {
  async fetch(request) {
    requests.push(new URL(request.url).pathname);
    const path = new URL(request.url).pathname;
    return new Response(path === '/' ? html : 'arquivo estático', {
      headers: { 'Content-Type': path === '/' ? 'text/html' : 'text/plain' },
    });
  },
};

globalThis.HTMLRewriter = class {
  handlers = new Map();
  on(selector, handler) { this.handlers.set(selector, handler); return this; }
  async transform(response) {
    let result = await response.text();
    const head = { append: (value) => { result = result.replace('</head>', `${value}</head>`); } };
    const root = { setInnerContent: (value) => { result = result.replace('<div id="root"></div>', `<div id="root">${value}</div>`); } };
    const splash = { remove: () => { result = result.replace('<div id="foodweb-splash-screen">Splash</div>', ''); } };
    this.handlers.get('head')?.element(head);
    this.handlers.get('#root')?.element(root);
    this.handlers.get('#foodweb-splash-screen')?.element(splash);
    return new Response(result, response);
  }
};

test('página inicial canônica tem conteúdo legível, metadados e JSON-LD permitido pela CSP', async () => {
  const response = await worker.fetch(new Request('https://www.vendeweb.com.br/'), { ASSETS: assets });
  const body = await response.text();
  assert.match(body, /<h1>Seu negócio tem personalidade/);
  assert.match(body, /<link rel="canonical" href="https:\/\/www\.vendeweb\.com\.br\/">/);
  assert.match(body, /<meta property="og:image"/);
  assert.doesNotMatch(body, /foodweb-splash-screen/);
  const json = body.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)?.[1];
  assert.equal(JSON.parse(json)['@type'], 'Organization');
  const csp = await readFile(new URL('../public/_headers', import.meta.url), 'utf8');
  assert.ok(csp.includes(`'sha256-${createHash('sha256').update(json).digest('base64')}'`));
});

test('loja em domínio próprio não recebe apresentação nem sitemap da plataforma', async () => {
  const store = await worker.fetch(new Request('https://loja.exemplo.com/'), { ASSETS: assets });
  assert.equal(await store.text(), html);
  const robots = await worker.fetch(new Request('https://loja.exemplo.com/robots.txt'), { ASSETS: assets });
  assert.equal(await robots.text(), 'User-agent: *\nAllow: /\n');
  const sitemap = await worker.fetch(new Request('https://loja.exemplo.com/sitemap.xml'), { ASSETS: assets });
  assert.equal(sitemap.status, 404);
  assert.equal(sitemap.headers.get('X-Robots-Tag'), 'noindex');
});

test('rotas de compra e arquivos públicos continuam com o servidor de assets', async () => {
  requests.length = 0;
  const route = await worker.fetch(new Request('https://www.vendeweb.com.br/carrinho'), { ASSETS: assets });
  assert.equal(await route.text(), 'arquivo estático');
  const robots = await worker.fetch(new Request('https://www.vendeweb.com.br/robots.txt'), { ASSETS: assets });
  assert.equal(await robots.text(), 'arquivo estático');
  assert.deepEqual(requests, ['/carrinho', '/robots.txt']);
});

test('páginas privadas não entram no sitemap e têm regra de não indexação', async () => {
  const sitemap = await readFile(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  const headers = await readFile(new URL('../public/_headers', import.meta.url), 'utf8');
  assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]), ['https://www.vendeweb.com.br/']);
  for (const path of ['/admin/*', '/admin-master/*', '/carrinho', '/finalizar', '/pedido/*', '/pagamento/*']) {
    assert.ok(headers.includes(`${path}\n  X-Robots-Tag: noindex`), `sem noindex: ${path}`);
  }
});
