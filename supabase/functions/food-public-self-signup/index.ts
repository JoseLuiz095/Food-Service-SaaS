import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';

type TurnstileResult = { success: boolean; hostname?: string; action?: string };
type SignupInput = {
  storeName?: string; ownerName?: string; email?: string; password?: string; planCode?: string;
  city?: string; state?: string; contactPhone?: string; businessDocument?: string; captchaToken?: string;
};

const clean = (value: string) => value.trim().replace(/\/$/, '');
const origins = () => new Set([
  'http://localhost:5173', 'http://localhost:5174',
  'http://127.0.0.1:5173', 'http://127.0.0.1:5174',
  'http://172.26.224.1:5173', 'http://172.26.224.1:5174',
  'https://foodweb.joseluizacama.workers.dev',
  ...String(Deno.env.get('PUBLIC_APP_ORIGINS') || '').split(',').map(clean).filter(Boolean),
]);
const allowed = (origin: string) => origins().has(clean(origin));
const originHost = (origin: string) => { try { return new URL(origin).hostname.toLowerCase(); } catch { return ''; } };
const clientIp = (request: Request) => (request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};
const responseHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': allowed(origin) ? origin : 'null',
  'Access-Control-Allow-Headers': 'apikey, content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Vary': 'Origin',
  'Content-Type': 'application/json',
});
const json = (origin: string, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: responseHeaders(origin) });
const digits = (value: string) => value.replace(/\D/g, '');

async function verifyTurnstile(token: string, origin: string, remoteIp: string) {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY') || '';
  if (!secret) throw new Error('O cadastro seguro ainda não foi configurado no servidor.');
  if (!token) throw new Error('Conclua a verificação de segurança.');
  const form = new FormData(); form.append('secret', secret); form.append('response', token); if (remoteIp) form.append('remoteip', remoteIp);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const result = await response.json().catch(() => ({ success: false })) as TurnstileResult;
  if (!response.ok || !result.success) throw new Error('A verificação de segurança expirou. Atualize a página e tente novamente.');
  if (result.action && result.action !== 'signup') throw new Error('A verificação recebida não corresponde ao cadastro.');
  const host = originHost(origin);
  if (host && result.hostname && result.hostname.toLowerCase() !== host) throw new Error('A verificação não pertence a este endereço do FoodWeb.');
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') || '';
  if (request.method === 'OPTIONS') return new Response('ok', { status: 200, headers: responseHeaders(origin) });
  if (request.method !== 'POST') return json(origin, { error: 'Método não permitido.' }, 405);
  if (!allowed(origin)) return json(origin, { error: 'Origem não autorizada para o cadastro.' }, 403);

  try {
    const body = await request.json().catch(() => ({})) as SignupInput;
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const storeName = String(body.storeName || '').trim();
    const ownerName = String(body.ownerName || '').trim();
    const planCode = String(body.planCode || '').trim().toUpperCase();
    const phone = digits(String(body.contactPhone || ''));
    const cnpj = digits(String(body.businessDocument || ''));
    const city = String(body.city || '').trim();
    const state = String(body.state || '').trim().toUpperCase().slice(0, 2);
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 320) throw new Error('Informe um e-mail válido.');
    if (password.length < 8 || password.length > 72) throw new Error('A senha deve ter entre 8 e 72 caracteres.');
    if (storeName.length < 2 || storeName.length > 120) throw new Error('Informe um nome de estabelecimento entre 2 e 120 caracteres.');
    if (ownerName.length < 2 || ownerName.length > 120) throw new Error('Informe o nome do responsável.');
    if (phone.length < 10 || phone.length > 13) throw new Error('Informe um WhatsApp comercial válido.');
    if (cnpj && cnpj.length !== 14) throw new Error('O CNPJ deve ter 14 dígitos.');
    if (!['DEMO', 'ESSENTIAL', 'STARTER', 'PROFESSIONAL'].includes(planCode)) throw new Error('Plano indisponível para auto cadastro.');

    const remoteIp = clientIp(request);
    await verifyTurnstile(String(body.captchaToken || ''), origin, remoteIp);
    const url = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!url || !serviceKey) throw new Error('Cadastro seguro indisponível por configuração interna.');
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const salt = Deno.env.get('SELF_SIGNUP_FINGERPRINT_SALT') || Deno.env.get('TURNSTILE_SECRET_KEY') || serviceKey.slice(-48);
    const fingerprint = await sha256(`${salt}:${remoteIp || 'unknown'}:${request.headers.get('user-agent') || 'unknown'}:${clean(origin)}`);
    const { error: rateError } = await admin.rpc('food_enforce_public_self_signup_rate_limit', { p_fingerprint: fingerprint });
    if (rateError) {
      if (String(rateError.message || '').includes('SELF_SIGNUP_RATE_LIMITED')) return json(origin, { error: 'Muitas tentativas de cadastro. Aguarde 15 minutos antes de tentar novamente.', code: 'SELF_SIGNUP_RATE_LIMITED' }, 429);
      throw new Error('Não foi possível validar o limite de segurança do cadastro.');
    }

    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { foodweb_signup: { store_name: storeName, owner_name: ownerName, plan_code: planCode, city, state, contact_phone: phone, business_document: cnpj } },
    });
    if (error) {
      const message = String(error.message || '').toLowerCase();
      if (message.includes('already') || message.includes('registered') || message.includes('exists')) return json(origin, { error: 'Este e-mail já possui uma conta. Use “Já tenho conta” para continuar.', code: 'EMAIL_ALREADY_REGISTERED' }, 409);
      throw new Error('Não foi possível criar a conta agora. Confira os dados e tente novamente.');
    }
    const { data: completion, error: completionError } = await admin.rpc('food_complete_self_service_signup_for_user_v1', {
      p_user_id: data.user.id, p_store_name: storeName, p_owner_name: ownerName, p_plan_code: planCode,
      p_city: city, p_state: state, p_contact_phone: phone, p_business_document: cnpj || null,
    });
    if (completionError) {
      await admin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
      throw new Error(String(completionError.message || 'Não foi possível registrar a solicitação no Admin Master.'));
    }
    return json(origin, { ok: true, userId: data.user.id, email, emailConfirmationRequired: false, completion });
  } catch (error) {
    return json(origin, { error: error instanceof Error ? error.message : 'Não foi possível concluir o cadastro.' }, 400);
  }
});
