-- Keep the phone-auth session boundary after professional content migrations redefine Fitness reads.
begin;

create or replace function food_fitness_private.student_session_for_user(p_store uuid,p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.food_fitness_students s
    where s.store_id=p_store and s.user_id=p_user
      and food_fitness_private.student_session_active(s.store_id,s.client_id)
  )
$$;
create or replace function food_fitness_private.require_student_session(p_store uuid)
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if not food_fitness_private.student_session_for_user(p_store,auth.uid()) then
    raise exception 'FITNESS_STUDENT_SESSION_REQUIRED' using errcode='42501';
  end if;
end; $$;
revoke all on function food_fitness_private.student_session_for_user(uuid,uuid),food_fitness_private.require_student_session(uuid) from public,anon;
grant execute on function food_fitness_private.student_session_for_user(uuid,uuid),food_fitness_private.require_student_session(uuid) to authenticated,service_role;

create or replace function food_fitness_private.has_training_identity(p_store uuid,p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.food_service_professionals p join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active
    where p.store_id=p_store and p.user_id=p_user and p.active and p.kind='training' and p.council='CREF')
$$;

revoke all on function food_fitness_private.has_training_identity(uuid,uuid) from public,anon,authenticated;
grant execute on function food_fitness_private.has_training_identity(uuid,uuid) to authenticated;

drop policy if exists food_fitness_workouts_read on public.food_fitness_workouts;
create policy food_fitness_workouts_read on public.food_fitness_workouts for select to authenticated using (
  (created_by=(select auth.uid()) or approved_by=(select auth.uid()) or exists(select 1 from public.food_fitness_workout_assignments a where a.store_id=food_fitness_workouts.store_id and a.workout_id=food_fitness_workouts.id and a.assigned_by=(select auth.uid())))
  and food_fitness_private.has_training_identity(food_fitness_workouts.store_id,(select auth.uid()))
  or (status='approved' and exists(
    select 1 from public.food_fitness_workout_assignments a join public.food_fitness_students st on st.store_id=a.store_id and st.client_id=a.client_id
    join public.food_fitness_professional_authorizations au on au.store_id=a.store_id and au.student_user_id=st.user_id and au.professional_user_id=food_fitness_workouts.approved_by and au.purpose='training' and au.active
    where a.store_id=food_fitness_workouts.store_id and a.workout_id=food_fitness_workouts.id and a.active and st.user_id=(select auth.uid()) and food_fitness_private.student_session_active(a.store_id,a.client_id)
      and food_fitness_private.has_training_identity(food_fitness_workouts.store_id,food_fitness_workouts.approved_by)
  ))
);
drop policy if exists food_fitness_exercises_read on public.food_fitness_exercises;
create policy food_fitness_exercises_read on public.food_fitness_exercises for select to authenticated using (
  exists(select 1 from public.food_fitness_workouts w
    where food_fitness_private.has_training_identity(w.store_id,(select auth.uid()))
      and w.id=food_fitness_exercises.workout_id and w.store_id=food_fitness_exercises.store_id and (w.created_by=(select auth.uid()) or w.approved_by=(select auth.uid()) or exists(select 1 from public.food_fitness_workout_assignments a where a.store_id=w.store_id and a.workout_id=w.id and a.assigned_by=(select auth.uid()))))
  or exists(select 1 from public.food_fitness_workouts w join public.food_fitness_workout_assignments a on a.store_id=w.store_id and a.workout_id=w.id and a.active
    join public.food_fitness_students st on st.store_id=a.store_id and st.client_id=a.client_id
    join public.food_fitness_professional_authorizations au on au.store_id=a.store_id and au.student_user_id=st.user_id and au.professional_user_id=w.approved_by and au.purpose='training' and au.active
    where w.id=food_fitness_exercises.workout_id and w.store_id=food_fitness_exercises.store_id and w.status='approved' and st.user_id=(select auth.uid()) and food_fitness_private.student_session_active(a.store_id,a.client_id)
      and food_fitness_private.has_training_identity(w.store_id,w.approved_by))
);
drop policy if exists food_fitness_assignments_read on public.food_fitness_workout_assignments;
create policy food_fitness_assignments_read on public.food_fitness_workout_assignments for select to authenticated using (
  assigned_by=(select auth.uid()) and food_fitness_private.has_training_identity(food_fitness_workout_assignments.store_id,(select auth.uid()))
  or exists(select 1 from public.food_fitness_students st where st.store_id=food_fitness_workout_assignments.store_id and st.client_id=food_fitness_workout_assignments.client_id and st.user_id=(select auth.uid()) and food_fitness_private.student_session_active(st.store_id,st.client_id))
);

