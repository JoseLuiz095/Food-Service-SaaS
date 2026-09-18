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
const COMMON_DOMAIN_TYPOS: Record<string,string> = {
  'gmial.com':'gmail.com','gmai.com':'gmail.com','gmal.com':'gmail.com','gmail.con':'gmail.com',
  'hotnail.com':'hotmail.com','outlok.com':'outlook.com',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers:{...corsHeaders,'Content-Type':'application/json'},
});

const validateEmail=(raw:string)=>{
  const email=raw.trim().toLowerCase();
  if(!email||email.length>254||!EMAIL_PATTERN.test(email)) throw new Error('Informe um e-mail válido para o responsável.');
  const domain=email.split('@')[1]||'';
  if(BLOCKED_EMAIL_DOMAINS.has(domain)) throw new Error('Use um e-mail real. Domínios de teste ou temporários não são permitidos.');
  const suggestion=COMMON_DOMAIN_TYPOS[domain];
  if(suggestion) throw new Error(`Confira o domínio do e-mail. Você quis dizer @${suggestion}?`);
  return email;
};

const validateMailDomain=async(email:string)=>{
  const domain=email.split('@')[1]||'';
  try{
    const response=await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,{
      headers:{Accept:'application/dns-json'},signal:AbortSignal.timeout(3500),
    });
    if(!response.ok)return;
    const payload=await response.json() as {Status?:number;Answer?:Array<{type?:number}>};
    const hasMx=payload.Status===0&&Array.isArray(payload.Answer)&&payload.Answer.some((item)=>item.type===15);
    if(!hasMx)throw new Error('O domínio informado não possui configuração de e-mail válida. Confira o endereço do responsável.');
  }catch(error){
    if(error instanceof Error&&error.message.includes('não possui configuração de e-mail válida'))throw error;
  }
};

const validatePassword=(password:string)=>{
  if(!password)return;
  if(password.length<10)throw new Error('A nova senha deve ter pelo menos 10 caracteres.');
  if(!/[A-Z]/.test(password)||!/[a-z]/.test(password)||!(/\d/.test(password)))throw new Error('A nova senha deve conter letra maiúscula, letra minúscula e número.');
};

