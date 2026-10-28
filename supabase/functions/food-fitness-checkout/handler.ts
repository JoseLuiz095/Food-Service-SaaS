// An authenticated, consented sandbox purchase. Financial POSTs are never retried.
const API = 'https://api-sandbox.asaas.com/v3';
const MAX_PAGES = 20;
const MAX_BYTES = 1_048_576;
type Json = Record<string, unknown>;
type User = { id: string; email?: string; email_confirmed_at?: string | null };
type Dependencies = {
  env: (key: string) => string | undefined;
  getUser: (token: string) => Promise<{ data: { user: User | null }; error: unknown }>;
  rpc: (name: string, args: Json) => Promise<{ data: unknown; error: unknown }>;
  fetch: typeof fetch;
  now?: () => Date;
};
type Enrollment = { id: string; store_id: string; account: string; user_id: string; plan_id: string; amount_cents: number; external_reference: string; checkout_state: string; provider_customer_id: string | null; provider_subscription_id: string | null; created: boolean };
class Failure extends Error {
  code: string; status: number;
  constructor(code: string, status = 503) { super(code); this.code = code; this.status = status; }
}
const isObject = (value: unknown): value is Json => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
const reference = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 255 && !/[\u0000-\u001f]/.test(value);
const centsEqual = (value: unknown, cents: number) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value * 100 - cents) < 0.000001;
const review = () => new Failure('CHECKOUT_REQUIRES_REVIEW', 409);

async function readJson(response: Request | Response, maximum = MAX_BYTES): Promise<unknown> {
  if (!response.body || Number(response.headers.get('content-length')) > maximum) throw new Failure('INVALID_RESPONSE', 400);
  const reader = response.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > maximum) { await reader.cancel(); throw new Failure('BODY_TOO_LARGE', 413); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  const all = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(all)); } catch { throw new Failure('INVALID_JSON', 400); }
}

function validateCustomer(value: unknown, enrollment: Enrollment, email?: string): Json {
  if (!isObject(value) || !id(value.id) || value.externalReference !== enrollment.external_reference || value.deleted === true || (email && (typeof value.email !== 'string' || value.email.toLowerCase() !== email.toLowerCase()))) throw review();
  return value;
}
function validateSubscription(value: unknown, enrollment: Enrollment, customerId: string): Json {
  if (!isObject(value) || !id(value.id) || value.customer !== customerId || value.externalReference !== enrollment.external_reference || !centsEqual(value.value, enrollment.amount_cents) || value.billingType !== 'PIX' || value.cycle !== 'MONTHLY' || value.deleted === true || value.status !== 'ACTIVE') throw review();
  return value;
}
function invoiceUrl(value: unknown): string {
  if (typeof value !== 'string') throw review();
  let url: URL; try { url = new URL(value); } catch { throw review(); }
  // Exact hosts only: never accept lookalike domains or credentials in the URL.
  if (url.protocol !== 'https:' || url.hostname !== 'sandbox.asaas.com' || url.username || url.password || url.port || !/^\/i\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) throw review();
  return `${url.origin}${url.pathname}`;
}

