-- Fitness offers and verified manual Pix fulfillment. Apply after the phone-session migrations.
-- Shared Supabase: only food_fitness_* tables, no writes to FloriWeb data.
begin;

create table public.food_fitness_offers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id),
  kind text not null check (kind in ('workout','assessment','combo','nutrition_consult','nutrition_plan')),
  name text not null check (length(trim(name)) between 3 and 120),
  description text not null default '' check (length(description) <= 2000),
  price_cents integer not null check (price_cents > 0),
  workout_id uuid,
  service_id uuid,
  professional_user_id uuid not null,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,store_id),
  foreign key (workout_id,store_id) references public.food_fitness_workouts(id,store_id),
  foreign key (service_id,store_id) references public.food_business_services(id,store_id),
  foreign key (store_id,professional_user_id) references public.food_service_professionals(store_id,user_id),
  check ((kind='workout' and workout_id is not null and service_id is null)
    or (kind='combo' and workout_id is not null and service_id is not null)
    or (kind in ('assessment','nutrition_consult','nutrition_plan') and workout_id is null and service_id is not null))
);
create index food_fitness_offers_public on public.food_fitness_offers(store_id,published) where published;

create table public.food_fitness_offer_orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  offer_id uuid not null,
  student_user_id uuid not null,
  client_id uuid not null,
  request_id uuid not null,
  price_cents integer not null check (price_cents > 0),
  offer_name text not null,
  state text not null default 'pending' check (state in ('pending','paid','cancelled','refunded')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  confirmed_by uuid references auth.users(id),
  revoked_at timestamptz,
  unique (store_id,student_user_id,request_id),
  unique (id,store_id),
  foreign key (offer_id,store_id) references public.food_fitness_offers(id,store_id),
  foreign key (store_id,student_user_id) references public.food_fitness_students(store_id,user_id),
  foreign key (client_id,store_id) references public.food_business_clients(id,store_id),
  check ((state='paid' and paid_at is not null and confirmed_by is not null and revoked_at is null)
    or (state in ('pending','cancelled') and paid_at is null and confirmed_by is null and revoked_at is null)
    or (state='refunded' and paid_at is not null and confirmed_by is not null and revoked_at is not null))
);
create index food_fitness_orders_admin on public.food_fitness_offer_orders(store_id,created_at desc);
create index food_fitness_orders_student on public.food_fitness_offer_orders(store_id,student_user_id,created_at desc);

alter table public.food_fitness_offers enable row level security;
alter table public.food_fitness_offer_orders enable row level security;
revoke all on public.food_fitness_offers,public.food_fitness_offer_orders from public,anon,authenticated;
grant all on public.food_fitness_offers,public.food_fitness_offer_orders to service_role;

-- No direct table write grants: all mutations below validate store, role, identity and status.
create function food_fitness_private.offer_ready(p_offer public.food_fitness_offers)
returns boolean language sql stable security definer set search_path='' as $$
  select p_offer.published and exists (
    select 1 from public.food_stores s join public.food_business_profiles b on b.store_id=s.id
    join public.food_store_subscriptions sub on sub.store_id=s.id
    where s.id=p_offer.store_id and s.active and s.access_status='online'
      and b.primary_segment='fitness' and sub.status in ('trial','active')
  ) and exists (
    select 1 from public.food_service_professionals p join public.food_store_users u
      on u.store_id=p.store_id and u.user_id=p.user_id and u.active
    where p.store_id=p_offer.store_id and p.user_id=p_offer.professional_user_id and p.active
      and ((p_offer.kind in ('workout','assessment','combo') and p.kind='training' and p.council='CREF'
            and food_business_private.module_enabled(p_offer.store_id,'training'))
        or (p_offer.kind in ('nutrition_consult','nutrition_plan') and p.kind='nutrition' and p.council='CRN'
            and food_business_private.module_enabled(p_offer.store_id,'nutrition')))
  ) and (p_offer.workout_id is null or exists (
    select 1 from public.food_fitness_workouts w where w.store_id=p_offer.store_id and w.id=p_offer.workout_id
      and w.status='approved' and w.approved_by=p_offer.professional_user_id
  )) and (p_offer.service_id is null or exists (
    select 1 from public.food_business_services sv where sv.store_id=p_offer.store_id and sv.id=p_offer.service_id
      and sv.active and sv.professional_user_id=p_offer.professional_user_id
      and sv.kind=case when p_offer.kind in ('nutrition_consult','nutrition_plan') then 'nutrition' else 'training' end
  ))
