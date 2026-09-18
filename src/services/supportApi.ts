import { restFetch } from '../lib/supabaseRest';

type SupportPayload={support_whatsapp?:string|null};

export async function loadAdminSupportContact():Promise<string>{
  const payload=await restFetch<SupportPayload>('rpc/food_get_admin_support_contact_v1',{method:'POST',body:{}});
  return String(payload?.support_whatsapp||'').replace(/\D/g,'');
}
