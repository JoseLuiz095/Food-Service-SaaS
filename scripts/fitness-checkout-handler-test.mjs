import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFitnessCheckoutHandler } from '../supabase/functions/food-fitness-checkout/handler.ts';

// Injected network/Auth/database: these do not contact a real Asaas sandbox.
const store = '10000000-0000-4000-8000-000000000001';
const plan = '20000000-0000-4000-8000-000000000001';
const uid = '30000000-0000-4000-8000-000000000001';
const eid = '40000000-0000-4000-8000-000000000001';
const sessionId = '50000000-0000-4000-8000-000000000001';
const verifiedToken = 'header.' + Buffer.from(JSON.stringify({ sub: uid, session_id: sessionId })).toString('base64url') + '.signature';
const origin = 'https://fitness-staging.example.invalid';
const authUser = { id: uid, email: 'verified@example.invalid', email_confirmed_at: '2026-10-27T00:00:00Z' };
const input = { storeId: store, planId: plan, name: 'Sandbox Customer', cpfCnpj: '12345678901', sandboxConsent: true };
const enrollment = { id: eid, store_id: store, user_id: uid, plan_id: plan, account: 'test-sandbox', amount_cents: 19990, external_reference: `fitness:${eid}`, checkout_state: 'creating', provider_customer_id: null, provider_subscription_id: null };
const customer = { id: 'cus_one', externalReference: enrollment.external_reference, email: authUser.email, name: 'private', cpfCnpj: 'private' };
const sub = { id: 'sub_one', customer: 'cus_one', externalReference: enrollment.external_reference, value: 199.9, billingType: 'PIX', cycle: 'MONTHLY', status: 'ACTIVE', deleted: false };
const payment = { id: 'pay_one', customer: 'cus_one', subscription: 'sub_one', externalReference: enrollment.external_reference, value: 199.9, status: 'PENDING', dueDate: '2026-10-26', invoiceUrl: 'https://sandbox.asaas.com/i/invoice_one', deleted: false };
const page = data => ({ data, hasMore: false, offset: 0 });
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function fixture(options = {}) {
  const calls = []; const network = []; let reserved = options.existing ? { ...enrollment, ...options.existing } : null;
  const handler = createFitnessCheckoutHandler({
    env: key => ({ FITNESS_ALLOWED_ORIGIN: origin, FITNESS_ASAAS_ACCOUNT: 'test-sandbox', FITNESS_ASAAS_SANDBOX_API_KEY: 'test-only-api-key', ...options.env })[key],
    now: () => new Date('2026-10-27T01:30:00Z'),
    getUser: async token => ({ data: { user: token === verifiedToken ? (options.user ?? authUser) : null }, error: token === verifiedToken ? null : { message: 'private' } }),
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (options.rpc) { const custom = await options.rpc(name, args); if (custom !== undefined) return custom; }
      if (name === 'food_fitness_checkout_reserve_v1') {
        if (reserved) return { data: { ...reserved, created: false }, error: null };
        reserved = { ...enrollment }; return { data: { ...reserved, created: true }, error: null };
      }
      if (name === 'food_fitness_checkout_bind_v1') { reserved = { ...reserved, provider_customer_id: args.p_customer_id, provider_subscription_id: args.p_subscription_id, checkout_state: 'ready' }; return { data: null, error: null }; }
      throw new Error('Unexpected RPC');
    },
    fetch: async (url, init) => {
      network.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
      if (options.fetch) return options.fetch(url, init, network.length);
      if (url.includes('/customers?')) return response(page([customer]));
      if (url.includes('/subscriptions?')) return response(page([sub]));
      if (url.includes('/subscriptions/sub_one/payments')) return response(page([payment]));
      if (url.includes('/payments/pay_one')) return response(payment);
      if (url.includes('/customers')) return response(customer);
      if (url.includes('/subscriptions')) return response(sub);
      throw new Error('Unexpected API');
    },
  });
  const call = async (body = input, headers = {}, method = 'POST') => {
    const res = await handler(new Request('https://staging.example.invalid/functions/v1/food-fitness-checkout', { method, headers: { Origin: origin, Authorization: `Bearer ${verifiedToken}`, 'Content-Type': 'application/json', ...headers }, ...(method === 'GET' || method === 'OPTIONS' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) }));
    return { status: res.status, body: res.status === 204 ? null : await res.json(), headers: res.headers };
  };
  return { call, calls, network };
}

