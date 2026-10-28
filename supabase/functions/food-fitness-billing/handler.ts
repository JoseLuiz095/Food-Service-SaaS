// Fitness billing is sandbox-only. This module never creates a charge or an Auth user.
export const ASAAS_SANDBOX_URL = 'https://api-sandbox.asaas.com/v3';
const MAX_BODY_BYTES = 65_536;
const MAX_API_BYTES = 1_048_576;
const MAX_HTTP_CALLS = 100;
const MAX_SUBSCRIPTION_PAGES = 20;
const MAX_RUN_MS = 45_000;
const PAGE_SIZE = 25;

type Json = Record<string, unknown>;
type RpcResult = { data: unknown; error: unknown };
type Dependencies = {
  env: (key: string) => string | undefined;
  rpc: (name: string, args: Json) => Promise<RpcResult>;
  fetch: typeof fetch;
  now?: () => number;
  uuid?: () => string;
};
type Event = { event_id: string; event_type: string; resource_type: 'payment' | 'subscription'; resource_id: string };
type Work = {
  events: Event[];
  enrollments: { id: string; provider_customer_id: string; provider_subscription_id: string | null; external_reference: string; payment_offset?: number }[];
  payments: { provider_payment_id: string }[];
  has_more?: boolean;
  truncated?: boolean;
};

class Failure extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 503) { super(code); this.code = code; this.status = status; }
}
const object = (value: unknown): value is Json => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
const eventIdentifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 255 && !/[\s\u0000-\u001f]/.test(value);
const eventType = (value: unknown): value is string => typeof value === 'string' && /^(PAYMENT|SUBSCRIPTION)_[A-Z0-9_]{1,100}$/.test(value);
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// Fixed-size digest comparison avoids early exit based on the first differing byte.
async function sameSecret(received: string | null, expected: string) {
  if (!received || received.length > 1024 || !expected) return false;
  const encode = new TextEncoder();
  const [left, right] = await Promise.all([received, expected].map(value => crypto.subtle.digest('SHA-256', encode.encode(value))));
  const a = new Uint8Array(left); const b = new Uint8Array(right);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

async function readJson(response: Request | Response, maxBytes: number): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Failure('BODY_TOO_LARGE', 413);
  if (!response.body) throw new Failure('INVALID_JSON', 400);
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new Failure('BODY_TOO_LARGE', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const joined = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(joined)); } catch { throw new Failure('INVALID_JSON', 400); }
}

function snapshot(resource: unknown, kind: 'payment' | 'subscription', expectedId: string): Json {
  if (!object(resource) || resource.id !== expectedId || !identifier(resource.customer) || typeof resource.status !== 'string') throw new Failure('INVALID_PROVIDER_RESOURCE');
  const result: Json = { id: resource.id, customer: resource.customer, status: resource.status, deleted: resource.deleted === true };
  for (const key of kind === 'payment' ? ['subscription', 'externalReference', 'dueDate'] : ['externalReference']) {
    const value = resource[key];
    if (value !== undefined && value !== null && typeof value !== 'string') throw new Failure('INVALID_PROVIDER_RESOURCE');
    result[key] = value ?? null;
  }
  if (kind === 'payment') {
    if (typeof resource.value !== 'number' || !Number.isFinite(resource.value) || resource.value < 0) throw new Failure('INVALID_PROVIDER_RESOURCE');
    result.value = resource.value;
    if (resource.refundedValue !== undefined) {
      if (typeof resource.refundedValue !== 'number' || !Number.isFinite(resource.refundedValue) || resource.refundedValue < 0) throw new Failure('INVALID_PROVIDER_RESOURCE');
      result.refundedValue = resource.refundedValue;
    }
    // Conservatively flag any refund history; no card/customer/refund payload is persisted.
    result.refunded = Array.isArray(resource.refunds) && resource.refunds.length > 0;
  }
  return result;
}