$$;
revoke all on function food_fitness_private.offer_ready(public.food_fitness_offers) from public,anon,authenticated;
grant execute on function food_fitness_private.offer_ready(public.food_fitness_offers) to authenticated;

create function public.food_fitness_offer_save_v1(
  p_store uuid,p_id uuid,p_kind text,p_name text,p_description text,p_price_cents integer,
  p_workout uuid,p_service uuid,p_professional uuid,p_published boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.food_fitness_offers%rowtype; target uuid:=coalesce(p_id,gen_random_uuid());
begin
  if not food_fitness_private.is_fitness(p_store) or not exists (
    select 1 from public.food_store_users u where u.store_id=p_store and u.user_id=auth.uid()
      and u.active and u.role in ('owner','admin')
  ) then raise exception 'Sem permissão para administrar ofertas.' using errcode='42501'; end if;
  if p_id is not null and not exists(select 1 from public.food_fitness_offers where id=p_id and store_id=p_store) then
    raise exception 'Oferta não encontrada nesta loja.' using errcode='42501';
  end if;
  insert into public.food_fitness_offers(id,store_id,kind,name,description,price_cents,workout_id,service_id,professional_user_id,published)
  values(target,p_store,p_kind,trim(p_name),coalesce(p_description,''),p_price_cents,p_workout,p_service,p_professional,false)
  on conflict(id) do update set kind=excluded.kind,name=excluded.name,description=excluded.description,
    price_cents=excluded.price_cents,workout_id=excluded.workout_id,service_id=excluded.service_id,
    professional_user_id=excluded.professional_user_id,published=false,updated_at=now()
  where food_fitness_offers.store_id=p_store returning * into v;
  if v.id is null then raise exception 'Oferta pertence a outra loja.' using errcode='42501'; end if;
  if p_published then
    v.published:=true;
    if not food_fitness_private.offer_ready(v) then raise exception 'Ficha, serviço, módulo ou profissional ainda não estão aprovados.' using errcode='42501'; end if;
    update public.food_fitness_offers set published=true where id=v.id;
  end if;
  insert into public.food_business_audit(store_id,actor_id,action,details)
    values(p_store,auth.uid(),'fitness.offer_saved',jsonb_build_object('offer_id',v.id,'published',p_published));
  return jsonb_build_object('id',v.id,'published',p_published);
end; $$;

create function public.food_fitness_offers_v1(p_store uuid,p_admin boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_admin and not exists(select 1 from public.food_store_users u where u.store_id=p_store and u.user_id=auth.uid()
      and u.active and u.role in ('owner','admin')) then
    raise exception 'Sem permissão para consultar rascunhos.' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',o.id,'kind',o.kind,'name',o.name,'description',o.description,'price_cents',o.price_cents,
    'workout_id',o.workout_id,'service_id',o.service_id,'professional_user_id',o.professional_user_id,
    'professional_name',p.name,'professional_council',p.council,'published',o.published
  ) order by o.created_at,o.id)
  from public.food_fitness_offers o
  join public.food_service_professionals p on p.store_id=o.store_id and p.user_id=o.professional_user_id
  where o.store_id=p_store and (p_admin or food_fitness_private.offer_ready(o))),'[]'::jsonb);
end; $$;

