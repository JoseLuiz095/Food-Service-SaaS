-- shared_future: phone OTP student access and per-store Fitness session control.
-- Does not change global Supabase Auth settings, provider credentials, or other products.
begin;

alter table public.food_fitness_students
  add constraint food_fitness_students_identity_client_uk unique(store_id,user_id,client_id);

create table public.food_fitness_student_sessions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  user_id uuid not null references auth.users(id),
  client_id uuid not null,
  auth_session_id uuid not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text check(revoke_reason is null or revoke_reason in ('user_logout','lost_device','security_review','user_request')),
  foreign key(store_id,user_id,client_id) references public.food_fitness_students(store_id,user_id,client_id) on delete cascade
);
create unique index food_fitness_student_one_live_session
  on public.food_fitness_student_sessions(store_id,user_id) where revoked_at is null;
create index food_fitness_student_sessions_lookup
  on public.food_fitness_student_sessions(store_id,client_id,granted_at desc);
alter table public.food_fitness_student_sessions enable row level security;
revoke all on public.food_fitness_student_sessions from public,anon,authenticated,service_role;

create or replace function food_fitness_private.phone_verified(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.users where id=p_user_id and phone is not null and phone_confirmed_at is not null)
$$;

create or replace function food_fitness_private.student_session_active(p_store uuid,p_client uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null
    and food_fitness_private.phone_verified(auth.uid())
    and food_business_private.module_enabled(p_store,'training')
    and nullif(auth.jwt()->>'session_id','') is not null
    and exists(
      select 1 from public.food_fitness_student_sessions fs
      join auth.sessions a on a.id=fs.auth_session_id and a.user_id=fs.user_id
      where fs.store_id=p_store and fs.client_id=p_client and fs.user_id=auth.uid()
        and fs.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid and fs.revoked_at is null
        and (a.not_after is null or a.not_after>now())
    )
$$;

create or replace function public.food_fitness_student_status_v1(p_store uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb; phone_ok boolean;
begin
  if u is null or not food_fitness_private.is_fitness(p_store)
    or not food_business_private.module_enabled(p_store,'training') then
    raise exception 'FITNESS_STUDENT_ACCESS_DENIED' using errcode='42501';
  end if;
  phone_ok:=food_fitness_private.phone_verified(u);
  if not phone_ok then raise exception 'VERIFIED_PHONE_REQUIRED' using errcode='42501'; end if;
  select jsonb_build_object('registered',true,'store_id',s.store_id,'client_id',s.client_id,'name',c.name)
    into result
    from public.food_fitness_students s join public.food_business_clients c on c.id=s.client_id and c.store_id=s.store_id and c.active
    where s.store_id=p_store and s.user_id=u;
  return coalesce(result,jsonb_build_object('registered',false,'store_id',p_store));
end; $$;

create or replace function public.food_fitness_register_student(p_store uuid,p_name text,p_phone text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); phone_value text; cid uuid;
begin
  if uid is null or not food_fitness_private.is_fitness(p_store)
    or not food_business_private.module_enabled(p_store,'clients')
    or not food_business_private.module_enabled(p_store,'training')
    or not food_fitness_private.phone_verified(uid) then
    raise exception 'Cadastro de aluno indisponível. Verifique seu telefone por código.' using errcode='42501';
  end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 120 then
    raise exception 'Informe um nome válido.' using errcode='22023';
  end if;
  select phone into phone_value from auth.users where id=uid and phone_confirmed_at is not null;
  if p_phone is not null and length(trim(p_phone))>0 and trim(p_phone)<>phone_value then
    raise exception 'O telefone do perfil precisa ser o telefone verificado desta conta.' using errcode='22023';
  end if;
  select client_id into cid from public.food_fitness_students where store_id=p_store and user_id=uid;
  if cid is null then
    insert into public.food_business_clients(store_id,name,email,phone)
      values(p_store,trim(p_name),'',phone_value) returning id into cid;
    insert into public.food_fitness_students(store_id,user_id,client_id) values(p_store,uid,cid);
  else
    update public.food_business_clients set name=trim(p_name),email='',phone=phone_value,updated_at=now()
      where id=cid and store_id=p_store and active;
    if not found then raise exception 'Perfil de aluno indisponível.' using errcode='42501'; end if;
  end if;
  return jsonb_build_object('store_id',p_store,'client_id',cid,'professional',false);
end; $$;

create or replace function public.food_fitness_student_session_v1(p_store uuid,p_client uuid,p_action text default 'claim')
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
  live_session uuid; previous_revoked boolean;
begin
  if u is null or sid is null or not food_fitness_private.is_fitness(p_store)
    or not food_business_private.module_enabled(p_store,'training')
    or not food_fitness_private.phone_verified(u)
    or not exists(select 1 from auth.sessions where id=sid and user_id=u and (not_after is null or not_after>now()))
    or not exists(select 1 from public.food_fitness_students where store_id=p_store and client_id=p_client and user_id=u) then
    raise exception 'FITNESS_STUDENT_ACCESS_DENIED' using errcode='42501';
  end if;
  if p_action is null or p_action not in ('claim','release','check') then raise exception 'INVALID_STUDENT_SESSION_ACTION' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_store::text||p_client::text,0));
  if p_action='check' then
    if food_fitness_private.student_session_active(p_store,p_client) then
      return jsonb_build_object('authorized',true,'reason',null);
    end if;
    return jsonb_build_object('authorized',false,'reason','SESSION_REVOKED');
  end if;
  if p_action='release' then
    update public.food_fitness_student_sessions set revoked_at=now(),revoke_reason='user_logout'
      where store_id=p_store and client_id=p_client and user_id=u and auth_session_id=sid and revoked_at is null;
    if found then
      insert into public.food_business_audit(store_id,actor_id,action,details)
        values(p_store,u,'fitness.student_session_released',jsonb_build_object('client_id',p_client,'reason','user_logout'));
    end if;
    return jsonb_build_object('authorized',false,'released',true);
  end if;
  select auth_session_id into live_session from public.food_fitness_student_sessions
    where store_id=p_store and user_id=u and revoked_at is null;
  if live_session=sid then return jsonb_build_object('authorized',true,'reason',null); end if;
  if live_session is not null then
    if exists(select 1 from auth.sessions where id=live_session and user_id=u and (not_after is null or not_after>now())) then
      return jsonb_build_object('authorized',false,'reason','SESSION_LIMIT');
    end if;
    update public.food_fitness_student_sessions set revoked_at=now(),revoke_reason='security_review'
      where store_id=p_store and user_id=u and revoked_at is null;
  end if;
  select exists(select 1 from public.food_fitness_student_sessions where store_id=p_store and user_id=u and auth_session_id=sid and revoked_at is not null)
    into previous_revoked;
  if previous_revoked then return jsonb_build_object('authorized',false,'reason','SESSION_REVOKED'); end if;
  insert into public.food_fitness_student_sessions(store_id,user_id,client_id,auth_session_id)
    values(p_store,u,p_client,sid);
  insert into public.food_business_audit(store_id,actor_id,action,details)
    values(p_store,u,'fitness.student_session_claimed',jsonb_build_object('client_id',p_client));
  return jsonb_build_object('authorized',true,'reason',null);
