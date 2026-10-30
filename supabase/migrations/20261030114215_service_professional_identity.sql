-- Identidade e atribuição de prestadores de serviços (shared_future).
-- Revisar o histórico efetivo do Supabase compartilhado antes de aplicar.
begin;

create table public.food_service_professionals (
  store_id uuid not null references public.food_stores(id),
  user_id uuid not null references auth.users(id),
  name text not null check (length(trim(name)) between 3 and 120),
  kind text not null check (kind in ('training','nutrition','general')),
  council text not null check (council in ('CREF','CRN','OUTRO')),
  registration text not null check (length(trim(registration)) between 3 and 50),
  active boolean not null default true,
  confirmed_by uuid not null references auth.users(id),
  confirmed_at timestamptz not null default now(),
  primary key (store_id,user_id),
  foreign key (store_id,user_id) references public.food_store_users(store_id,user_id),
  constraint food_service_professional_council_kind check (
    (kind='nutrition' and council='CRN') or
    (kind='training' and council='CREF') or
    (kind='general')
  )
);
alter table public.food_service_professionals enable row level security;
revoke all on public.food_service_professionals from public,anon,authenticated;
grant select on public.food_service_professionals to authenticated;
create policy food_service_professionals_read on public.food_service_professionals for select to authenticated
  using (user_id=(select auth.uid()) or food_business_private.can_manage(store_id));

alter table public.food_business_services add column professional_user_id uuid;
alter table public.food_business_services add constraint food_business_service_professional_fk
  foreign key (store_id,professional_user_id) references public.food_service_professionals(store_id,user_id);
create index food_business_service_professional_idx on public.food_business_services(store_id,professional_user_id) where professional_user_id is not null;

-- Somente o proprietário vincula e atesta o registro. A verificação externa do
-- conselho é uma etapa humana; o banco não afirma validação junto ao conselho.
create function public.food_service_professional_upsert(
  p_store uuid,p_user uuid,p_name text,p_kind text,p_council text,p_registration text,p_active boolean default true
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.food_service_professionals%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.food_store_users u where u.store_id=p_store and u.user_id=auth.uid() and u.role='owner' and u.active) then
    raise exception 'Somente o proprietário pode confirmar o prestador.' using errcode='42501';
  end if;
  if p_user is null or not exists(select 1 from public.food_store_users u where u.store_id=p_store and u.user_id=p_user and u.active and u.role in ('owner','admin','manager','attendant')) then
    raise exception 'A conta do prestador deve pertencer à mesma loja.' using errcode='42501';
  end if;
  if not p_active and exists(select 1 from public.food_business_appointments a
    where a.store_id=p_store and a.professional_id=p_user and a.status in ('scheduled','confirmed') and a.starts_at>now()) then
    raise exception 'Reatribua ou cancele as consultas futuras antes de desativar.' using errcode='23P01';
  end if;
  if exists(select 1 from public.food_business_services s where s.store_id=p_store and s.professional_user_id=p_user
    and s.active and s.kind in ('nutrition','training') and s.kind is distinct from p_kind) then
    raise exception 'Reatribua os serviços ativos antes de trocar a habilitação.' using errcode='23P01';
  end if;
  insert into public.food_service_professionals(store_id,user_id,name,kind,council,registration,active,confirmed_by,confirmed_at)
  values(p_store,p_user,trim(p_name),p_kind,p_council,trim(p_registration),p_active,auth.uid(),now())
  on conflict(store_id,user_id) do update set name=excluded.name,kind=excluded.kind,council=excluded.council,
    registration=excluded.registration,active=excluded.active,confirmed_by=excluded.confirmed_by,confirmed_at=now()
  returning * into v;
  insert into public.food_business_audit(store_id,actor_id,action,details)
    values(p_store,auth.uid(),'service.professional',jsonb_build_object('user_id',p_user,'active',p_active));
  return jsonb_build_object('user_id',v.user_id,'name',v.name,'kind',v.kind,'council',v.council,'registration',v.registration,'active',v.active);
end; $$;

create function public.food_service_professional_staff(p_store uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.food_store_users u where u.store_id=p_store and u.user_id=auth.uid() and u.role in ('owner','admin') and u.active) then
    raise exception 'Sem acesso à equipe.' using errcode='42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('user_id',u.user_id,'email',a.email,'name',p.name,'kind',p.kind,'council',p.council,'registration',p.registration,'professional_active',p.active) order by a.email),'[]'::jsonb)
    from public.food_store_users u join auth.users a on a.id=u.user_id
    left join public.food_service_professionals p on p.store_id=u.store_id and p.user_id=u.user_id
    where u.store_id=p_store and u.active and u.role in ('owner','admin','manager','attendant'));
