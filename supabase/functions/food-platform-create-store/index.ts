import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EMAIL_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;
const BLOCKED_EMAIL_DOMAINS = new Set([
  'example.com','example.org','example.net','teste.com','test.com','invalid.com','localhost',
  'mailinator.com','10minutemail.com','tempmail.com','guerrillamail.com',
]);

const COMMON_DOMAIN_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'hotnail.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
};

const slugify = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const addDays = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + Math.max(1, Math.round(days)));
  return date.toISOString();
};

const validateEmail = (raw: string) => {
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) throw new Error('Informe um e-mail válido para o responsável.');
  const domain = email.split('@')[1] || '';
  if (BLOCKED_EMAIL_DOMAINS.has(domain)) throw new Error('Use um e-mail real. Domínios de teste ou temporários não são permitidos.');
  const suggestedDomain = COMMON_DOMAIN_TYPOS[domain];
  if (suggestedDomain) throw new Error(`Confira o domínio do e-mail. Você quis dizer @${suggestedDomain}?`);
  return email;
};

const validateMailDomain = async (email: string) => {
  const domain = email.split('@')[1] || '';
  // A validação DNS confirma que o domínio está configurado para receber e-mail.
  // A existência da caixa postal específica só pode ser comprovada pelo envio/convite.
  try {
    const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) return; // indisponibilidade do resolvedor não deve bloquear uma venda legítima
    const payload = await response.json() as { Status?: number; Answer?: Array<{ type?: number }> };
    const hasMx = payload.Status === 0 && Array.isArray(payload.Answer) && payload.Answer.some((answer) => answer.type === 15);
    if (!hasMx) throw new Error('O domínio informado não possui configuração de e-mail válida. Confira o endereço do responsável.');
  } catch (error) {
    if (error instanceof Error && error.message.includes('não possui configuração de e-mail válida')) throw error;
    // Timeout/falha externa: mantém o cadastro possível. O convite é a confirmação definitiva da caixa postal.
  }
};

const validateTemporaryPassword = (password: string) => {
  if (password.length < 10) throw new Error('A senha temporária deve ter pelo menos 10 caracteres.');
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('A senha temporária deve conter letra maiúscula, letra minúscula e número.');
  }
};

