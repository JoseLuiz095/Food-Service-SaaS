import { restFetch } from '../lib/supabaseRest';

export type ProfessionalKind = 'training'|'nutrition'|'general';
export type Council = 'CREF'|'CRN'|'OUTRO';
export type StaffMember = { user_id:string; email:string; name:string|null; kind:ProfessionalKind|null; council:Council|null; registration:string|null; professional_active:boolean|null };
export type OwnAssignment = { store_id:string; store_name:string; name:string; kind:ProfessionalKind; council:Council; registration:string; services:{id:string;name:string;kind:string}[] };
export type ProfessionalPublication = {id:string;title:string;body:string;category:'commercial'|'training'|'nutrition';channel:'storefront'|'student_message';recipient_student_user_id:string|null;status:'draft'|'scheduled'|'published'|'cancelled';scheduled_at:string|null;approved_at:string|null;published_at:string|null;cancelled_at:string|null;author_name:string;author_council:Council;author_registration:string;created_at:string};
export type StudentReminder = {id:string;kind:'workout'|'appointment'|'hydration'|'routine';label:string;reminder_time:string;timezone:string;weekdays:number[];channel:'in_app'|'push';status:'active'|'paused'|'cancelled';paused_until:string|null};
export type ReminderDelivery = {id:string;reminder_id:string;planned_for:string;status:'queued'|'sending'|'sent'|'seen'|'failed';label:string;kind:StudentReminder['kind']};
export type ProfessionalAuthorization = {user_id:string;name:string;kind:ProfessionalKind;council:Council;registration:string;authorized:boolean;message_enabled:boolean};
export type AuthorizedStudent = {student_user_id:string;client_id:string;name:string;purpose:'training'|'nutrition';authorized_at:string};
export type MessageRecipient = {student_user_id:string;name:string;training_authorized:boolean;nutrition_authorized:boolean};
export type ProfessionalMessage = {id:string;publication_id:string;title:string;body:string;category:'commercial'|'training'|'nutrition';status:'sent'|'seen';sent_at:string;author_name:string;author_council:Council;author_registration:string};

export const professionalApi = {
  staff: (store:string)=>restFetch<StaffMember[]>('rpc/food_service_professional_staff',{method:'POST',body:{p_store:store}}),
  save: (input:{store:string;user:string;name:string;kind:ProfessionalKind;council:Council;registration:string;active:boolean})=>restFetch<unknown>('rpc/food_service_professional_upsert',{method:'POST',body:{p_store:input.store,p_user:input.user,p_name:input.name,p_kind:input.kind,p_council:input.council,p_registration:input.registration,p_active:input.active}}),
  assign: (store:string,service:string,user:string)=>restFetch<unknown>('rpc/food_service_professional_assign',{method:'POST',body:{p_store:store,p_service:service,p_user:user}}),
  mine: ()=>restFetch<OwnAssignment[]>('rpc/food_service_professional_mine',{method:'POST',body:{}}),
  publications:(store:string)=>restFetch<ProfessionalPublication[]>('rpc/food_professional_publication_list',{method:'POST',body:{p_store:store}}),
  savePublication:(input:{store:string;id?:string;title:string;body:string;category:ProfessionalPublication['category'];channel:ProfessionalPublication['channel'];recipient?:string})=>restFetch<unknown>('rpc/food_professional_publication_save',{method:'POST',body:{p_store:input.store,p_id:input.id||null,p_title:input.title,p_body:input.body,p_category:input.category,p_channel:input.channel,p_recipient:input.recipient||null}}),
  approvePublication:(store:string,id:string,scheduledAt:string)=>restFetch<unknown>('rpc/food_professional_publication_approve',{method:'POST',body:{p_store:store,p_id:id,p_scheduled_at:scheduledAt}}),
  cancelPublication:(store:string,id:string)=>restFetch<unknown>('rpc/food_professional_publication_cancel',{method:'POST',body:{p_store:store,p_id:id}}),
  authorizedStudents:(store:string)=>restFetch<AuthorizedStudent[]>('rpc/food_professional_authorized_students',{method:'POST',body:{p_store:store}}),
  messageRecipients:(store:string)=>restFetch<MessageRecipient[]>('rpc/food_professional_message_recipients',{method:'POST',body:{p_store:store}}),
  messages:(store:string)=>restFetch<ProfessionalMessage[]>('rpc/food_fitness_student_messages_list',{method:'POST',body:{p_store:store}}),
  reminders:(store:string)=>restFetch<{reminders:StudentReminder[];inbox:ReminderDelivery[]}>('rpc/food_fitness_student_reminders_list',{method:'POST',body:{p_store:store}}),
  saveReminder:(input:{store:string;id?:string;kind:StudentReminder['kind'];label:string;time:string;timezone:string;weekdays:number[];channel:StudentReminder['channel']})=>restFetch<unknown>('rpc/food_fitness_student_reminder_save',{method:'POST',body:{p_store:input.store,p_id:input.id||null,p_kind:input.kind,p_label:input.label,p_time:input.time,p_timezone:input.timezone,p_weekdays:input.weekdays,p_channel:input.channel}}),
  reminderAction:(store:string,id:string,action:'pause'|'resume'|'cancel',until?:string)=>restFetch<unknown>('rpc/food_fitness_student_reminder_action',{method:'POST',body:{p_store:store,p_id:id,p_action:action,p_paused_until:until||null}}),
  authorizationList:(store:string)=>restFetch<{professionals:ProfessionalAuthorization[]}>('rpc/food_fitness_student_authorization_list',{method:'POST',body:{p_store:store}}),
  authorize:(store:string,professional:string,purpose:ProfessionalKind,enabled:boolean)=>restFetch<unknown>('rpc/food_fitness_student_authorize_professional',{method:'POST',body:{p_store:store,p_professional:professional,p_purpose:purpose,p_enabled:enabled}}),
  messagePermission:(store:string,professional:string,enabled:boolean)=>restFetch<unknown>('rpc/food_fitness_student_message_permission_set',{method:'POST',body:{p_store:store,p_professional:professional,p_enabled:enabled}}),
  markReminderSeen:(store:string,id:string)=>restFetch<unknown>('rpc/food_fitness_reminder_mark_seen',{method:'POST',body:{p_store:store,p_delivery:id}}),
  markMessageSeen:(store:string,id:string)=>restFetch<unknown>('rpc/food_fitness_student_message_mark_seen',{method:'POST',body:{p_store:store,p_delivery:id}}),
};