create or replace function public.food_fitness_list_workouts(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare is_professional boolean; student_client uuid;
begin
  if auth.uid() is null or not food_fitness_private.is_fitness(p_store) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  is_professional:=exists(select 1 from public.food_service_professionals p join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active where p.store_id=p_store and p.user_id=auth.uid() and p.active and p.kind='training' and p.council='CREF');
  if is_professional then
    return (select coalesce(jsonb_agg(to_jsonb(w)||jsonb_build_object('professional',jsonb_build_object('user_id',sp.user_id,'name',sp.name,'council',sp.council,'registration',sp.registration),'exercises',(select coalesce(jsonb_agg(to_jsonb(e) order by e.position),'[]'::jsonb) from public.food_fitness_exercises e where e.workout_id=w.id and e.store_id=w.store_id)) order by w.created_at),'[]'::jsonb)
      from public.food_fitness_workouts w join public.food_service_professionals sp on sp.store_id=w.store_id and sp.user_id=coalesce(w.approved_by,w.created_by) and sp.active
      where w.store_id=p_store and (w.created_by=auth.uid() or w.approved_by=auth.uid() or exists(select 1 from public.food_fitness_workout_assignments a where a.store_id=w.store_id and a.workout_id=w.id and a.assigned_by=auth.uid())));
  end if;
  select client_id into student_client from public.food_fitness_students where store_id=p_store and user_id=auth.uid();
  if student_client is null then return '[]'::jsonb; end if;
  if not food_fitness_private.student_session_active(p_store,student_client) then raise exception 'FITNESS_STUDENT_SESSION_REQUIRED' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(w)||jsonb_build_object('professional',jsonb_build_object('user_id',sp.user_id,'name',sp.name,'council',sp.council,'registration',sp.registration),'exercises',(select coalesce(jsonb_agg(to_jsonb(e) order by e.position),'[]'::jsonb) from public.food_fitness_exercises e where e.workout_id=w.id and e.store_id=w.store_id)) order by w.created_at),'[]'::jsonb)
    from public.food_fitness_workouts w join public.food_fitness_workout_assignments a on a.workout_id=w.id and a.store_id=w.store_id and a.active
    join public.food_fitness_students st on st.store_id=a.store_id and st.client_id=a.client_id and st.user_id=auth.uid() and st.client_id=student_client
    join public.food_fitness_professional_authorizations au on au.store_id=st.store_id and au.student_user_id=st.user_id and au.professional_user_id=w.approved_by and au.purpose='training' and au.active
    join public.food_service_professionals sp on sp.store_id=w.store_id and sp.user_id=w.approved_by and sp.active and sp.kind='training' and sp.council='CREF'
    where w.store_id=p_store and w.status='approved');
end; $$;

