import { restFetch } from '../lib/supabaseRest';
import type { BusinessSegment } from '../segments/businessSegments';

export type ModuleCode = 'clients'|'appointments'|'training'|'nutrition'|'creator'|'florist'|'events'|'combos'|'rentals'|'custom';
export const moduleLabels: Record<ModuleCode,string> = { clients:'Clientes e alunos', appointments:'Agenda e serviços', training:'Acompanhamento de alunos', nutrition:'Acompanhamento administrativo', creator:'Campanhas e links', florist:'Floricultura', events:'Eventos', combos:'Combos', rentals:'Locações', custom:'Personalizados e 3D' };
export type ModuleGrant = { code:ModuleCode; enabled:boolean; effective:boolean; source:string|null; plan_allowed:boolean; reason:string|null; expires_at:string|null; dependencies:ModuleCode[] };
export type BusinessStatus = { profile:{store_id:string;primary_segment:BusinessSegment}|null; legacy:boolean; can_initialize:boolean; modules:ModuleGrant[]; audit?:{id:string;action:string;created_at:string;actor_id?:string|null;details?:{module_code?:string;reason?:string;segment?:string;source?:string}}[] };
export type BusinessRecord = { id:string; [key:string]:unknown };
const changedEvent = 'vendeweb:business-modules-updated';
export const notifyBusinessChange = () => { window.dispatchEvent(new Event(changedEvent)); try { localStorage.setItem(changedEvent,String(Date.now())); } catch { /* storage optional */ } };
export const businessChangeEvent = changedEvent;
export const businessApi = {
  async status(store:string):Promise<BusinessStatus> {
    const value=await restFetch<BusinessStatus>('rpc/food_business_status',{method:'POST',body:{p_store:store}});
    if(!value || !Array.isArray(value.modules) || typeof value.legacy!=='boolean') throw new Error('A estrutura de segmentos ainda não está disponível neste ambiente. Solicite a implantação da migration de segmentos no ambiente correto.');
    return value;
  },
  async initialize(store:string,segment:BusinessSegment) {
    await restFetch('rpc/food_business_initialize',{method:'POST',body:{p_store:store,p_segment:segment}}); notifyBusinessChange();
  },
  async master(action:string,store:string|null,data:Record<string,unknown>={}) {
    const value=await restFetch<{items?:BusinessRecord[]}>('rpc/food_business_master',{method:'POST',body:{p_action:action,p_store:store,p_data:data}}); notifyBusinessChange(); return value;
  },
  operate:(store:string,action:string,data:Record<string,unknown>={})=>restFetch<{items?:BusinessRecord[];item?:BusinessRecord}>('rpc/food_business_operate',{method:'POST',body:{p_store:store,p_action:action,p_data:data}}),
};
export const moduleIsActive = (state:BusinessStatus|null,code:ModuleCode) => state?.modules.some(item=>item.code===code&&item.effective)===true;
