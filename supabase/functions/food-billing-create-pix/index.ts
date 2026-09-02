import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
const cleanDigits=(value:string)=>value.replace(/\D/g,'');

async function asaasFetch(base:string,key:string,path:string,init:RequestInit={}){
  const response=await fetch(`${base}${path}`,{
    ...init,
    headers:{'Content-Type':'application/json','User-Agent':'FoodWeb/0.3.0','access_token':key,...(init.headers||{})},
  });
  const payload=await response.json().catch(()=>null) as any;
  if(!response.ok){
    const message=payload?.errors?.[0]?.description||payload?.message||`Asaas HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  try{
    const supabaseUrl=Deno.env.get('SUPABASE_URL');
    const anon=Deno.env.get('SUPABASE_ANON_KEY');
    const service=Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const asaasKey=Deno.env.get('ASAAS_API_KEY');
    const environment=(Deno.env.get('ASAAS_ENVIRONMENT')||'sandbox').toLowerCase();
    const asaasBase=environment==='production'?'https://api.asaas.com/v3':'https://api-sandbox.asaas.com/v3';
    if(req.method==='GET') return json({ok:Boolean(supabaseUrl&&anon&&service&&asaasKey),function:'food-billing-create-pix',version:'foodservice-0.3.0',configured:Boolean(supabaseUrl&&anon&&service&&asaasKey),environment});
    if(!supabaseUrl||!anon||!service)throw new Error('Variáveis do Supabase não configuradas.');
    if(!asaasKey)throw new Error('Integração Asaas ainda não configurada. Use o PIX manual ou configure ASAAS_API_KEY.');

    const authorization=req.headers.get('Authorization')||'';
    const userClient=createClient(supabaseUrl,anon,{global:{headers:{Authorization:authorization}}});
    const admin=createClient(supabaseUrl,service,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:userData,error:userError}=await userClient.auth.getUser();
    if(userError||!userData.user)return json({error:'Não autenticado.'},401);

    const body=await req.json();
    const storeId=String(body.storeId||'');
    const planId=String(body.planId||'');
    if(!storeId||!planId)throw new Error('Loja e plano são obrigatórios.');

    const {data:membership}=await admin.from('food_store_users').select('role').eq('store_id',storeId).eq('user_id',userData.user.id).eq('active',true).maybeSingle();
    if(!membership||!['owner','admin','manager'].includes(membership.role))return json({error:'Sem permissão para gerar cobrança desta loja.'},403);

    const [{data:store},{data:plan},{data:settings},{data:subscriptions}]=await Promise.all([
      admin.from('food_stores').select('id,name,owner_name,owner_email,whatsapp,billing_document,billing_phone,billing_asaas_customer_id').eq('id',storeId).single(),
      admin.from('food_plans').select('id,code,name,monthly_price,active').eq('id',planId).eq('active',true).single(),
      admin.from('food_platform_settings').select('billing_provider,billing_auto_renew').eq('id',1).single(),
      admin.from('food_store_subscriptions').select('id').eq('store_id',storeId).order('started_at',{ascending:false}).limit(1),
    ]);
    if(!store||!plan)throw new Error('Loja ou plano não encontrado.');
    if(plan.code==='DEMO'||Number(plan.monthly_price)<=0)throw new Error('Selecione um plano pago.');
    if(settings?.billing_provider!=='asaas')throw new Error('O pagamento automático não está ativado no Admin Master.');
    const cpfCnpj=cleanDigits(String(store.billing_document||''));
    if(![11,14].includes(cpfCnpj.length))throw new Error('Cadastre o CPF/CNPJ de cobrança em Configurações antes de gerar o PIX automático.');

    const {data:existing}=await admin.from('food_subscription_payments').select('*').eq('store_id',storeId).eq('plan_id',planId).eq('provider','asaas').in('status',['pending']).gte('due_date',new Date().toISOString().slice(0,10)).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(existing?.provider_payment_id&&existing?.pix_payload){
      return json({payment:existing,plan:{id:plan.id,code:plan.code,name:plan.name,monthlyPrice:Number(plan.monthly_price)},autoRenew:true});
    }

    let customerId=store.billing_asaas_customer_id as string|undefined;
    if(!customerId){
      const customer=await asaasFetch(asaasBase,asaasKey,'/customers',{
        method:'POST',body:JSON.stringify({
          name:String(store.owner_name||store.name),cpfCnpj,
          email:store.owner_email||undefined,
          mobilePhone:cleanDigits(String(store.billing_phone||store.whatsapp||''))||undefined,
          externalReference:storeId,
          notificationDisabled:true,
        }),
      });
      customerId=customer.id;
      if(!customerId)throw new Error('O Asaas não retornou o identificador do cliente.');
      await admin.from('food_stores').update({billing_asaas_customer_id:customerId,updated_at:new Date().toISOString()}).eq('id',storeId);
    }

    const dueDate=new Date(); dueDate.setUTCDate(dueDate.getUTCDate()+3);
    const due=dueDate.toISOString().slice(0,10);
    const {data:paymentRow,error:paymentRowError}=await admin.from('food_subscription_payments').insert({
      store_id:storeId,subscription_id:subscriptions?.[0]?.id||null,plan_id:planId,
      amount:Number(plan.monthly_price),due_date:due,provider:'asaas',status:'pending',proof_required:false,
    }).select('*').single();
    if(paymentRowError||!paymentRow)throw new Error(paymentRowError?.message||'Não foi possível registrar a cobrança.');

    try{
      const charge=await asaasFetch(asaasBase,asaasKey,'/payments',{
        method:'POST',body:JSON.stringify({customer:customerId,billingType:'PIX',value:Number(plan.monthly_price),dueDate:due,description:`FoodWeb - plano ${plan.name}`,externalReference:paymentRow.id}),
      });
      const qr=await asaasFetch(asaasBase,asaasKey,`/payments/${encodeURIComponent(charge.id)}/pixQrCode`,{method:'GET'});
      const {data:updated,error:updateError}=await admin.from('food_subscription_payments').update({
        provider_payment_id:charge.id,pix_payload:qr.payload||null,pix_qr_base64:qr.encodedImage||null,
        provider_expiration_at:qr.expirationDate||null,provider_raw:{charge,qrMeta:{expirationDate:qr.expirationDate}},updated_at:new Date().toISOString(),
      }).eq('id',paymentRow.id).select('*').single();
      if(updateError)throw updateError;
      return json({payment:updated,plan:{id:plan.id,code:plan.code,name:plan.name,monthlyPrice:Number(plan.monthly_price)},autoRenew:Boolean(settings?.billing_auto_renew),environment});
    }catch(error){
      await admin.from('food_subscription_payments').delete().eq('id',paymentRow.id);
      throw error;
    }
  }catch(error){return json({error:error instanceof Error?error.message:'Erro inesperado.'},400);}
});
