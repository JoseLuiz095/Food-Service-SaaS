// Endpoint independente: não altera food-public-checkout nem a sua configuração.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const origins = new Set((Deno.env.get('PUBLIC_APP_ORIGINS') || 'https://foodweb.joseluizacama.workers.dev').split(',').map(x => x.trim()).filter(Boolean));
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(x => x.toString(16).padStart(2, '0')).join('');

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  const headers = { 'Content-Type': 'application/json', 'Vary': 'Origin', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': origins.has(origin) ? origin : '', 'Access-Control-Allow-Headers': 'apikey,content-type', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
  const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (!origins.has(origin)) return respond({ error: 'Origem não autorizada.' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return respond({ error: 'Método não permitido.' }, 405);
  try {
    // Limite real durante a leitura, inclusive requisições sem Content-Length.
    const reader = req.body?.getReader();
    if (!reader) return respond({ error: 'Solicitação vazia.' }, 400);
    const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 65536) { await reader.cancel(); return respond({ error: 'Solicitação excede o limite.' }, 413); }
      chunks.push(value);
    }
    const buffer = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
    const body = JSON.parse(new TextDecoder().decode(buffer)) as { action: string; data: Record<string, unknown>; turnstileToken?: string };
    if (!['create','get','remove','freeze'].includes(body.action) || !body.data || !/^[a-f0-9]{64}$/.test(String(body.data.token))) return respond({ error: 'Solicitação inválida.' }, 400);
    const storeId = String(body.data.seller_store_id || '');
    if (body.action === 'create' ? !uuid.test(storeId) || !uuid.test(String(body.data.request_id)) : !uuid.test(String(body.data.order_id))) return respond({ error: 'Identificador inválido.' }, 400);
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false },
      global: { fetch: (input,init) => fetch(input,{ ...init, signal: AbortSignal.timeout(10000) }) } });
    // Não confiar em IP fornecido pelo cliente nem em x-forwarded-for arbitrário.
    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'unknown';
    const salt = Deno.env.get('TURNSTILE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const { error: rateError } = await admin.rpc('food_modules_rate_limit', { p_key: await hash(`${salt}:${ip}`) });
    if (rateError) return respond({ error: 'Muitas solicitações. Aguarde um minuto.' }, 429);
    if (body.action === 'create') {
      const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
      // Fail closed na criação; implantação requer os mesmos secrets do checkout atual.
      if (!secret || !body.turnstileToken) return respond({ error: 'Conclua a verificação de segurança.' }, 400);
      const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', body: new URLSearchParams({ secret, response: body.turnstileToken }), signal: AbortSignal.timeout(10000),
      });
      const captcha = await verification.json() as { success?: boolean; hostname?: string; action?: string };
      if (!captcha.success || captcha.hostname !== new URL(origin).hostname || captcha.action !== 'modules') return respond({ error: 'Verificação de segurança inválida.' }, 403);
    }
    // Cada RPC é uma transação: a limpeza não mantém locks durante a compra.
    const { error: cleanupError } = await admin.rpc('food_modules_cleanup');
    if (cleanupError) return respond({ error: 'Não foi possível atualizar as reservas. Tente novamente.' }, 503);
    const { data, error } = await admin.rpc('food_modules_customer', { p_action: body.action, p_data: body.data });
    if (error) {
      if (error.code === 'P0001') return respond({ error: error.message }, 400);
      if (error.code === '42501') return respond({ error: 'Pedido indisponível ou credencial inválida.' }, 403);
      return respond({ error: 'Dados inválidos ou recurso indisponível.' }, 400);
    }
    return respond(data);
  } catch {
    return respond({ error: 'Não foi possível processar. Tente novamente com a mesma solicitação.' }, 400);
  }
});
