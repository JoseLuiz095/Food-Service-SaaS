import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';
import * as webPushModule from 'npm:web-push@3.6.7';

const webpush = (webPushModule as { default?: typeof webPushModule }).default || webPushModule;
const cors = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Content-Type':'application/json', 'Cache-Control':'no-store' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers:cors });

Deno.serve(async (request) => {
  if (request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:suporte@vendeweb.com.br';
  if (!url || !serviceKey) return json({ error: 'Agendador de lembretes ainda não configurado.' }, 503);
  if (request.headers.get('Authorization') !== `Bearer ${serviceKey}`) return json({ error: 'Não autorizado.' }, 401);
  try {
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: enqueued, error: enqueueError } = await admin.rpc('food_fitness_reminder_enqueue_due');
    if (enqueueError) throw enqueueError;
    if (!publicKey || !privateKey) return json({ ok:true, enqueued:Number(enqueued||0), claimed:0, push_configured:false });
    const { data: due, error: claimError } = await admin.rpc('food_fitness_reminder_claim_push', { p_limit: 100 });
    if (claimError) throw claimError;
    const rows = Array.isArray(due) ? due as Array<{ delivery_id:string;store_id:string;user_id:string;kind:string;title:string;message:string;url:string;subscriptions:Array<{id:string;endpoint:string;p256dh:string;auth:string}> }> : [];
    webpush.setVapidDetails(subject, publicKey, privateKey);
    let sent = 0;
    let failed = 0;
    for (const row of rows) {
      let successfulDevices = 0;
      for (const subscription of row.subscriptions||[]) {
        try {
          await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title:row.title, body:row.message, tag:`fitness-reminder:${row.delivery_id}`, url:row.url }));
          successfulDevices++;
          sent++;
        } catch (error) {
          failed++;
          const code = Number((error as {statusCode?:number}).statusCode || 0);
          if (code===404||code===410) await admin.from('food_fitness_student_push_subscriptions').update({active:false,updated_at:new Date().toISOString()}).eq('id',subscription.id).eq('store_id',row.store_id).eq('user_id',row.user_id);
        }
      }
      const { error: finishError } = await admin.rpc('food_fitness_reminder_finish_push', { p_delivery:row.delivery_id, p_success:successfulDevices>0 });
      if (finishError) throw finishError;
    }
    return json({ ok:true, enqueued:Number(enqueued||0), claimed:rows.length, sent, failed, push_configured:true });
  } catch {
    return json({ error:'Falha ao processar lembretes push.' }, 500);
  }
});
