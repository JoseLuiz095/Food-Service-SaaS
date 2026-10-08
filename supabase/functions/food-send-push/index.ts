import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';
import * as webPushModule from 'npm:web-push@3.6.7';

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

const webpush = (webPushModule as { default?: typeof webPushModule }).default || webPushModule;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Método não permitido.' }), { status: 405, headers: { 'Content-Type': 'application/json' } });

  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:suporte@foodweb.local';
  const authorization = req.headers.get('Authorization') || '';

  if (!url || !serviceKey || !vapidPublicKey || !vapidPrivateKey) {
    return new Response(JSON.stringify({ error: 'Notificações push ainda não estão configuradas no servidor.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  if (authorization !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'Não autorizado.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const body = await req.json() as {
      store_id?: string;
      title?: string;
      message?: string;
      tag?: string;
      url?: string;
    };
    if (!body.store_id) throw new Error('Loja não informada.');

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
    const { data: storeSettings } = await admin
      .from('food_stores')
      .select('notifications_new_order_enabled,notifications_desktop_enabled')
      .eq('id', body.store_id)
      .maybeSingle();
    if (storeSettings && (storeSettings.notifications_new_order_enabled === false || storeSettings.notifications_desktop_enabled === false)) {
      return new Response(JSON.stringify({ ok: true, sent: 0, removed: 0, total: 0, skipped: 'disabled_by_store' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const { data: subscriptions, error } = await admin
      .from('food_push_subscriptions')
      .select('id,endpoint,p256dh,auth')
      .eq('store_id', body.store_id)
      .eq('active', true);
    if (error) throw error;

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const payload = JSON.stringify({
      title: body.title || 'Novo pedido na loja',
      body: body.message || 'Há um novo pedido aguardando atendimento.',
      tag: body.tag || `foodweb:${body.store_id}`,
      url: body.url || '/admin/pedidos',
    });
    let sent = 0;
    let removed = 0;
    for (const subscription of (subscriptions || []) as PushSubscriptionRow[]) {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload);
        sent += 1;
      } catch (sendError) {
        const statusCode = Number((sendError as { statusCode?: number }).statusCode || 0);
        if (statusCode === 404 || statusCode === 410) {
          await admin.from('food_push_subscriptions').update({ active: false, updated_at: new Date().toISOString() }).eq('id', subscription.id);
          removed += 1;
        } else console.warn('Falha ao enviar push:', sendError);
      }
    }
    return new Response(JSON.stringify({ ok: true, sent, removed, total: subscriptions?.length || 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Falha ao enviar notificações push.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
});
