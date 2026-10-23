-- shared_future: núcleo modular aditivo. Não migra dados Impulso/FloriWeb,
-- não modifica preços/assinaturas e não executa cobranças.
-- Comparar histórico remoto e diagnosticar em homologação antes da aplicação.
begin;
create schema if not exists food_business_private;

create table public.food_business_profiles (
  store_id uuid primary key references public.food_stores(id),
  primary_segment text not null check(primary_segment in ('food','florist','retail','rentals','personal','nutrition','creator','confectionery','printing3d','services')),
  initialized_by uuid references auth.users(id), initialized_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.food_business_entitlements (
  store_id uuid not null references public.food_business_profiles(store_id),
  module_code text not null check(module_code in ('clients','appointments','creator','training','nutrition','florist','events','combos','rentals','custom')),
  enabled boolean not null default false,
  source text not null check(source in ('segment','plan','exception')),
  reason text not null check(length(trim(reason)) between 3 and 500),
  expires_at timestamptz, granted_by uuid references auth.users(id), updated_at timestamptz not null default now(),
  primary key(store_id,module_code)
);
create table public.food_business_audit (
  id bigint generated always as identity primary key,store_id uuid not null references public.food_stores(id),
  actor_id uuid references auth.users(id),action text not null,details jsonb not null default '{}',created_at timestamptz not null default now()
);
create index food_business_audit_store_idx on public.food_business_audit(store_id,created_at desc);

create table public.food_business_clients (
  id uuid primary key default gen_random_uuid(),store_id uuid not null references public.food_stores(id),
  name text not null check(length(trim(name)) between 2 and 120),
  email text not null default '' check(length(email)<=254),phone text not null default '' check(length(phone)<=30),
  active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,store_id)
);
create table public.food_business_services (
  id uuid primary key default gen_random_uuid(),store_id uuid not null references public.food_stores(id),
  name text not null check(length(trim(name)) between 2 and 120),description text not null default '' check(length(description)<=1000),
  kind text not null default 'general' check(kind in ('general','training','nutrition')),
  price_cents bigint not null default 0 check(price_cents between 0 and 100000000),duration_minutes integer not null default 60 check(duration_minutes between 5 and 1440),
  active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,store_id)
);
create table public.food_business_appointments (
  id uuid primary key default gen_random_uuid(),store_id uuid not null references public.food_stores(id),
  client_id uuid not null,service_id uuid not null,professional_id uuid not null references auth.users(id),
  starts_at timestamptz not null,ends_at timestamptz not null,
  status text not null default 'scheduled' check(status in ('scheduled','confirmed','completed','cancelled')),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  check(ends_at>starts_at and ends_at<=starts_at+interval '24 hours'),
  foreign key(client_id,store_id) references public.food_business_clients(id,store_id),
  foreign key(service_id,store_id) references public.food_business_services(id,store_id),unique(id,store_id)
);
create index food_business_appointments_schedule_idx on public.food_business_appointments(store_id,professional_id,starts_at,ends_at) where status in ('scheduled','confirmed');
create table public.food_business_followups (
  id uuid primary key default gen_random_uuid(),store_id uuid not null references public.food_stores(id),client_id uuid not null,
  title text not null check(length(trim(title)) between 3 and 160),
  type text not null default 'administrative' check(type in ('administrative','training','nutrition')),
  due_at timestamptz not null,status text not null default 'pending' check(status in ('pending','done','cancelled')),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  foreign key(client_id,store_id) references public.food_business_clients(id,store_id)
);
create table public.food_creator_campaigns (
  id uuid primary key default gen_random_uuid(),store_id uuid not null references public.food_stores(id),
  title text not null check(length(trim(title)) between 3 and 160),starts_at timestamptz,ends_at timestamptz,
  status text not null default 'draft' check(status in ('draft','active','completed','cancelled')),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  check(ends_at is null or starts_at is null or ends_at>=starts_at),unique(id,store_id)
);
create table public.food_creator_links (
  id uuid primary key default gen_random_uuid(),store_id uuid not null references public.food_stores(id),campaign_id uuid,
  label text not null check(length(trim(label)) between 2 and 120),
  url text not null check(length(url)<=2048 and url ~ '^https://[^[:space:]]+$'),active boolean not null default true,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  foreign key(campaign_id,store_id) references public.food_creator_campaigns(id,store_id)
);
create index food_business_clients_store_idx on public.food_business_clients(store_id,active,name);
create index food_business_services_store_idx on public.food_business_services(store_id,active,name);
create index food_business_followups_store_idx on public.food_business_followups(store_id,due_at);
create index food_creator_campaigns_store_idx on public.food_creator_campaigns(store_id,created_at desc);
create index food_creator_links_store_idx on public.food_creator_links(store_id,active);

insert into public.food_features(code,name,description,scope)
select 'segment_'||code,label,'Módulo administrativo VendeWeb: '||label,'shared_future'
from (values ('clients','Clientes'),('appointments','Agenda'),('creator','Creator'),('training','Acompanhamento administrativo Personal'),('nutrition','Acompanhamento administrativo Nutrição'),('florist','Floricultura'),('events','Eventos'),('combos','Combos'),('rentals','Locações'),('custom','Personalizados')) x(code,label)
on conflict(code) do nothing;

create function food_business_private.segment_defaults(p_segment text) returns text[] language sql immutable set search_path='' as $$
 select case p_segment when 'personal' then array['clients','appointments','training'] when 'nutrition' then array['clients','appointments','nutrition']
 when 'creator' then array['creator'] when 'florist' then array['florist'] when 'rentals' then array['clients','appointments'] when 'services' then array['clients','appointments'] else array[]::text[] end;
