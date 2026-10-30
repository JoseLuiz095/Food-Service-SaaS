import { restFetch } from '../lib/supabaseRest';

export type ProfessionalKind = 'training'|'nutrition'|'general';
export type Council = 'CREF'|'CRN'|'OUTRO';
export type StaffMember = { user_id:string; email:string; name:string|null; kind:ProfessionalKind|null; council:Council|null; registration:string|null; professional_active:boolean|null };
export type OwnAssignment = { store_id:string; store_name:string; name:string; kind:ProfessionalKind; council:Council; registration:string; services:{id:string;name:string;kind:string}[] };

export const professionalApi = {
  staff: (store:string)=>restFetch<StaffMember[]>('rpc/food_service_professional_staff',{method:'POST',body:{p_store:store}}),
  save: (input:{store:string;user:string;name:string;kind:ProfessionalKind;council:Council;registration:string;active:boolean})=>restFetch<unknown>('rpc/food_service_professional_upsert',{method:'POST',body:{p_store:input.store,p_user:input.user,p_name:input.name,p_kind:input.kind,p_council:input.council,p_registration:input.registration,p_active:input.active}}),
  assign: (store:string,service:string,user:string)=>restFetch<unknown>('rpc/food_service_professional_assign',{method:'POST',body:{p_store:store,p_service:service,p_user:user}}),
  mine: ()=>restFetch<OwnAssignment[]>('rpc/food_service_professional_mine',{method:'POST',body:{}}),
};