function workResult(value: unknown): Work {
  if (!object(value) || !Array.isArray(value.events) || !Array.isArray(value.enrollments) || !Array.isArray(value.payments)) throw new Failure('INVALID_WORK');
  if ([value.events, value.enrollments, value.payments].some(rows => rows.length > 1000)) throw new Failure('INVALID_WORK');
  for (const event of value.events) {
    if (!object(event) || !eventIdentifier(event.event_id) || !eventType(event.event_type) || !['payment', 'subscription'].includes(String(event.resource_type)) || !identifier(event.resource_id)) throw new Failure('INVALID_WORK');
  }
  for (const row of value.enrollments) {
    if (!object(row) || !identifier(row.id) || (row.provider_subscription_id != null && !identifier(row.provider_subscription_id))) throw new Failure('INVALID_WORK');
    if (row.payment_offset !== undefined && (!Number.isSafeInteger(row.payment_offset) || Number(row.payment_offset) < 0 || Number(row.payment_offset) > 2_147_483_647)) throw new Failure('INVALID_WORK');
  }
  for (const row of value.payments) if (!object(row) || !identifier(row.provider_payment_id)) throw new Failure('INVALID_WORK');
  return value as unknown as Work;
}

export function createFitnessBillingHandler(deps: Dependencies) {
  const now = deps.now ?? Date.now;
  const rpc = async (name: string, args: Json) => {
    let result: RpcResult;
    try { result = await deps.rpc(name, args); } catch { throw new Failure('DATABASE_UNAVAILABLE'); }
    if (result.error) throw new Failure('DATABASE_UNAVAILABLE');
    return result.data;
  };

  return async (request: Request): Promise<Response> => {
    const route = new URL(request.url).pathname.replace(/\/$/, '').split('/').at(-1);
    if (route !== 'webhook' && route !== 'reconcile') return json({ error: 'NOT_FOUND' }, 404);
    if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
    try {
      const account = deps.env('FITNESS_ASAAS_ACCOUNT') ?? '';
      const token = deps.env(route === 'webhook' ? 'FITNESS_ASAAS_SANDBOX_WEBHOOK_TOKEN' : 'FITNESS_BILLING_WORKER_TOKEN') ?? '';
      if (!account || !token || token.length < 32 || /\s/.test(token)) throw new Failure('SERVER_NOT_CONFIGURED');
      if (!await sameSecret(request.headers.get(route === 'webhook' ? 'asaas-access-token' : 'x-fitness-worker-token'), token)) return json({ error: 'UNAUTHORIZED' }, 401);

      if (route === 'webhook') {
        const body = await readJson(request, MAX_BODY_BYTES);
        if (!object(body) || !eventIdentifier(body.id) || !eventType(body.event)) return json({ error: 'INVALID_EVENT' }, 422);
        const kind = body.event.startsWith('PAYMENT_') ? 'payment' : 'subscription';
        const resource = body[kind];
        if (!object(resource) || !identifier(resource.id)) return json({ error: 'INVALID_EVENT' }, 422);
        const data = await rpc('food_fitness_billing_ingest_v1', { p_account: account, p_event_id: body.id, p_event_type: body.event, p_resource_type: kind, p_resource_id: resource.id });
        return json({ received: true, duplicate: object(data) && data.duplicate === true, environment: 'sandbox' });
      }

      const apiKey = deps.env('FITNESS_ASAAS_SANDBOX_API_KEY') ?? '';
      if (!apiKey) throw new Failure('SERVER_NOT_CONFIGURED');
      const leaseToken = (deps.uuid ?? (() => crypto.randomUUID()))();
      const leaseArgs = { p_account: account, p_token: leaseToken };
      if (await rpc('food_fitness_billing_lease_v1', leaseArgs) !== true) return json({ error: 'RECONCILIATION_BUSY' }, 409);
      let releaseFailed = false;
      let outcome: Response;
      const started = now(); let httpCalls = 0; let applied = 0; let ignored = 0;
      try {
        const renew = async () => {
          if (now() - started >= MAX_RUN_MS || httpCalls >= MAX_HTTP_CALLS) throw new Failure('RECONCILIATION_LIMIT', 202);
          // Renewal must not reacquire an expired/released lease: another worker
          // may already have processed a newer provider snapshot in between.
          if (await rpc('food_fitness_billing_lease_v1', { ...leaseArgs, p_renew: true }) !== true) throw new Failure('LEASE_LOST');
        };
        const get = async (path: string) => {
          await renew(); httpCalls++;
          let response: Response;
          try { response = await deps.fetch(`${ASAAS_SANDBOX_URL}${path}`, { headers: { access_token: apiKey, 'User-Agent': 'VendeWeb-Fitness-Sandbox', Accept: 'application/json' }, signal: AbortSignal.timeout(10_000), redirect: 'error' }); }
          catch { throw new Failure('PROVIDER_UNAVAILABLE'); }
          if (!response.ok) throw new Failure('PROVIDER_UNAVAILABLE');
          return readJson(response, MAX_API_BYTES);
        };
        const apply = async (kind: 'payment' | 'subscription', resource: unknown, expectedId: string, event: Event | null = null) => {
          const projected = snapshot(resource, kind, expectedId);
          await renew();
          const result = await rpc('food_fitness_billing_apply_v1', { ...leaseArgs, p_event_id: event?.event_id ?? null, p_event_type: event?.event_type ?? (kind === 'payment' ? 'RECONCILE_PAYMENT' : 'RECONCILE_SUBSCRIPTION'), p_resource_type: kind, p_snapshot: projected });
          if (object(result) && result.ignored === true) {
            ignored++;
            if (event) { await renew(); await rpc('food_fitness_billing_complete_v1', { ...leaseArgs, p_event_id: event.event_id }); }
          } else applied++;
        };
        const work = workResult(await rpc('food_fitness_billing_work_v1', { p_account: account, p_limit: 10 }));
        for (const event of work.events) {
          const path = event.resource_type === 'payment' ? 'payments' : 'subscriptions';
          await apply(event.resource_type, await get(`/${path}/${encodeURIComponent(event.resource_id)}`), event.resource_id, event);
        }
        for (const payment of work.payments) await apply('payment', await get(`/payments/${encodeURIComponent(payment.provider_payment_id)}`), payment.provider_payment_id);
        for (const enrollment of work.enrollments) {
          const id = enrollment.provider_subscription_id;
          if (!id) continue;
          await apply('subscription', await get(`/subscriptions/${encodeURIComponent(id)}`), id);
          const seen = new Set<string>(); let offset = enrollment.payment_offset ?? 0; let finished = false;
          for (let page = 0; page < MAX_SUBSCRIPTION_PAGES; page++) {
            const response = await get(`/subscriptions/${encodeURIComponent(id)}/payments?limit=${PAGE_SIZE}&offset=${offset}`);
            if (!object(response) || !Array.isArray(response.data) || typeof response.hasMore !== 'boolean' || (response.offset !== undefined && response.offset !== offset) || response.data.length > PAGE_SIZE) throw new Failure('INVALID_PROVIDER_PAGE');
            if (response.hasMore && response.data.length === 0) throw new Failure('INCOMPLETE_PROVIDER_PAGE');
            for (const payment of response.data) {
              if (!object(payment) || !identifier(payment.id) || seen.has(payment.id)) throw new Failure('INCOMPLETE_PROVIDER_PAGE');
              seen.add(payment.id);
              // A list entry can be summarized. Fetch each payment before applying it.
              await apply('payment', await get(`/payments/${encodeURIComponent(payment.id)}`), payment.id);
            }
            // Advance only after EVERY payment in this page was applied. An
            // interrupted page is replayed idempotently by the next execution.
            const nextOffset = response.hasMore ? offset + response.data.length : 0;
            if (nextOffset > 2_147_483_647) throw new Failure('INVALID_PROVIDER_PAGE');
            await renew();
            await rpc('food_fitness_billing_cursor_v1', { ...leaseArgs, p_enrollment_id: enrollment.id, p_offset: nextOffset, p_complete: !response.hasMore });
            if (!response.hasMore) { finished = true; break; }
            offset = nextOffset;
          }
          if (!finished) throw new Failure('RECONCILIATION_LIMIT', 202);
        }
        // A full capped batch is conservatively incomplete, even on older RPCs
        // that omit pagination metadata. Never claim a whole-account scan then.
        const incomplete = work.has_more === true || work.truncated === true || [work.events, work.payments, work.enrollments].some(rows => rows.length >= 10);
        outcome = json({ environment: 'sandbox', complete: !incomplete, applied, ignored, httpCalls, ...(incomplete ? { continuationRequired: true } : {}) }, incomplete ? 202 : 200);
      } catch (error) {
        const failure = error instanceof Failure ? error : new Failure('RECONCILIATION_FAILED');
        outcome = json({ environment: 'sandbox', complete: false, applied, ignored, httpCalls, error: failure.code, continuationRequired: true }, failure.status);
      } finally {
        try { await rpc('food_fitness_billing_lease_v1', { ...leaseArgs, p_release: true }); } catch { releaseFailed = true; }
      }
      return releaseFailed ? json({ error: 'LEASE_RELEASE_FAILED', environment: 'sandbox', complete: false, continuationRequired: true }, 503) : outcome;
    } catch (error) {
      const failure = error instanceof Failure ? error : new Failure('BILLING_UNAVAILABLE');
      return json({ error: failure.code }, failure.status);
    }
  };
}