end; $$;

create or replace function public.food_fitness_student_session_admin_v1(p_store uuid,p_client uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare n integer; u uuid; sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2'
    or not food_fitness_private.is_fitness(p_store)
    or not (public.food_is_store_admin(p_store) or food_fitness_private.can_configure(p_store))
    or not exists(select 1 from auth.sessions where id=sid and user_id=auth.uid() and (not_after is null or not_after>now())) then
    raise exception 'FITNESS_ADMIN_MFA_REQUIRED' using errcode='42501';
  end if;
  if p_reason is null or p_reason not in ('lost_device','security_review','user_request') then raise exception 'INVALID_RECOVERY_REASON' using errcode='22023'; end if;
  select user_id into u from public.food_fitness_students where store_id=p_store and client_id=p_client;
  if u is null then raise exception 'FITNESS_STUDENT_NOT_FOUND' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_store::text||p_client::text,0));
  update public.food_fitness_student_sessions set revoked_at=now(),revoke_reason=p_reason
    where store_id=p_store and client_id=p_client and user_id=u and revoked_at is null;
  get diagnostics n=row_count;
  insert into public.food_business_audit(store_id,actor_id,action,details)
    values(p_store,auth.uid(),'fitness.student_session_admin_revoked',
      jsonb_build_object('client_id',p_client,'student_id',u,'reason',p_reason,'revoked_count',n));
  return jsonb_build_object('revoked_count',n,'student_id',u);