export function createFitnessCheckoutHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('Origin') ?? '';
    const configured = (deps.env('FITNESS_ALLOWED_ORIGIN') ?? '').replace(/\/$/, '');
    let validOrigin = false;
    try { validOrigin = Boolean(configured) && new URL(configured).origin === configured && origin === configured; } catch { /* closed by default */ }
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin', ...(validOrigin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization,apikey,x-client-info,content-type', 'Access-Control-Allow-Methods': 'POST,OPTIONS' } : {}) };
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (!validOrigin) return json({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
    try {
      const apiKey = deps.env('FITNESS_ASAAS_SANDBOX_API_KEY') ?? '';
      const account = deps.env('FITNESS_ASAAS_ACCOUNT') ?? '';
      if (!apiKey || !account) throw new Failure('SERVER_NOT_CONFIGURED');
      const bearer = /^Bearer ([^\s]+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
      if (!bearer) throw new Failure('UNAUTHORIZED', 401);
      let auth: Awaited<ReturnType<Dependencies['getUser']>>;
      try { auth = await deps.getUser(bearer); } catch { throw new Failure('UNAUTHORIZED', 401); }
      const user = auth.data?.user;
      if (auth.error || !user || !uuid(user.id)) throw new Failure('UNAUTHORIZED', 401);
      if (!user.email || !user.email_confirmed_at) throw new Failure('VERIFIED_EMAIL_REQUIRED', 403);
      // Decode only AFTER getUser verified this bearer. The database checks that
      // its session still exists; an unexpired signed-out JWT cannot buy access.
      let sessionId: string;
      try {
        const part = bearer.split('.')[1];
        const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
        if (claims.sub !== user.id || !uuid(claims.session_id)) throw new Error();
        sessionId = claims.session_id;
      } catch { throw new Failure('VALID_SESSION_REQUIRED', 401); }
      const body = await readJson(request, 16_384);
      if (!isObject(body) || !uuid(body.storeId) || !uuid(body.planId) || body.sandboxConsent !== true || typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.length > 120 || /[\u0000-\u001f]/.test(body.name) || typeof body.cpfCnpj !== 'string' || !/^[0-9.\-/\s]{11,20}$/.test(body.cpfCnpj)) throw new Failure('INVALID_CHECKOUT', 422);
      const document = body.cpfCnpj.replace(/\D/g, '');
      if (![11, 14].includes(document.length)) throw new Failure('INVALID_CHECKOUT', 422);
      const rpc = async (name: string, args: Json) => {
        let result: Awaited<ReturnType<Dependencies['rpc']>>;
        try { result = await deps.rpc(name, args); } catch { throw new Failure('CHECKOUT_UNAVAILABLE', 409); }
        if (result.error) throw new Failure('CHECKOUT_UNAVAILABLE', 409);
        return result.data;
      };
      const reserved = await rpc('food_fitness_checkout_reserve_v1', { p_store_id: body.storeId, p_user_id: user.id, p_plan_id: body.planId, p_session_id: sessionId });
      if (!isObject(reserved) || !uuid(reserved.id) || reserved.store_id !== body.storeId || reserved.user_id !== user.id || reserved.plan_id !== body.planId || reserved.account !== account || !Number.isSafeInteger(reserved.amount_cents) || Number(reserved.amount_cents) <= 0 || !reference(reserved.external_reference) || typeof reserved.created !== 'boolean') throw review();
      const enrollment = reserved as unknown as Enrollment;
      const api = async (path: string, method = 'GET', payload?: Json): Promise<unknown> => {
        let response: Response;
        try {
          response = await deps.fetch(`${API}${path}`, { method, headers: { access_token: apiKey, 'User-Agent': 'VendeWeb-Fitness-Sandbox', Accept: 'application/json', ...(payload ? { 'Content-Type': 'application/json' } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}), signal: AbortSignal.timeout(10_000), redirect: 'error' });
        } catch { throw method === 'POST' ? review() : new Failure('PROVIDER_UNAVAILABLE'); }
        if (!response.ok) throw method === 'POST' ? review() : new Failure('PROVIDER_UNAVAILABLE');
        try { return await readJson(response); } catch { throw method === 'POST' ? review() : new Failure('INVALID_PROVIDER_RESPONSE'); }
      };
      const list = async (path: string) => {
        const results: Json[] = []; const seen = new Set<string>(); let offset = 0;
        for (let page = 0; page < MAX_PAGES; page++) {
          const data = await api(`${path}${path.includes('?') ? '&' : '?'}limit=100&offset=${offset}`);
          if (!isObject(data) || !Array.isArray(data.data) || typeof data.hasMore !== 'boolean' || data.data.length > 100 || (data.offset !== undefined && data.offset !== offset) || (data.hasMore && data.data.length === 0)) throw review();
          for (const row of data.data) {
            if (!isObject(row) || !id(row.id) || seen.has(row.id)) throw review();
            seen.add(row.id); results.push(row);
          }
          if (!data.hasMore) return results;
          offset += data.data.length;
        }
        throw review(); // A partial scan cannot establish uniqueness or invoice ownership.
      };
      let customerId: string; let subscriptionId: string;
      if (enrollment.created) {
        if (enrollment.checkout_state !== 'creating' || enrollment.provider_customer_id || enrollment.provider_subscription_id) throw review();
        // Only this first reservation can POST. A timeout permanently switches
        // later requests to read-only recovery; it never repeats either POST.
        const customer = validateCustomer(await api('/customers', 'POST', { name: body.name.trim(), cpfCnpj: document, email: user.email, externalReference: enrollment.external_reference, notificationDisabled: true }), enrollment, user.email);
        customerId = customer.id as string;
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format((deps.now ?? (() => new Date()))());
        const subscription = validateSubscription(await api('/subscriptions', 'POST', { customer: customerId, billingType: 'PIX', cycle: 'MONTHLY', value: enrollment.amount_cents / 100, nextDueDate: today, externalReference: enrollment.external_reference }), enrollment, customerId);
        subscriptionId = subscription.id as string;
        await rpc('food_fitness_checkout_bind_v1', { p_enrollment_id: enrollment.id, p_customer_id: customerId, p_subscription_id: subscriptionId });
      } else if (enrollment.checkout_state === 'ready' && id(enrollment.provider_customer_id) && id(enrollment.provider_subscription_id)) {
        customerId = enrollment.provider_customer_id; subscriptionId = enrollment.provider_subscription_id;
        if (validateCustomer(await api(`/customers/${encodeURIComponent(customerId)}`), enrollment).id !== customerId) throw review();
        const subscription = validateSubscription(await api(`/subscriptions/${encodeURIComponent(subscriptionId)}`), enrollment, customerId);
        if (subscription.id !== subscriptionId) throw review();
      } else if (enrollment.checkout_state === 'creating') {
        const filter = encodeURIComponent(enrollment.external_reference);
        const customers = (await list(`/customers?externalReference=${filter}`)).filter(row => row.externalReference === enrollment.external_reference);
        if (customers.length !== 1) throw review();
        customerId = validateCustomer(customers[0], enrollment, user.email).id as string;
        const subscriptions = (await list(`/subscriptions?customer=${encodeURIComponent(customerId)}&externalReference=${filter}&includeDeleted=true`)).filter(row => row.externalReference === enrollment.external_reference);
        if (subscriptions.length !== 1) throw review();
        subscriptionId = validateSubscription(subscriptions[0], enrollment, customerId).id as string;
        await rpc('food_fitness_checkout_bind_v1', { p_enrollment_id: enrollment.id, p_customer_id: customerId, p_subscription_id: subscriptionId });
      } else throw review();

      const payments = await list(`/subscriptions/${encodeURIComponent(subscriptionId)}/payments`);
      const pending = payments.filter(row => row.deleted !== true && ['PENDING', 'OVERDUE'].includes(String(row.status))).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)) || String(a.id).localeCompare(String(b.id)));
      let invoice: string | null = null;
      if (pending.length) {
        const current = await api(`/payments/${encodeURIComponent(pending[0].id as string)}`);
        if (!isObject(current) || current.id !== pending[0].id || current.customer !== customerId || current.subscription !== subscriptionId || current.externalReference !== enrollment.external_reference || !centsEqual(current.value, enrollment.amount_cents) || current.deleted === true) throw review();
        if (['PENDING', 'OVERDUE'].includes(String(current.status))) invoice = invoiceUrl(current.invoiceUrl);
      }
      return json({ environment: 'sandbox', checkoutStatus: invoice ? 'awaiting_payment' : 'payment_processing', enrollment_id: enrollment.id, invoiceUrl: invoice }, invoice ? 200 : 202);
    } catch (error) {
      const failure = error instanceof Failure ? error : new Failure('CHECKOUT_UNAVAILABLE');
      return json({ environment: 'sandbox', error: failure.code }, failure.status);
    }
  };
}
