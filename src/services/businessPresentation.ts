import { restFetch } from '../lib/supabaseRest';
import type { BusinessSegment } from '../segments/businessSegments';

/** Completes server-side onboarding without retrying account creation on failure. */
export async function saveNewStorePresentation(storeId: string, segment?: BusinessSegment, masterUpdate = false): Promise<string | undefined> {
  if (!segment) return;
  try {
    let existing=false;
    if(masterUpdate){
      const status=await restFetch<{profile?:{primary_segment:string}}>('rpc/food_business_status',{method:'POST',body:{p_store:storeId}});
      existing=Boolean(status?.profile);
    }
    if(existing)await restFetch('rpc/food_business_master',{method:'POST',body:{p_action:'set_segment',p_store:storeId,p_data:{segment}}});
    else await restFetch('rpc/food_business_initialize',{method:'POST',body:{p_store:storeId,p_segment:segment}});
    const verified=await restFetch<{profile?:{primary_segment:string}}>('rpc/food_business_status',{method:'POST',body:{p_store:storeId}});
    if(verified?.profile?.primary_segment!==segment)throw new Error('Perfil não confirmado pelo servidor.');
  } catch {
    // Account creation already succeeded: do not invite a duplicate registration on a visual failure.
    return 'O segmento ainda não foi configurado no servidor. Sua conta foi preservada. Abra Segmento e permissões no painel ou solicite a atualização do ambiente ao Admin Master.';
  }
}