end; $$;

create function public.food_service_professional_assign(p_store uuid,p_service uuid,p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare service_kind text; profile_kind text; previous_user uuid;
begin
  if not exists(select 1 from public.food_store_users u where u.store_id=p_store and u.user_id=auth.uid() and u.role in ('owner','admin') and u.active) then
    raise exception 'Sem permissão para atribuir serviços.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('food-business:'||p_store::text,0));
  select kind,professional_user_id into service_kind,previous_user from public.food_business_services where id=p_service and store_id=p_store for update;
  if service_kind is null then raise exception 'Serviço não encontrado nesta loja.' using errcode='22023'; end if;
  if previous_user is distinct from p_user and exists(select 1 from public.food_business_appointments a
    where a.store_id=p_store and a.service_id=p_service and a.status in ('scheduled','confirmed') and a.starts_at>now()) then
    raise exception 'Reatribua ou cancele as consultas futuras antes de trocar o prestador.' using errcode='23P01';
  end if;
  if p_user is not null then
    select p.kind into profile_kind from public.food_service_professionals p
      join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active
      where p.store_id=p_store and p.user_id=p_user and p.active;
    if profile_kind is null or (service_kind in ('nutrition','training') and service_kind<>profile_kind) then
      raise exception 'Prestador ativo e habilitação apropriada são obrigatórios.' using errcode='42501';
    end if;
  end if;
  update public.food_business_services set professional_user_id=p_user,updated_at=now() where id=p_service and store_id=p_store;
  insert into public.food_business_audit(store_id,actor_id,action,details)
    values(p_store,auth.uid(),'service.assign',jsonb_build_object('service_id',p_service,'user_id',p_user));
  return jsonb_build_object('service_id',p_service,'professional_user_id',p_user);
end; $$;

-- A conta profissional vê apenas as próprias atribuições, sem dados de alunos.
create function public.food_service_professional_mine() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('store_id',p.store_id,'store_name',st.name,'name',p.name,'kind',p.kind,'council',p.council,'registration',p.registration,
    'services',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'kind',s.kind)),'[]'::jsonb)
      from public.food_business_services s where s.store_id=p.store_id and s.professional_user_id=p.user_id and s.active)) order by st.name),'[]'::jsonb)
  from public.food_service_professionals p
  join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active
  join public.food_stores st on st.id=p.store_id and st.active and st.access_status='online'
  where p.user_id=auth.uid() and p.active;
$$;

revoke all on function public.food_service_professional_upsert(uuid,uuid,text,text,text,text,boolean),
  public.food_service_professional_staff(uuid),public.food_service_professional_assign(uuid,uuid,uuid),
  public.food_service_professional_mine() from public,anon;
grant execute on function public.food_service_professional_upsert(uuid,uuid,text,text,text,text,boolean),
  public.food_service_professional_staff(uuid),public.food_service_professional_assign(uuid,uuid,uuid),
  public.food_service_professional_mine() to authenticated;