test('rejects invalid Auth and verifies confirmation before reading checkout data', async () => {
  const f = fixture();
  assert.equal((await f.call('{bad-json', { Authorization: 'Bearer invalid' })).status, 401);
  assert.equal((await f.call(input, { Authorization: '' })).status, 401);
  assert.equal(f.calls.length, 0); assert.equal(f.network.length, 0);
  assert.equal((await fixture({ user: { ...authUser, email_confirmed_at: null } }).call()).status, 403);
});
test('requires explicit configured origin and sandbox consent', async () => {
  const f = fixture();
  assert.equal((await f.call(input, { Origin: 'https://outsider.example.invalid' })).status, 403);
  assert.equal((await f.call(input, { Origin: '' })).status, 403);
  assert.equal((await f.call({ ...input, sandboxConsent: false })).status, 422);
  assert.equal((await f.call(input, {}, 'OPTIONS')).status, 204);
  assert.equal(f.calls.length, 0);
  assert.equal((await fixture({ env: { FITNESS_ALLOWED_ORIGIN: '*' } }).call()).status, 403);
});
test('verified Auth identity and DB price prevail over body user/email/price tampering', async () => {
  const f = fixture();
  const result = await f.call({ ...input, userId: 'attacker', email: 'attacker@example.invalid', amount: 0.01, amount_cents: 1 });
  assert.equal(result.status, 200);
  assert.equal(f.calls[0].args.p_user_id, uid);
  const posts = f.network.filter(n => n.init.method === 'POST');
  assert.equal(posts[0].body.email, authUser.email);
  assert.equal(posts[0].body.notificationDisabled, true);
  assert.equal(posts[1].body.value, 199.9);
  assert.equal(posts[1].body.nextDueDate, '2026-10-26');
  assert.equal(posts[1].body.billingType, 'PIX'); assert.equal(posts[1].body.cycle, 'MONTHLY');
  assert.ok(f.network.every(n => n.url.startsWith('https://api-sandbox.asaas.com/v3/') && n.init.redirect === 'error'));
  assert.deepEqual(result.body, { environment: 'sandbox', checkoutStatus: 'awaiting_payment', enrollment_id: eid, invoiceUrl: payment.invoiceUrl });
  assert.equal(JSON.stringify(result.body).includes(authUser.email), false);
  assert.equal(f.calls.filter(c => c.name.includes('billing_apply')).length, 0);
});
test('repeat request uses existing enrollment and only GETs provider resources', async () => {
  const f = fixture();
  assert.equal((await f.call()).status, 200);
  const initial = f.network.length;
  assert.equal((await f.call()).status, 200);
  assert.equal(f.network.filter(n => n.init.method === 'POST').length, 2);
  assert.ok(f.network.slice(initial).every(n => n.init.method === 'GET'));
  assert.equal(f.calls.filter(c => c.name === 'food_fitness_checkout_bind_v1').length, 1);
});
test('timeout during customer POST never retries financial creation', async () => {
  const f = fixture({ fetch: async (url, init) => { if (init.method === 'POST') throw new Error('timeout-private-secret'); return response(page([])); } });
  const first = await f.call(); assert.equal(first.status, 409);
  const retry = await f.call(); assert.equal(retry.status, 409);
  assert.equal(f.network.filter(n => n.init.method === 'POST').length, 1);
  assert.equal(JSON.stringify(first).includes('private-secret'), false);
});
test('read-only recovery binds exactly one customer and subscription by exact external reference', async () => {
  const f = fixture({ existing: {} });
  const result = await f.call();
  assert.equal(result.status, 200);
  assert.ok(f.network.every(n => n.init.method === 'GET'));
  assert.ok(f.network[0].url.includes('externalReference=fitness%3A'));
  assert.ok(f.network[1].url.includes('customer=cus_one'));
  assert.equal(f.calls.filter(c => c.name === 'food_fitness_checkout_bind_v1').length, 1);
});
test('ambiguous/absent recovery and wrong provider reference stay closed without POST', async () => {
  for (const customers of [[], [customer, { ...customer, id: 'cus_two' }], [{ ...customer, externalReference: 'someone-else' }]]) {
    const f = fixture({ existing: {}, fetch: async () => response(page(customers)) });
    const result = await f.call();
    assert.equal(result.status, 409); assert.equal(result.body.error, 'CHECKOUT_REQUIRES_REVIEW');
    assert.ok(f.network.every(n => n.init.method === 'GET'));
    assert.equal(f.calls.filter(c => c.name === 'food_fitness_checkout_bind_v1').length, 0);
  }
});
test('provider price or tenant mismatch does not bind enrollment', async () => {
  const f = fixture({ fetch: async (url) => response(url.endsWith('/customers') ? customer : { ...sub, value: 0.01 }) });
  assert.equal((await f.call()).status, 409);
  assert.equal(f.calls.filter(c => c.name === 'food_fitness_checkout_bind_v1').length, 0);
  const wrong = fixture({ rpc: async name => name.includes('reserve') ? { data: { ...enrollment, store_id: plan, created: true }, error: null } : undefined });
  assert.equal((await wrong.call()).status, 409); assert.equal(wrong.network.length, 0);
});
test('invoice URL rejects lookalike domains and cross-user/cross-subscription payment', async () => {
  for (const changed of [{ invoiceUrl: 'https://www.asaas.com/i/id' }, { invoiceUrl: 'https://sandbox.asaas.com.attacker.invalid/i/id' }, { invoiceUrl: 'http://sandbox.asaas.com/i/id' }, { invoiceUrl: 'https://attacker@sandbox.asaas.com/i/id' }, { customer: 'cus_other' }, { subscription: 'sub_other' }]) {
    const f = fixture({ existing: { checkout_state: 'ready', provider_customer_id: 'cus_one', provider_subscription_id: 'sub_one' }, fetch: async url => {
      if (url.endsWith('/customers/cus_one')) return response(customer);
      if (url.endsWith('/subscriptions/sub_one')) return response(sub);
      if (url.includes('/payments?')) return response(page([payment]));
      return response({ ...payment, ...changed });
    } });
    assert.equal((await f.call()).status, 409);
  }
});
test('recovers across all provider pages and refuses incomplete scans', async () => {
  const f = fixture({ existing: {}, fetch: async url => {
    if (url.includes('/customers?') && url.includes('offset=0')) return response({ data: [{ ...customer, id: 'cus_irrelevant', externalReference: 'different' }], hasMore: true, offset: 0 });
    if (url.includes('/customers?')) return response({ data: [customer], hasMore: false, offset: 1 });
    if (url.includes('/subscriptions?')) return response(page([sub]));
    if (url.includes('/payments?')) return response(page([payment]));
    return response(payment);
  } });
  assert.equal((await f.call()).status, 200);
  const broken = fixture({ existing: {}, fetch: async () => response({ data: [], hasMore: true, offset: 0 }) });
  assert.equal((await broken.call()).status, 409);
});
test('paid or not-yet-generated invoice returns processing without granting access', async () => {
  const f = fixture({ existing: { checkout_state: 'ready', provider_customer_id: 'cus_one', provider_subscription_id: 'sub_one' }, fetch: async url => {
    if (url.includes('/customers/')) return response(customer);
    if (url.includes('/payments?')) return response(page([{ ...payment, status: 'RECEIVED' }]));
    return response(sub);
  } });
  const result = await f.call(); assert.equal(result.status, 202); assert.equal(result.body.checkoutStatus, 'payment_processing'); assert.equal(result.body.invoiceUrl, null);
  assert.equal(f.calls.length, 1);
});
test('subscription POST timeout is read-only on retry and never creates second subscription', async () => {
  let recovering = false;
  const f = fixture({ fetch: async (url, init) => {
    if (init.method === 'POST' && url.endsWith('/customers')) return response(customer);
    if (init.method === 'POST') { recovering = true; throw new Error('timeout'); }
    if (url.includes('/customers?')) return response(page([customer]));
    if (url.includes('/subscriptions?')) return response(page([sub]));
    if (url.includes('/payments?')) return response(page([payment]));
    return response(payment);
  } });
  assert.equal((await f.call()).status, 409); assert.equal(recovering, true);
  assert.equal((await f.call()).status, 200);
  assert.equal(f.network.filter(n => n.init.method === 'POST' && n.url.endsWith('/subscriptions')).length, 1);
});
