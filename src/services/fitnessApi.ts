import { restFetch } from '../lib/supabaseRest';

export type FitnessSlot = {
  starts_at: string;
  ends_at: string;
  professional_id: string;
};

export type FitnessSlots = {
  slots: FitnessSlot[];
  cancel_policy: string;
  reschedule_policy: string;
};

export type FitnessProfessional = { user_id: string; active: boolean };
export type FitnessWindow = { id: string; professional_id: string; weekday: number; starts_local: string; ends_local: string; timezone: string; step_minutes: number; buffer_minutes: number; active: boolean };
export type FitnessBlock = { id: string; professional_id: string; starts_at: string; ends_at: string; reason: string };
export type FitnessTerm = { service_id: string; published_at: string | null; price_confirmed: boolean; cancel_policy: string; reschedule_policy: string; cancel_before_minutes: number };
export type FitnessAppointment = { id: string; service_id: string; professional_id: string; starts_at: string; ends_at: string; status: string; client_id?: string; cancel_policy?:string|null; reschedule_policy?:string|null };
export type FitnessStatus = { professionals: FitnessProfessional[]; windows: FitnessWindow[]; blocks: FitnessBlock[]; terms: FitnessTerm[]; appointments: FitnessAppointment[] };
export type FitnessExercise = { id:string; position:number; name:string; sets:number; repetitions:string; rest_seconds:number; load_or_effort:string; instructions:string; alternative:string };
export type FitnessWorkout = { id:string; title:string; level:'basic'|'medium'|'advanced'; source:'custom'|'pilot'; status:'draft'|'approved'; description:string; approved_at:string|null; professional?:{user_id:string;name:string;council:string;registration:string}; exercises:FitnessExercise[] };
export type FitnessStudent = { client_id:string; name:string };

export type FitnessWindowInput = {
  store: string;
  id?: string | null;
  professional: string;
  weekday: number;
  start: string;
  end: string;
  timezone: string;
  stepMinutes: number;
  bufferMinutes: number;
};

export type FitnessBlockInput = {
  store: string;
  id?: string | null;
  professional: string;
  starts: string;
  ends: string;
  reason: string;
};

export const fitnessApi = {
  status: (store:string) => restFetch<FitnessStatus>('rpc/food_fitness_status', {
    method: 'POST', body: {p_store:store},
  }),
  setProfessional: (store:string,user:string,active:boolean) => restFetch<unknown>('rpc/food_fitness_set_professional', {
    method: 'POST', body: {p_store:store,p_user:user,p_active:active},
  }),
  saveWindow: (input: FitnessWindowInput) => restFetch<unknown>('rpc/food_fitness_save_window', {
    method: 'POST',
    body: {
      p_store: input.store,
      p_id: input.id || null,
      p_professional: input.professional,
      p_weekday: input.weekday,
      p_start: input.start,
      p_end: input.end,
      p_timezone: input.timezone,
      p_step_minutes: input.stepMinutes,
      p_buffer_minutes: input.bufferMinutes,
    },
  }),
  disableWindow: (store:string,id:string) => restFetch<unknown>('rpc/food_fitness_disable_window', {
    method:'POST',body:{p_store:store,p_id:id},
  }),
  saveBlock: (input: FitnessBlockInput) => restFetch<unknown>('rpc/food_fitness_save_block', {
    method: 'POST',
    body: {
      p_store: input.store,
      p_id: input.id || null,
      p_professional: input.professional,
      p_starts: input.starts,
      p_ends: input.ends,
      p_reason: input.reason,
    },
  }),
  deleteBlock: (store:string,id:string) => restFetch<unknown>('rpc/food_fitness_delete_block', {
    method:'POST',body:{p_store:store,p_id:id},
  }),
  publishService: (input: {store:string;service:string;cancelPolicy:string;reschedulePolicy:string;cancelBeforeMinutes:number;priceConfirmed:boolean}) => restFetch<unknown>('rpc/food_fitness_publish_service', {
    method: 'POST',
    body: {
      p_store: input.store,
      p_service: input.service,
      p_cancel_policy: input.cancelPolicy,
      p_reschedule_policy: input.reschedulePolicy,
      p_cancel_before_minutes: input.cancelBeforeMinutes,
      p_price_confirmed: input.priceConfirmed,
    },
  }),
  listSlots: (store:string, service:string, from:string, days:number) => restFetch<FitnessSlots>('rpc/food_fitness_list_slots', {
    method: 'POST', body: {p_store:store,p_service:service,p_from:from,p_days:days},
  }),
  myAppointments: (store:string) => restFetch<{appointments:FitnessAppointment[]}>('rpc/food_fitness_my_appointments', {
    method: 'POST', body: {p_store:store},
  }),
  registerStudent: (store:string,name:string,phone:string) => restFetch<unknown>('rpc/food_fitness_register_student', {
    method: 'POST', body: {p_store:store,p_name:name,p_phone:phone},
  }),
  book: (store:string,service:string,starts:string,professional:string,termsAccepted:boolean) => restFetch<unknown>('rpc/food_fitness_book', {
    method: 'POST', body: {p_store:store,p_service:service,p_starts:starts,p_professional:professional,p_terms_accepted:termsAccepted},
  }),
  reschedule: (appointment:string,starts:string,professional:string) => restFetch<unknown>('rpc/food_fitness_reschedule', {
    method: 'POST', body: {p_appointment:appointment,p_starts:starts,p_professional:professional},
  }),
  cancel: (appointment:string) => restFetch<unknown>('rpc/food_fitness_cancel', {
    method: 'POST', body: {p_appointment:appointment},
  }),
  listWorkouts: (store:string) => restFetch<FitnessWorkout[]>('rpc/food_fitness_list_workouts', {
    method:'POST',body:{p_store:store},
  }),
  listStudents: (store:string) => restFetch<{students:FitnessStudent[]}>('rpc/food_fitness_list_students', {
    method:'POST',body:{p_store:store},
  }),
  seedWorkouts: (store:string) => restFetch<{created_ids:string[];status:'draft'}>('rpc/food_fitness_seed_workouts', {
    method:'POST',body:{p_store:store},
  }),
  saveWorkout: (store:string,workout:FitnessWorkout) => restFetch<unknown>('rpc/food_fitness_save_workout', {
    method:'POST',body:{p_store:store,p_id:workout.id,p_level:workout.level,p_title:workout.title,p_description:workout.description,p_source:workout.source,p_exercises:workout.exercises.map(({name,sets,repetitions,rest_seconds,load_or_effort,instructions,alternative})=>({name,sets,repetitions,rest_seconds,load_or_effort,instructions,alternative}))},
  }),
  approveWorkout: (store:string,workout:string) => restFetch<unknown>('rpc/food_fitness_approve_workout', {
    method:'POST',body:{p_store:store,p_workout:workout},
  }),
  assignWorkout: (store:string,workout:string,client:string) => restFetch<unknown>('rpc/food_fitness_assign_workout', {
    method:'POST',body:{p_store:store,p_workout:workout,p_client:client},
  }),
};