create or replace function public.food_fitness_student_session_admin_list_v1(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2'
    or not food_fitness_private.is_fitness(p_store)
    or not (public.food_is_store_admin(p_store) or food_fitness_private.can_configure(p_store))
    or not exists(select 1 from auth.sessions where id=sid and user_id=auth.uid() and (not_after is null or not_after>now())) then
    raise exception 'FITNESS_ADMIN_MFA_REQUIRED' using errcode='42501';
  end if;
  return jsonb_build_object('students',(
    select coalesce(jsonb_agg(jsonb_build_object(
      'client_id',s.client_id,'name',c.name,
      'session_active',exists(
        select 1 from public.food_fitness_student_sessions fs
        join auth.sessions a on a.id=fs.auth_session_id and a.user_id=fs.user_id
        where fs.store_id=s.store_id and fs.client_id=s.client_id and fs.user_id=s.user_id
          and fs.revoked_at is null and (a.not_after is null or a.not_after>now())
      )
    ) order by c.name),'[]'::jsonb)
    from public.food_fitness_students s
    join public.food_business_clients c on c.id=s.client_id and c.store_id=s.store_id
    where s.store_id=p_store and c.active
  ));
end; $$;

create or replace function public.food_fitness_student_reminders_list(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform food_fitness_private.require_student_session(p_store);
  if not exists(select 1 from public.food_fitness_students where store_id=p_store and user_id=auth.uid()) then raise exception 'Somente o próprio aluno pode consultar seus lembretes.' using errcode='42501'; end if;
  return jsonb_build_object(
    'reminders',(select coalesce(jsonb_agg(to_jsonb(r) order by r.reminder_time,r.id),'[]'::jsonb) from public.food_fitness_student_reminders r where r.store_id=p_store and r.student_user_id=auth.uid()),
    'inbox',(select coalesce(jsonb_agg(to_jsonb(x) order by x.planned_for desc),'[]'::jsonb) from (
      select d.id,d.reminder_id,d.planned_for,d.status,r.label,r.kind from public.food_fitness_reminder_deliveries d
      join public.food_fitness_student_reminders r on r.id=d.reminder_id and r.store_id=d.store_id
      where d.store_id=p_store and d.student_user_id=auth.uid() and d.planned_for>now()-interval '7 days' and d.status<>'cancelled'
      order by d.planned_for desc limit 50
    ) x)
  );
end; $$;

create or replace function public.food_fitness_student_reminder_save(p_store uuid,p_id uuid,p_kind text,p_label text,p_time time,p_timezone text,p_weekdays smallint[],p_channel text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.food_fitness_student_reminders%rowtype; target uuid:=coalesce(p_id,gen_random_uuid());
begin
  perform food_fitness_private.require_student_session(p_store);
  if not exists(select 1 from public.food_fitness_students where store_id=p_store and user_id=auth.uid()) then raise exception 'Somente o próprio aluno pode configurar lembretes.' using errcode='42501'; end if;
  if not food_business_private.module_enabled(p_store,'clients') or p_kind not in ('workout','appointment','hydration','routine') or length(trim(p_label)) not between 2 and 100 or p_time is null or cardinality(p_weekdays) not between 1 and 7 or not (p_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]) or p_timezone not in (select name from pg_timezone_names) or p_channel not in ('in_app','push') then
    raise exception 'Preferência de lembrete inválida ou módulo indisponível.' using errcode='22023';
  end if;
  if p_channel='push' and not exists(select 1 from public.food_fitness_student_push_subscriptions ps where ps.store_id=p_store and ps.user_id=auth.uid() and ps.active) then raise exception 'Ative notificações push neste aparelho antes de escolher esse canal.' using errcode='22023'; end if;
  insert into public.food_fitness_student_reminders(id,store_id,student_user_id,kind,label,reminder_time,timezone,weekdays,channel)
  values(target,p_store,auth.uid(),p_kind,trim(p_label),p_time,p_timezone,p_weekdays,p_channel)
  on conflict(id) do update set kind=excluded.kind,label=excluded.label,reminder_time=excluded.reminder_time,timezone=excluded.timezone,weekdays=excluded.weekdays,channel=excluded.channel,updated_at=now()
    where food_fitness_student_reminders.store_id=p_store and food_fitness_student_reminders.student_user_id=auth.uid() and food_fitness_student_reminders.status<>'cancelled'
  returning * into result;
  if result.id is null then raise exception 'Lembrete não encontrado para esta conta.' using errcode='42501'; end if;
  return jsonb_build_object('id',result.id,'status',result.status,'kind',result.kind,'label',result.label);
end; $$;

create or replace function public.food_fitness_student_reminder_action(p_store uuid,p_id uuid,p_action text,p_paused_until timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.food_fitness_student_reminders%rowtype;
begin
  perform food_fitness_private.require_student_session(p_store);
  if not exists(select 1 from public.food_fitness_students where store_id=p_store and user_id=auth.uid()) then raise exception 'Somente o próprio aluno pode alterar seus lembretes.' using errcode='42501'; end if;
  if p_action='pause' then
    if p_paused_until is null or p_paused_until<=now() or p_paused_until>now()+interval '1 year' then raise exception 'Defina uma pausa futura de até um ano.' using errcode='22023'; end if;
    update public.food_fitness_student_reminders set status='paused',paused_until=p_paused_until,updated_at=now() where id=p_id and store_id=p_store and student_user_id=auth.uid() and status<>'cancelled' returning * into result;
  elsif p_action='resume' then
    update public.food_fitness_student_reminders set status='active',paused_until=null,updated_at=now() where id=p_id and store_id=p_store and student_user_id=auth.uid() and status='paused' returning * into result;
  elsif p_action='cancel' then
    update public.food_fitness_student_reminders set status='cancelled',cancelled_at=now(),paused_until=null,updated_at=now() where id=p_id and store_id=p_store and student_user_id=auth.uid() and status<>'cancelled' returning * into result;
  else raise exception 'Ação indisponível.' using errcode='22023'; end if;
  if result.id is null then raise exception 'Lembrete não encontrado ou já desligado.' using errcode='22023'; end if;
  if p_action in ('pause','cancel') then
    update public.food_fitness_reminder_deliveries set status='cancelled',claimed_at=null
      where reminder_id=p_id and store_id=p_store and student_user_id=auth.uid() and status='queued';
  end if;
  return jsonb_build_object('id',result.id,'status',result.status,'paused_until',result.paused_until,'cancelled_at',result.cancelled_at);
end; $$;

create or replace function public.food_fitness_reminder_mark_seen(p_store uuid,p_delivery uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.food_fitness_reminder_deliveries%rowtype;
begin
  perform food_fitness_private.require_student_session(p_store);
  update public.food_fitness_reminder_deliveries set status='seen',seen_at=now() where id=p_delivery and store_id=p_store and student_user_id=auth.uid() and status in ('queued','sent') returning * into result;
  if result.id is null then raise exception 'Aviso não encontrado.' using errcode='42501'; end if;
  return jsonb_build_object('id',result.id,'status',result.status);
end; $$;

create or replace function public.food_fitness_student_authorize_professional(p_store uuid,p_professional uuid,p_purpose text,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare profile public.food_service_professionals%rowtype;
begin
  perform food_fitness_private.require_student_session(p_store);
  if not exists(select 1 from public.food_fitness_students where store_id=p_store and user_id=auth.uid()) then raise exception 'Somente o próprio aluno pode conceder acesso.' using errcode='42501'; end if;
  select p.* into profile from public.food_service_professionals p join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active
    where p.store_id=p_store and p.user_id=p_professional and p.active for update;
  if profile.user_id is null or p_purpose not in ('training','nutrition') or profile.kind<>p_purpose or (p_purpose='training' and profile.council<>'CREF') or (p_purpose='nutrition' and profile.council<>'CRN') then
    raise exception 'Profissional ativo e registro adequado são obrigatórios.' using errcode='42501';
  end if;
  if p_enabled and not exists(select 1 from public.food_business_services s where s.store_id=p_store and s.professional_user_id=p_professional and s.kind=p_purpose and s.active) then
    raise exception 'Este profissional ainda não presta um serviço ativo nesta loja.' using errcode='22023';
  end if;
  insert into public.food_fitness_professional_authorizations(store_id,student_user_id,professional_user_id,purpose,authorized_at,revoked_at,active)
  values(p_store,auth.uid(),p_professional,p_purpose,case when p_enabled then now() else now() end,case when p_enabled then null else now() end,p_enabled)
  on conflict(store_id,student_user_id,professional_user_id,purpose) do update set authorized_at=case when p_enabled then now() else food_fitness_professional_authorizations.authorized_at end,revoked_at=case when p_enabled then null else now() end,active=p_enabled;
  return jsonb_build_object('professional_user_id',p_professional,'purpose',p_purpose,'active',p_enabled);
end; $$;

create or replace function public.food_fitness_student_authorization_list(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform food_fitness_private.require_student_session(p_store);
  if not exists(select 1 from public.food_fitness_students where store_id=p_store and user_id=auth.uid()) then raise exception 'Acesso restrito à própria conta de aluno.' using errcode='42501'; end if;
  return jsonb_build_object('professionals',(select coalesce(jsonb_agg(jsonb_build_object('user_id',p.user_id,'name',p.name,'kind',p.kind,'council',p.council,'registration',p.registration,'authorized',exists(select 1 from public.food_fitness_professional_authorizations a where a.store_id=p_store and a.student_user_id=auth.uid() and a.professional_user_id=p.user_id and a.purpose=p.kind and a.active),'message_enabled',exists(select 1 from public.food_fitness_student_message_permissions mp where mp.store_id=p_store and mp.student_user_id=auth.uid() and mp.professional_user_id=p.user_id and mp.enabled)) order by p.name),'[]'::jsonb)
    from public.food_service_professionals p join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active
    where p.store_id=p_store and p.active and p.kind in ('training','nutrition') and exists(select 1 from public.food_business_services s where s.store_id=p_store and s.professional_user_id=p.user_id and s.kind=p.kind and s.active)
      and ((p.kind='training' and food_business_private.module_enabled(p_store,'training')) or (p.kind='nutrition' and food_business_private.module_enabled(p_store,'nutrition')))));
end; $$;

create or replace function public.food_fitness_student_message_permission_set(p_store uuid,p_professional uuid,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare profile public.food_service_professionals%rowtype;
begin
  perform food_fitness_private.require_student_session(p_store);
  if not exists(select 1 from public.food_fitness_students where store_id=p_store and user_id=auth.uid()) then raise exception 'Somente o próprio aluno pode alterar esta preferência.' using errcode='42501'; end if;
  select p.* into profile from public.food_service_professionals p join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active
    where p.store_id=p_store and p.user_id=p_professional and p.active for update;
  if profile.user_id is null or not exists(select 1 from public.food_business_services s where s.store_id=p_store and s.professional_user_id=p_professional and s.kind=profile.kind and s.active)
    or (profile.kind in ('training','nutrition') and not food_business_private.module_enabled(p_store,profile.kind)) then raise exception 'Profissional com serviço ativo nesta loja é obrigatório.' using errcode='42501'; end if;
  insert into public.food_fitness_student_message_permissions(store_id,student_user_id,professional_user_id,enabled,granted_at,revoked_at)
  values(p_store,auth.uid(),p_professional,p_enabled,now(),case when p_enabled then null else now() end)
  on conflict(store_id,student_user_id,professional_user_id) do update set enabled=p_enabled,granted_at=case when p_enabled then now() else food_fitness_student_message_permissions.granted_at end,revoked_at=case when p_enabled then null else now() end;
  return jsonb_build_object('professional_user_id',p_professional,'enabled',p_enabled);
end; $$;

create or replace function public.food_fitness_student_messages_list(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform food_fitness_private.require_student_session(p_store);
  if not exists(select 1 from public.food_fitness_students where store_id=p_store and user_id=auth.uid()) then raise exception 'Somente o próprio aluno pode consultar mensagens profissionais.' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'publication_id',p.id,'title',p.title,'body',p.body,'category',p.category,'status',d.status,'sent_at',d.sent_at,'author_name',p.author_name,'author_council',p.author_council,'author_registration',p.author_registration) order by d.sent_at desc),'[]'::jsonb)
    from public.food_professional_message_deliveries d join public.food_professional_publications p on p.id=d.publication_id and p.store_id=d.store_id
    where d.store_id=p_store and d.student_user_id=auth.uid() and d.status in ('sent','seen'));
end; $$;

create or replace function public.food_fitness_student_message_mark_seen(p_store uuid,p_delivery uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.food_professional_message_deliveries%rowtype;
begin
  perform food_fitness_private.require_student_session(p_store);
  update public.food_professional_message_deliveries set status='seen',seen_at=now() where id=p_delivery and store_id=p_store and student_user_id=auth.uid() and status='sent' returning * into result;
  if result.id is null then raise exception 'Mensagem não encontrada.' using errcode='42501'; end if;
  return jsonb_build_object('id',result.id,'status',result.status);
end; $$;

drop policy if exists food_fitness_student_reminders_read on public.food_fitness_student_reminders;
create policy food_fitness_student_reminders_read on public.food_fitness_student_reminders for select to authenticated
using (food_fitness_private.student_session_for_user(store_id,student_user_id));
drop policy if exists food_fitness_authorizations_read on public.food_fitness_professional_authorizations;
create policy food_fitness_authorizations_read on public.food_fitness_professional_authorizations for select to authenticated
using (food_fitness_private.student_session_for_user(store_id,student_user_id) or professional_user_id=(select auth.uid()));
drop policy if exists food_fitness_message_permissions_read on public.food_fitness_student_message_permissions;
create policy food_fitness_message_permissions_read on public.food_fitness_student_message_permissions for select to authenticated
using (food_fitness_private.student_session_for_user(store_id,student_user_id) or professional_user_id=(select auth.uid()));
drop policy if exists food_professional_message_deliveries_read on public.food_professional_message_deliveries;
create policy food_professional_message_deliveries_read on public.food_professional_message_deliveries for select to authenticated
using (food_fitness_private.student_session_for_user(store_id,student_user_id));
drop policy if exists food_fitness_reminder_deliveries_read on public.food_fitness_reminder_deliveries;
create policy food_fitness_reminder_deliveries_read on public.food_fitness_reminder_deliveries for select to authenticated
using (food_fitness_private.student_session_for_user(store_id,student_user_id));

drop policy if exists food_fitness_student_push_select_self on public.food_fitness_student_push_subscriptions;
create policy food_fitness_student_push_select_self on public.food_fitness_student_push_subscriptions for select to authenticated
using (food_fitness_private.student_session_for_user(store_id,user_id));
drop policy if exists food_fitness_student_push_insert_self on public.food_fitness_student_push_subscriptions;
create policy food_fitness_student_push_insert_self on public.food_fitness_student_push_subscriptions for insert to authenticated
with check (food_fitness_private.student_session_for_user(store_id,user_id));
drop policy if exists food_fitness_student_push_update_self on public.food_fitness_student_push_subscriptions;
create policy food_fitness_student_push_update_self on public.food_fitness_student_push_subscriptions for update to authenticated
using (food_fitness_private.student_session_for_user(store_id,user_id))
with check (food_fitness_private.student_session_for_user(store_id,user_id));

revoke all on function public.food_fitness_student_session_admin_list_v1(uuid) from public,anon,authenticated;
grant execute on function public.food_fitness_student_session_admin_list_v1(uuid) to authenticated;
commit;
