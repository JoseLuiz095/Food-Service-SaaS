import { buildPixPayloadWithAmount } from '../../../src/utils/pix.ts';

type PaymentOrder = { id: string; store_id: string; order_number: number; total: number; payment_method: string; payment_status: string; status: string };
type PaymentStore = { id: string; name: string; active: boolean; access_status: string; pix_enabled: boolean; pix_receipt_mode: 'key' | 'copy_paste'; pix_key: string; pix_copy_paste: string; pix_holder_name: string; city: string };
type Dependencies = {
  env: (key: string) => string | undefined;
  now?: () => number;
  authorizedOrder: (jwt: string, storeId: string, orderId: string) => Promise<PaymentOrder | null>;
  order: (storeId: string, orderId: string) => Promise<PaymentOrder | null>;
  store: (storeId: string) => Promise<PaymentStore | null>;
};
type Grant = { v: number; storeId: string; orderId: string; expiresAt: number; fingerprint: string };
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const encoder = new TextEncoder();
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unbase64 = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const digest = async (value: string) => base64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
const payloadFor = (order: PaymentOrder, store: PaymentStore) => buildPixPayloadWithAmount({
  receiptMode: store.pix_receipt_mode, key: store.pix_key || '', copyPaste: store.pix_copy_paste || '',
  receiver: store.pix_holder_name || '', city: store.city || '', amount: Number(order.total), txid: `PED${order.order_number}`,
});

/** Read-only capability API. No financial creation, confirmation or database writes. */
export const createOrderPaymentHandler = (deps: Dependencies) => async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin') || '';
  const allowed = (deps.env('ORDER_PAYMENT_ALLOWED_ORIGINS') || 'https://www.vendeweb.com.br,https://vendeweb.com.br').split(',').map(s => s.trim());
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, private', 'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin', 'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !allowed.includes(origin)) return reply(403, { error: 'Origem não autorizada.' });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply(405, { error: 'Método não permitido.' });
  const secret = deps.env('ORDER_PAYMENT_LINK_SECRET') || '';
  if (deps.env('ORDER_PAYMENT_LINK_ENABLED') !== 'true' || secret.length < 32) return reply(503, { error: 'Link de pagamento ainda não habilitado. Solicite o QR Code à loja.' });
  const now = deps.now?.() ?? Date.now();
  try {
    // Bound the actual body too; Content-Length may be absent or dishonest.
    const reader = req.body?.getReader();
    let raw = ''; let size = 0;
    if (reader) for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 4096) { await reader.cancel(); return reply(413, { error: 'Solicitação muito grande.' }); }
      raw += new TextDecoder().decode(value);
    }
    const body = JSON.parse(raw);
    const key = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', encoder.encode(secret)), 'AES-GCM', false, ['encrypt', 'decrypt']);
    let grant: Grant;
    let order: PaymentOrder | null;
    if (body.action === 'issue') {
      const jwt = req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
      if (!jwt) return reply(401, { error: 'Entre na conta da loja para compartilhar.' });
      if (!uuid.test(body.storeId || '') || !uuid.test(body.orderId || '')) return reply(400, { error: 'Pedido inválido.' });
      order = await deps.authorizedOrder(jwt, body.storeId, body.orderId);
      if (!order) return reply(403, { error: 'Sem acesso a este pedido.' });
      grant = { v: 1, storeId: body.storeId, orderId: body.orderId, expiresAt: now + 24 * 60 * 60 * 1000, fingerprint: '' };
    } else if (body.action === 'resolve') {
      if (typeof body.token !== 'string' || body.token.length > 2048 || !/^[\w-]+\.[\w-]+$/.test(body.token)) return reply(404, { error: 'Link inválido ou expirado. Solicite outro à loja.' });
      try {
        const [iv, ciphertext] = body.token.split('.').map(unbase64);
        if (iv.length !== 12) throw new Error();
        grant = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('vendeweb-order-payment-v1') }, key, ciphertext)));
      } catch { return reply(404, { error: 'Link inválido ou expirado. Solicite outro à loja.' }); }
      if (grant.v !== 1 || !uuid.test(grant.storeId) || !uuid.test(grant.orderId) || !Number.isFinite(grant.expiresAt) || grant.expiresAt <= now || grant.expiresAt > now + 86400000) return reply(410, { error: 'Link expirado. Solicite outro à loja.' });
      order = await deps.order(grant.storeId, grant.orderId);
    } else return reply(400, { error: 'Solicitação inválida.' });
    if (!order || order.store_id !== grant.storeId || order.id !== grant.orderId) return reply(404, { error: 'Pagamento indisponível. Fale com a loja.' });
    const store = await deps.store(grant.storeId);
    if (!store || store.id !== grant.storeId || !store.active || store.access_status !== 'online') return reply(410, { error: 'Pagamento indisponível. Fale com a loja.' });
    const ended = order.status === 'cancelled' ? 'cancelled' : order.payment_status === 'paid' ? 'paid' : null;
    if (ended) return body.action === 'issue'
      ? reply(409, { error: 'Este pedido já foi pago ou cancelado.' })
      : reply(200, { status: ended, storeName: store.name, orderNumber: order.order_number });
    if (order.payment_method !== 'pix' || order.payment_status !== 'pending' || !store.pix_enabled || !Number.isFinite(Number(order.total)) || Number(order.total) <= 0) return reply(410, { error: 'Pagamento indisponível. Fale com a loja.' });
    let pixPayload: string;
    try { pixPayload = payloadFor(order, store); } catch { return reply(409, { error: 'A loja precisa revisar a configuração do Pix.' }); }
    const fingerprint = await digest(JSON.stringify([order.total, pixPayload, store.pix_holder_name]));
    if (body.action === 'issue') {
      grant.fingerprint = fingerprint;
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('vendeweb-order-payment-v1') }, key, encoder.encode(JSON.stringify(grant)));
      return reply(200, { token: `${base64(iv)}.${base64(new Uint8Array(ciphertext))}`, expiresAt: new Date(grant.expiresAt).toISOString() });
    }
    if (grant.fingerprint !== fingerprint) return reply(410, { error: 'O pedido ou os dados do Pix mudaram. Solicite um novo link à loja.' });
    return reply(200, { status: 'pending', storeName: store.name, orderNumber: order.order_number, total: Number(order.total), receiver: store.pix_holder_name, pixPayload, expiresAt: new Date(grant.expiresAt).toISOString() });
  } catch {
    return reply(400, { error: 'Não foi possível consultar o pagamento. Tente novamente.' });
  }
};