create function public.food_fitness_order_v1(p_store uuid,p_offer uuid,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.food_fitness_offers%rowtype; student uuid; result public.food_fitness_offer_orders%rowtype;
  purpose text;
begin
  if auth.uid() is null or p_request is null then raise exception 'Sessão de aluno obrigatória.' using errcode='42501'; end if;
  select client_id into student from public.food_fitness_students where store_id=p_store and user_id=auth.uid();
  if student is null or not food_fitness_private.student_session_active(p_store,student) then
    raise exception 'FITNESS_STUDENT_SESSION_REQUIRED' using errcode='42501';
  end if;
  select * into v from public.food_fitness_offers where id=p_offer and store_id=p_store;
  if v.id is null or not food_fitness_private.offer_ready(v) then raise exception 'Oferta indisponível.' using errcode='22023'; end if;
  purpose:=case when v.kind in ('nutrition_consult','nutrition_plan') then 'nutrition' else 'training' end;
  if not exists(select 1 from public.food_fitness_professional_authorizations au where au.store_id=p_store
      and au.student_user_id=auth.uid() and au.professional_user_id=v.professional_user_id
      and au.purpose=purpose and au.active) then
    raise exception 'Autorize o profissional desta oferta antes de comprar.' using errcode='42501';
  end if;
  insert into public.food_fitness_offer_orders(store_id,offer_id,student_user_id,client_id,request_id,price_cents,offer_name)
  values(p_store,v.id,auth.uid(),student,p_request,v.price_cents,v.name)
  on conflict(store_id,student_user_id,request_id) do nothing;
  select * into result from public.food_fitness_offer_orders where store_id=p_store and student_user_id=auth.uid() and request_id=p_request;
  if result.offer_id<>p_offer then raise exception 'Chave de pedido já utilizada para outra oferta.' using errcode='23505'; end if;
  return jsonb_build_object('id',result.id,'state',result.state,'price_cents',result.price_cents,'offer_name',result.offer_name);
end; $$;

create function public.food_fitness_my_orders_v1(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform food_fitness_private.require_student_session(p_store);
  return coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'offer_id',o.offer_id,'offer_name',o.offer_name,
    'state',o.state,'price_cents',o.price_cents,'created_at',o.created_at) order by o.created_at desc)
    from public.food_fitness_offer_orders o where o.store_id=p_store and o.student_user_id=auth.uid()),'[]'::jsonb);
end; $$;

create function public.food_fitness_admin_orders_v1(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.food_store_users u where u.store_id=p_store and u.user_id=auth.uid()
      and u.active and u.role in ('owner','admin')) then raise exception 'Sem acesso aos pedidos.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'offer_name',o.offer_name,'price_cents',o.price_cents,
    'state',o.state,'created_at',o.created_at,'client_id',o.client_id,'student_name',c.name) order by o.created_at desc)
    from public.food_fitness_offer_orders o join public.food_business_clients c on c.id=o.client_id and c.store_id=o.store_id
    where o.store_id=p_store),'[]'::jsonb);
end; $$;

