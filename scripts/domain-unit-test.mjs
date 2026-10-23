import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const compile = path => ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const brandUrl = moduleUrl(compile('src/lib/brand.ts'));
const brand = await import(brandUrl);
const routes = await import(moduleUrl(compile('src/utils/storefrontRoute.ts').replace('../lib/brand', brandUrl)));
const config = await import(moduleUrl(compile('src/lib/config.ts').replace('./brand', brandUrl).replaceAll('import.meta.env', '({})')));
const storeHours = await import(moduleUrl(compile('src/utils/storeHours.ts')));
const { canonicalPlatformRedirect: redirect, PLATFORM_URL } = brand;
const legacy = brand.LEGACY_PLATFORM_ORIGIN;

assert.equal(PLATFORM_URL, 'https://www.vendeweb.com.br');
for (const origin of [legacy, 'https://vendeweb.com.br', 'http://vendeweb.com.br']) {
  for (const suffix of ['/', '/doce-lua/produto/bolo?utm_source=whatsapp#detalhes', '/cadastro?plan=DEMO&segment=printing3d', '/admin/redefinir-senha?code=example-code#access_token=example-token&type=recovery', '/doce%20lua?x=%2F%3F&x=2#arte%20final']) {
    const expected = new URL(suffix, PLATFORM_URL).href;
    assert.equal(redirect(`${origin}${suffix}`), expected);
  }
}

for (const origin of [PLATFORM_URL, 'https://pedidos.docelua.com.br', 'http://localhost:5174', 'http://127.0.0.1:5174', 'https://www.vendeweb.com.br.attacker.invalid', 'https://unknown.invalid']) {
  assert.equal(redirect(`${origin}/doce-lua?next=https://attacker.invalid/#x`), null);
}
for (const value of ['javascript:alert(1)', '//attacker.invalid', 'not a url', 'file:///tmp/test', 'https://vendeweb.com.br@attacker.invalid/']) assert.equal(redirect(value), null);
assert.equal(redirect(`${legacy}:8443/doce-lua?next=https://attacker.invalid#cap=abc`), 'https://www.vendeweb.com.br/doce-lua?next=https://attacker.invalid#cap=abc');
assert.equal(redirect(`${legacy}//attacker.invalid/path`), `${PLATFORM_URL}//attacker.invalid/path`);
for (const path of ['/pedido/123', '/doce-lua/pedido/123', '/doce-lua/carrinho', '/doce-lua/finalizar', '/carrinho', '/finalizar', '/modulos/eventos/pedido/123?access_token=capability']) assert.equal(redirect(`${legacy}${path}`), null);
assert.equal(redirect(`${legacy}/doce-lua`, true), null);

const storage = entries => ({ length: entries.length, key: index => entries[index]?.[0] ?? null, getItem: key => entries.find(entry => entry[0] === key)?.[1] ?? null });
assert.equal(brand.hasOriginBoundShoppingState(storage([])), false);
assert.equal(brand.hasOriginBoundShoppingState(storage([['foodservice_cart_v1:store', '[]']])), false);
assert.equal(brand.hasOriginBoundShoppingState(storage([['foodservice_cart_v1:store', '[{"id":"item"}]']])), true);
assert.equal(brand.hasOriginBoundShoppingState(storage([['foodweb_checkout_draft_v1:store', '{"notes":"example"}']])), true);
assert.equal(brand.hasOriginBoundShoppingState(storage([['unrelated', '{"a":1}']])), false);
assert.equal(brand.hasOriginBoundShoppingState(storage([['foodservice_cart_v1:store', 'broken json']])), true);
assert.equal(brand.hasOriginBoundShoppingState({ get length() { throw new Error('blocked'); } }), true);
assert.equal(brand.hasOriginBoundAuthCallback(`${legacy}/admin/redefinir-senha?code=example`, storage([['foodservice.auth.v1-code-verifier', 'private-example']])), true);
assert.equal(brand.hasOriginBoundAuthCallback(`${legacy}/admin/redefinir-senha?code=example`, storage([['foodservice.auth.v1-flow-example-code-verifier', 'private-example']])), true);
assert.equal(brand.hasOriginBoundAuthCallback(`${legacy}/admin/redefinir-senha?code=example`, storage([])), false);
assert.equal(brand.hasOriginBoundAuthCallback(`${legacy}/admin/login`, storage([['foodservice.auth.v1-code-verifier', 'private-example']])), false);

