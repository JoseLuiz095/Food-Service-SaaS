-- shared_future: agenda real de Fitness. Nenhuma cobrança ou dado de outras lojas é alterado.
-- Revisar o diff e o histórico remoto antes de aplicar no Supabase compartilhado.
begin;

create table public.food_fitness_professionals (
  store_id uuid not null references public.food_stores(id),
  user_id uuid not null references auth.users(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (store_id,user_id),
  foreign key (store_id,user_id) references public.food_store_users(store_id,user_id)
);
create table public.food_fitness_students (
  store_id uuid not null references public.food_stores(id),
  user_id uuid not null references auth.users(id),
  client_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (store_id,user_id), unique (store_id,client_id),
  foreign key (client_id,store_id) references public.food_business_clients(id,store_id)
);
create table public.food_fitness_windows (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null, professional_id uuid not null,
  weekday integer not null check (weekday between 0 and 6),
  starts_local time not null, ends_local time not null,
  timezone text not null,
  step_minutes integer not null check (step_minutes between 5 and 240),
  buffer_minutes integer not null default 0 check (buffer_minutes between 0 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_local>starts_local),
  unique (id,store_id),
  foreign key (store_id,professional_id) references public.food_fitness_professionals(store_id,user_id)
);
create index food_fitness_windows_lookup on public.food_fitness_windows(store_id,professional_id,weekday) where active;
create table public.food_fitness_blocks (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null, professional_id uuid not null,
  starts_at timestamptz not null, ends_at timestamptz not null,
  reason text not null default '' check (length(reason)<=160),
  created_at timestamptz not null default now(),
  check (ends_at>starts_at),
  unique (id,store_id),
  foreign key (store_id,professional_id) references public.food_fitness_professionals(store_id,user_id)
);
create index food_fitness_blocks_lookup on public.food_fitness_blocks(store_id,professional_id,starts_at,ends_at);
create table public.food_fitness_service_terms (
  store_id uuid not null,
  service_id uuid not null,
  cancel_policy text not null check (length(trim(cancel_policy)) between 10 and 1000),
  reschedule_policy text not null check (length(trim(reschedule_policy)) between 10 and 1000),
  cancel_before_minutes integer not null check (cancel_before_minutes between 0 and 10080),
  price_confirmed boolean not null default false,
  published_at timestamptz,
  published_by uuid references auth.users(id),
  primary key (store_id,service_id),
  foreign key (service_id,store_id) references public.food_business_services(id,store_id)
);
create table public.food_fitness_appointment_events (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.food_stores(id),
  appointment_id uuid not null,
  actor_id uuid references auth.users(id),
  old_status text, new_status text not null,
  old_starts_at timestamptz, new_starts_at timestamptz not null,
  old_ends_at timestamptz, new_ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (appointment_id,store_id) references public.food_business_appointments(id,store_id)
);
create index food_fitness_events_lookup on public.food_fitness_appointment_events(store_id,appointment_id,created_at);
create table public.food_fitness_booking_terms (
  store_id uuid not null,
  appointment_id uuid not null,
  cancel_policy text not null,
  reschedule_policy text not null,
  cancel_before_minutes integer not null,
  accepted_at timestamptz not null default now(),
  primary key (store_id,appointment_id),
  foreign key (appointment_id,store_id) references public.food_business_appointments(id,store_id)
);

create schema if not exists food_fitness_private;
create function food_fitness_private.is_fitness(p_store uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists (select 1 from public.food_business_profiles where store_id=p_store and primary_segment='fitness');
$$;
create function food_fitness_private.is_professional(p_store uuid,p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
  select p_user is not null and exists (
    select 1 from public.food_fitness_professionals p
    join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id
    where p.store_id=p_store and p.user_id=p_user and p.active and u.active
  );
$$;
create function food_fitness_private.can_configure(p_store uuid) returns boolean language sql stable security definer set search_path='' as $$
  select food_fitness_private.is_fitness(p_store) and food_business_private.can_manage(p_store)
    and (food_business_private.is_master() or food_fitness_private.is_professional(p_store,auth.uid()) or exists (
      select 1 from public.food_store_users where store_id=p_store and user_id=auth.uid() and role='owner' and active
    ));
$$;
revoke all on schema food_fitness_private from public;
grant usage on schema food_fitness_private to authenticated;
revoke all on function food_fitness_private.is_fitness(uuid), food_fitness_private.is_professional(uuid,uuid), food_fitness_private.can_configure(uuid) from public,anon,authenticated;
grant execute on function food_fitness_private.is_fitness(uuid), food_fitness_private.is_professional(uuid,uuid), food_fitness_private.can_configure(uuid) to authenticated;

do $$ declare t text; begin
  foreach t in array array['food_fitness_professionals','food_fitness_students','food_fitness_windows','food_fitness_blocks','food_fitness_service_terms','food_fitness_appointment_events','food_fitness_booking_terms'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
  end loop;
end $$;
grant select on public.food_fitness_professionals,public.food_fitness_windows,public.food_fitness_blocks,public.food_fitness_service_terms,public.food_fitness_appointment_events to authenticated;
grant select on public.food_fitness_students to authenticated;
grant select on public.food_fitness_booking_terms to authenticated;
create policy food_fitness_professionals_read on public.food_fitness_professionals for select to authenticated using (food_fitness_private.can_configure(store_id));
create policy food_fitness_windows_read on public.food_fitness_windows for select to authenticated using (food_fitness_private.can_configure(store_id));
create policy food_fitness_blocks_read on public.food_fitness_blocks for select to authenticated using (food_fitness_private.can_configure(store_id));
create policy food_fitness_terms_read on public.food_fitness_service_terms for select to authenticated using (food_fitness_private.can_configure(store_id));
create policy food_fitness_events_read on public.food_fitness_appointment_events for select to authenticated using (food_fitness_private.can_configure(store_id) or exists (select 1 from public.food_business_appointments a join public.food_fitness_students s on s.store_id=a.store_id and s.client_id=a.client_id where a.id=appointment_id and a.store_id=food_fitness_appointment_events.store_id and s.user_id=auth.uid()));
create policy food_fitness_students_read on public.food_fitness_students for select to authenticated using (user_id=auth.uid() or food_fitness_private.can_configure(store_id));
create policy food_fitness_booking_terms_read on public.food_fitness_booking_terms for select to authenticated
using (food_fitness_private.can_configure(store_id) or exists (
  select 1 from public.food_business_appointments a join public.food_fitness_students s on s.store_id=a.store_id and s.client_id=a.client_id
  where a.id=appointment_id and a.store_id=food_fitness_booking_terms.store_id and s.user_id=auth.uid()
));
create policy food_fitness_student_appointments_read on public.food_business_appointments for select to authenticated
using (food_fitness_private.is_fitness(store_id) and exists (
  select 1 from public.food_fitness_students s where s.store_id=food_business_appointments.store_id
    and s.client_id=food_business_appointments.client_id and s.user_id=auth.uid()
));

create function public.food_fitness_set_professional(p_store uuid,p_user uuid,p_active boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not food_fitness_private.is_fitness(p_store) or not exists(select 1 from public.food_store_users where store_id=p_store and user_id=auth.uid() and role='owner' and active) then raise exception 'Somente o proprietário da loja Fitness pode definir profissionais.' using errcode='42501'; end if;
  if not exists(select 1 from public.food_store_users where store_id=p_store and user_id=p_user and active) then raise exception 'Profissional precisa integrar esta loja.' using errcode='42501'; end if;
  insert into public.food_fitness_professionals(store_id,user_id,active) values(p_store,p_user,p_active)
  on conflict(store_id,user_id) do update set active=excluded.active;
  insert into public.food_business_audit(store_id,actor_id,action,details) values(p_store,auth.uid(),'fitness.professional',jsonb_build_object('user_id',p_user,'active',p_active));
  return jsonb_build_object('store_id',p_store,'user_id',p_user,'active',p_active);
end; $$;

create function public.food_fitness_save_window(p_store uuid,p_id uuid,p_professional uuid,p_weekday integer,p_start time,p_end time,p_timezone text,p_step_minutes integer,p_buffer_minutes integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.food_fitness_windows%rowtype; target uuid:=coalesce(p_id,gen_random_uuid());
begin
  if not food_fitness_private.can_configure(p_store) or not food_fitness_private.is_professional(p_store,p_professional) then raise exception 'Profissional indisponível nesta loja.' using errcode='42501'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'Fuso horário inválido.' using errcode='22023'; end if;
  if p_id is not null and exists(select 1 from public.food_fitness_windows where id=p_id and store_id<>p_store) then raise exception 'Janela pertence a outra loja.' using errcode='42501'; end if;
  insert into public.food_fitness_windows(id,store_id,professional_id,weekday,starts_local,ends_local,timezone,step_minutes,buffer_minutes)
  values(target,p_store,p_professional,p_weekday,p_start,p_end,p_timezone,p_step_minutes,p_buffer_minutes)
  on conflict(id) do update set professional_id=excluded.professional_id,weekday=excluded.weekday,starts_local=excluded.starts_local,ends_local=excluded.ends_local,timezone=excluded.timezone,step_minutes=excluded.step_minutes,buffer_minutes=excluded.buffer_minutes,active=true
  where food_fitness_windows.store_id=excluded.store_id returning * into result;
  if result.id is null then raise exception 'Janela indisponível.' using errcode='42501'; end if;
  return to_jsonb(result);
end; $$;

create function public.food_fitness_save_block(p_store uuid,p_id uuid,p_professional uuid,p_starts timestamptz,p_ends timestamptz,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.food_fitness_blocks%rowtype; target uuid:=coalesce(p_id,gen_random_uuid());
begin
  if not food_fitness_private.can_configure(p_store) or not food_fitness_private.is_professional(p_store,p_professional) then raise exception 'Profissional indisponível nesta loja.' using errcode='42501'; end if;
  if p_ends<=p_starts or p_starts<now() then raise exception 'Período de bloqueio inválido.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('food-fitness-slot:'||p_store::text||':'||p_professional::text,0));
  if exists(select 1 from public.food_business_appointments a where a.store_id=p_store and a.professional_id=p_professional and a.status in ('scheduled','confirmed') and a.starts_at<p_ends and a.ends_at>p_starts) then raise exception 'Há reserva neste período; reagende ou cancele antes.' using errcode='23P01'; end if;
  if p_id is not null and exists(select 1 from public.food_fitness_blocks where id=p_id and store_id<>p_store) then raise exception 'Bloqueio pertence a outra loja.' using errcode='42501'; end if;
  insert into public.food_fitness_blocks(id,store_id,professional_id,starts_at,ends_at,reason)
  values(target,p_store,p_professional,p_starts,p_ends,coalesce(p_reason,''))
  on conflict(id) do update set professional_id=excluded.professional_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at,reason=excluded.reason
  where food_fitness_blocks.store_id=excluded.store_id returning * into result;
  if result.id is null then raise exception 'Bloqueio indisponível.' using errcode='42501'; end if;
  return to_jsonb(result);
end; $$;

create function public.food_fitness_disable_window(p_store uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.food_fitness_windows%rowtype;
begin
  if not food_fitness_private.can_configure(p_store) then raise exception 'Sem acesso à agenda Fitness.' using errcode='42501'; end if;
  update public.food_fitness_windows set active=false where id=p_id and store_id=p_store returning * into result;
  if result.id is null then raise exception 'Janela não encontrada.' using errcode='22023'; end if;
  return to_jsonb(result);
end; $$;

create function public.food_fitness_delete_block(p_store uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.food_fitness_blocks%rowtype;
begin
  if not food_fitness_private.can_configure(p_store) then raise exception 'Sem acesso à agenda Fitness.' using errcode='42501'; end if;
  delete from public.food_fitness_blocks where id=p_id and store_id=p_store returning * into result;
  if result.id is null then raise exception 'Bloqueio não encontrado.' using errcode='22023'; end if;
  return jsonb_build_object('id',result.id,'deleted',true);
end; $$;

create function public.food_fitness_publish_service(p_store uuid,p_service uuid,p_cancel_policy text,p_reschedule_policy text,p_cancel_before_minutes integer,p_price_confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.food_fitness_service_terms%rowtype;
begin
  if not food_fitness_private.can_configure(p_store) then raise exception 'Sem acesso à loja Fitness.' using errcode='42501'; end if;
  if p_price_confirmed is distinct from true or not exists(select 1 from public.food_business_services where id=p_service and store_id=p_store and kind='training' and active and price_cents is not null) then raise exception 'Confirme o preço e ative o serviço antes de publicar a reserva.' using errcode='22023'; end if;
  insert into public.food_fitness_service_terms(store_id,service_id,cancel_policy,reschedule_policy,cancel_before_minutes,price_confirmed,published_at,published_by)
  values(p_store,p_service,trim(p_cancel_policy),trim(p_reschedule_policy),p_cancel_before_minutes,true,now(),auth.uid())
  on conflict(store_id,service_id) do update set cancel_policy=excluded.cancel_policy,reschedule_policy=excluded.reschedule_policy,cancel_before_minutes=excluded.cancel_before_minutes,price_confirmed=true,published_at=now(),published_by=auth.uid()
  returning * into result;
  return to_jsonb(result);
end; $$;

-- Na vitrine Fitness, somente serviços com preço explicitamente confirmado e
-- regras de reserva publicadas aparecem. Os demais segmentos mantêm o contrato.
create or replace function food_business_private.public_offers(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare segment_value text; services jsonb:='[]'; links jsonb:='[]';
begin
 if not exists(select 1 from public.food_stores s where s.id=p_store and s.active and s.archived_at is null and s.approval_status='approved' and s.access_status='online') then
  return jsonb_build_object('services','[]'::jsonb,'links','[]'::jsonb,'primary_segment',null);
 end if;
 select primary_segment into segment_value from public.food_business_profiles where store_id=p_store;
 if food_business_private.module_enabled(p_store,'appointments') then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into services from (
   select id,name,description,price_cents,duration_minutes,kind from public.food_business_services s
   where s.store_id=p_store and s.active and (s.kind='general' or food_business_private.module_enabled(p_store,s.kind))
     and (segment_value is distinct from 'fitness' or exists (
       select 1 from public.food_fitness_service_terms t where t.store_id=s.store_id and t.service_id=s.id and t.price_confirmed and t.published_at is not null
     ))
   order by name,id limit 100
  ) x;
 end if;
 if food_business_private.module_enabled(p_store,'creator') then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into links from (
   select l.id,l.label,l.url from public.food_creator_links l where l.store_id=p_store and l.active
   and (l.campaign_id is null or exists(select 1 from public.food_creator_campaigns c where c.id=l.campaign_id and c.store_id=p_store and c.status='active'
   and (c.starts_at is null or c.starts_at<=now()) and (c.ends_at is null or c.ends_at>=now()))) order by l.label,l.id limit 100
  ) x;
 end if;
 return jsonb_build_object('services',services,'links',links,'primary_segment',segment_value);
end; $$;

create function public.food_fitness_register_student(p_store uuid,p_name text,p_phone text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); email_value text; cid uuid;
begin
  if uid is null or not food_fitness_private.is_fitness(p_store) or not food_business_private.module_enabled(p_store,'clients') then raise exception 'Cadastro de aluno indisponível.' using errcode='42501'; end if;
  select email into email_value from auth.users where id=uid;
  if email_value is null or length(trim(p_name)) not between 2 and 120 or length(coalesce(p_phone,''))>30 then raise exception 'Informe dados válidos para o seu perfil.' using errcode='22023'; end if;
  select client_id into cid from public.food_fitness_students where store_id=p_store and user_id=uid;
  if cid is null then
    insert into public.food_business_clients(store_id,name,email,phone) values(p_store,trim(p_name),email_value,coalesce(p_phone,'')) returning id into cid;
    insert into public.food_fitness_students(store_id,user_id,client_id) values(p_store,uid,cid);
  else
    update public.food_business_clients set name=trim(p_name),phone=coalesce(p_phone,''),updated_at=now() where id=cid and store_id=p_store;
  end if;
  return jsonb_build_object('store_id',p_store,'client_id',cid,'professional',false);
end; $$;

create function public.food_fitness_status(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not food_fitness_private.can_configure(p_store) then raise exception 'Sem acesso à operação Fitness.' using errcode='42501'; end if;
  return jsonb_build_object(
    'professionals',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select store_id,user_id,active from public.food_fitness_professionals where store_id=p_store order by created_at) x),
    'windows',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select * from public.food_fitness_windows where store_id=p_store order by weekday,starts_local) x),
    'blocks',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select * from public.food_fitness_blocks where store_id=p_store and ends_at>now()-interval '30 days' order by starts_at limit 200) x),
    'terms',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select * from public.food_fitness_service_terms where store_id=p_store order by published_at desc nulls last) x),
    'appointments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select * from public.food_business_appointments where store_id=p_store order by starts_at desc limit 200) x)
  );
end; $$;

create function public.food_fitness_list_slots(p_store uuid,p_service uuid,p_from date,p_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare service_row public.food_business_services%rowtype; terms_row public.food_fitness_service_terms%rowtype; slots jsonb;
begin
  if p_days not between 1 and 30 or p_from is null or p_from<current_date-1 or p_from>current_date+90 then raise exception 'Período de consulta inválido.' using errcode='22023'; end if;
  select * into service_row from public.food_business_services where id=p_service and store_id=p_store and active and kind='training';
  select * into terms_row from public.food_fitness_service_terms where store_id=p_store and service_id=p_service and price_confirmed and published_at is not null;
  if service_row.id is null or terms_row.service_id is null or not food_fitness_private.is_fitness(p_store)
    or not food_business_private.module_enabled(p_store,'appointments') or not food_business_private.module_enabled(p_store,'training') then
    return jsonb_build_object('slots','[]'::jsonb,'cancel_policy',null,'reschedule_policy',null);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('starts_at',x.starts_at,'ends_at',x.ends_at,'professional_id',x.professional_id) order by x.starts_at,x.professional_id),'[]'::jsonb)
  into slots from (
    select distinct w.professional_id, (g.local_start at time zone w.timezone) as starts_at,
      (g.local_start at time zone w.timezone)+make_interval(mins=>service_row.duration_minutes) as ends_at
    from public.food_fitness_windows w
    join public.food_fitness_professionals p on p.store_id=w.store_id and p.user_id=w.professional_id and p.active
    join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active
    cross join generate_series(0,p_days-1) d(n)
    cross join lateral generate_series((p_from+d.n)+w.starts_local,(p_from+d.n)+w.ends_local-make_interval(mins=>service_row.duration_minutes),make_interval(mins=>w.step_minutes)) g(local_start)
    where w.store_id=p_store and w.active and extract(dow from p_from+d.n)=w.weekday
      and (g.local_start at time zone w.timezone)>now()
      and not exists (select 1 from public.food_fitness_blocks b where b.store_id=w.store_id and b.professional_id=w.professional_id and b.starts_at<(g.local_start at time zone w.timezone)+make_interval(mins=>service_row.duration_minutes+w.buffer_minutes) and b.ends_at>(g.local_start at time zone w.timezone)-make_interval(mins=>w.buffer_minutes))
      and not exists (select 1 from public.food_business_appointments a where a.store_id=w.store_id and a.professional_id=w.professional_id and a.status in ('scheduled','confirmed') and a.starts_at<(g.local_start at time zone w.timezone)+make_interval(mins=>service_row.duration_minutes+w.buffer_minutes) and a.ends_at>(g.local_start at time zone w.timezone)-make_interval(mins=>w.buffer_minutes))
    order by starts_at,professional_id limit 500
  ) x;
  return jsonb_build_object('slots',slots,'cancel_policy',terms_row.cancel_policy,'reschedule_policy',terms_row.reschedule_policy,'cancel_before_minutes',terms_row.cancel_before_minutes,'terms_published_at',terms_row.published_at);
end; $$;

create function food_fitness_private.guard_appointment()
returns trigger language plpgsql security definer set search_path='' as $$
declare duration_minutes integer; buffer_value integer; matched boolean;
begin
  if not food_fitness_private.is_fitness(new.store_id) or new.status not in ('scheduled','confirmed') then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('food-fitness-slot:'||new.store_id::text||':'||new.professional_id::text,0));
  if new.starts_at<=now() or not food_fitness_private.is_professional(new.store_id,new.professional_id) then raise exception 'Profissional ou horário indisponível.' using errcode='42501'; end if;
  select s.duration_minutes into duration_minutes from public.food_business_services s
    join public.food_fitness_service_terms t on t.store_id=s.store_id and t.service_id=s.id and t.price_confirmed and t.published_at is not null
    where s.id=new.service_id and s.store_id=new.store_id and s.active and s.kind='training';
  if duration_minutes is null or new.ends_at<>new.starts_at+make_interval(mins=>duration_minutes) then raise exception 'Serviço indisponível ou duração incorreta.' using errcode='22023'; end if;
  select true,w.buffer_minutes into matched,buffer_value from public.food_fitness_windows w
    where w.store_id=new.store_id and w.professional_id=new.professional_id and w.active
      and w.weekday=extract(dow from new.starts_at at time zone w.timezone)
      and (new.starts_at at time zone w.timezone)::time>=w.starts_local
      and (new.ends_at at time zone w.timezone)::time<=w.ends_local
      and (new.starts_at at time zone w.timezone)::date=(new.ends_at at time zone w.timezone)::date
      and mod((extract(epoch from ((new.starts_at at time zone w.timezone)::time-w.starts_local))/60)::integer,w.step_minutes)=0
    order by w.buffer_minutes desc limit 1;
  if not coalesce(matched,false) then raise exception 'Horário fora da disponibilidade publicada.' using errcode='22023'; end if;
  if exists(select 1 from public.food_fitness_blocks b where b.store_id=new.store_id and b.professional_id=new.professional_id and b.starts_at<new.ends_at+make_interval(mins=>buffer_value) and b.ends_at>new.starts_at-make_interval(mins=>buffer_value)) then raise exception 'Horário bloqueado.' using errcode='23P01'; end if;
  if exists(select 1 from public.food_business_appointments a where a.store_id=new.store_id and a.professional_id=new.professional_id and a.id<>new.id and a.status in ('scheduled','confirmed') and a.starts_at<new.ends_at+make_interval(mins=>buffer_value) and a.ends_at>new.starts_at-make_interval(mins=>buffer_value)) then raise exception 'Horário já reservado.' using errcode='23P01'; end if;
  return new;
end; $$;
create trigger food_fitness_guard_appointment before insert or update of starts_at,ends_at,professional_id,service_id,status
on public.food_business_appointments for each row execute function food_fitness_private.guard_appointment();

create function food_fitness_private.audit_appointment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if food_fitness_private.is_fitness(new.store_id) then
    insert into public.food_fitness_appointment_events(store_id,appointment_id,actor_id,old_status,new_status,old_starts_at,new_starts_at,old_ends_at,new_ends_at)
    values(new.store_id,new.id,auth.uid(),case when tg_op='UPDATE' then old.status else null end,new.status,case when tg_op='UPDATE' then old.starts_at else null end,new.starts_at,case when tg_op='UPDATE' then old.ends_at else null end,new.ends_at);
  end if;
  return new;
end; $$;
create trigger food_fitness_audit_appointment after insert or update on public.food_business_appointments
for each row execute function food_fitness_private.audit_appointment();
revoke all on function food_fitness_private.guard_appointment(), food_fitness_private.audit_appointment() from public,anon,authenticated;

create function public.food_fitness_book(p_store uuid,p_service uuid,p_starts timestamptz,p_professional uuid,p_terms_accepted boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare client uuid; duration_minutes integer; result public.food_business_appointments%rowtype; terms_row public.food_fitness_service_terms%rowtype;
begin
  if auth.uid() is null or p_terms_accepted is distinct from true then raise exception 'Entre na sua conta e aceite as regras antes de reservar.' using errcode='42501'; end if;
  if not food_fitness_private.is_fitness(p_store) or not food_business_private.module_enabled(p_store,'appointments') or not food_business_private.module_enabled(p_store,'training') then raise exception 'Reservas indisponíveis.' using errcode='42501'; end if;
  select s.client_id into client from public.food_fitness_students s join public.food_business_clients c on c.id=s.client_id and c.store_id=s.store_id and c.active where s.store_id=p_store and s.user_id=auth.uid();
  if client is null then raise exception 'Cadastre seu perfil de aluno antes de reservar.' using errcode='42501'; end if;
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

create function public.food_fitness_my_appointments(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not food_fitness_private.is_fitness(p_store) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  return jsonb_build_object('appointments',(
    select coalesce(jsonb_agg(to_jsonb(x) order by x.starts_at desc),'[]'::jsonb)
    from (select a.id,a.service_id,a.professional_id,a.starts_at,a.ends_at,a.status,a.created_at,a.updated_at,t.cancel_policy,t.reschedule_policy
      from public.food_business_appointments a join public.food_fitness_students s on s.store_id=a.store_id and s.client_id=a.client_id
      left join public.food_fitness_booking_terms t on t.store_id=a.store_id and t.appointment_id=a.id
      where a.store_id=p_store and s.user_id=auth.uid() order by a.starts_at desc limit 100) x
  ));
end; $$;

create function public.food_fitness_cancel(p_appointment uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.food_business_appointments%rowtype; cutoff integer; admin_action boolean;
begin
  select * into a from public.food_business_appointments where id=p_appointment for update;
  if a.id is null or not food_fitness_private.is_fitness(a.store_id) then raise exception 'Reserva não encontrada.' using errcode='22023'; end if;
  admin_action:=food_fitness_private.can_configure(a.store_id);
  if not admin_action and not exists(select 1 from public.food_fitness_students where store_id=a.store_id and client_id=a.client_id and user_id=auth.uid()) then raise exception 'Reserva de outro aluno.' using errcode='42501'; end if;
  if a.status not in ('scheduled','confirmed') then raise exception 'Reserva já finalizada.' using errcode='22023'; end if;
  select coalesce(bt.cancel_before_minutes,t.cancel_before_minutes) into cutoff
  from public.food_fitness_service_terms t left join public.food_fitness_booking_terms bt on bt.store_id=a.store_id and bt.appointment_id=a.id
  where t.store_id=a.store_id and t.service_id=a.service_id;
  if not admin_action and a.starts_at<=now()+make_interval(mins=>coalesce(cutoff,0)) then raise exception 'Prazo de cancelamento encerrado. Contate o profissional.' using errcode='22023'; end if;
  update public.food_business_appointments set status='cancelled',updated_at=now() where id=a.id;
  return jsonb_build_object('appointment_id',a.id,'status','cancelled');
end; $$;

create function public.food_fitness_reschedule(p_appointment uuid,p_starts timestamptz,p_professional uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.food_business_appointments%rowtype; cutoff integer; duration_minutes integer; admin_action boolean; result public.food_business_appointments%rowtype;
begin
  select * into a from public.food_business_appointments where id=p_appointment for update;
  if a.id is null or not food_fitness_private.is_fitness(a.store_id) then raise exception 'Reserva não encontrada.' using errcode='22023'; end if;
  admin_action:=food_fitness_private.can_configure(a.store_id);
  if not admin_action and not exists(select 1 from public.food_fitness_students where store_id=a.store_id and client_id=a.client_id and user_id=auth.uid()) then raise exception 'Reserva de outro aluno.' using errcode='42501'; end if;
  if a.status not in ('scheduled','confirmed') then raise exception 'Reserva já finalizada.' using errcode='22023'; end if;
  select coalesce(bt.cancel_before_minutes,t.cancel_before_minutes),s.duration_minutes into cutoff,duration_minutes
  from public.food_fitness_service_terms t join public.food_business_services s on s.id=t.service_id and s.store_id=t.store_id
  left join public.food_fitness_booking_terms bt on bt.store_id=a.store_id and bt.appointment_id=a.id
  where t.store_id=a.store_id and t.service_id=a.service_id;
  if not admin_action and a.starts_at<=now()+make_interval(mins=>coalesce(cutoff,0)) then raise exception 'Prazo de reagendamento encerrado. Contate o profissional.' using errcode='22023'; end if;
  update public.food_business_appointments set starts_at=p_starts,ends_at=p_starts+make_interval(mins=>duration_minutes),professional_id=p_professional,updated_at=now() where id=a.id returning * into result;
  return jsonb_build_object('appointment_id',result.id,'status',result.status,'starts_at',result.starts_at,'ends_at',result.ends_at);
end; $$;

revoke all on function public.food_fitness_set_professional(uuid,uuid,boolean), public.food_fitness_save_window(uuid,uuid,uuid,integer,time,time,text,integer,integer), public.food_fitness_save_block(uuid,uuid,uuid,timestamptz,timestamptz,text), public.food_fitness_disable_window(uuid,uuid), public.food_fitness_delete_block(uuid,uuid), public.food_fitness_publish_service(uuid,uuid,text,text,integer,boolean), public.food_fitness_register_student(uuid,text,text), public.food_fitness_status(uuid), public.food_fitness_list_slots(uuid,uuid,date,integer), public.food_fitness_book(uuid,uuid,timestamptz,uuid,boolean), public.food_fitness_my_appointments(uuid), public.food_fitness_cancel(uuid), public.food_fitness_reschedule(uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.food_fitness_set_professional(uuid,uuid,boolean), public.food_fitness_save_window(uuid,uuid,uuid,integer,time,time,text,integer,integer), public.food_fitness_save_block(uuid,uuid,uuid,timestamptz,timestamptz,text), public.food_fitness_disable_window(uuid,uuid), public.food_fitness_delete_block(uuid,uuid), public.food_fitness_publish_service(uuid,uuid,text,text,integer,boolean), public.food_fitness_register_student(uuid,text,text), public.food_fitness_status(uuid), public.food_fitness_book(uuid,uuid,timestamptz,uuid,boolean), public.food_fitness_my_appointments(uuid), public.food_fitness_cancel(uuid), public.food_fitness_reschedule(uuid,timestamptz,uuid) to authenticated;
grant execute on function public.food_fitness_list_slots(uuid,uuid,date,integer) to anon,authenticated;

commit;