create function public.food_fitness_confirm_order_v1(p_store uuid,p_order uuid,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.food_fitness_offer_orders%rowtype; offer public.food_fitness_offers%rowtype;
  sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
begin
  if auth.uid() is null or auth.jwt()->>'aal' <> 'aal2' or sid is null
    or not exists(select 1 from auth.sessions s where s.id=sid and s.user_id=auth.uid() and (s.not_after is null or s.not_after>now()))
    or not exists(select 1 from public.food_store_users u where u.store_id=p_store and u.user_id=auth.uid()
      and u.active and u.role in ('owner','admin')) then raise exception 'FITNESS_ADMIN_MFA_REQUIRED' using errcode='42501'; end if;
  if p_action not in ('confirm','refund') then raise exception 'Ação inválida.' using errcode='22023'; end if;
  select * into v from public.food_fitness_offer_orders where id=p_order and store_id=p_store for update;
  if v.id is null then raise exception 'Pedido não encontrado nesta loja.' using errcode='42501'; end if;
  select * into offer from public.food_fitness_offers where id=v.offer_id and store_id=v.store_id;
  if p_action='confirm' then
    if v.state='paid' then return jsonb_build_object('id',v.id,'state','paid'); end if;
    if v.state<>'pending' or not food_fitness_private.offer_ready(offer) or offer.price_cents<>v.price_cents then
      raise exception 'Pedido ou oferta mudou; revisão manual obrigatória.' using errcode='22023';
    end if;
    update public.food_fitness_offer_orders set state='paid',paid_at=now(),confirmed_by=auth.uid() where id=v.id;
    if offer.workout_id is not null then
      insert into public.food_fitness_workout_assignments(store_id,workout_id,client_id,assigned_by)
      values(p_store,offer.workout_id,v.client_id,offer.professional_user_id)
      on conflict(store_id,workout_id,client_id) do update set active=true,assigned_by=excluded.assigned_by,assigned_at=now();
    end if;
  else
    if v.state='refunded' then return jsonb_build_object('id',v.id,'state','refunded'); end if;
    if v.state<>'paid' then raise exception 'Somente compra paga pode ser reembolsada.' using errcode='22023'; end if;
    update public.food_fitness_offer_orders set state='refunded',revoked_at=now() where id=v.id;
    if offer.workout_id is not null and not exists(select 1 from public.food_fitness_offer_orders other
      join public.food_fitness_offers f on f.id=other.offer_id and f.store_id=other.store_id
      where other.store_id=p_store and other.client_id=v.client_id and other.id<>v.id and other.state='paid'
        and f.workout_id=offer.workout_id) then
      update public.food_fitness_workout_assignments set active=false
      where store_id=p_store and workout_id=offer.workout_id and client_id=v.client_id;
    end if;
  end if;
  insert into public.food_business_audit(store_id,actor_id,action,details)
    values(p_store,auth.uid(),'fitness.order_'||p_action,jsonb_build_object('order_id',v.id,'student_user_id',v.student_user_id));
  return jsonb_build_object('id',v.id,'state',case when p_action='confirm' then 'paid' else 'refunded' end);
end; $$;

create function public.food_fitness_pix_v1(p_store uuid)
returns jsonb language sql stable security definer set search_path='' as $
  select case when s.active and s.access_status='online' and s.pix_enabled
    then jsonb_build_object('pix_key',s.pix_key,'pix_copy_paste',s.pix_copy_paste,'holder_name',s.pix_holder_name)
    else '{}'::jsonb end
  from public.food_stores s join public.food_business_profiles b on b.store_id=s.id and b.primary_segment='fitness'
  where s.id=p_store
$;

revoke all on function public.food_fitness_offer_save_v1(uuid,uuid,text,text,text,integer,uuid,uuid,uuid,boolean),
  public.food_fitness_offers_v1(uuid,boolean),public.food_fitness_order_v1(uuid,uuid,uuid),
  public.food_fitness_my_orders_v1(uuid),public.food_fitness_admin_orders_v1(uuid),
  public.food_fitness_confirm_order_v1(uuid,uuid,text),public.food_fitness_pix_v1(uuid) from public,anon,authenticated;
grant execute on function public.food_fitness_offers_v1(uuid,boolean),public.food_fitness_pix_v1(uuid) to anon,authenticated;
grant execute on function public.food_fitness_offer_save_v1(uuid,uuid,text,text,text,integer,uuid,uuid,uuid,boolean),
  public.food_fitness_order_v1(uuid,uuid,uuid),public.food_fitness_my_orders_v1(uuid),
  public.food_fitness_admin_orders_v1(uuid),public.food_fitness_confirm_order_v1(uuid,uuid,text) to authenticated;
commit;
