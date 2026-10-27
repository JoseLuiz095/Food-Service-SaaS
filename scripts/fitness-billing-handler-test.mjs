import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFitnessBillingHandler, ASAAS_SANDBOX_URL } from '../supabase/functions/food-fitness-billing/handler.ts';

// Local handler tests only. Network, Asaas and database are injected fakes.
const token = 'test-only-webhook-'.repeat(3);
const worker = 'test-only-worker-'.repeat(3);
const config = { FITNESS_ASAAS_ACCOUNT: 'sandbox-test-account', FITNESS_ASAAS_SANDBOX_WEBHOOK_TOKEN: token, FITNESS_BILLING_WORKER_TOKEN: worker, FITNESS_ASAAS_SANDBOX_API_KEY: 'test-only-api-key' };
const event = { id: 'evt_test&123', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_one', customer: 'cus_one', status: 'RECEIVED', card: { token: 'do-not-store' }, email: 'private@example.invalid' } };
const payment = (id = 'pay_one', overrides = {}) => ({ id, customer: 'cus_one', subscription: 'sub_one', externalReference: 'enrollment-one', value: 100, status: 'RECEIVED', dueDate: '2026-10-27', deleted: false, ...overrides });
const subscription = { id: 'sub_one', customer: 'cus_one', externalReference: 'enrollment-one', status: 'ACTIVE', deleted: false };
const enrollment = { id: 'enrollment-one', provider_customer_id: 'cus_one', provider_subscription_id: 'sub_one', external_reference: 'enrollment-one' };
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function fixture(options = {}) {
  const calls = []; const network = []; const stored = new Map(); const applied = [];
  let leaseCount = 0;
  const rpc = async (name, args) => {
    calls.push({ name, args });
    if (options.rpc) { const custom = await options.rpc(name, args); if (custom !== undefined) return custom; }
    if (name === 'food_fitness_billing_ingest_v1') {
      const duplicate = stored.has(args.p_event_id);
      if (!duplicate) stored.set(args.p_event_id, { event_id: args.p_event_id, event_type: args.p_event_type, resource_type: args.p_resource_type, resource_id: args.p_resource_id });
      return { data: { duplicate }, error: null };
    }
    if (name === 'food_fitness_billing_lease_v1') { leaseCount++; return { data: options.loseLeaseAt === leaseCount ? false : true, error: null }; }
    if (name === 'food_fitness_billing_work_v1') return { data: options.work ?? { events: [...stored.values()], enrollments: [], payments: [] }, error: null };
    if (name === 'food_fitness_billing_apply_v1') { applied.push(args); if (!options.ignored && args.p_event_id) stored.delete(args.p_event_id); return { data: options.ignored ? { ignored: true } : { applied: true }, error: null }; }
    if (name === 'food_fitness_billing_complete_v1') { stored.delete(args.p_event_id); return { data: null, error: null }; }
    if (name === 'food_fitness_billing_cursor_v1') return { data: null, error: null };
    throw new Error('Unexpected RPC');
  };
  const fetch = async (url, init) => {
    network.push({ url, init });
    if (options.fetch) return options.fetch(url, init, network.length);
    return response(url.includes('/subscriptions/') ? subscription : payment());
  };
  const handler = createFitnessBillingHandler({ env: name => ({ ...config, ...options.env })[name], rpc, fetch, uuid: () => '00000000-0000-4000-8000-000000000001', now: options.now });
  const call = async (route = 'webhook', body = event, headers = {}, method = 'POST') => {
    const req = new Request(`https://staging.example.invalid/functions/v1/food-fitness-billing/${route}`, { method, headers: { [route === 'webhook' ? 'asaas-access-token' : 'x-fitness-worker-token']: route === 'webhook' ? token : worker, 'Content-Type': 'application/json', ...headers }, ...(method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
    const res = await handler(req);
    return { status: res.status, body: await res.json() };
  };
  return { call, calls, network, stored, applied };
}

test('authenticates before reading/parsing body; rejects invalid and absent token', async () => {
  const f = fixture();
  assert.equal((await f.call('webhook', '{not-json', { 'asaas-access-token': 'wrong' })).status, 401);
  assert.equal((await f.call('webhook', event, { 'asaas-access-token': '' })).status, 401);
  assert.equal((await f.call('reconcile', {}, { 'x-fitness-worker-token': 'wrong' })).status, 401);
  assert.equal(f.calls.length, 0); assert.equal(f.network.length, 0);
});
test('rejects missing configuration, invalid event, unsupported resource and oversized body', async () => {
  assert.equal((await fixture({ env: { FITNESS_ASAAS_SANDBOX_WEBHOOK_TOKEN: '' } }).call()).status, 503);
  const f = fixture();
  assert.equal((await f.call('webhook', { ...event, id: '' })).status, 422);
  assert.equal((await f.call('webhook', { ...event, event: 'CHECKOUT_PAID' })).status, 422);
  assert.equal((await f.call('webhook', { ...event, payment: { id: '../customers' } })).status, 422);
  assert.equal((await f.call('webhook', '{bad-json')).status, 400);
  assert.equal((await f.call('webhook', 'x'.repeat(70_000))).status, 413);
  assert.equal(f.calls.length, 0);
});
test('persists only IDs and type; duplicate events do not enqueue another event', async () => {
  const f = fixture();
  assert.equal((await f.call()).body.duplicate, false);
  assert.equal((await f.call()).body.duplicate, true);
  assert.equal(f.stored.size, 1);
  assert.deepEqual(f.calls[0].args, { p_account: config.FITNESS_ASAAS_ACCOUNT, p_event_id: event.id, p_event_type: event.event, p_resource_type: 'payment', p_resource_id: 'pay_one' });
  assert.equal(JSON.stringify(f.calls).includes('private@example.invalid'), false);
  assert.equal(JSON.stringify(f.calls).includes('do-not-store'), false);
  assert.equal(f.network.length, 0);
});
test('subscription event is persisted separately and cannot grant from browser success', async () => {
  const f = fixture();
  assert.equal((await f.call('webhook', { id: 'evt_sub', event: 'SUBSCRIPTION_DELETED', subscription: { id: 'sub_one' } })).status, 200);
  assert.equal(f.calls[0].args.p_resource_type, 'subscription');
  assert.equal((await f.call('success')).status, 404);
  assert.equal((await f.call('webhook', event, {}, 'GET')).status, 405);
  assert.equal(f.applied.length, 0);
});
test('database persistence failure never acknowledges delivery and hides database detail', async () => {
  const f = fixture({ rpc: async () => ({ data: null, error: { message: 'private-secret-and-email' } }) });
  const result = await f.call();
  assert.equal(result.status, 503); assert.equal(result.body.error, 'DATABASE_UNAVAILABLE');
  assert.equal(JSON.stringify(result).includes('private-secret'), false);
});
test('worker uses current GET status instead of an old received webhook and strips PII', async () => {
  const f = fixture({ fetch: async () => response(payment('pay_one', { status: 'REFUNDED', refunds: [{ value: 100, creditCardToken: 'secret' }], refundedValue: 100, creditCard: { number: 'secret' }, description: 'private' })) });
  await f.call();
  const result = await f.call('reconcile', {});
  assert.equal(result.status, 200); assert.equal(result.body.complete, true);
  assert.equal(f.stored.size, 0);
  assert.deepEqual(f.applied[0].p_snapshot, { id: 'pay_one', customer: 'cus_one', subscription: 'sub_one', externalReference: 'enrollment-one', value: 100, status: 'REFUNDED', dueDate: '2026-10-27', deleted: false, refundedValue: 100, refunded: true });
  assert.equal(f.network[0].url, `${ASAAS_SANDBOX_URL}/payments/pay_one`);
  assert.equal(f.network[0].init.redirect, 'error');
  assert.equal(f.network[0].init.headers.access_token, config.FITNESS_ASAAS_SANDBOX_API_KEY);
  assert.ok(f.calls.some(c => c.name === 'food_fitness_billing_lease_v1' && c.args.p_release === true));
});
test('provider failure leaves event pending; retry reconsults and applies once', async () => {
  let failing = true;
  const f = fixture({ fetch: async () => failing ? response({}, 500) : response(payment()) });
  await f.call();
  assert.equal((await f.call('reconcile', {})).status, 503);
  assert.equal(f.stored.size, 1); assert.equal(f.applied.length, 0);
  failing = false;
  assert.equal((await f.call('reconcile', {})).status, 200);
  assert.equal(f.stored.size, 0); assert.equal(f.applied.length, 1);
});
test('unknown contract event is completed only after the database explicitly ignores it', async () => {
  const f = fixture({ ignored: true });
  await f.call();
  const result = await f.call('reconcile', {});
  assert.equal(result.body.ignored, 1); assert.equal(f.stored.size, 0);
  assert.equal(f.calls.filter(c => c.name === 'food_fitness_billing_complete_v1').length, 1);
});
test('reconciles old known payments plus every subscription page, fetching full payment snapshots', async () => {
  const f = fixture({ work: { events: [], payments: [{ provider_payment_id: 'pay_old' }], enrollments: [enrollment] }, fetch: async url => {
    if (url.includes('/payments?') && url.includes('offset=0')) return response({ data: [{ id: 'pay_one' }], hasMore: true, offset: 0 });
    if (url.includes('/payments?') && url.includes('offset=1')) return response({ data: [{ id: 'pay_two' }], hasMore: false, offset: 1 });
    if (url.endsWith('/sub_one')) return response(subscription);
    return response(payment(url.split('/').at(-1), { status: url.endsWith('pay_old') ? 'REFUNDED' : 'RECEIVED' }));
  } });
  const result = await f.call('reconcile', {});
  assert.equal(result.status, 200); assert.equal(result.body.complete, true);
  assert.deepEqual(f.applied.map(row => row.p_snapshot.id), ['pay_old', 'sub_one', 'pay_one', 'pay_two']);
  assert.equal(f.applied[0].p_event_type, 'RECONCILE_PAYMENT');
  assert.ok(f.network.every(call => call.url.startsWith(`${ASAAS_SANDBOX_URL}/`) && call.init.method === undefined));
});
test('empty, repeated or inconsistent pagination fails closed instead of claiming a complete scan', async () => {
  for (const mode of ['empty', 'repeat', 'offset']) {
    const f = fixture({ work: { events: [], payments: [], enrollments: [enrollment] }, fetch: async url => {
      if (url.endsWith('/sub_one')) return response(subscription);
      if (url.includes('/payments?')) {
        if (mode === 'empty') return response({ data: [], hasMore: true });
        if (mode === 'offset') return response({ data: [{ id: 'pay_one' }], hasMore: true, offset: 999 });
        return response({ data: [{ id: 'pay_one' }], hasMore: true });
      }
      return response(payment());
    } });
    const result = await f.call('reconcile', {});
    assert.equal(result.status, 503); assert.equal(result.body.complete, false);
  }
});
test('persists a completed page cursor and resumes the next run at offset 25', async () => {
  const target = { ...enrollment, payment_offset: 0 };
  const work = { events: [], payments: [], enrollments: [target] };
  let elapsed = 0;
  const f = fixture({ work, now: () => elapsed, rpc: async (name, args) => {
    if (name !== 'food_fitness_billing_cursor_v1') return undefined;
    target.payment_offset = args.p_complete ? 0 : args.p_offset;
    if (!args.p_complete) elapsed = 50_000; // Hit this execution's time budget after saving a full page.
    return { data: null, error: null };
  }, fetch: async url => {
    if (url.endsWith('/sub_one')) return response(subscription);
    if (url.includes('/payments?')) {
      assert.ok(url.includes('limit=25'));
      if (url.includes('offset=0')) return response({ data: Array.from({ length: 25 }, (_, i) => ({ id: `pay_page_${i}` })), hasMore: true, offset: 0 });
      assert.ok(url.includes('offset=25'));
      return response({ data: [{ id: 'pay_last' }], hasMore: false, offset: 25 });
    }
    return response(payment(url.split('/').at(-1)));
  } });
  const first = await f.call('reconcile', {});
  assert.equal(first.status, 202); assert.equal(first.body.complete, false);
  assert.equal(first.body.error, 'RECONCILIATION_LIMIT');
  assert.equal(target.payment_offset, 25);
  const requestsBeforeRetry = f.network.length;
  const second = await f.call('reconcile', {});
  assert.equal(second.status, 200); assert.equal(second.body.complete, true);
  assert.equal(target.payment_offset, 0);
  const retryPages = f.network.slice(requestsBeforeRetry).filter(call => call.url.includes('/payments?'));
  assert.equal(retryPages.length, 1); assert.ok(retryPages[0].url.includes('offset=25'));
  assert.deepEqual(f.calls.filter(call => call.name === 'food_fitness_billing_cursor_v1').map(call => ({ offset: call.args.p_offset, complete: call.args.p_complete })), [{ offset: 25, complete: false }, { offset: 0, complete: true }]);
  assert.equal(f.applied.filter(call => call.p_snapshot.id === 'pay_page_0').length, 1);
});
test('interruption inside a page never advances its cursor', async () => {
  const f = fixture({ work: { events: [], payments: [], enrollments: [{ ...enrollment, payment_offset: 50 }] }, fetch: async url => {
    if (url.endsWith('/sub_one')) return response(subscription);
    if (url.includes('/payments?')) { assert.ok(url.includes('offset=50')); return response({ data: [{ id: 'pay_ok' }, { id: 'pay_failure' }], hasMore: false, offset: 50 }); }
    if (url.endsWith('/pay_failure')) throw new Error('failure in page');
    return response(payment('pay_ok'));
  } });
  const result = await f.call('reconcile', {});
  assert.equal(result.status, 503); assert.equal(result.body.complete, false);
  assert.equal(f.calls.filter(call => call.name === 'food_fitness_billing_cursor_v1').length, 0);
  assert.equal(f.applied.filter(call => call.p_snapshot.id === 'pay_ok').length, 1);
});
test('lease contention and loss prevent mutation; acquired leases always release', async () => {
  const busy = fixture({ loseLeaseAt: 1 });
  assert.equal((await busy.call('reconcile', {})).status, 409); assert.equal(busy.network.length, 0);
  const lost = fixture({ work: { events: [], payments: [{ provider_payment_id: 'pay_one' }], enrollments: [] }, loseLeaseAt: 3 });
  const result = await lost.call('reconcile', {});
  assert.equal(result.body.error, 'LEASE_LOST'); assert.equal(lost.applied.length, 0);
  assert.equal(lost.calls.at(-1).args.p_release, true);
});
test('expired worker cannot reacquire after a newer worker acquires and releases the lease', async () => {
  let activeToken = null;
  const f = fixture({
    work: { events: [], payments: [{ provider_payment_id: 'pay_one' }], enrollments: [] },
    rpc: async (name, args) => {
      if (name !== 'food_fitness_billing_lease_v1') return undefined;
      if (args.p_release) { if (activeToken === args.p_token) activeToken = null; return { data: true, error: null }; }
      if (args.p_renew) return { data: activeToken === args.p_token, error: null };
      if (activeToken !== null) return { data: false, error: null };
      activeToken = args.p_token;
      return { data: true, error: null };
    },
    fetch: async () => {
      // While GET is in flight, this worker expires, another worker processes a
      // newer state and releases. The old token must never acquire the empty row.
      activeToken = 'newer-worker-token';
      activeToken = null;
      return response(payment());
    },
  });
  const result = await f.call('reconcile', {});
  assert.equal(result.status, 503);
  assert.equal(result.body.error, 'LEASE_LOST');
  assert.equal(f.applied.length, 0);
  const leases = f.calls.filter(call => call.name === 'food_fitness_billing_lease_v1');
  assert.equal(leases[0].args.p_renew, undefined);
  assert.ok(leases.slice(1, -1).every(call => call.args.p_renew === true));
  assert.equal(leases.at(-1).args.p_release, true);
});
test('time and batch bounds are explicit and never report complete reconciliation', async () => {
  let timeCalls = 0;
  const f = fixture({ now: () => timeCalls++ === 0 ? 0 : 50_000, work: { events: [], payments: [{ provider_payment_id: 'pay_one' }], enrollments: [] } });
  const timed = await f.call('reconcile', {});
  assert.equal(timed.status, 202); assert.equal(timed.body.complete, false); assert.equal(timed.body.continuationRequired, true); assert.equal(f.network.length, 0);
  const partial = fixture({ work: { events: [], payments: [], enrollments: [], has_more: true } });
  const result = await partial.call('reconcile', {});
  assert.equal(result.status, 202); assert.equal(result.body.complete, false);
});
test('invalid provider identity/status and redirect errors do not reach apply', async () => {
  for (const get of [async () => response(payment('pay_other')), async () => response({ id: 'pay_one' }), async () => { throw new Error('redirect or timeout with secret'); }]) {
    const f = fixture({ work: { events: [], payments: [{ provider_payment_id: 'pay_one' }], enrollments: [] }, fetch: get });
    const result = await f.call('reconcile', {});
    assert.equal(result.status, 503); assert.equal(f.applied.length, 0);
    assert.equal(JSON.stringify(result).includes('secret'), false);
  }
});
