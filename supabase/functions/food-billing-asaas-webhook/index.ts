import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
Deno.serve(async(req)=>{
  if(req.method!=='POST')return json({ok:true,function:'food-billing-asaas-webhook',version:'foodservice-0.3.0'});
  const expected=Deno.env.get('ASAAS_WEBHOOK_TOKEN')||'';
  if(!expected||req.headers.get('asaas-access-token')!==expected)return json({error:'Webhook não autorizado.'},401);
  try{
    const url=Deno.env.get('SUPABASE_URL');
    const service=Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!url||!service)throw new Error('Supabase não configurado.');
    const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
    const payload=await req.json() as any;
    const eventId=String(payload?.id||'');
    const eventType=String(payload?.event||'');
    const providerPaymentId=String(payload?.payment?.id||'');
    if(!eventId||!eventType)return json({error:'Evento inválido.'},400);

    const {data:existing}=await admin.from('food_billing_webhook_events').select('event_id,processed_at').eq('event_id',eventId).maybeSingle();
    if(existing?.processed_at)return json({ok:true,replayed:true});
    await admin.from('food_billing_webhook_events').upsert({event_id:eventId,event_type:eventType,provider:'asaas',payload},{onConflict:'event_id'});

    if(providerPaymentId){
      const {data:payment}=await admin.from('food_subscription_payments').select('id,status').eq('provider','asaas').eq('provider_payment_id',providerPaymentId).maybeSingle();
      if(payment){
        if(eventType==='PAYMENT_RECEIVED'){
          const paidAt=payload?.payment?.clientPaymentDate||payload?.payment?.paymentDate||new Date().toISOString();
          const {error}=await admin.rpc('food_confirm_subscription_payment',{p_payment_id:payment.id,p_paid_at:paidAt,p_provider_event_id:eventId});
          if(error)throw error;
        }else if(eventType==='PAYMENT_OVERDUE'){
          await admin.from('food_subscription_payments').update({status:'expired',provider_raw:payload,updated_at:new Date().toISOString()}).eq('id',payment.id).neq('status','paid');
          await admin.from('food_billing_webhook_events').update({processed_at:new Date().toISOString()}).eq('event_id',eventId);
        }else if(eventType==='PAYMENT_DELETED'){
          await admin.from('food_subscription_payments').update({status:'cancelled',provider_raw:payload,updated_at:new Date().toISOString()}).eq('id',payment.id).neq('status','paid');
          await admin.from('food_billing_webhook_events').update({processed_at:new Date().toISOString()}).eq('event_id',eventId);
        }else if(eventType==='PAYMENT_REFUNDED'){
          await admin.from('food_subscription_payments').update({status:'refunded',provider_raw:payload,updated_at:new Date().toISOString()}).eq('id',payment.id);
          await admin.from('food_billing_webhook_events').update({processed_at:new Date().toISOString()}).eq('event_id',eventId);
        }else{
          await admin.from('food_billing_webhook_events').update({processed_at:new Date().toISOString()}).eq('event_id',eventId);
        }
      }else{
        await admin.from('food_billing_webhook_events').update({processed_at:new Date().toISOString()}).eq('event_id',eventId);
      }
    }
    return json({ok:true});
  }catch(error){return json({error:error instanceof Error?error.message:'Erro inesperado.'},500);}
});