$$;
create function food_business_private.dependencies(p_module text) returns text[] language sql immutable set search_path='' as $$
 select case when p_module in ('appointments','training','nutrition') then array['clients'] else array[]::text[] end;
$$;
create function food_business_private.is_master() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(auth.uid() is not null and auth.jwt()->>'aal'='aal2' and public.food_is_platform_admin(),false);
$$;
create function food_business_private.can_manage(p_store uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.food_stores s where s.id=p_store and s.active and s.archived_at is null)
 and (food_business_private.is_master() or exists(select 1 from public.food_store_users u where u.store_id=p_store and u.user_id=auth.uid() and u.active and u.role in ('owner','admin','manager')));
$$;
create function food_business_private.granted(p_store uuid,p_module text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.food_business_entitlements e join public.food_business_profiles p on p.store_id=e.store_id
 where e.store_id=p_store and e.module_code=p_module and e.enabled and (e.expires_at is null or e.expires_at>now())
 and case e.source when 'segment' then e.module_code=any(food_business_private.segment_defaults(p.primary_segment)) when 'plan' then public.food_store_has_feature(p_store,'segment_'||p_module) else true end);
$$;
create function food_business_private.module_enabled(p_store uuid,p_module text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.food_stores s where s.id=p_store and s.active and s.archived_at is null and s.approval_status='approved' and s.access_status='online')
 and exists(select 1 from public.food_store_subscriptions ss where ss.store_id=p_store and ss.status in ('trial','active') and (ss.expires_at is null or ss.expires_at>now()))
 and food_business_private.granted(p_store,p_module)
 and not exists(select 1 from unnest(food_business_private.dependencies(p_module)) dep where not food_business_private.granted(p_store,dep));
$$;
create function food_business_private.read_module(p_store uuid,p_module text) returns boolean language sql stable security definer set search_path='' as $$
 select food_business_private.can_manage(p_store) and food_business_private.module_enabled(p_store,p_module);
$$;