async function findAuthUserByEmail(adminClient:ReturnType<typeof createClient>,email:string){
  let page=1;const perPage=1000;
  while(page<=50){
    const{data,error}=await adminClient.auth.admin.listUsers({page,perPage});
    if(error)throw error;
    const found=data.users.find((user)=>(user.email||'').toLowerCase()===email.toLowerCase());
    if(found)return found;
    if(data.users.length<perPage)return null;
    page+=1;
  }
  throw new Error('Não foi possível concluir a busca do usuário existente.');
}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  try{
    const url=Deno.env.get('SUPABASE_URL');
    const anon=Deno.env.get('SUPABASE_ANON_KEY');
    const service=Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if(req.method==='GET')return json({ok:Boolean(url&&anon&&service),function:'food-platform-manage-store-user',version:'foodweb-0.5.0',configured:Boolean(url&&anon&&service)});
    if(req.method!=='POST')return json({error:'Método não permitido.'},405);
    if(!url||!anon||!service)throw new Error('Variáveis do Supabase não configuradas na Edge Function.');

    const authorization=req.headers.get('Authorization')||'';
    const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}}});
    const adminClient=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});

    const{data:userData,error:userError}=await userClient.auth.getUser();
    if(userError||!userData.user)return json({error:'Não autenticado.'},401);

    const jwt=authorization.replace(/^Bearer\s+/i,'');
    const{data:aalData,error:aalError}=await userClient.auth.mfa.getAuthenticatorAssuranceLevel(jwt);
    if(aalError||aalData.currentLevel!=='aal2')return json({error:'MFA obrigatório para operações do Admin Master.',code:'MFA_AAL2_REQUIRED'},403);

    const{data:platformAdmin}=await adminClient.from('food_platform_admins').select('id').eq('user_id',userData.user.id).eq('active',true).maybeSingle();
    if(!platformAdmin)return json({error:'Acesso restrito ao Admin Master.'},403);

    const body=await req.json();
    const storeId=String(body.storeId||'').trim();
    const email=validateEmail(String(body.email||''));
    const password=String(body.password||'');
    const forcePasswordChange=body.forcePasswordChange!==false;
    validatePassword(password);
    if(!storeId)throw new Error('Loja não informada.');

    const{data:store,error:storeError}=await adminClient.from('food_stores').select('id,name,owner_email').eq('id',storeId).maybeSingle();
    if(storeError)throw storeError;
    if(!store)throw new Error('Loja não encontrada.');

    let{data:membership,error:membershipError}=await adminClient.from('food_store_users')
      .select('id,user_id,role,active,must_change_password,created_at').eq('store_id',storeId).eq('active',true).eq('role','owner').order('created_at',{ascending:true}).limit(1).maybeSingle();
    if(membershipError)throw membershipError;
    if(!membership){
      const fallback=await adminClient.from('food_store_users').select('id,user_id,role,active,must_change_password,created_at')
        .eq('store_id',storeId).eq('active',true).in('role',['admin','owner']).order('created_at',{ascending:true}).limit(1).maybeSingle();
      if(fallback.error)throw fallback.error;
      membership=fallback.data;
    }
    if(!membership)throw new Error('A loja não possui responsável administrativo ativo para atualizar.');

    const{data:targetUserData,error:targetUserError}=await adminClient.auth.admin.getUserById(membership.user_id);
    if(targetUserError)throw targetUserError;
    if(!targetUserData.user)throw new Error('Usuário do responsável não encontrado no Supabase Auth.');

    const currentEmail=(targetUserData.user.email||'').toLowerCase();
    const emailChanged=email!==currentEmail;
    if(emailChanged){
      await validateMailDomain(email);
      const existing=await findAuthUserByEmail(adminClient,email);
      if(existing&&existing.id!==membership.user_id)throw new Error('Este e-mail já pertence a outro usuário do Supabase Auth.');
    }

    if(!emailChanged&&!password)return json({ok:true,email:currentEmail,passwordChanged:false,emailChanged:false,linkedStoreCount:1});

    const attributes:Record<string,unknown>={};
    if(emailChanged){attributes.email=email;attributes.email_confirm=true;}
    if(password)attributes.password=password;
    const{error:updateUserError}=await adminClient.auth.admin.updateUserById(membership.user_id,attributes);
    if(updateUserError)throw updateUserError;

    const{data:linkedMemberships,error:linkedMembershipsError}=await adminClient.from('food_store_users')
      .select('id,store_id,role,active').eq('user_id',membership.user_id).eq('active',true);
    if(linkedMembershipsError)throw linkedMembershipsError;
    const linkedStoreIds=Array.from(new Set((linkedMemberships||[]).map((item)=>item.store_id).filter(Boolean)));

    if(emailChanged&&linkedStoreIds.length){
      const{error:updateStoreError}=await adminClient.from('food_stores').update({owner_email:email}).in('id',linkedStoreIds);
      if(updateStoreError){
        try{await adminClient.auth.admin.updateUserById(membership.user_id,{email:currentEmail,email_confirm:true});}catch{/* best effort */}
        throw updateStoreError;
      }
    }

    if(password){
      const{error:updateMembershipError}=await adminClient.from('food_store_users').update({must_change_password:forcePasswordChange}).eq('user_id',membership.user_id).eq('active',true);
      if(updateMembershipError)throw updateMembershipError;
    }

    // Auditoria sem senha, token ou e-mail em texto. Falha de auditoria nunca desfaz a operação principal.
    await adminClient.from('food_platform_event_log').insert({
      actor_user_id:userData.user.id,store_id:storeId,kind:'audit',action:'store_credentials_updated',result:'success',
      route:'/admin-master/lojas',app_version:'0.5.0',metadata:{emailChanged,passwordChanged:Boolean(password),forcePasswordChange:password?forcePasswordChange:membership.must_change_password,linkedStoreCount:linkedStoreIds.length},
    });

    return json({ok:true,storeId,email,emailChanged,passwordChanged:Boolean(password),forcePasswordChange:password?forcePasswordChange:membership.must_change_password,linkedStoreCount:linkedStoreIds.length});
  }catch(error){
    console.error('food-platform-manage-store-user',error);
    return json({error:error instanceof Error?error.message:'Falha ao atualizar o acesso do lojista.'},400);
  }
});