end; $$;

create or replace function public.food_fitness_list_workouts(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); cid uuid;
begin
  if u is null or not food_fitness_private.is_fitness(p_store) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if food_fitness_private.can_configure(p_store) then
    return (select coalesce(jsonb_agg(to_jsonb(w)||jsonb_build_object('exercises',(select coalesce(jsonb_agg(to_jsonb(e) order by e.position),'[]'::jsonb) from public.food_fitness_exercises e where e.workout_id=w.id and e.store_id=w.store_id)) order by w.created_at),'[]'::jsonb) from public.food_fitness_workouts w where w.store_id=p_store);
  end if;
  select client_id into cid from public.food_fitness_students where store_id=p_store and user_id=u;
  if cid is null or not food_fitness_private.student_session_active(p_store,cid) then
    raise exception 'FITNESS_STUDENT_SESSION_REQUIRED' using errcode='42501';
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(w)||jsonb_build_object('exercises',(select coalesce(jsonb_agg(to_jsonb(e) order by e.position),'[]'::jsonb) from public.food_fitness_exercises e where e.workout_id=w.id and e.store_id=w.store_id)) order by w.created_at),'[]'::jsonb)
    from public.food_fitness_workouts w join public.food_fitness_workout_assignments a on a.workout_id=w.id and a.store_id=w.store_id and a.active
    where w.store_id=p_store and w.status='approved' and a.client_id=cid);
end; $$;

