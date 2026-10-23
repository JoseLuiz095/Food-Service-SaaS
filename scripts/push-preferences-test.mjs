import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

// Run the actual Edge handler, stubbing only Deno, database and push transport.
// No remote database or notification provider is used by this test.
const source = readFileSync(new URL('../supabase/functions/food-send-push/index.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

for (const scenario of [
  { name: 'falha de leitura das preferências', data: null, error: { message: 'internal private database detail' }, status: 503, delivered: 0 },
  { name: 'loja inexistente', data: null, error: null, status: 404, delivered: 0 },
  { name: 'preferência de pedidos desativada', data: { notifications_new_order_enabled: false, notifications_desktop_enabled: true }, error: null, status: 200, delivered: 0 },
  { name: 'preferência desktop desativada', data: { notifications_new_order_enabled: true, notifications_desktop_enabled: false }, error: null, status: 200, delivered: 0 },
  { name: 'preferências habilitadas', data: { notifications_new_order_enabled: true, notifications_desktop_enabled: true }, error: null, status: 200, delivered: 1 },
]) {
  test(`push respeita ${scenario.name}`, async () => {
    let handler, sent = 0, subscriptionReads = 0;
    const client = { from(table) {
      if (table === 'food_stores') {
        const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: scenario.data, error: scenario.error }) };
        return query;
      }
      assert.equal(table, 'food_push_subscriptions');
      subscriptionReads++;
      const query = { select: () => query, eq: () => query, then: resolve => resolve({ data: [{ id: 'fixture', endpoint: 'https://push.example.invalid', p256dh: 'fixture', auth: 'fixture' }], error: null }) };
      return query;
    } };
    const deno = { serve: value => { handler = value; }, env: { get: key => ({ SUPABASE_URL: 'https://test.supabase.invalid', SUPABASE_SECRET_KEY: 'test-server-secret', VAPID_PUBLIC_KEY: 'fixture', VAPID_PRIVATE_KEY: 'fixture' })[key] } };
    const push = { setVapidDetails() {}, sendNotification: async () => { sent++; } };
    new Function('Deno', 'createClient', 'webPushModule', compiled)(deno, () => client, push);
    const response = await handler(new Request('https://edge.example.invalid', { method: 'POST', headers: { Authorization: 'Bearer test-server-secret', 'Content-Type': 'application/json' }, body: JSON.stringify({ store_id: 'fixture-store' }) }));
    const body = await response.json();
    assert.equal(response.status, scenario.status);
    assert.equal(sent, scenario.delivered);
    assert.equal(subscriptionReads, scenario.delivered ? 1 : 0);
    assert.ok(!JSON.stringify(body).includes('internal private database detail'));
    if (scenario.delivered) assert.equal(body.sent, 1);
  });
}