-- O endpoint público nunca expõe uma oferta profissional anônima ou cujo
-- prestador saiu da loja. A revisão comercial Fitness continua obrigatória.
create or replace function food_business_private.public_offers(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare segment_value text; services jsonb:='[]'; links jsonb:='[]';
begin
  if not exists(select 1 from public.food_stores s where s.id=p_store and s.active and s.archived_at is null and s.approval_status='approved' and s.access_status='online') then
    return jsonb_build_object('services','[]'::jsonb,'links','[]'::jsonb,'primary_segment',null);
  end if;
  select primary_segment into segment_value from public.food_business_profiles where store_id=p_store;
  if food_business_private.module_enabled(p_store,'appointments') then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into services from (
      select s.id,s.name,s.description,s.price_cents,s.duration_minutes,s.kind,
        jsonb_build_object('user_id',p.user_id,'name',p.name,'council',p.council,'registration',p.registration) as professional
      from public.food_business_services s
      join public.food_service_professionals p on p.store_id=s.store_id and p.user_id=s.professional_user_id and p.active
      join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active
      where s.store_id=p_store and s.active and (s.kind='general' or food_business_private.module_enabled(p_store,s.kind))
        and (s.kind='general' or s.kind=p.kind)
        and (segment_value is distinct from 'fitness' or exists (
          select 1 from public.food_fitness_service_terms t where t.store_id=s.store_id and t.service_id=s.id and t.price_confirmed and t.published_at is not null))
      order by s.name,s.id limit 100
    ) x;
  end if;
  if food_business_private.module_enabled(p_store,'creator') then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into links from (
      select l.id,l.label,l.url from public.food_creator_links l where l.store_id=p_store and l.active
        and (l.campaign_id is null or exists(select 1 from public.food_creator_campaigns c where c.id=l.campaign_id and c.store_id=l.store_id and c.status='active'
          and (c.starts_at is null or c.starts_at<=now()) and (c.ends_at is null or c.ends_at>=now())))
      order by l.label,l.id limit 100
    ) x;
  end if;
  return jsonb_build_object('services',services,'links',links,'primary_segment',segment_value);
end; $$;

-- Atribuir um horário a outro prestador não pode contornar a vitrine nem a agenda.
create function food_business_private.guard_service_professional() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('scheduled','confirmed') and not exists(
    select 1 from public.food_business_services s
      join public.food_service_professionals p on p.store_id=s.store_id and p.user_id=s.professional_user_id and p.active
      join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active
    where s.id=new.service_id and s.store_id=new.store_id and s.active and s.professional_user_id=new.professional_id
      and (s.kind='general' or s.kind=p.kind)
  ) then raise exception 'Prestador não atribuído a este serviço.' using errcode='42501'; end if;
  return new;
end; $$;
create trigger food_business_appointment_professional before insert or update of service_id,professional_id,status,starts_at,ends_at
  on public.food_business_appointments for each row execute function food_business_private.guard_service_professional();
revoke all on function food_business_private.guard_service_professional() from public,anon,authenticated;

-- A agenda pública só oferece horários do prestador atribuído ao serviço.
create or replace function public.food_fitness_list_slots(p_store uuid,p_service uuid,p_from date,p_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare service_row public.food_business_services%rowtype; terms_row public.food_fitness_service_terms%rowtype; slots jsonb;
begin
  if p_days not between 1 and 30 or p_from is null or p_from<current_date-1 or p_from>current_date+90 then raise exception 'Período de consulta inválido.' using errcode='22023'; end if;
  select * into service_row from public.food_business_services where id=p_service and store_id=p_store and active and kind='training';
  select * into terms_row from public.food_fitness_service_terms where store_id=p_store and service_id=p_service and price_confirmed and published_at is not null;
  if service_row.id is null or service_row.professional_user_id is null or terms_row.service_id is null or not food_fitness_private.is_fitness(p_store)
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
    where w.store_id=p_store and w.professional_id=service_row.professional_user_id and w.active and extract(dow from p_from+d.n)=w.weekday
      and (g.local_start at time zone w.timezone)>now()
      and not exists (select 1 from public.food_fitness_blocks b where b.store_id=w.store_id and b.professional_id=w.professional_id and b.starts_at<(g.local_start at time zone w.timezone)+make_interval(mins=>service_row.duration_minutes+w.buffer_minutes) and b.ends_at>(g.local_start at time zone w.timezone)-make_interval(mins=>w.buffer_minutes))
      and not exists (select 1 from public.food_business_appointments a where a.store_id=w.store_id and a.professional_id=w.professional_id and a.status in ('scheduled','confirmed') and a.starts_at<(g.local_start at time zone w.timezone)+make_interval(mins=>service_row.duration_minutes+w.buffer_minutes) and a.ends_at>(g.local_start at time zone w.timezone)-make_interval(mins=>w.buffer_minutes))
    order by starts_at,professional_id limit 500
  ) x;
  return jsonb_build_object('slots',slots,'cancel_policy',terms_row.cancel_policy,'reschedule_policy',terms_row.reschedule_policy,'cancel_before_minutes',terms_row.cancel_before_minutes,'terms_published_at',terms_row.published_at);
end; $$;

create function food_business_private.guard_fitness_publication() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.published_at is not null and not exists(
    select 1 from public.food_business_services s
      join public.food_service_professionals p on p.store_id=s.store_id and p.user_id=s.professional_user_id and p.active and p.kind='training' and p.council='CREF'
      join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active
    where s.store_id=new.store_id and s.id=new.service_id and s.active
  ) then raise exception 'Atribua um profissional com registro CREF antes de publicar.' using errcode='42501'; end if;
  return new;
end; $$;
create trigger food_fitness_terms_professional before insert or update of published_at,service_id,price_confirmed
  on public.food_fitness_service_terms for each row execute function food_business_private.guard_fitness_publication();
revoke all on function food_business_private.guard_fitness_publication() from public,anon,authenticated;

commit;