-- Somente leitura do cliente SQL; toda escrita é feita pelas RPCs abaixo.
do $$ declare t text; m text; begin
 foreach t in array array['food_business_profiles','food_business_entitlements','food_business_audit','food_business_clients','food_business_services','food_business_appointments','food_business_followups','food_creator_campaigns','food_creator_links'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  m:=case when t in ('food_business_clients','food_business_followups') then 'clients' when t in ('food_business_services','food_business_appointments') then 'appointments' when t in ('food_creator_campaigns','food_creator_links') then 'creator' else null end;
  if m is null then execute format('create policy %I on public.%I for select to authenticated using(food_business_private.can_manage(store_id))',t||'_read',t);
  else execute format('create policy %I on public.%I for select to authenticated using(food_business_private.read_module(store_id,%L))',t||'_read',t,m); end if;
 end loop;
end $$;
drop policy food_business_followups_read on public.food_business_followups;
create policy food_business_followups_read on public.food_business_followups for select to authenticated
using(food_business_private.read_module(store_id,'clients') and (type='administrative' or food_business_private.read_module(store_id,type)));
drop policy food_business_services_read on public.food_business_services;
create policy food_business_services_read on public.food_business_services for select to authenticated
using(food_business_private.read_module(store_id,'appointments') and (kind='general' or food_business_private.read_module(store_id,kind)));
drop policy food_business_appointments_read on public.food_business_appointments;
create policy food_business_appointments_read on public.food_business_appointments for select to authenticated
using(food_business_private.read_module(store_id,'appointments') and exists(select 1 from public.food_business_services s where s.id=service_id and s.store_id=food_business_appointments.store_id));

create function food_business_private.status(p_store uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.food_business_profiles%rowtype; modules jsonb; can_init boolean; audit_rows jsonb;
begin
 if not food_business_private.can_manage(p_store) then raise exception 'Acesso negado a este negócio.' using errcode='42501'; end if;
 select * into p from public.food_business_profiles where store_id=p_store;
 can_init:=p.store_id is null and exists(select 1 from public.food_store_users u where u.store_id=p_store and u.user_id=auth.uid() and u.active and u.role='owner');
 select jsonb_agg(jsonb_build_object('code',x.code,'enabled',coalesce(e.enabled,false),'effective',food_business_private.module_enabled(p_store,x.code),
 'source',e.source,'reason',e.reason,'expires_at',e.expires_at,'plan_allowed',public.food_store_has_feature(p_store,'segment_'||x.code),'dependencies',food_business_private.dependencies(x.code)) order by x.code)
 into modules from unnest(array['clients','appointments','creator','training','nutrition','florist','events','combos','rentals','custom']) x(code)
 left join public.food_business_entitlements e on e.store_id=p_store and e.module_code=x.code;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into audit_rows from (select id::text,actor_id,action,details,created_at from public.food_business_audit where store_id=p_store order by created_at desc,id desc limit 50) x;
 return jsonb_build_object('profile',case when p.store_id is null then null else to_jsonb(p) end,'legacy',p.store_id is null,'can_initialize',can_init,'can_manage_read',true,'modules',coalesce(modules,'[]'),'audit',audit_rows);
end;
$$;

create function food_business_private.set_segment(p_store uuid,p_segment text,p_preserve_legacy boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare defaults text[]; old_profile public.food_business_profiles%rowtype; m text; flags public.food_module_settings%rowtype;
begin
 if auth.uid() is null and coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Sessão obrigatória.' using errcode='42501'; end if;
 if p_segment not in ('food','florist','retail','rentals','personal','nutrition','creator','confectionery','printing3d','services') or p_segment is null then raise exception 'Segmento inválido.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('food-business:'||p_store::text,0));
 select * into old_profile from public.food_business_profiles where store_id=p_store for update;
 select * into flags from public.food_module_settings where store_id=p_store;
 if old_profile.store_id is null and (coalesce(flags.events_enabled,false) or coalesce(flags.combos_enabled,false) or coalesce(flags.rentals_enabled,false) or coalesce(flags.custom_enabled,false)) and not (p_preserve_legacy and food_business_private.is_master()) then
   raise exception 'Este negócio possui módulos legados ativos. O Master precisa preservar os direitos existentes antes da inicialização.' using errcode='22023';
 end if;
 defaults:=food_business_private.segment_defaults(p_segment);
 insert into public.food_business_profiles(store_id,primary_segment,initialized_by) values(p_store,p_segment,auth.uid())
 on conflict(store_id) do update set primary_segment=excluded.primary_segment,updated_at=now();
 update public.food_business_entitlements set enabled=false,updated_at=now(),reason='Pacote do segmento anterior substituído' where store_id=p_store and source='segment' and not(module_code=any(defaults));
 foreach m in array defaults loop
  insert into public.food_business_entitlements(store_id,module_code,enabled,source,reason,granted_by) values(p_store,m,true,'segment','Incluído no segmento principal',auth.uid())
  on conflict(store_id,module_code) do update set enabled=true,source='segment',reason=excluded.reason,expires_at=null,granted_by=excluded.granted_by,updated_at=now();
 end loop;
 if old_profile.store_id is null and p_preserve_legacy and food_business_private.is_master() then
  foreach m in array array['events','combos','rentals','custom'] loop
   if (case m when 'events' then flags.events_enabled when 'combos' then flags.combos_enabled when 'rentals' then flags.rentals_enabled else flags.custom_enabled end) then
    insert into public.food_business_entitlements(store_id,module_code,enabled,source,reason,granted_by) values(p_store,m,true,'exception','Migração de direitos existentes',auth.uid())
    on conflict(store_id,module_code) do nothing;
   end if;
  end loop;
 end if;
 if exists(select 1 from public.food_business_entitlements e cross join lateral unnest(food_business_private.dependencies(e.module_code)) dep where e.store_id=p_store and e.enabled and not food_business_private.granted(p_store,dep)) then
  raise exception 'A mudança removeria uma dependência de módulo ativo. Revise as concessões no Master.' using errcode='22023';
 end if;
 update public.food_stores set visual_theme=coalesce(visual_theme,'{}'::jsonb)||jsonb_build_object('businessSegment',p_segment),updated_at=now() where id=p_store;
 insert into public.food_business_audit(store_id,actor_id,action,details) values(p_store,auth.uid(),'set_segment',jsonb_build_object('previous_segment',old_profile.primary_segment,'segment',p_segment,'preserve_legacy',p_preserve_legacy));
end;
$$;

create function food_business_private.initialize(p_store uuid,p_segment text) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing text;
begin
 if not food_business_private.can_manage(p_store) or not exists(select 1 from public.food_store_users u where u.store_id=p_store and u.user_id=auth.uid() and u.active and u.role='owner') then raise exception 'Somente o proprietário pode escolher o primeiro segmento.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('food-business:'||p_store::text,0));
 select primary_segment into existing from public.food_business_profiles where store_id=p_store;
 if existing is not null then
  if existing<>p_segment then raise exception 'O segmento principal já foi escolhido. Solicite a mudança ao Master.' using errcode='42501'; end if;
  return food_business_private.status(p_store);
 end if;
 perform food_business_private.set_segment(p_store,p_segment,false);
 return food_business_private.status(p_store);
end;
$$;

create function food_business_private.master(p_action text,p_store uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare m text; source_value text; reason_value text; expiry timestamptz; dep text; result jsonb; org uuid;
begin
 if not food_business_private.is_master() then raise exception 'Master com MFA obrigatório.' using errcode='42501'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Dados inválidos.' using errcode='22023'; end if;
 if p_action='list' then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (select s.id,s.name,p.primary_segment from public.food_stores s left join public.food_business_profiles p on p.store_id=s.id where s.archived_at is null order by s.name limit 100) x;
  return jsonb_build_object('items',result);
 end if;
 if not exists(select 1 from public.food_stores where id=p_store and active and archived_at is null) then raise exception 'Negócio indisponível.' using errcode='22023'; end if;
 if p_action='set_segment' then
  perform food_business_private.set_segment(p_store,p_data->>'segment',coalesce((p_data->>'preserve_legacy')::boolean,false));
  return food_business_private.status(p_store);
 end if;
 m:=p_data->>'module_code';
 if m not in ('clients','appointments','creator','training','nutrition','florist','events','combos','rentals','custom') or m is null then raise exception 'Módulo inválido.' using errcode='22023'; end if;
 if p_action='plan_feature' then
  if not exists(select 1 from public.food_plans where id=(p_data->>'plan_id')::uuid) then raise exception 'Plano inexistente.'; end if;
  insert into public.food_plan_features(plan_id,feature_code,enabled) values((p_data->>'plan_id')::uuid,'segment_'||m,coalesce((p_data->>'enabled')::boolean,false))
  on conflict(plan_id,feature_code) do update set enabled=excluded.enabled,updated_at=now();
 elsif p_action in ('grant','revoke') then
  if not exists(select 1 from public.food_business_profiles where store_id=p_store) then raise exception 'Inicialize o perfil antes das concessões.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('food-business:'||p_store::text,0));
  reason_value:=trim(coalesce(p_data->>'reason',''));
  if length(reason_value) not between 3 and 500 then raise exception 'Informe o motivo da alteração (3 a 500 caracteres).'; end if;
  if p_action='grant' then
   source_value:=p_data->>'source'; expiry:=nullif(p_data->>'expires_at','')::timestamptz;
   if source_value not in ('plan','exception') or source_value is null then raise exception 'Fonte deve ser plano ou exceção.'; end if;
   if expiry is not null and expiry<=now() then raise exception 'Validade deve ser futura.'; end if;
   if source_value='plan' and not public.food_store_has_feature(p_store,'segment_'||m) then raise exception 'O plano vigente não inclui este módulo.' using errcode='42501'; end if;
   foreach dep in array food_business_private.dependencies(m) loop
    if not food_business_private.granted(p_store,dep) then raise exception 'Dependência obrigatória: %',dep; end if;
   end loop;
   insert into public.food_business_entitlements(store_id,module_code,enabled,source,reason,expires_at,granted_by) values(p_store,m,true,source_value,reason_value,expiry,auth.uid())
   on conflict(store_id,module_code) do update set enabled=true,source=excluded.source,reason=excluded.reason,expires_at=excluded.expires_at,granted_by=excluded.granted_by,updated_at=now();
  else
   if exists(select 1 from public.food_business_entitlements e where e.store_id=p_store and e.enabled and m=any(food_business_private.dependencies(e.module_code))) then raise exception 'Revogue primeiro os módulos dependentes.'; end if;
   update public.food_business_entitlements set enabled=false,reason=reason_value,granted_by=auth.uid(),updated_at=now() where store_id=p_store and module_code=m;
  end if;
 else raise exception 'Ação Master inválida.' using errcode='22023'; end if;
 if p_action='grant' and m in ('events','combos','rentals','custom') then
  select organization_id into org from public.food_module_stores where store_id=p_store;
  if org is null then
   insert into public.food_module_organizations(name) select name from public.food_stores where id=p_store returning id into org;
   insert into public.food_module_stores(store_id,organization_id) values(p_store,org);
   insert into public.food_module_settings(store_id,organization_id) values(p_store,org);
  end if;
  execute format('update public.food_module_settings set %I=true where store_id=$1',m||'_enabled') using p_store;
 end if;
 insert into public.food_business_audit(store_id,actor_id,action,details) values(p_store,auth.uid(),p_action,p_data);
 return food_business_private.status(p_store);
end;
$$;

-- O tema nunca é autoridade: em perfis novos o segmento vem do registro protegido.
create function food_business_private.guard_visual_segment() returns trigger language plpgsql security definer set search_path='' as $$
declare segment_value text;
begin
 select primary_segment into segment_value from public.food_business_profiles where store_id=new.id;
 if segment_value is not null and (new.visual_theme->>'businessSegment') is distinct from segment_value then
  raise exception 'Altere o segmento pelo gerenciamento do negócio.' using errcode='42501';
 end if;
 return new;
end;
$$;
create trigger food_business_visual_segment_guard before update of visual_theme on public.food_stores for each row execute function food_business_private.guard_visual_segment();

-- Legado sem perfil continua opt-in pelos fluxos existentes. Perfil novo usa
-- as mesmas flags como configuração, porém a autorização vem do Master.
create function food_business_private.guard_legacy_flags() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.food_business_profiles where store_id=new.store_id)
 and (tg_op='INSERT' and (new.events_enabled or new.combos_enabled or new.rentals_enabled or new.custom_enabled)
 or tg_op='UPDATE' and row(new.events_enabled,new.combos_enabled,new.rentals_enabled,new.custom_enabled) is distinct from row(old.events_enabled,old.combos_enabled,old.rentals_enabled,old.custom_enabled))
 and not food_business_private.is_master() and coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Módulos opcionais são gerenciados pelo Master.' using errcode='42501'; end if;
 return new;
end;
$$;
create trigger food_business_legacy_flags_guard before insert or update on public.food_module_settings for each row execute function food_business_private.guard_legacy_flags();
create or replace function food_modules_private.food_modules_enabled(p_store uuid,p_module text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.food_module_settings m join public.food_stores s on s.id=m.store_id
 where m.store_id=p_store and s.active and s.archived_at is null and s.access_status='online' and s.approval_status='approved'
 and case p_module when 'events' then m.events_enabled when 'combos' then m.combos_enabled when 'rentals' then m.rentals_enabled when 'custom' then m.custom_enabled else false end
 and (not exists(select 1 from public.food_business_profiles p where p.store_id=p_store) or food_business_private.module_enabled(p_store,p_module)));
$$;

create function public.food_business_status(p_store uuid) returns jsonb language sql stable security invoker set search_path='' as $$select food_business_private.status(p_store)$$;
create function public.food_business_initialize(p_store uuid,p_segment text) returns jsonb language sql security invoker set search_path='' as $$select food_business_private.initialize(p_store,p_segment)$$;
create function public.food_business_master(p_action text,p_store uuid default null,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select food_business_private.master(p_action,p_store,p_data)$$;

revoke all on all functions in schema food_business_private from public,anon,authenticated;
grant usage on schema food_business_private to authenticated;
grant execute on function food_business_private.can_manage(uuid),food_business_private.read_module(uuid,text),food_business_private.status(uuid),food_business_private.initialize(uuid,text),food_business_private.master(text,uuid,jsonb) to authenticated;
revoke all on function public.food_business_status(uuid),public.food_business_initialize(uuid,text),public.food_business_master(text,uuid,jsonb) from public,anon;
grant execute on function public.food_business_status(uuid),public.food_business_initialize(uuid,text),public.food_business_master(text,uuid,jsonb) to authenticated;

create function food_business_private.operate(p_store uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare entity text; operation text; tbl text; required_module text; obj uuid; previous jsonb; body jsonb; result jsonb;
 allowed text[]; professional uuid; client uuid; service uuid; starts timestamptz; ends timestamptz; state_value text; kind_value text; limit_value integer;
begin
 if not food_business_private.can_manage(p_store) then raise exception 'Sem acesso a este negócio.' using errcode='42501'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Dados inválidos.' using errcode='22023'; end if;
 entity:=split_part(p_action,'.',1); operation:=split_part(p_action,'.',2);
 tbl:=case entity when 'clients' then 'food_business_clients' when 'services' then 'food_business_services' when 'appointments' then 'food_business_appointments' when 'followups' then 'food_business_followups' when 'campaigns' then 'food_creator_campaigns' when 'links' then 'food_creator_links' end;
 required_module:=case when entity in ('clients','followups') then 'clients' when entity in ('services','appointments') then 'appointments' else 'creator' end;
 if tbl is null or operation not in ('list','save','archive','cancel','complete','status') then raise exception 'Operação inválida.' using errcode='22023'; end if;
 -- Serviços podem ser preparados enquanto a loja aguarda aprovação. Nenhuma
 -- publicação ou agenda operacional é liberada por essa configuração interna.
 if not (food_business_private.module_enabled(p_store,required_module) or entity='services' and food_business_private.granted(p_store,required_module)) then
   raise exception 'Módulo indisponível no plano ou no acesso atual.' using errcode='42501';
 end if;
 if operation='list' then
  limit_value:=least(greatest(coalesce((p_data->>'limit')::integer,100),1),200);
  if entity='followups' then
   select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (select * from public.food_business_followups f where f.store_id=p_store and (f.type='administrative' or food_business_private.module_enabled(p_store,f.type)) order by f.created_at desc,f.id limit limit_value) x;
  elsif entity='services' then
   select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (select * from public.food_business_services s where s.store_id=p_store and (s.kind='general' or food_business_private.granted(p_store,s.kind)) order by s.created_at desc,s.id limit limit_value) x;
  elsif entity='appointments' then
   select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (select a.* from public.food_business_appointments a join public.food_business_services s on s.id=a.service_id and s.store_id=a.store_id where a.store_id=p_store and (s.kind='general' or food_business_private.module_enabled(p_store,s.kind)) order by a.created_at desc,a.id limit limit_value) x;
  else
   execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from (select * from public.%I where store_id=$1 order by created_at desc,id limit $2) x',tbl) into result using p_store,limit_value;
  end if;
  return jsonb_build_object('items',result);
 end if;
 -- Serializa mutações por negócio: locks de agenda e concessões nunca podem
 -- mudar durante uma gravação que já teve autorização validada.
 perform pg_advisory_xact_lock(hashtextextended('food-business:'||p_store::text,0));
 if not food_business_private.can_manage(p_store) or not (food_business_private.module_enabled(p_store,required_module) or entity='services' and food_business_private.granted(p_store,required_module)) then raise exception 'Permissão ou módulo alterado durante a operação.' using errcode='42501'; end if;
 obj:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid());
 perform pg_advisory_xact_lock(hashtextextended('food-business-object:'||tbl||':'||obj::text,0));
 execute format('select to_jsonb(t) from public.%I t where id=$1 for update',tbl) into previous using obj;
 if previous is not null and (previous->>'store_id')::uuid<>p_store then raise exception 'Registro pertence a outro negócio.' using errcode='42501'; end if;
 if entity='followups' and previous->>'type' in ('training','nutrition') and not food_business_private.module_enabled(p_store,previous->>'type') then raise exception 'Tipo de acompanhamento não habilitado.' using errcode='42501'; end if;
 if entity='services' and previous->>'kind' in ('training','nutrition') and not food_business_private.granted(p_store,previous->>'kind') then raise exception 'Tipo do serviço não habilitado.' using errcode='42501'; end if;
 if entity='appointments' and previous is not null then
  select kind into kind_value from public.food_business_services where id=(previous->>'service_id')::uuid and store_id=p_store;
  if kind_value in ('training','nutrition') and not food_business_private.module_enabled(p_store,kind_value) then raise exception 'Tipo do serviço não habilitado.' using errcode='42501'; end if;
 end if;
 if operation<>'save' then
  if previous is null then raise exception 'Registro não encontrado.' using errcode='22023'; end if;
  if operation='archive' and entity in ('clients','services','links') then
   execute format('update public.%I set active=false,updated_at=now() where id=$1 returning to_jsonb(%I.*)',tbl,tbl) into result using obj;
  elsif entity='campaigns' and operation='archive' then
   update public.food_creator_campaigns set status='cancelled',updated_at=now() where id=obj returning to_jsonb(food_creator_campaigns.*) into result;
  elsif entity='appointments' and operation in ('cancel','complete') then
   if previous->>'status' in ('completed','cancelled') then raise exception 'Agendamento já finalizado.'; end if;
   update public.food_business_appointments set status=case operation when 'cancel' then 'cancelled' else 'completed' end,updated_at=now() where id=obj returning to_jsonb(food_business_appointments.*) into result;
  elsif entity='followups' and operation='status' then
   if p_data->>'status' not in ('pending','done','cancelled') then raise exception 'Status inválido.'; end if;
   update public.food_business_followups set status=p_data->>'status',updated_at=now() where id=obj returning to_jsonb(food_business_followups.*) into result;
  else raise exception 'Operação não disponível para este registro.'; end if;
  insert into public.food_business_audit(store_id,actor_id,action,details) values(p_store,auth.uid(),p_action,jsonb_build_object('id',obj));
  return jsonb_build_object('item',result);
 end if;
 allowed:=case entity
  when 'clients' then array['id','name','email','phone','active']
  when 'services' then array['id','name','description','kind','price_cents','duration_minutes','active']
  when 'appointments' then array['id','client_id','service_id','professional_id','starts_at','ends_at','status']
  when 'followups' then array['id','client_id','title','type','due_at','status']
  when 'campaigns' then array['id','title','starts_at','ends_at','status']
  else array['id','label','url','campaign_id','active'] end;
 if (p_data-allowed)<>'{}'::jsonb then raise exception 'Campo não aceito. Use somente dados administrativos.' using errcode='22023'; end if;
 body:=coalesce(previous,'{}'::jsonb)||p_data||jsonb_build_object('id',obj,'store_id',p_store,'updated_at',now(),'created_at',coalesce(previous->'created_at',to_jsonb(now())));
 if entity='clients' then
  insert into public.food_business_clients(id,store_id,name,email,phone,active)
  values(obj,p_store,trim(body->>'name'),trim(coalesce(body->>'email','')),trim(coalesce(body->>'phone','')),coalesce((body->>'active')::boolean,true))
  on conflict(id) do update set name=excluded.name,email=excluded.email,phone=excluded.phone,active=excluded.active,updated_at=now() where food_business_clients.store_id=excluded.store_id
  returning to_jsonb(food_business_clients.*) into result;
 elsif entity='services' then
  kind_value:=coalesce(body->>'kind','general');
  if kind_value in ('training','nutrition') and not food_business_private.granted(p_store,kind_value) then raise exception 'Tipo de acompanhamento não habilitado.' using errcode='42501'; end if;
  insert into public.food_business_services(id,store_id,name,description,kind,price_cents,duration_minutes,active)
  values(obj,p_store,trim(body->>'name'),coalesce(body->>'description',''),kind_value,coalesce((body->>'price_cents')::bigint,0),coalesce((body->>'duration_minutes')::integer,60),coalesce((body->>'active')::boolean,true))
  on conflict(id) do update set name=excluded.name,description=excluded.description,kind=excluded.kind,price_cents=excluded.price_cents,duration_minutes=excluded.duration_minutes,active=excluded.active,updated_at=now() where food_business_services.store_id=excluded.store_id
  returning to_jsonb(food_business_services.*) into result;
 elsif entity='appointments' then
  if previous->>'status' in ('completed','cancelled') then raise exception 'Agendamento finalizado preserva seu histórico.'; end if;
  client:=(body->>'client_id')::uuid; service:=(body->>'service_id')::uuid;
  professional:=coalesce(nullif(body->>'professional_id','')::uuid,auth.uid());
  starts:=(body->>'starts_at')::timestamptz;
  select coalesce(nullif(body->>'ends_at','')::timestamptz,starts+make_interval(mins=>duration_minutes)) into ends from public.food_business_services where id=service and store_id=p_store and active;
  select kind into kind_value from public.food_business_services where id=service and store_id=p_store;
  if kind_value in ('training','nutrition') and not food_business_private.module_enabled(p_store,kind_value) then raise exception 'Tipo do serviço não está habilitado.' using errcode='42501'; end if;
  if not exists(select 1 from public.food_business_clients where id=client and store_id=p_store and active) or ends is null then raise exception 'Cliente ou serviço indisponível neste negócio.'; end if;
  if not exists(select 1 from public.food_store_users u where u.store_id=p_store and u.user_id=professional and u.active and u.role in ('owner','admin','manager')) then raise exception 'Profissional não pertence a este negócio.' using errcode='42501'; end if;
  if starts is null or starts<=now() or ends<=starts or ends>starts+interval '24 hours' then raise exception 'Informe um intervalo futuro válido de até 24 horas.'; end if;
  state_value:=coalesce(body->>'status','scheduled');
  if state_value not in ('scheduled','confirmed') then raise exception 'Use as ações de conclusão ou cancelamento.'; end if;
  if exists(select 1 from public.food_business_appointments a where a.store_id=p_store and a.id<>obj and a.professional_id=professional and a.status in ('scheduled','confirmed') and a.starts_at<ends and a.ends_at>starts) then
   raise exception 'Este profissional já possui um agendamento no intervalo.' using errcode='23P01';
  end if;
  insert into public.food_business_appointments(id,store_id,client_id,service_id,professional_id,starts_at,ends_at,status)
  values(obj,p_store,client,service,professional,starts,ends,state_value)
  on conflict(id) do update set client_id=excluded.client_id,service_id=excluded.service_id,professional_id=excluded.professional_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at,status=excluded.status,updated_at=now() where food_business_appointments.store_id=excluded.store_id
  returning to_jsonb(food_business_appointments.*) into result;
 elsif entity='followups' then
  kind_value:=coalesce(body->>'type','administrative');
  if kind_value in ('training','nutrition') and not food_business_private.module_enabled(p_store,kind_value) then raise exception 'Tipo de acompanhamento não habilitado.' using errcode='42501'; end if;
  if not exists(select 1 from public.food_business_clients where id=(body->>'client_id')::uuid and store_id=p_store and active) then raise exception 'Cliente indisponível neste negócio.'; end if;
  insert into public.food_business_followups(id,store_id,client_id,title,type,due_at,status)
  values(obj,p_store,(body->>'client_id')::uuid,trim(body->>'title'),kind_value,(body->>'due_at')::timestamptz,coalesce(body->>'status','pending'))
  on conflict(id) do update set client_id=excluded.client_id,title=excluded.title,type=excluded.type,due_at=excluded.due_at,status=excluded.status,updated_at=now() where food_business_followups.store_id=excluded.store_id
  returning to_jsonb(food_business_followups.*) into result;
 elsif entity='campaigns' then
  insert into public.food_creator_campaigns(id,store_id,title,starts_at,ends_at,status)
  values(obj,p_store,trim(body->>'title'),nullif(body->>'starts_at','')::timestamptz,nullif(body->>'ends_at','')::timestamptz,coalesce(body->>'status','draft'))
  on conflict(id) do update set title=excluded.title,starts_at=excluded.starts_at,ends_at=excluded.ends_at,status=excluded.status,updated_at=now() where food_creator_campaigns.store_id=excluded.store_id
  returning to_jsonb(food_creator_campaigns.*) into result;
 else
  if nullif(body->>'campaign_id','') is not null and not exists(select 1 from public.food_creator_campaigns where id=(body->>'campaign_id')::uuid and store_id=p_store) then raise exception 'Campanha não pertence a este negócio.' using errcode='42501'; end if;
  insert into public.food_creator_links(id,store_id,label,url,campaign_id,active)
  values(obj,p_store,trim(body->>'label'),trim(body->>'url'),nullif(body->>'campaign_id','')::uuid,coalesce((body->>'active')::boolean,true))
  on conflict(id) do update set label=excluded.label,url=excluded.url,campaign_id=excluded.campaign_id,active=excluded.active,updated_at=now() where food_creator_links.store_id=excluded.store_id
  returning to_jsonb(food_creator_links.*) into result;
 end if;
 if result is null then raise exception 'Registro indisponível para este negócio.' using errcode='42501'; end if;
 insert into public.food_business_audit(store_id,actor_id,action,details) values(p_store,auth.uid(),p_action,jsonb_build_object('id',obj));
 return jsonb_build_object('item',result);
end;
$$;
create function public.food_business_operate(p_store uuid,p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select food_business_private.operate(p_store,p_action,p_data)$$;
revoke all on function food_business_private.operate(uuid,text,jsonb),public.food_business_operate(uuid,text,jsonb) from public,anon;
grant execute on function food_business_private.operate(uuid,text,jsonb),public.food_business_operate(uuid,text,jsonb) to authenticated;

-- Projeção comercial opt-in. Nenhum identificador de cliente/profissional,
-- agenda, concessão, dado clínico ou auditoria faz parte deste contrato.
create function food_business_private.public_offers(p_store uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare segment_value text; services jsonb:='[]'; links jsonb:='[]';
begin
 if not exists(select 1 from public.food_stores s where s.id=p_store and s.active and s.archived_at is null and s.approval_status='approved' and s.access_status='online') then
  return jsonb_build_object('services','[]'::jsonb,'links','[]'::jsonb,'primary_segment',null);
 end if;
 select primary_segment into segment_value from public.food_business_profiles where store_id=p_store;
 if food_business_private.module_enabled(p_store,'appointments') then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into services from (
   select id,name,description,price_cents,duration_minutes,kind from public.food_business_services s
   where s.store_id=p_store and s.active and (s.kind='general' or food_business_private.module_enabled(p_store,s.kind)) order by name,id limit 100
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
end;
$$;
create function public.food_business_public(p_store uuid) returns jsonb language sql stable security invoker set search_path='' as $$select food_business_private.public_offers(p_store)$$;
revoke all on function food_business_private.public_offers(uuid),public.food_business_public(uuid) from public;
grant usage on schema food_business_private to anon;
grant execute on function food_business_private.public_offers(uuid),public.food_business_public(uuid) to anon,authenticated;
-- Provisionamento de homologação: fechado por padrão, sem exposição ao browser.
create table food_business_private.test_provisioning_config (
 singleton boolean primary key default true check(singleton),enabled boolean not null default false,
 environment text not null default 'disabled' check(environment in ('disabled','development','staging')),
 check(not enabled or environment in ('development','staging'))
);
insert into food_business_private.test_provisioning_config(singleton) values(true);
create table food_business_private.test_businesses (
 store_id uuid primary key references public.food_stores(id),slug text not null unique,
 owner_id uuid not null references auth.users(id),fixture_version text not null default 'vendeweb-test-v1',created_at timestamptz not null default now()
);
alter table food_business_private.test_provisioning_config enable row level security;
alter table food_business_private.test_businesses enable row level security;
revoke all on food_business_private.test_provisioning_config,food_business_private.test_businesses from public,anon,authenticated,service_role;

create function food_business_private.test_provisioning_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso exclusivo do serviço.' using errcode='42501'; end if;
 select jsonb_build_object('enabled',enabled,'environment',environment,'schema_version',1) into result from food_business_private.test_provisioning_config where singleton;
 return coalesce(result,jsonb_build_object('enabled',false,'environment','disabled','schema_version',1));
end;
$$;
create function food_business_private.provision_test_business(p_owner uuid,p_slug text,p_name text,p_segment text,p_catalog jsonb,p_extra_modules text[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid; existing boolean:=false; plan uuid; category uuid; item jsonb; i integer:=0; m text; dep text; org uuid; marker food_business_private.test_businesses%rowtype;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or not exists(select 1 from food_business_private.test_provisioning_config where singleton and enabled and environment in ('development','staging')) then raise exception 'Provisionamento de teste desativado neste ambiente.' using errcode='42501'; end if;
 if p_slug is null or p_slug !~ '^test-vendeweb-[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug)>80 or length(trim(p_name)) not between 3 and 120 then raise exception 'Namespace ou nome de fixture inválido.'; end if;
 if not exists(select 1 from auth.users u where u.id=p_owner and u.raw_app_meta_data->>'vendeweb_test_fixture'='vendeweb-test-v1' and u.raw_app_meta_data->>'fixture_slug'=p_slug) then raise exception 'Dono precisa ser uma conta de homologação criada pelo Auth Admin.' using errcode='42501'; end if;
 if jsonb_typeof(p_catalog) is distinct from 'array' or jsonb_array_length(p_catalog)>30 then raise exception 'Catálogo de teste deve conter até 30 itens.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('food-test-fixture:'||p_slug,0));
 select id into target from public.food_stores where slug=p_slug;
 if target is not null then
  select * into marker from food_business_private.test_businesses where store_id=target;
  if marker.owner_id is distinct from p_owner or marker.slug is distinct from p_slug or marker.fixture_version is distinct from 'vendeweb-test-v1' then raise exception 'Slug já pertence a um negócio não compatível. Nenhum dado será sobrescrito.' using errcode='42501'; end if;
  if not exists(select 1 from public.food_business_profiles where store_id=target and primary_segment=p_segment) then raise exception 'Fixture existente usa outro segmento. Nenhum dado será sobrescrito.'; end if;
  return jsonb_build_object('store_id',target,'slug',p_slug,'existing',true,'fixture_version',marker.fixture_version);
 end if;
 select id into plan from public.food_plans where active order by case when code='demo' then 0 else 1 end,sort_order,id limit 1;
 if plan is null then raise exception 'Configure primeiro um plano de homologação.'; end if;
 insert into public.food_stores(slug,name,active,approval_status,access_status,visual_theme,delivery_enabled,pickup_enabled,confirmation_payment_enabled,pix_enabled)
 values(p_slug,trim(p_name),true,'approved','online',jsonb_build_object('businessSegment',p_segment),false,true,true,false) returning id into target;
 insert into public.food_store_users(store_id,user_id,role,active,must_change_password) values(target,p_owner,'owner',true,false);
 insert into public.food_store_subscriptions(store_id,plan_id,status,expires_at,billing_amount,notes) values(target,plan,'trial',now()+interval '14 days',0,'Fixture VendeWeb de homologação; sem cobrança');
 insert into food_business_private.test_businesses(store_id,slug,owner_id) values(target,p_slug,p_owner);
 perform food_business_private.set_segment(target,p_segment,false);
 foreach m in array coalesce(p_extra_modules,array[]::text[]) loop
  if m not in ('clients','appointments','creator','training','nutrition','florist','events','combos','rentals','custom') or m is null then raise exception 'Extra inválido na fixture.'; end if;
  foreach dep in array food_business_private.dependencies(m) loop
   if not food_business_private.granted(target,dep) then raise exception 'Dependência ausente na fixture: %',dep; end if;
  end loop;
  insert into public.food_business_entitlements(store_id,module_code,enabled,source,reason,expires_at)
  values(target,m,true,'exception','Fixture de homologação explicitamente autorizada',now()+interval '14 days')
  on conflict(store_id,module_code) do nothing;
 end loop;
 if exists(select 1 from unnest(coalesce(p_extra_modules,array[]::text[])) x where x in ('events','combos','rentals','custom')) then
  insert into public.food_module_organizations(name) values(trim(p_name)) returning id into org;
  insert into public.food_module_stores(store_id,organization_id) values(target,org);
  insert into public.food_module_settings(store_id,organization_id,events_enabled,combos_enabled,rentals_enabled,custom_enabled)
  values(target,org,'events'=any(p_extra_modules),'combos'=any(p_extra_modules),'rentals'=any(p_extra_modules),'custom'=any(p_extra_modules));
 end if;
 for item in select value from jsonb_array_elements(p_catalog) loop
  if jsonb_typeof(item) is distinct from 'object' or length(trim(coalesce(item->>'name',''))) not between 2 and 120 or (item->>'price')::numeric<0 or item->>'price' is null then raise exception 'Item de catálogo inválido.'; end if;
  select id into category from public.food_categories where store_id=target and name=coalesce(nullif(item->>'category',''),'Demonstração') limit 1;
  if category is null then
   insert into public.food_categories(store_id,name,slug) values(target,coalesce(nullif(item->>'category',''),'Demonstração'),'fixture-category-'||i::text) returning id into category;
  end if;
  insert into public.food_products(store_id,category_id,name,slug,description,price,active)
  values(target,category,trim(item->>'name'),'fixture-product-'||i::text,coalesce(item->>'description','Item fictício para homologação'),(item->>'price')::numeric,true);
  i:=i+1;
 end loop;
 insert into public.food_business_audit(store_id,action,details) values(target,'test_fixture_provisioned',jsonb_build_object('fixture_version','vendeweb-test-v1','extra_modules',p_extra_modules,'catalog_items',i));
 return jsonb_build_object('store_id',target,'slug',p_slug,'existing',false,'fixture_version','vendeweb-test-v1');
end;
$$;
create function public.food_test_provisioning_status() returns jsonb language sql stable security invoker set search_path='' as $$select food_business_private.test_provisioning_status()$$;
create function public.food_provision_test_business(p_owner uuid,p_slug text,p_name text,p_segment text,p_catalog jsonb,p_extra_modules text[] default array[]::text[]) returns jsonb language sql security invoker set search_path='' as $$select food_business_private.provision_test_business(p_owner,p_slug,p_name,p_segment,p_catalog,p_extra_modules)$$;
revoke all on function public.food_test_provisioning_status(),public.food_provision_test_business(uuid,text,text,text,jsonb,text[]),food_business_private.test_provisioning_status(),food_business_private.provision_test_business(uuid,text,text,text,jsonb,text[]) from public,anon,authenticated;
grant usage on schema food_business_private to service_role;
grant execute on function public.food_test_provisioning_status(),public.food_provision_test_business(uuid,text,text,text,jsonb,text[]),food_business_private.test_provisioning_status(),food_business_private.provision_test_business(uuid,text,text,text,jsonb,text[]) to service_role;
commit;