async function findAuthUserByEmail(adminClient: ReturnType<typeof createClient>, email: string) {
  let page = 1;
  const perPage = 1000;
  while (page <= 50) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((user) => (user.email || '').toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
  }
  throw new Error('Não foi possível concluir a busca do usuário existente.');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    const service = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (req.method === 'GET') {
      return new Response(JSON.stringify({
        ok: Boolean(url && anon && service),
        function: 'food-platform-create-store',
        version: 'foodservice-0.2.0',
        configured: Boolean(url && anon && service),
      }), { status:200, headers:{...corsHeaders,'Content-Type':'application/json'} });
    }

    if (!url || !anon || !service) throw new Error('Variáveis do Supabase não configuradas na Edge Function.');

    const authorization = req.headers.get('Authorization') || '';
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const adminClient = createClient(url, service, { auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return new Response(JSON.stringify({ error:'Não autenticado.' }), { status:401, headers:{...corsHeaders,'Content-Type':'application/json'} });

    // V3: operações do Admin Master exigem MFA/AAL2 também na borda. A interface
    // sozinha não é um limite de segurança, portanto validamos o JWT recebido.
    const jwt = authorization.replace(/^Bearer\s+/i,'');
    const { data: aalData, error: aalError } = await userClient.auth.mfa.getAuthenticatorAssuranceLevel(jwt);
    if (aalError || aalData.currentLevel !== 'aal2') {
      return new Response(JSON.stringify({ error:'MFA obrigatório para operações do Admin Master.', code:'MFA_AAL2_REQUIRED' }), { status:403, headers:{...corsHeaders,'Content-Type':'application/json'} });
    }

    const { data: platformAdmin } = await adminClient.from('food_platform_admins').select('id').eq('user_id',userData.user.id).eq('active',true).maybeSingle();
    if (!platformAdmin) return new Response(JSON.stringify({ error:'Acesso restrito ao Admin Master.' }), { status:403, headers:{...corsHeaders,'Content-Type':'application/json'} });

    const body = await req.json();
    const name = String(body.name||'').trim();
    const slug = slugify(String(body.slug||name));
    const city = String(body.city||'').trim();
    const state = String(body.state||'').trim().toUpperCase();
    const ownerName = String(body.ownerName||'').trim();
    const ownerEmail = validateEmail(String(body.ownerEmail||''));
    await validateMailDomain(ownerEmail);
    const planId = String(body.planId||'').trim();
    const accessStatus = body.accessStatus === 'suspended' ? 'suspended' : 'online';
    const dueDay = Math.min(28,Math.max(1,Number(body.dueDay)||10));
    const customDomain = String(body.customDomain||'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
    const appOrigin = String(body.appOrigin||'').replace(/\/$/,'');
    const credentialMode = body.credentialMode === 'temporary_password' ? 'temporary_password' : 'invite';
    const temporaryPassword = String(body.temporaryPassword||'');
    const forcePasswordChange = body.forcePasswordChange !== false;
    if (!name || !slug || !city || state.length!==2 || !ownerName || !ownerEmail || !planId) throw new Error('Preencha nome, slug, cidade, UF, responsável, e-mail e plano.');
    if (credentialMode === 'temporary_password') validateTemporaryPassword(temporaryPassword);

    const { data: plan, error: planError } = await adminClient.from('food_plans').select('id,code,monthly_price,custom_domain').eq('id',planId).eq('active',true).single();
    if (planError || !plan) throw new Error('Plano inválido ou inativo.');
    if (customDomain && !plan.custom_domain) throw new Error('O plano selecionado não inclui domínio próprio.');

    const isDemoPlan = plan.code === 'DEMO';
    let demoDurationDays = 30;
    if (isDemoPlan) {
      const { data: settingsRow } = await adminClient.from('food_platform_settings').select('demo_duration_days').eq('id',1).maybeSingle();
      demoDurationDays = Math.max(1, Number(settingsRow?.demo_duration_days) || 30);
    }

    const now = new Date();
    const dueYear = now.getUTCFullYear();
    const dueMonth = now.getUTCDate() <= dueDay ? now.getUTCMonth() : now.getUTCMonth() + 1;
    const nextDueDate = new Date(Date.UTC(dueYear, dueMonth, dueDay)).toISOString().slice(0,10);
    const expiresAt = isDemoPlan ? addDays(demoDurationDays) : null;

    // Um mesmo usuário pode administrar mais de uma loja. Se o e-mail já existir,
    // apenas criamos o novo vínculo food_store_users e nunca sobrescrevemos a senha existente.
    const existingUser = await findAuthUserByEmail(adminClient, ownerEmail);

    const { data: store, error: storeError } = await adminClient.from('food_stores').insert({
      name, slug, city, state, owner_name:ownerName, owner_email:ownerEmail,
      active:true,
      access_status:accessStatus,
      suspended_at:accessStatus==='suspended'?new Date().toISOString():null,
      suspension_reason:accessStatus==='suspended'?'Criada inicialmente com acesso suspenso':null,
      delivery_enabled:true, pickup_enabled:true,
    }).select('id,slug').single();
    if (storeError || !store) throw new Error(storeError?.message || 'Não foi possível criar a loja.');

    let createdAuthUserId: string | null = null;
    try {
      const subscriptionStatus = accessStatus === 'suspended' ? 'suspended' : (isDemoPlan ? 'trial' : 'active');
      const previousStatus = accessStatus === 'suspended' ? (isDemoPlan ? 'trial' : 'active') : null;
      const { error: subError } = await adminClient.from('food_store_subscriptions').insert({
        store_id:store.id,
        plan_id:planId,
        status:subscriptionStatus,
        status_before_suspension:previousStatus,
        billing_amount:isDemoPlan ? 0 : plan.monthly_price,
        due_day:isDemoPlan ? null : dueDay,
        next_due_date:isDemoPlan ? null : nextDueDate,
        expires_at:expiresAt,
      });
      if (subError) throw subError;

      const { error: seedError } = await adminClient.rpc('food_platform_seed_new_store',{p_store_id:store.id,p_city:city,p_state:state});
      if (seedError) throw seedError;
      if (customDomain && plan.custom_domain) {
        const { error: domainError } = await adminClient.from('food_store_domains').insert({store_id:store.id,domain:customDomain,is_primary:true,active:true});
        if (domainError) throw domainError;
      }

      let invited = false;
      let createdWithPassword = false;
      let warning = '';
      let ownerUser = existingUser;
      if (!ownerUser && credentialMode === 'temporary_password') {
        const { data: created, error: createError } = await adminClient.auth.admin.createUser({
          email: ownerEmail,
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: { name: ownerName, foodservice_store_slug: slug, created_by_foodservice_master: true },
        });
        if (createError) throw new Error(`O cadastro foi revertido porque o usuário não pôde ser criado: ${createError.message}`);
        ownerUser = created.user;
        createdAuthUserId = created.user?.id || null;
        createdWithPassword = true;
      } else if (!ownerUser) {
        const redirectTo = appOrigin ? `${appOrigin}/admin/redefinir-senha` : undefined;
        const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
          ownerEmail,
          redirectTo ? { redirectTo, data: { name: ownerName, foodservice_store_slug: slug } } : { data: { name: ownerName, foodservice_store_slug: slug } },
        );
        if (inviteError) {
          throw new Error(`O cadastro foi revertido porque o convite não pôde ser enviado: ${inviteError.message}. Em produção, confira o SMTP e as Redirect URLs do Supabase.`);
        }
        ownerUser = inviteData.user;
        createdAuthUserId = inviteData.user?.id || null;
        invited = true;
      } else if (credentialMode === 'temporary_password') {
        warning = 'O e-mail já possui usuário no Supabase Auth. A senha existente foi preservada e apenas o novo vínculo com a loja foi criado.';
      }

      if (!ownerUser?.id) throw new Error('Não foi possível identificar o usuário responsável.');
      const memberPayload: Record<string, unknown> = {store_id:store.id,user_id:ownerUser.id,role:'owner',active:true};
      if (!existingUser) memberPayload.must_change_password = Boolean(createdWithPassword && forcePasswordChange);
      const { error: memberError } = await adminClient.from('food_store_users').upsert(memberPayload,{onConflict:'store_id,user_id'});
      if (memberError) throw memberError;

      return new Response(JSON.stringify({
        storeId:store.id,
        slug:store.slug,
        invited,
        createdWithPassword,
        existingUser:Boolean(existingUser),
        warning:warning || undefined,
        expiresAt:expiresAt || undefined,
      }), { status:200, headers:{...corsHeaders,'Content-Type':'application/json'} });
    } catch (inner) {
      await adminClient.from('food_stores').delete().eq('id',store.id);
      if (createdAuthUserId && !existingUser) {
        try { await adminClient.auth.admin.deleteUser(createdAuthUserId); } catch { /* melhor esforço */ }
      }
      throw inner;
    }
  } catch (error) {
    return new Response(JSON.stringify({ error:error instanceof Error?error.message:'Erro inesperado.' }), { status:400, headers:{...corsHeaders,'Content-Type':'application/json'} });
  }
});
