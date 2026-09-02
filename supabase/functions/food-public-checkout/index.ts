import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';

type TurnstileResult = {
  success: boolean;
  hostname?: string;
  action?: string;
  'error-codes'?: string[];
};

const jsonHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Vary': 'Origin',
  'Content-Type': 'application/json',
});

const allowedOrigins = () => new Set(
  String(Deno.env.get('PUBLIC_APP_ORIGINS') || '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean),
);

const allowedOrigin = (origin: string) => {
  const configured = allowedOrigins();
  if (!origin || configured.size === 0) return true;
  return configured.has(origin.replace(/\/$/, ''));
};

const activeStoreDomainAllowsOrigin = async (adminClient: ReturnType<typeof createClient>, storeId: string, origin: string) => {
  const hostname = parseOriginHostname(origin);
  if (!UUID_PATTERN.test(storeId) || !hostname) return false;
  const { data, error } = await adminClient
    .from('food_store_domains')
    .select('id')
    .eq('store_id', storeId)
    .eq('domain', hostname)
    .eq('active', true)
    .limit(1);
  return !error && Boolean(data?.length);
};

const parseOriginHostname = (origin: string) => {
  try { return new URL(origin).hostname.toLowerCase(); } catch { return ''; }
};

const clientIpFrom = (req: Request) => {
  const cf = (req.headers.get('cf-connecting-ip') || '').trim();
  if (cf) return cf;
  return (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || '';
};

const sha256 = async (value: string) => {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const validateTurnstile = async (token: string, remoteIp: string, origin: string) => {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY') || '';
  const required = String(Deno.env.get('TURNSTILE_REQUIRED') || '').toLowerCase() === 'true';

  if (!secret) {
    if (required) throw new Error('Proteção anti-spam ainda não foi configurada no servidor.');
    return { configured: false, validated: false };
  }

  if (!token) throw new Error('Conclua a verificação anti-spam antes de finalizar o pedido.');

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret,
      response: token,
      ...(remoteIp ? { remoteip: remoteIp } : {}),
    }),
  });
  const result = await response.json() as TurnstileResult;
  if (!response.ok || !result.success) {
    throw new Error('Não foi possível confirmar a verificação anti-spam. Atualize a página e tente novamente.');
  }

  const originHostname = parseOriginHostname(origin);
  if (originHostname && result.hostname && result.hostname.toLowerCase() !== originHostname) {
    throw new Error('A verificação anti-spam não pertence a este endereço da plataforma.');
  }
  if (result.action && result.action !== 'checkout') {
    throw new Error('A verificação anti-spam não corresponde ao checkout.');
  }

  return { configured: true, validated: true };
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') || '';
  const headers = jsonHeaders(origin);
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers });

  const url = Deno.env.get('SUPABASE_URL') || '';
  const service = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const turnstileConfigured = Boolean(Deno.env.get('TURNSTILE_SECRET_KEY'));
  const turnstileRequired = String(Deno.env.get('TURNSTILE_REQUIRED') || '').toLowerCase() === 'true';

  if (req.method === 'GET') {
    if (!allowedOrigin(origin)) {
      return new Response(JSON.stringify({ error: 'Origem não autorizada.', code: 'ORIGIN_NOT_ALLOWED' }), { status: 403, headers });
    }
    return new Response(JSON.stringify({
      ok: Boolean(url && service),
      function: 'food-public-checkout',
      version: 'foodservice-0.2.0',
      configured: Boolean(url && service),
      turnstileConfigured,
      turnstileRequired,
    }), { status: 200, headers });
  }

  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Método não permitido.' }), { status: 405, headers });
  if (!url || !service) return new Response(JSON.stringify({ error: 'Checkout indisponível por configuração interna.' }), { status: 503, headers });

  try {
    const contentLength = Number(req.headers.get('content-length') || 0);
    if (contentLength > 80000) throw new Error('Pedido excede o tamanho permitido.');

    const body = await req.json() as { payload?: unknown; turnstileToken?: string; analyticsSessionId?: string; requestId?: string };
    if (!body.payload || typeof body.payload !== 'object') throw new Error('Pedido inválido.');

    const payloadRecord = body.payload as Record<string, unknown>;
    const storeId = String(payloadRecord.store_id || '');
    const adminClient = createClient(url, service, { auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false } });

    const token = String(body.turnstileToken || '');
    const analyticsSessionId = String(body.analyticsSessionId || '');
    const requestedId = String(body.requestId || '').toLowerCase();
    const requestId = UUID_PATTERN.test(requestedId) ? requestedId : crypto.randomUUID();
    const remoteIp = clientIpFrom(req);
    await validateTurnstile(token, remoteIp, origin);

    // O dominio principal vem de PUBLIC_APP_ORIGINS. Dominios Premium ativos
    // podem ser aceitos automaticamente a partir de public.food_store_domains.
    const originIsAllowed = allowedOrigin(origin) || await activeStoreDomainAllowsOrigin(adminClient, storeId, origin);
    if (!originIsAllowed) {
      return new Response(JSON.stringify({ error: 'Origem não autorizada para esta loja.', code: 'ORIGIN_NOT_ALLOWED' }), { status: 403, headers });
    }

    const salt = Deno.env.get('CHECKOUT_FINGERPRINT_SALT') || Deno.env.get('TURNSTILE_SECRET_KEY') || service.slice(-48);
    const fingerprint = await sha256(`${salt}:${remoteIp || 'unknown'}:${req.headers.get('user-agent') || 'unknown'}`);

    const rpcResponse = await fetch(`${url}/rest/v1/rpc/food_create_public_order`, {
      method: 'POST',
      headers: {
        apikey: service,
        Authorization: `Bearer ${service}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        'x-foodservice-security-fingerprint': fingerprint,
                'x-foodservice-request-id': requestId,
              },
      body: JSON.stringify({ payload: { ...(body.payload as Record<string, unknown>), public_request_id: requestId } }),
    });

    const rpcPayload = await rpcResponse.json().catch(() => null) as Array<{order_id:string;order_number:number|string;order_total:number|string}> | {message?:string} | null;
    if (!rpcResponse.ok) {
      // Se a primeira tentativa foi gravada, mas a resposta se perdeu, a unique key
      // pode rejeitar a repeticao. Nesse caso devolvemos o pedido ja existente.
      if (UUID_PATTERN.test(storeId)) {
        const { data: existing } = await adminClient
          .from('food_orders')
          .select('id,order_number,total')
          .eq('store_id', storeId)
          .eq('public_request_id', requestId)
          .limit(1)
          .maybeSingle();
        if (existing?.id) {
          if (UUID_PATTERN.test(analyticsSessionId)) {
            try {
              await adminClient.from('food_analytics_events').insert({
                store_id: storeId,
                session_id: analyticsSessionId,
                event_name: 'order_created',
                order_id: existing.id,
              });
            } catch {
              // Evento ja existente ou analytics indisponivel: o pedido continua valido.
            }
          }
          return new Response(JSON.stringify({
            orderId: existing.id,
            orderNumber: Number(existing.order_number),
            total: Number(existing.total),
            idempotentReplay: true,
          }), { status: 200, headers });
        }
      }

      const message = !Array.isArray(rpcPayload) && rpcPayload?.message ? rpcPayload.message : 'Não foi possível registrar o pedido.';
      const rateLimited = message.toLowerCase().includes('muitas tentativas');
      return new Response(JSON.stringify({ error: message, code: rateLimited ? 'RATE_LIMITED' : 'ORDER_REJECTED' }), { status: rateLimited ? 429 : 400, headers });
    }

    const created = Array.isArray(rpcPayload) ? rpcPayload[0] : null;
    if (!created?.order_id) throw new Error('O banco não retornou o identificador do pedido.');

    if (UUID_PATTERN.test(analyticsSessionId)) {
      try {
        if (UUID_PATTERN.test(storeId)) {
          await adminClient.from('food_analytics_events').insert({
            store_id: storeId,
            session_id: analyticsSessionId,
            event_name: 'order_created',
            order_id: created.order_id,
          });
        }
      } catch {
        // Falha de analytics nunca pode invalidar um pedido já criado.
      }
    }

    return new Response(JSON.stringify({
      orderId: created.order_id,
      orderNumber: Number(created.order_number),
      total: Number(created.order_total),
    }), { status: 200, headers });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro inesperado no checkout.' }), { status: 400, headers });
  }
});