create or replace function public.food_fitness_list_students(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not food_fitness_private.can_configure(p_store) then raise exception 'Sem acesso aos alunos Fitness.' using errcode='42501'; end if;
  return jsonb_build_object('students',(
    select coalesce(jsonb_agg(jsonb_build_object(
      'client_id',c.id,'name',c.name,
      'session_active',exists(select 1 from public.food_fitness_student_sessions fs
        where fs.store_id=s.store_id and fs.client_id=s.client_id and fs.user_id=s.user_id and fs.revoked_at is null
          and exists(select 1 from auth.sessions a where a.id=fs.auth_session_id and a.user_id=fs.user_id and (a.not_after is null or a.not_after>now())))
    ) order by c.name),'[]'::jsonb)
    from public.food_fitness_students s join public.food_business_clients c on c.id=s.client_id and c.store_id=s.store_id
    where s.store_id=p_store and c.active
  ));
end; $$;

create or replace function public.food_fitness_book(p_store uuid,p_service uuid,p_starts timestamptz,p_professional uuid,p_terms_accepted boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare client uuid; duration_minutes integer; result public.food_business_appointments%rowtype; terms_row public.food_fitness_service_terms%rowtype;
begin
  if auth.uid() is null or p_terms_accepted is distinct from true then raise exception 'Entre na sua conta e aceite as regras antes de reservar.' using errcode='42501'; end if;
  if not food_fitness_private.is_fitness(p_store) or not food_business_private.module_enabled(p_store,'appointments') or not food_business_private.module_enabled(p_store,'training') then raise exception 'Reservas indisponíveis.' using errcode='42501'; end if;
  select s.client_id into client from public.food_fitness_students s join public.food_business_clients c on c.id=s.client_id and c.store_id=s.store_id and c.active where s.store_id=p_store and s.user_id=auth.uid();
  if client is null or not food_fitness_private.student_session_active(p_store,client) then raise exception 'FITNESS_STUDENT_SESSION_REQUIRED' using errcode='42501'; end if;
  select s.duration_minutes into duration_minutes from public.food_business_services s join public.food_fitness_service_terms t on t.store_id=s.store_id and t.service_id=s.id and t.price_confirmed and t.published_at is not null where s.store_id=p_store and s.id=p_service and s.active and s.kind='training';
  select * into terms_row from public.food_fitness_service_terms where store_id=p_store and service_id=p_service and price_confirmed and published_at is not null;
  if duration_minutes is null or p_starts is null or p_starts<=now() or p_starts>now()+interval '90 days' then raise exception 'Serviço ou horário indisponível.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('food-fitness-slot:'||p_store::text||':'||p_professional::text,0));
  insert into public.food_business_appointments(store_id,client_id,service_id,professional_id,starts_at,ends_at,status)
  values(p_store,client,p_service,p_professional,p_starts,p_starts+make_interval(mins=>duration_minutes),'scheduled') returning * into result;
  insert into public.food_fitness_booking_terms(store_id,appointment_id,cancel_policy,reschedule_policy,cancel_before_minutes)
  values(p_store,result.id,terms_row.cancel_policy,terms_row.reschedule_policy,terms_row.cancel_before_minutes);
  return jsonb_build_object('appointment_id',result.id,'status',result.status,'starts_at',result.starts_at,'ends_at',result.ends_at);
end; $$;

create or replace function public.food_fitness_my_appointments(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); cid uuid;
begin
  if u is null or not food_fitness_private.is_fitness(p_store) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  select client_id into cid from public.food_fitness_students where store_id=p_store and user_id=u;
  if cid is null or not food_fitness_private.student_session_active(p_store,cid) then raise exception 'FITNESS_STUDENT_SESSION_REQUIRED' using errcode='42501'; end if;
  return jsonb_build_object('appointments',(
    select coalesce(jsonb_agg(to_jsonb(x) order by x.starts_at desc),'[]'::jsonb)
    from (select a.id,a.service_id,a.professional_id,a.starts_at,a.ends_at,a.status,a.created_at,a.updated_at,t.cancel_policy,t.reschedule_policy
      from public.food_business_appointments a join public.food_fitness_booking_terms t on t.store_id=a.store_id and t.appointment_id=a.id
      where a.store_id=p_store and a.client_id=cid order by a.starts_at desc limit 100) x
  ));
end; $$;

create or replace function public.food_fitness_cancel(p_appointment uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.food_business_appointments%rowtype; cutoff integer; admin_action boolean;
begin
  select * into a from public.food_business_appointments where id=p_appointment for update;
  if a.id is null or not food_fitness_private.is_fitness(a.store_id) then raise exception 'Reserva não encontrada.' using errcode='22023'; end if;
  admin_action:=food_fitness_private.can_configure(a.store_id);
  if not admin_action and not exists(select 1 from public.food_fitness_students where store_id=a.store_id and client_id=a.client_id and user_id=auth.uid()) then raise exception 'Reserva de outro aluno.' using errcode='42501'; end if;
  if not admin_action and not food_fitness_private.student_session_active(a.store_id,a.client_id) then raise exception 'FITNESS_STUDENT_SESSION_REQUIRED' using errcode='42501'; end if;
  if a.status not in ('scheduled','confirmed') then raise exception 'Reserva já finalizada.' using errcode='22023'; end if;
  select coalesce(bt.cancel_before_minutes,t.cancel_before_minutes) into cutoff
  from public.food_fitness_service_terms t left join public.food_fitness_booking_terms bt on bt.store_id=a.store_id and bt.appointment_id=a.id
  where t.store_id=a.store_id and t.service_id=a.service_id;
  if not admin_action and a.starts_at<=now()+make_interval(mins=>coalesce(cutoff,0)) then raise exception 'Prazo de cancelamento encerrado. Contate o profissional.' using errcode='22023'; end if;
  update public.food_business_appointments set status='cancelled',updated_at=now() where id=a.id;
  return jsonb_build_object('appointment_id',a.id,'status','cancelled');
end; $$;

create or replace function public.food_fitness_reschedule(p_appointment uuid,p_starts timestamptz,p_professional uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.food_business_appointments%rowtype; cutoff integer; duration_minutes integer; admin_action boolean; result public.food_business_appointments%rowtype;
begin
  select * into a from public.food_business_appointments where id=p_appointment for update;
  if a.id is null or not food_fitness_private.is_fitness(a.store_id) then raise exception 'Reserva não encontrada.' using errcode='22023'; end if;
  admin_action:=food_fitness_private.can_configure(a.store_id);
  if not admin_action and not exists(select 1 from public.food_fitness_students where store_id=a.store_id and client_id=a.client_id and user_id=auth.uid()) then raise exception 'Reserva de outro aluno.' using errcode='42501'; end if;
  if not admin_action and not food_fitness_private.student_session_active(a.store_id,a.client_id) then raise exception 'FITNESS_STUDENT_SESSION_REQUIRED' using errcode='42501'; end if;
  if a.status not in ('scheduled','confirmed') then raise exception 'Reserva já finalizada.' using errcode='22023'; end if;
  select coalesce(bt.cancel_before_minutes,t.cancel_before_minutes),s.duration_minutes into cutoff,duration_minutes
  from public.food_fitness_service_terms t join public.food_business_services s on s.id=t.service_id and s.store_id=t.store_id
  left join public.food_fitness_booking_terms bt on bt.store_id=a.store_id and bt.appointment_id=a.id
  where t.store_id=a.store_id and t.service_id=a.service_id;
  if not admin_action and a.starts_at<=now()+make_interval(mins=>coalesce(cutoff,0)) then raise exception 'Prazo de reagendamento encerrado. Contate o profissional.' using errcode='22023'; end if;
  update public.food_business_appointments set starts_at=p_starts,ends_at=p_starts+make_interval(mins=>duration_minutes),professional_id=p_professional,updated_at=now() where id=a.id returning * into result;
  return jsonb_build_object('appointment_id',result.id,'status',result.status,'starts_at',result.starts_at,'ends_at',result.ends_at);
end; $$;

drop policy food_fitness_events_read on public.food_fitness_appointment_events;
create policy food_fitness_events_read on public.food_fitness_appointment_events for select to authenticated
using (food_fitness_private.can_configure(store_id) or exists (
  select 1 from public.food_business_appointments a join public.food_fitness_students s on s.store_id=a.store_id and s.client_id=a.client_id
  where a.id=appointment_id and a.store_id=food_fitness_appointment_events.store_id and food_fitness_private.student_session_active(s.store_id,s.client_id)
));
drop policy food_fitness_students_read on public.food_fitness_students;
create policy food_fitness_students_read on public.food_fitness_students for select to authenticated
using ((user_id=auth.uid() and food_fitness_private.student_session_active(store_id,client_id)) or food_fitness_private.can_configure(store_id));
drop policy food_fitness_booking_terms_read on public.food_fitness_booking_terms;
create policy food_fitness_booking_terms_read on public.food_fitness_booking_terms for select to authenticated
using (food_fitness_private.can_configure(store_id) or exists (
  select 1 from public.food_business_appointments a where a.id=appointment_id and a.store_id=food_fitness_booking_terms.store_id
    and food_fitness_private.student_session_active(a.store_id,a.client_id)
));
drop policy food_fitness_student_appointments_read on public.food_business_appointments;
create policy food_fitness_student_appointments_read on public.food_business_appointments for select to authenticated
using (food_fitness_private.is_fitness(store_id) and food_fitness_private.student_session_active(store_id,client_id));

drop policy food_fitness_workouts_read on public.food_fitness_workouts;
create policy food_fitness_workouts_read on public.food_fitness_workouts for select to authenticated
using (food_fitness_private.can_configure(store_id) or (status='approved' and exists (
  select 1 from public.food_fitness_workout_assignments a
  where a.store_id=food_fitness_workouts.store_id and a.workout_id=food_fitness_workouts.id and a.active
    and food_fitness_private.student_session_active(a.store_id,a.client_id)
)));
drop policy food_fitness_exercises_read on public.food_fitness_exercises;
create policy food_fitness_exercises_read on public.food_fitness_exercises for select to authenticated
using (food_fitness_private.can_configure(store_id) or exists (
  select 1 from public.food_fitness_workouts w join public.food_fitness_workout_assignments a on a.store_id=w.store_id and a.workout_id=w.id
  where w.id=food_fitness_exercises.workout_id and w.store_id=food_fitness_exercises.store_id
    and w.status='approved' and a.active and food_fitness_private.student_session_active(a.store_id,a.client_id)
));
drop policy food_fitness_assignments_read on public.food_fitness_workout_assignments;
create policy food_fitness_assignments_read on public.food_fitness_workout_assignments for select to authenticated
using (food_fitness_private.can_configure(store_id) or food_fitness_private.student_session_active(store_id,client_id));

revoke all on function food_fitness_private.phone_verified(uuid), food_fitness_private.student_session_active(uuid,uuid) from public,anon;
grant execute on function food_fitness_private.phone_verified(uuid) to service_role;
grant execute on function food_fitness_private.student_session_active(uuid,uuid) to authenticated,service_role;
revoke all on function public.food_fitness_student_status_v1(uuid), public.food_fitness_student_session_v1(uuid,uuid,text), public.food_fitness_student_session_admin_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.food_fitness_student_status_v1(uuid), public.food_fitness_student_session_v1(uuid,uuid,text), public.food_fitness_student_session_admin_v1(uuid,uuid,text) to authenticated;
commit;