for (const origin of [legacy, PLATFORM_URL, 'https://vendeweb.com.br']) assert.equal(routes.publicStorefrontUrl('doce-lua', origin), `${PLATFORM_URL}/doce-lua`);
assert.equal(routes.publicStorefrontUrl('doces & arte', legacy), `${PLATFORM_URL}/doces%20%26%20arte`);
assert.equal(routes.publicStorefrontUrl('doce-lua', 'http://localhost:5174'), 'http://localhost:5174/doce-lua');
assert.equal(routes.publicStorefrontUrl('doce-lua', 'https://pedidos.docelua.com.br'), 'https://pedidos.docelua.com.br/');
assert.equal(routes.publicStorefrontUrl('doce-lua', 'javascript:alert(1)'), `${PLATFORM_URL}/doce-lua`);
assert.equal(routes.publicStorefrontUrl('doce-lua'), `${PLATFORM_URL}/doce-lua`);
assert.equal(routes.publicProductUrl('doce-lua','bolo de festa',legacy),`${PLATFORM_URL}/doce-lua/produto/bolo%20de%20festa`);
assert.equal(routes.publicProductUrl('doce-lua','brigadeiro','https://pedidos.docelua.com.br'),'https://pedidos.docelua.com.br/produto/brigadeiro');
assert.equal(routes.customStorefrontUrl('PEDIDOS.DOCELUA.COM.BR'), 'https://pedidos.docelua.com.br/');
assert.equal(routes.customStorefrontUrl('https://pedidos.docelua.com.br/'), 'https://pedidos.docelua.com.br/');
for (const value of ['javascript:alert(1)', 'store.invalid@evil.invalid', 'store.invalid:8443', 'store.invalid/path', 'https://store.invalid?next=x', 'https://store.invalid#x', '//store.invalid', 'vendeweb.com.br', 'www.vendeweb.com.br']) assert.equal(routes.customStorefrontUrl(value), null);
assert.equal(routes.storeSlugFromPath('/doce-lua/produto/bolo'), 'doce-lua');
assert.equal(routes.storeSlugFromPath('/%E0%A4%A'), null);
for (const path of ['/cadastro', '/cadastro/confirmar', '/modulos/eventos/test', '/admin', '/admin-master', '/pedido/id', '/finalizar']) assert.equal(routes.storeSlugFromPath(path), null);
for (const host of ['vendeweb.com.br', 'www.vendeweb.com.br', 'foodweb.joseluizacama.workers.dev', 'localhost', '127.0.0.1']) assert.equal(config.isFoodWebMarketingRoot('/', host), true);
assert.equal(config.isFoodWebMarketingRoot('/doce-lua', 'www.vendeweb.com.br'), false);
assert.equal(config.isFoodWebMarketingRoot('/', 'pedidos.docelua.com.br'), false);
assert.equal(brand.platformOrigin('https://pedidos.docelua.com.br'), PLATFORM_URL);
assert.equal(brand.platformOrigin('https://vendeweb.com.br'), PLATFORM_URL);
assert.equal(brand.platformOrigin('http://localhost:5174'), 'http://localhost:5174');
assert.equal(storeHours.storeDateKey(new Date('2026-10-23T01:30:00.000Z'),'America/Sao_Paulo'),'2026-10-22');
assert.equal(storeHours.storeDateKey(new Date('2026-10-23T01:30:00.000Z'),'UTC'),'2026-10-23');
assert.equal(storeHours.storeDateKey(new Date('2026-10-23T01:30:00.000Z'),'invalid/timezone'),'2026-10-22');
assert.match(storeHours.storeDateLabel(new Date('2026-10-23T01:30:00.000Z'),'America/Sao_Paulo'),/qui/);
console.log('OK domínio: canônico www, marketing root, links públicos/customizados, convite/recuperação, aliases com query/hash, proteção contra open redirect e preservação de compras na origem antiga.');
