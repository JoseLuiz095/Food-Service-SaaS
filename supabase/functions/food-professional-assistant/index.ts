import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';

const cors = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Content-Type':'application/json', 'Cache-Control':'no-store' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers:cors });
const forbidden = /\b(dieta|caloria|calorias|hidrata(?:ção|cao|r|nte)|quantos?\s+litros|quanto\s+de\s+água|prescri(?:ção|cao)|diagn[oó]stico|sintoma|les[aã]o|doen[cç]a|medica(?:mento|ção|cao)|tratamento|dose|suplement|emagrec|ganhar\s+massa|plano\s+alimentar|dor\s+no)\b/i;
const identifying = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\d\s().-]{8,}\d)/i;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:cors});
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceKey = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const aiKey = Deno.env.get('OPENAI_API_KEY') || '';
  const model = Deno.env.get('OPENAI_MODEL') || '';
  const authorization = request.headers.get('Authorization') || '';
  if (!supabaseUrl || !anonKey || !serviceKey || !aiKey || !model) return json({ error: 'Assistente ainda não configurado neste ambiente.' }, 503);
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Entre na conta profissional para usar o assistente.' }, 401);
  try {
    const token = authorization.slice(7);
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) return json({ error: 'Sessão profissional inválida.' }, 401);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const input = await request.json() as { mode?: string; prompt?: string; store_id?: string };
    const storeId = typeof input.store_id === 'string' ? input.store_id : '';
    if (!/^[0-9a-f-]{36}$/i.test(storeId)) return json({ error: 'Selecione uma loja profissional.' }, 400);
    const { data: membership, error: membershipError } = await admin.from('food_store_users').select('user_id').eq('store_id', storeId).eq('user_id', user.id).eq('active', true).maybeSingle();
    if (membershipError || !membership) return json({ error: 'Vínculo profissional ativo nesta loja não encontrado.' }, 403);
    const { data: profile, error: profileError } = await admin.from('food_service_professionals').select('store_id,user_id,kind,council,active,name,registration').eq('store_id', storeId).eq('user_id', user.id).eq('active', true).maybeSingle();
    if (profileError || !profile) return json({ error: 'Conta profissional ativa não encontrada.' }, 403);
    const mode = input.mode;
    const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
    if (!['question', 'post_ideas', 'calendar'].includes(mode || '') || prompt.length < 3 || prompt.length > 700) return json({ error: 'Escolha uma tarefa e escreva até 700 caracteres.' }, 400);
    if (identifying.test(prompt)) return json({ error: 'Remova nomes, e-mails, telefones e identificadores de alunos. O assistente atende apenas assuntos gerais.' }, 400);
    if (forbidden.test(prompt)) return json({ error: 'O assistente não prepara orientação clínica. Use o julgamento profissional e escreva orientações de saúde diretamente como profissional habilitado.' }, 422);
    const task = mode === 'post_ideas' ? 'Crie 3 ideias curtas de publicação comercial para a vitrine desta loja. Não inclua alegações de saúde.' : mode === 'calendar' ? 'Sugira uma sequência de calendário de publicações comerciais, com data relativa e tema, sem recomendar frequência obrigatória.' : 'Responda uma dúvida pequena de uso da plataforma ou comunicação profissional de forma curta e prática.';
    const system = `Você auxilia profissionais da VendeWeb. A pessoa profissional é ${profile.name}, área ${profile.kind}, registro ${profile.council} ${profile.registration}. ${task} Nunca faça diagnóstico, prescrição ou recomendação individual de saúde, exercício, alimentação, hidratação, dose ou suplementação. Não calcule metas de água. Se a solicitação pedir isso, recuse em uma frase e direcione a decisão ao profissional competente. Não solicite dados de alunos. Sua resposta é apenas rascunho: nunca publique, agende, envie ou aprove. Responda em português brasileiro, com texto conciso.`;
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${aiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: [{ role: 'system', content: [{ type: 'input_text', text: system }] }, { role: 'user', content: [{ type: 'input_text', text: prompt }] }], max_output_tokens: 450, store: false }),
      signal: AbortSignal.timeout(25000),
    });
    const result = await response.json().catch(() => ({})) as { output_text?: string; error?: { message?: string }; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
    if (!response.ok) return json({ error: 'Não foi possível gerar uma ideia agora. Tente novamente em instantes.' }, 502);
    const text = (result.output_text || result.output?.flatMap(item => item.content || []).find(part => part.type === 'output_text')?.text || '').trim();
    if (!text) return json({ error: 'O assistente retornou uma resposta vazia.' }, 502);
    if (forbidden.test(text)) return json({ error: 'A sugestão pediu conteúdo clínico. Revise e escreva esse conteúdo diretamente como profissional competente.' }, 422);
    return json({ text, reviewed_by: profile.name, review_required: true });
  } catch {
    return json({ error: 'Falha temporária no assistente profissional.' }, 502);
  }
});
