import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';
import { createOrderPaymentHandler } from './handler.ts';

const autoPaidEnabled=Deno.env.get('ORDER_RECEIPT_AUTOPAID_ENABLED')==='true';
const orderFields = 'id,store_id,order_number,total,payment_method,payment_status,status,pickup_location_id,delivery_type,scheduled_for'+(autoPaidEnabled?',payment_reported_by_customer,payment_receipt_version':'');
Deno.serve(async (req: Request) => {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const service = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!url || !service || !anon) return new Response(JSON.stringify({ error: 'Pagamento indisponível por configuração interna.' }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, service, options);
  return createOrderPaymentHandler({
    reportReceipt: async claim=>{const {data,error}=await admin.rpc('food_declare_order_receipt_v1',{p_store_id:claim.storeId,p_order_id:claim.orderId,p_amount:claim.amount,p_version:claim.version});if(error)throw new Error('RECEIPT_REPORT_REJECTED');return data;},
    receiptDestinations: async (storeId,_pointId,receiptOrderId) => {
      const {data:source,error:sourceError}=await admin.from('food_order_receipt_sources').select('pickup_location_id').eq('order_id',receiptOrderId).eq('store_id',storeId).maybeSingle();
      if(sourceError)throw new Error('RECEIPT_SOURCE_UNAVAILABLE');
      const {data,error}=await admin.rpc('food_get_receipt_destinations_v1',{p_store_id:storeId,p_pickup_location_id:source?.pickup_location_id || null});
      if(error)throw new Error('RECEIPT_DESTINATIONS_UNAVAILABLE');
      return data;
    },
    env: name => Deno.env.get(name),
    authorizedOrder: async (jwt, storeId, orderId) => {
      const { data: { user }, error } = await admin.auth.getUser(jwt);
      if (error || !user || user.is_anonymous) return null;
      const client = createClient(url, anon, { ...options, global: { headers: { Authorization: `Bearer ${jwt}` } } });
      const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel(jwt);
      if (assuranceError || (assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2')) return null;
      const { data: membership, error: memberError } = await client.from('food_store_users').select('id,must_change_password').eq('user_id', user.id).eq('store_id', storeId).eq('active', true).maybeSingle();
      if (memberError || !membership || membership.must_change_password) return null;
      // User-scoped read preserves existing order RLS; service role never issues a grant on its own.
      const { data, error: readError } = await client.from('food_orders').select(orderFields).eq('store_id', storeId).eq('id', orderId).maybeSingle();
      if (readError) return null;
      return data;
    },
    order: async (storeId, orderId) => {
      const { data, error } = await admin.from('food_orders').select(orderFields).eq('store_id', storeId).eq('id', orderId).maybeSingle();
      if (error) throw new Error('PAYMENT_READ_FAILED');
      return data;
    },
    store: async storeId => {
      const { data, error } = await admin.from('food_stores').select('id,name,active,access_status,pix_enabled,pix_receipt_mode,pix_key,pix_copy_paste,pix_holder_name,city'+(autoPaidEnabled?',receipt_click_marks_paid':'')).eq('id', storeId).maybeSingle();
      if (error) throw new Error('PAYMENT_STORE_FAILED');
      return data;
    },
  })(req);
});
