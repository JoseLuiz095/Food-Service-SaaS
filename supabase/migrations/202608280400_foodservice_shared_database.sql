-- Food Service SaaS - banco compartilhado com FloriWeb
-- Objetivo: usar o MESMO projeto Supabase, sem reutilizar tabelas operacionais do FloriWeb.
-- Apenas auth.users e compartilhado. Dados e permissoes Food Service usam namespace food_*.

begin;

create extension if not exists pgcrypto;
create schema if not exists private;

-- Pre-flight: esta migration e exclusiva para o projeto Supabase que ja hospeda
-- o FloriWeb V3. Ela compartilha apenas auth.users e NAO grava dados Food nas
-- tabelas ou permissoes operacionais da floricultura.
do $$
begin
  if to_regclass('public.store_domains') is null then
    raise exception 'Pre-flight Food Service: public.store_domains nao existe. Banco FloriWeb esperado nao foi identificado.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Admin Master Food Service (separado do Master do FloriWeb)
-- -----------------------------------------------------------------------------
create table if not exists public.food_platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Helpers de seguranca
-- -----------------------------------------------------------------------------
create or replace function public.food_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.food_platform_admins pa
    where pa.user_id = auth.uid() and pa.active = true
  );
$$;

revoke all on function public.food_is_platform_admin() from public;
grant execute on function public.food_is_platform_admin() to authenticated;

-- -----------------------------------------------------------------------------
-- Nucleo SaaS Food Service
-- -----------------------------------------------------------------------------
create table if not exists public.food_stores (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (lower(slug) <> all (array['admin','admin-master','produto','carrinho','finalizar','pedido','404']::text[])),
  name text not null,
  description text,
  logo_url text,
  logo_storage_path text,
  cover_url text,
  cover_storage_path text,
  whatsapp text,
  instagram text,
  address text,
  city text,
  state varchar(2),
  zip_code text,
  delivery_enabled boolean not null default true,
  pickup_enabled boolean not null default true,
  pix_enabled boolean not null default false,
  pix_key_type text,
  pix_key text,
  pix_holder_name text,
  show_pix_before_confirmation boolean not null default false,
  pix_receipt_mode text not null default 'key' check (pix_receipt_mode in ('key','copy_paste')),
  pix_copy_paste text,
  card_payment_enabled boolean not null default false,
  confirmation_payment_enabled boolean not null default true,
  cash_payment_enabled boolean not null default false,
  payment_method_order jsonb not null default '["confirm","pix","card","cash"]'::jsonb check (jsonb_typeof(payment_method_order)='array'),
  minimum_order numeric(12,2) not null default 0 check (minimum_order >= 0),
  opening_hours jsonb not null default '{}'::jsonb,
  average_preparation_min integer not null default 30 check (average_preparation_min between 0 and 1440),
  average_preparation_max integer not null default 45 check (average_preparation_max between 0 and 1440),
  allow_scheduled_orders boolean not null default false,
  active boolean not null default true,
  access_status text not null default 'online' check (access_status in ('online','suspended')),
  owner_name text,
  owner_email text,
  suspended_at timestamptz,
  suspension_reason text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_stores_preparation_range_ck check (average_preparation_max >= average_preparation_min)
);

create table if not exists public.food_store_users (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('owner','admin','manager','attendant','kitchen','finance')),
  active boolean not null default true,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,user_id)
);

create or replace function public.food_is_store_member(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.food_is_platform_admin() or exists (
    select 1 from public.food_store_users su
    where su.store_id = p_store_id and su.user_id = auth.uid() and su.active = true
  );
$$;

create or replace function public.food_is_store_admin(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.food_is_platform_admin() or exists (
    select 1 from public.food_store_users su
    where su.store_id = p_store_id and su.user_id = auth.uid() and su.active = true
      and su.role in ('owner','admin','manager')
  );
$$;

revoke all on function public.food_is_store_member(uuid) from public;
revoke all on function public.food_is_store_admin(uuid) from public;
grant execute on function public.food_is_store_member(uuid) to authenticated;
grant execute on function public.food_is_store_admin(uuid) to authenticated;

create table if not exists public.food_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  product_limit integer check (product_limit is null or product_limit >= 0),
  image_limit_per_product integer check (image_limit_per_product is null or image_limit_per_product >= 0),
  custom_domain boolean not null default false,
  reports boolean not null default false,
  priority_support boolean not null default false,
  active boolean not null default true,
  monthly_price numeric(12,2) not null default 0,
  setup_price numeric(12,2) not null default 0,
  category_limit integer,
  addon_limit integer,
  admin_user_limit integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.food_features (
  code text primary key,
  name text not null,
  description text,
  scope text not null default 'food' check (scope in ('core','food','shared_future')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.food_plan_features (
  plan_id uuid not null references public.food_plans(id) on delete cascade,
  feature_code text not null references public.food_features(code) on delete cascade,
  enabled boolean not null default true,
  limit_value integer check (limit_value is null or limit_value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(plan_id,feature_code)
);

create table if not exists public.food_store_subscriptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  plan_id uuid not null references public.food_plans(id),
  status text not null default 'trial' check (status in ('trial','active','suspended','cancelled')),
  status_before_suspension text check (status_before_suspension is null or status_before_suspension in ('trial','active')),
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  billing_amount numeric(12,2),
  due_day integer check (due_day is null or due_day between 1 and 28),
  next_due_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists food_store_subscriptions_store_idx on public.food_store_subscriptions(store_id,status,started_at desc);

create table if not exists public.food_platform_settings (
  id smallint primary key default 1 check (id=1),
  demo_enabled boolean not null default true,
  demo_duration_days integer not null default 15 check (demo_duration_days between 1 and 365),
  demo_warning_days integer not null default 3 check (demo_warning_days between 1 and 90),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_platform_settings_warning_ck check (demo_warning_days < demo_duration_days)
);
insert into public.food_platform_settings(id) values(1) on conflict(id) do nothing;

create table if not exists public.food_store_domains (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  domain text not null unique,
  is_primary boolean not null default true,
  active boolean not null default true,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Protecao contra colisao de dominio entre as duas verticais no mesmo Supabase.
create or replace function public.food_guard_cross_vertical_domain()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if exists(select 1 from public.store_domains sd where lower(sd.domain)=lower(new.domain) and sd.active) then
    raise exception 'Este domínio já está vinculado ao FloriWeb.';
  end if;
  return new;
end;
$$;

drop trigger if exists food_store_domains_cross_vertical_guard on public.food_store_domains;
create trigger food_store_domains_cross_vertical_guard
before insert or update of domain,active on public.food_store_domains
for each row when (new.active) execute function public.food_guard_cross_vertical_domain();

-- Importante: nao instalamos trigger na tabela public.store_domains do FloriWeb.
-- Assim esta migration nao altera o comportamento do produto em producao.
-- O lado Food impede colisao com dominios Flori existentes; ao cadastrar um
-- novo dominio no FloriWeb, a equipe deve conferir tambem food_store_domains.

-- -----------------------------------------------------------------------------
-- Catalogo Food Service
-- -----------------------------------------------------------------------------
create table if not exists public.food_categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,slug),
  unique(id,store_id)
);

create table if not exists public.food_products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  category_id uuid not null,
  name text not null,
  slug text not null,
  description text not null default '',
  internal_code text,
  price numeric(12,2) not null default 0 check (price >= 0),
  promotional_price numeric(12,2) check (promotional_price is null or promotional_price >= 0),
  active boolean not null default true,
  featured boolean not null default false,
  made_to_order boolean not null default false,
  production_days integer not null default 0 check (production_days >= 0),
  stock_status text not null default 'available' check (stock_status in ('available','low_stock','unavailable')),
  availability_status text not null default 'available' check (availability_status in ('available','unavailable','sold_out')),
  track_stock boolean not null default false,
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  preparation_time_minutes integer not null default 0 check (preparation_time_minutes between 0 and 1440),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,slug),
  unique(id,store_id),
  constraint food_products_category_store_fk foreign key(category_id,store_id)
    references public.food_categories(id,store_id)
);

create table if not exists public.food_product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.food_products(id) on delete cascade,
  url text not null,
  storage_path text,
  alt_text text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

-- Compatibilidade interna; o modelo novo usa food_option_*.
create table if not exists public.food_product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.food_products(id) on delete cascade,
  name text not null,
  price_delta numeric(12,2) not null default 0,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.food_addons (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  name text not null,
  description text,
  price numeric(12,2) not null default 0 check (price >= 0),
  active boolean not null default true,
  image_url text,
  image_storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.food_product_addons (
  product_id uuid not null references public.food_products(id) on delete cascade,
  addon_id uuid not null references public.food_addons(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(product_id,addon_id)
);

create table if not exists public.food_option_groups (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  name text not null,
  description text,
  kind text not null default 'addon' check (kind in ('variant','choice','addon','removal')),
  min_choices integer not null default 0 check (min_choices >= 0),
  max_choices integer not null default 1 check (max_choices >= 1),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,store_id),
  constraint food_option_groups_min_max_ck check (min_choices <= max_choices),
  constraint food_option_groups_single_ck check (kind not in ('variant','choice') or max_choices=1)
);

create table if not exists public.food_option_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  store_id uuid not null,
  name text not null,
  description text,
  price_delta numeric(12,2) not null default 0,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_option_items_group_store_fk foreign key(group_id,store_id)
    references public.food_option_groups(id,store_id) on delete cascade
);

create table if not exists public.food_product_option_groups (
  store_id uuid not null,
  product_id uuid not null,
  option_group_id uuid not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key(product_id,option_group_id),
  constraint food_product_option_groups_product_fk foreign key(product_id,store_id)
    references public.food_products(id,store_id) on delete cascade,
  constraint food_product_option_groups_group_fk foreign key(option_group_id,store_id)
    references public.food_option_groups(id,store_id) on delete cascade
);

create table if not exists public.food_delivery_zones (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  name text not null,
  aliases text[] not null default '{}'::text[],
  city text not null,
  state varchar(2) not null,
  fee numeric(12,2) not null default 0 check (fee >= 0),
  active boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Pedidos
-- -----------------------------------------------------------------------------
create table if not exists public.food_orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated by default as identity,
  store_id uuid not null references public.food_stores(id) on delete restrict,
  public_request_id uuid,
  customer_name text not null,
  customer_phone text,
  customer_email text,
  delivery_type text not null check (delivery_type in ('delivery','pickup')),
  desired_date date,
  desired_period text,
  recipient_name text,
  recipient_phone text,
  delivery_address text,
  delivery_zip_code text,
  delivery_street text,
  delivery_number text,
  delivery_complement text,
  delivery_neighborhood text,
  delivery_zone_id uuid references public.food_delivery_zones(id),
  delivery_zone_name text,
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  delivery_city text,
  delivery_state varchar(2),
  reference_point text,
  card_message text,
  card_signature text,
  anonymous_sender boolean not null default false,
  notes text,
  payment_method text not null default 'confirm' check (payment_method in ('confirm','pix','card','cash')),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  status text not null default 'received' check (status in ('received','confirmed','preparing','ready','out_for_delivery','delivered','picked_up','cancelled')),
  whatsapp_clicked_at timestamptz,
  review_confirmed boolean not null default false,
  needs_change boolean not null default false,
  change_for numeric(12,2) check (change_for is null or change_for >= 0),
  change_amount numeric(12,2) check (change_amount is null or change_amount >= 0),
  scheduled_for timestamptz,
  preparation_estimate_minutes integer,
  source text not null default 'site' check (source in ('site','whatsapp','counter','phone','ifood','other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,public_request_id)
);

create table if not exists public.food_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.food_orders(id) on delete cascade,
  product_id uuid references public.food_products(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  variant_name text,
  variant_price_delta numeric(12,2) not null default 0,
  addons jsonb not null default '[]'::jsonb,
  item_total numeric(12,2) not null check (item_total >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.food_order_item_options (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.food_order_items(id) on delete cascade,
  option_group_id uuid,
  option_item_id uuid,
  group_name text not null,
  option_name text not null,
  option_kind text not null check (option_kind in ('variant','choice','addon','removal')),
  price_delta numeric(12,2) not null default 0,
  quantity integer not null default 1 check (quantity between 1 and 20),
  created_at timestamptz not null default now()
);

create table if not exists public.food_analytics_events (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.food_stores(id) on delete cascade,
  session_id uuid not null,
  event_name text not null check (event_name in ('storefront_view','product_view','add_to_cart','checkout_started','order_created','whatsapp_clicked')),
  product_id uuid references public.food_products(id) on delete set null,
  order_id uuid references public.food_orders(id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index if not exists food_products_store_idx on public.food_products(store_id,active,sort_order);
create index if not exists food_orders_store_idx on public.food_orders(store_id,created_at desc);
create index if not exists food_analytics_store_idx on public.food_analytics_events(store_id,occurred_at desc);
create index if not exists food_option_groups_store_idx on public.food_option_groups(store_id,active,sort_order);
create index if not exists food_option_items_group_idx on public.food_option_items(group_id,active,sort_order);

-- -----------------------------------------------------------------------------
-- Assinatura / disponibilidade
-- -----------------------------------------------------------------------------
create or replace function public.food_store_accessible(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.food_stores s
    where s.id = p_store_id
      and s.active = true
      and s.archived_at is null
      and s.access_status = 'online'
      and exists (
        select 1 from public.food_store_subscriptions ss
        where ss.store_id=s.id
          and ss.status in ('trial','active')
          and (ss.expires_at is null or ss.expires_at > now())
      )
  );
$$;
revoke all on function public.food_store_accessible(uuid) from public;
grant execute on function public.food_store_accessible(uuid) to anon, authenticated;

create or replace function public.food_store_is_accepting_orders(p_store_id uuid, p_at timestamptz default now())
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_hours jsonb;
  v_timezone text;
  v_local timestamp;
  v_time time;
  v_day integer;
  v_prev_day integer;
  v_today jsonb;
  v_prev jsonb;
  v_open time;
  v_close time;
begin
  if not public.food_store_accessible(p_store_id) then return false; end if;
  select opening_hours into v_hours from public.food_stores where id=p_store_id;
  if jsonb_typeof(v_hours->'days') <> 'array' or jsonb_array_length(v_hours->'days')=0 then return true; end if;
  v_timezone := coalesce(nullif(v_hours->>'timezone',''),'America/Sao_Paulo');
  begin v_local := p_at at time zone v_timezone; exception when others then v_local := p_at at time zone 'America/Sao_Paulo'; end;
  v_time := v_local::time;
  v_day := extract(dow from v_local)::integer;
  v_prev_day := (v_day + 6) % 7;

  select value into v_today from jsonb_array_elements(v_hours->'days') where (value->>'day')::integer=v_day limit 1;
  if coalesce((v_today->>'enabled')::boolean,false) then
    begin
      v_open := (v_today->>'open')::time; v_close := (v_today->>'close')::time;
      if v_close > v_open and v_time >= v_open and v_time < v_close then return true; end if;
      if v_close <= v_open and v_time >= v_open then return true; end if;
    exception when others then null; end;
  end if;

  select value into v_prev from jsonb_array_elements(v_hours->'days') where (value->>'day')::integer=v_prev_day limit 1;
  if coalesce((v_prev->>'enabled')::boolean,false) then
    begin
      v_open := (v_prev->>'open')::time; v_close := (v_prev->>'close')::time;
      if v_close <= v_open and v_time < v_close then return true; end if;
    exception when others then null; end;
  end if;
  return false;
end;
$$;
revoke all on function public.food_store_is_accepting_orders(uuid,timestamptz) from public;
grant execute on function public.food_store_is_accepting_orders(uuid,timestamptz) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Seed para nova loja Food Service
-- -----------------------------------------------------------------------------
create or replace function public.food_platform_seed_new_store(p_store_id uuid, p_city text, p_state text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.food_categories(store_id,name,slug,active,sort_order) values
    (p_store_id,'Lanches','lanches',true,10),
    (p_store_id,'Porções','porcoes',true,20),
    (p_store_id,'Bebidas','bebidas',true,30),
    (p_store_id,'Sobremesas','sobremesas',true,40)
  on conflict(store_id,slug) do nothing;

  if lower(trim(coalesce(p_city,'')))='linhares' and upper(trim(coalesce(p_state,'')))='ES' then
    insert into public.food_delivery_zones(store_id,name,aliases,city,state,fee,active,sort_order)
    select p_store_id,x.name,'{}'::text[],'Linhares','ES',0,false,x.ord*10
    from unnest(array['Centro','Aviso','Interlagos','Shell','Jardim Laguna']) with ordinality x(name,ord)
    where not exists(select 1 from public.food_delivery_zones dz where dz.store_id=p_store_id and lower(dz.name)=lower(x.name));
  end if;
end;
$$;
revoke all on function public.food_platform_seed_new_store(uuid,text,text) from public;
grant execute on function public.food_platform_seed_new_store(uuid,text,text) to service_role;

-- Suspensao automática de Demos Food Service expiradas. Não apaga nenhum dado.
create or replace function public.food_suspend_expired_trials()
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_count integer:=0;
begin
  with expired as (
    update public.food_store_subscriptions ss
    set status='suspended',status_before_suspension='trial',updated_at=now()
    where ss.status='trial' and ss.expires_at is not null and ss.expires_at<=now()
    returning ss.store_id
  )
  update public.food_stores s
  set access_status='suspended',suspended_at=coalesce(s.suspended_at,now()),suspension_reason='Demo expirada automaticamente',updated_at=now()
  where s.id in (select store_id from expired);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.food_suspend_expired_trials() from public,anon,authenticated;
grant execute on function public.food_suspend_expired_trials() to service_role;

-- Agenda de forma independente do cron do FloriWeb quando pg_cron estiver disponível.
do $$
declare v_jobid bigint;
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    for v_jobid in select jobid from cron.job where jobname='foodservice-demo-expiration-hourly' loop
      perform cron.unschedule(v_jobid);
    end loop;
    perform cron.schedule('foodservice-demo-expiration-hourly','15 * * * *','select public.food_suspend_expired_trials();');
  end if;
exception when others then
  raise notice 'pg_cron indisponível; execute food_suspend_expired_trials por agendamento externo. %',sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- Vitrine publica consolidada
-- -----------------------------------------------------------------------------
create or replace function public.food_get_public_storefront_v1(p_slug text default null, p_hostname text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_store public.food_stores%rowtype;
  v_store_id uuid;
begin
  if nullif(trim(coalesce(p_hostname,'')),'') is not null then
    select sd.store_id into v_store_id from public.food_store_domains sd
    where sd.active and lower(sd.domain)=lower(trim(p_hostname))
    order by sd.is_primary desc,sd.created_at asc limit 1;
  end if;
  if v_store_id is not null then
    select * into v_store from public.food_stores where id=v_store_id and archived_at is null limit 1;
  elsif nullif(trim(coalesce(p_slug,'')),'') is not null then
    select * into v_store from public.food_stores where lower(slug)=lower(trim(p_slug)) and archived_at is null limit 1;
  end if;
  if v_store.id is null then return jsonb_build_object('found',false); end if;
  if not public.food_store_accessible(v_store.id) then
    return jsonb_build_object('found',true,'status','unavailable','store',jsonb_build_object('id',v_store.id,'slug',v_store.slug,'name',v_store.name));
  end if;

  return jsonb_build_object(
    'found',true,'status','online',
    'store',to_jsonb(v_store) - 'owner_email' - 'owner_name' - 'suspension_reason',
    'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order,c.name) from public.food_categories c where c.store_id=v_store.id and c.active),'[]'::jsonb),
    'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.featured desc,p.sort_order,p.name)
      from public.food_products p join public.food_categories c on c.id=p.category_id and c.store_id=p.store_id and c.active
      where p.store_id=v_store.id and p.active and p.availability_status='available' and p.stock_status<>'unavailable' and (not p.track_stock or coalesce(p.stock_quantity,0)>0)),'[]'::jsonb),
    'product_images',coalesce((select jsonb_agg(to_jsonb(pi) order by pi.sort_order,pi.created_at)
      from public.food_product_images pi join public.food_products p on p.id=pi.product_id where p.store_id=v_store.id and p.active),'[]'::jsonb),
    'option_groups',coalesce((select jsonb_agg(to_jsonb(og) order by og.sort_order,og.name) from public.food_option_groups og where og.store_id=v_store.id and og.active),'[]'::jsonb),
    'option_items',coalesce((select jsonb_agg(to_jsonb(oi) order by oi.sort_order,oi.name) from public.food_option_items oi where oi.store_id=v_store.id and oi.active),'[]'::jsonb),
    'product_option_groups',coalesce((select jsonb_agg(to_jsonb(pog) order by pog.sort_order) from public.food_product_option_groups pog where pog.store_id=v_store.id),'[]'::jsonb),
    'product_variants','[]'::jsonb,'addons','[]'::jsonb,'product_addons','[]'::jsonb,
    'delivery_zones',coalesce((select jsonb_agg(to_jsonb(dz) order by dz.sort_order,dz.name) from public.food_delivery_zones dz where dz.store_id=v_store.id and dz.active),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.food_get_public_storefront_v1(text,text) from public;
grant execute on function public.food_get_public_storefront_v1(text,text) to anon, authenticated;

create or replace function public.food_resolve_storefront_status(p_slug text default null, p_hostname text default null)
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select public.food_get_public_storefront_v1(p_slug,p_hostname);
$$;
revoke all on function public.food_resolve_storefront_status(text,text) from public;
grant execute on function public.food_resolve_storefront_status(text,text) to anon,authenticated;

-- -----------------------------------------------------------------------------
-- Checkout / idempotencia / rate limit
-- -----------------------------------------------------------------------------
create table if not exists private.food_public_order_rate_limits (
  id bigint generated always as identity primary key,
  store_id uuid not null,
  fingerprint text not null,
  created_at timestamptz not null default now()
);
create index if not exists food_public_order_rate_limits_idx on private.food_public_order_rate_limits(store_id,fingerprint,created_at desc);

create or replace function public.food_enforce_public_order_rate_limit(p_store_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_headers jsonb := '{}'::jsonb;
  v_fingerprint text := '';
  v_count integer;
begin
  begin v_headers := coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb); exception when others then v_headers:='{}'::jsonb; end;
  v_fingerprint := lower(trim(coalesce(v_headers->>'x-foodservice-security-fingerprint','')));
  if length(v_fingerprint) < 20 then raise exception 'Fingerprint de segurança ausente.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || v_fingerprint,0));
  delete from private.food_public_order_rate_limits where created_at < now()-interval '24 hours';
  select count(*) into v_count from private.food_public_order_rate_limits
    where store_id=p_store_id and fingerprint=v_fingerprint and created_at > now()-interval '5 minutes';
  if v_count >= 8 then raise exception 'Muitas tentativas de pedido. Aguarde alguns minutos e tente novamente.'; end if;
  insert into private.food_public_order_rate_limits(store_id,fingerprint) values(p_store_id,v_fingerprint);
end;
$$;
revoke all on function public.food_enforce_public_order_rate_limit(uuid) from public,anon,authenticated;
grant execute on function public.food_enforce_public_order_rate_limit(uuid) to service_role;

create or replace function public.food_create_public_order(payload jsonb)
returns table(order_id uuid,order_number bigint,order_total numeric)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_store public.food_stores%rowtype;
  v_product public.food_products%rowtype;
  v_zone public.food_delivery_zones%rowtype;
  v_order_id uuid := gen_random_uuid();
  v_order_number bigint;
  v_request_id uuid;
  v_item jsonb; v_option jsonb; v_group record; v_option_record record;
  v_items_calculated jsonb := '[]'::jsonb; v_options_calculated jsonb;
  v_subtotal numeric(12,2):=0; v_delivery_fee numeric(12,2):=0; v_total numeric(12,2):=0;
  v_product_id uuid; v_group_id uuid; v_option_id uuid; v_quantity integer; v_option_quantity integer; v_choice_count integer;
  v_unit_price numeric(12,2); v_item_total numeric(12,2); v_payment_method text; v_review_confirmed boolean;
  v_needs_change boolean:=false; v_change_for numeric(12,2); v_change_amount numeric(12,2);
  v_scheduled_for timestamptz; v_preparation_extra integer:=0; v_order_item_id uuid;
begin
  if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'Pedido inválido.'; end if;
  begin v_request_id := (payload->>'public_request_id')::uuid; exception when others then raise exception 'Identificador de tentativa inválido.'; end;
  begin select * into v_store from public.food_stores where id=(payload->>'store_id')::uuid; exception when others then raise exception 'Loja inválida.'; end;
  if v_store.id is null or not public.food_store_accessible(v_store.id) then raise exception 'Loja indisponível.'; end if;
  perform public.food_enforce_public_order_rate_limit(v_store.id);

  select o.id,o.order_number,o.total into order_id,order_number,order_total from public.food_orders o
  where o.store_id=v_store.id and o.public_request_id=v_request_id limit 1;
  if order_id is not null then return next; return; end if;

  if length(trim(coalesce(payload->>'customer_name',''))) < 2 then raise exception 'Informe seu nome.'; end if;
  if length(regexp_replace(coalesce(payload->>'customer_phone',''),'\D','','g')) < 10 then raise exception 'Informe um telefone válido.'; end if;
  if payload->>'delivery_type' not in ('delivery','pickup') then raise exception 'Forma de recebimento inválida.'; end if;
  if payload->>'delivery_type'='delivery' and not v_store.delivery_enabled then raise exception 'Delivery indisponível.'; end if;
  if payload->>'delivery_type'='pickup' and not v_store.pickup_enabled then raise exception 'Retirada indisponível.'; end if;

  if not public.food_store_is_accepting_orders(v_store.id,now()) then
    if not v_store.allow_scheduled_orders then raise exception 'A loja está fechada para novos pedidos.'; end if;
    begin v_scheduled_for := (payload->>'scheduled_for')::timestamptz; exception when others then raise exception 'Informe data e horário para o pedido agendado.'; end;
    if v_scheduled_for <= now() then raise exception 'O agendamento precisa ser futuro.'; end if;
    if not public.food_store_is_accepting_orders(v_store.id,v_scheduled_for) then raise exception 'O horário agendado está fora do funcionamento da loja.'; end if;
  elsif nullif(payload->>'scheduled_for','') is not null then
    begin v_scheduled_for := (payload->>'scheduled_for')::timestamptz; exception when others then raise exception 'Agendamento inválido.'; end;
    if v_scheduled_for <= now() or not public.food_store_is_accepting_orders(v_store.id,v_scheduled_for) then raise exception 'Horário agendado inválido.'; end if;
  end if;

  v_payment_method := coalesce(nullif(payload->>'payment_method',''),'confirm');
  if v_payment_method not in ('confirm','pix','card','cash') then raise exception 'Forma de pagamento inválida.'; end if;
  if v_payment_method='pix' and not v_store.pix_enabled then raise exception 'PIX indisponível.'; end if;
  if v_payment_method='card' and not v_store.card_payment_enabled then raise exception 'Cartão indisponível.'; end if;
  if v_payment_method='cash' and not v_store.cash_payment_enabled then raise exception 'Dinheiro indisponível.'; end if;
  if v_payment_method='confirm' and not v_store.confirmation_payment_enabled then raise exception 'Pagamento a combinar indisponível.'; end if;

  if payload->>'delivery_type'='delivery' then
    begin select * into v_zone from public.food_delivery_zones where id=(payload->>'delivery_zone_id')::uuid and store_id=v_store.id and active; exception when others then raise exception 'Bairro de entrega inválido.'; end;
    if v_zone.id is null then raise exception 'Bairro de entrega indisponível.'; end if;
    v_delivery_fee := v_zone.fee;
  end if;

  if jsonb_typeof(payload->'items')<>'array' or jsonb_array_length(payload->'items')=0 then raise exception 'Carrinho vazio.'; end if;
  if jsonb_array_length(payload->'items')>50 then raise exception 'O pedido excede o limite de itens.'; end if;

  for v_item in select * from jsonb_array_elements(payload->'items') loop
    begin v_product_id := (v_item->>'product_id')::uuid; exception when others then raise exception 'Produto inválido.'; end;
    select * into v_product from public.food_products p
      where p.id=v_product_id and p.store_id=v_store.id and p.active and p.availability_status='available'
        and p.stock_status<>'unavailable' and (not p.track_stock or coalesce(p.stock_quantity,0)>0)
        and exists(select 1 from public.food_categories c where c.id=p.category_id and c.store_id=p.store_id and c.active);
    if v_product.id is null then raise exception 'Um dos produtos não está mais disponível.'; end if;
    begin v_quantity := (v_item->>'quantity')::integer; exception when others then raise exception 'Quantidade inválida.'; end;
    if v_quantity<1 or v_quantity>99 then raise exception 'Quantidade inválida.'; end if;
    if v_product.track_stock and v_quantity>coalesce(v_product.stock_quantity,0) then raise exception 'Estoque insuficiente.'; end if;

    v_unit_price := coalesce(v_product.promotional_price,v_product.price);
    v_options_calculated := '[]'::jsonb;

    for v_group in
      select og.* from public.food_option_groups og join public.food_product_option_groups pog on pog.option_group_id=og.id and pog.store_id=og.store_id
      where pog.product_id=v_product.id and pog.store_id=v_store.id and og.active order by pog.sort_order,og.sort_order
    loop
      select count(distinct(entry->>'item_id'))::integer into v_choice_count
      from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb)) entry where entry->>'group_id'=v_group.id::text;
      if v_choice_count<v_group.min_choices then raise exception 'Faltam escolhas obrigatórias em %.',v_group.name; end if;
      if v_choice_count>v_group.max_choices then raise exception 'Quantidade de escolhas excedida em %.',v_group.name; end if;
    end loop;

    for v_option in select * from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb)) loop
      begin v_group_id:=(v_option->>'group_id')::uuid; v_option_id:=(v_option->>'item_id')::uuid; v_option_quantity:=coalesce((v_option->>'quantity')::integer,1); exception when others then raise exception 'Opção inválida.'; end;
      if v_option_quantity<1 or v_option_quantity>20 then raise exception 'Quantidade da opção inválida.'; end if;
      select og.id group_id,og.name group_name,og.kind,oi.id item_id,oi.name item_name,oi.price_delta into v_option_record
      from public.food_option_groups og
      join public.food_product_option_groups pog on pog.option_group_id=og.id and pog.store_id=og.store_id
      join public.food_option_items oi on oi.group_id=og.id and oi.store_id=og.store_id
      where pog.product_id=v_product.id and pog.store_id=v_store.id and og.id=v_group_id and oi.id=v_option_id and og.active and oi.active;
      if not found then raise exception 'Uma das opções não está disponível.'; end if;
      if v_option_record.kind<>'addon' and v_option_quantity<>1 then raise exception 'Quantidade inválida para a opção.'; end if;
      if v_option_record.kind='removal' and v_option_record.price_delta<>0 then raise exception 'Remoção com preço inválido.'; end if;
      if exists(select 1 from jsonb_array_elements(v_options_calculated) x where x->>'item_id'=v_option_record.item_id::text) then raise exception 'Opção duplicada.'; end if;
      v_unit_price := v_unit_price + v_option_record.price_delta*v_option_quantity;
      v_options_calculated := v_options_calculated || jsonb_build_array(jsonb_build_object('group_id',v_option_record.group_id,'group_name',v_option_record.group_name,'kind',v_option_record.kind,'item_id',v_option_record.item_id,'item_name',v_option_record.item_name,'price_delta',v_option_record.price_delta,'quantity',v_option_quantity));
    end loop;

    if v_unit_price<0 then raise exception 'Preço final inválido.'; end if;
    v_item_total := round(v_unit_price*v_quantity,2);
    v_subtotal := v_subtotal + v_item_total;
    v_preparation_extra := greatest(v_preparation_extra,coalesce(v_product.preparation_time_minutes,0));
    v_items_calculated := v_items_calculated || jsonb_build_array(jsonb_build_object('product_id',v_product.id,'product_name',v_product.name,'quantity',v_quantity,'unit_price',round(v_unit_price,2),'options',v_options_calculated,'item_total',v_item_total));
  end loop;

  v_subtotal:=round(v_subtotal,2);
  if v_subtotal<v_store.minimum_order then raise exception 'Pedido abaixo do mínimo da loja.'; end if;
  v_total:=round(v_subtotal+v_delivery_fee,2);
  begin v_review_confirmed:=coalesce((payload->>'review_confirmed')::boolean,false); exception when others then v_review_confirmed:=false; end;
  begin v_needs_change:=coalesce((payload->>'needs_change')::boolean,false); exception when others then v_needs_change:=false; end;
  if v_payment_method<>'cash' then v_needs_change:=false; end if;
  if v_needs_change then
    begin v_change_for:=(payload->>'change_for')::numeric; exception when others then raise exception 'Valor para troco inválido.'; end;
    if v_change_for<=v_total then raise exception 'O valor para troco deve ser maior que o total.'; end if;
    v_change_amount:=round(v_change_for-v_total,2);
  end if;

  insert into public.food_orders(
    id,store_id,public_request_id,customer_name,customer_phone,customer_email,delivery_type,desired_date,
    delivery_address,delivery_zip_code,delivery_street,delivery_number,delivery_complement,delivery_neighborhood,delivery_zone_id,delivery_zone_name,delivery_fee,delivery_city,delivery_state,reference_point,
    notes,payment_method,review_confirmed,subtotal,total,status,needs_change,change_for,change_amount,scheduled_for,preparation_estimate_minutes,source
  ) values(
    v_order_id,v_store.id,v_request_id,trim(payload->>'customer_name'),trim(payload->>'customer_phone'),nullif(trim(payload->>'customer_email'),''),payload->>'delivery_type',coalesce(v_scheduled_for::date,current_date),
    case when payload->>'delivery_type'='delivery' then nullif(trim(payload->>'delivery_address'),'') end,
    case when payload->>'delivery_type'='delivery' then nullif(trim(payload->>'delivery_zip_code'),'') end,
    case when payload->>'delivery_type'='delivery' then nullif(trim(payload->>'delivery_street'),'') end,
    case when payload->>'delivery_type'='delivery' then nullif(trim(payload->>'delivery_number'),'') end,
    case when payload->>'delivery_type'='delivery' then nullif(trim(payload->>'delivery_complement'),'') end,
    case when payload->>'delivery_type'='delivery' then v_zone.name end,
    case when payload->>'delivery_type'='delivery' then v_zone.id end,
    case when payload->>'delivery_type'='delivery' then v_zone.name end,
    v_delivery_fee,
    case when payload->>'delivery_type'='delivery' then v_zone.city end,
    case when payload->>'delivery_type'='delivery' then upper(v_zone.state) end,
    case when payload->>'delivery_type'='delivery' then nullif(trim(payload->>'reference_point'),'') end,
    nullif(trim(payload->>'notes'),''),v_payment_method,v_review_confirmed,v_subtotal,v_total,'received',v_needs_change,v_change_for,v_change_amount,v_scheduled_for,greatest(v_store.average_preparation_min,v_store.average_preparation_max)+v_preparation_extra,'site'
  ) returning food_orders.order_number into v_order_number;

  for v_item in select * from jsonb_array_elements(v_items_calculated) loop
    insert into public.food_order_items(order_id,product_id,product_name,quantity,unit_price,variant_name,variant_price_delta,addons,item_total)
    values(v_order_id,(v_item->>'product_id')::uuid,v_item->>'product_name',(v_item->>'quantity')::integer,(v_item->>'unit_price')::numeric,null,0,coalesce(v_item->'options','[]'::jsonb),(v_item->>'item_total')::numeric)
    returning id into v_order_item_id;
    for v_option in select * from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb)) loop
      insert into public.food_order_item_options(order_item_id,option_group_id,option_item_id,group_name,option_name,option_kind,price_delta,quantity)
      values(v_order_item_id,(v_option->>'group_id')::uuid,(v_option->>'item_id')::uuid,v_option->>'group_name',v_option->>'item_name',v_option->>'kind',(v_option->>'price_delta')::numeric,(v_option->>'quantity')::integer);
    end loop;
  end loop;

  return query select v_order_id,v_order_number,v_total;
end;
$$;
revoke all on function public.food_create_public_order(jsonb) from public,anon,authenticated;
grant execute on function public.food_create_public_order(jsonb) to service_role;

create or replace function public.food_mark_public_order_whatsapp_clicked(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  update public.food_orders set whatsapp_clicked_at=coalesce(whatsapp_clicked_at,now()),updated_at=now() where id=p_order_id;
end;
$$;
revoke all on function public.food_mark_public_order_whatsapp_clicked(uuid) from public;
grant execute on function public.food_mark_public_order_whatsapp_clicked(uuid) to anon,authenticated,service_role;

-- -----------------------------------------------------------------------------
-- Analytics sem PII
-- -----------------------------------------------------------------------------
create or replace function public.food_track_public_event_v1(p_store_id uuid,p_session_id uuid,p_event_name text,p_product_id uuid default null)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if p_event_name not in ('storefront_view','product_view','add_to_cart','checkout_started','order_created','whatsapp_clicked') then raise exception 'Evento inválido.'; end if;
  if not public.food_store_accessible(p_store_id) then return; end if;
  if p_product_id is not null and not exists(select 1 from public.food_products where id=p_product_id and store_id=p_store_id) then return; end if;
  insert into public.food_analytics_events(store_id,session_id,event_name,product_id) values(p_store_id,p_session_id,p_event_name,p_product_id);
end;
$$;
revoke all on function public.food_track_public_event_v1(uuid,uuid,text,uuid) from public;
grant execute on function public.food_track_public_event_v1(uuid,uuid,text,uuid) to anon,authenticated;

create or replace function public.food_get_store_analytics_v1(p_store_id uuid,p_from timestamptz default null,p_to timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare v_from timestamptz:=coalesce(p_from,now()-interval '30 days'); v_to timestamptz:=coalesce(p_to,now());
begin
  if not public.food_is_store_admin(p_store_id) then raise exception 'Acesso negado.'; end if;
  return jsonb_build_object(
    'from',v_from,'to',v_to,
    'storefrontSessions',(select count(distinct session_id) from public.food_analytics_events where store_id=p_store_id and event_name='storefront_view' and occurred_at between v_from and v_to),
    'productViews',(select count(*) from public.food_analytics_events where store_id=p_store_id and event_name='product_view' and occurred_at between v_from and v_to),
    'productViewSessions',(select count(distinct session_id) from public.food_analytics_events where store_id=p_store_id and event_name='product_view' and occurred_at between v_from and v_to),
    'addToCartSessions',(select count(distinct session_id) from public.food_analytics_events where store_id=p_store_id and event_name='add_to_cart' and occurred_at between v_from and v_to),
    'checkoutSessions',(select count(distinct session_id) from public.food_analytics_events where store_id=p_store_id and event_name='checkout_started' and occurred_at between v_from and v_to),
    'orderSessions',(select count(distinct session_id) from public.food_analytics_events where store_id=p_store_id and event_name='order_created' and occurred_at between v_from and v_to),
    'orders',(select count(*) from public.food_orders where store_id=p_store_id and status<>'cancelled' and created_at between v_from and v_to),
    'whatsappClicks',(select count(*) from public.food_analytics_events where store_id=p_store_id and event_name='whatsapp_clicked' and occurred_at between v_from and v_to),
    'revenue',(select coalesce(sum(total),0) from public.food_orders where store_id=p_store_id and status<>'cancelled' and created_at between v_from and v_to),
    'averageTicket',(select coalesce(avg(total),0) from public.food_orders where store_id=p_store_id and status<>'cancelled' and created_at between v_from and v_to),
    'conversionRate',0,'cartAbandonmentRate',0,'checkoutAbandonmentRate',0,'whatsappRate',0,
    'topProducts','[]'::jsonb,'viewedNotSold','[]'::jsonb
  );
end;
$$;
revoke all on function public.food_get_store_analytics_v1(uuid,timestamptz,timestamptz) from public;
grant execute on function public.food_get_store_analytics_v1(uuid,timestamptz,timestamptz) to authenticated;

create or replace function public.food_platform_system_check()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_settings public.food_platform_settings%rowtype;
begin
  if not public.food_is_platform_admin() then raise exception 'Acesso negado.'; end if;
  select * into v_settings from public.food_platform_settings where id=1;
  return jsonb_build_object(
    'version','foodservice-shared-0.2.0',
    'platformAdmin',true,
    'stores',(select count(*) from public.food_stores),
    'storesOnline',(select count(*) from public.food_stores where active and access_status='online'),
    'storesSuspended',(select count(*) from public.food_stores where access_status='suspended'),
    'plans',(select count(*) from public.food_plans where active),
    'subscriptions',(select count(*) from public.food_store_subscriptions),
    'users',(select count(*) from public.food_store_users where active),
    'products',(select count(*) from public.food_products),
    'orders',(select count(*) from public.food_orders),
    'deliveryZones',(select count(*) from public.food_delivery_zones),
    'domains',(select count(*) from public.food_store_domains where active),
    'analyticsEvents',(select count(*) from public.food_analytics_events),
    'analyticsReady',true,
    'demoEnabled',coalesce(v_settings.demo_enabled,true),
    'demoTrials',(select count(*) from public.food_store_subscriptions where status='trial' and (expires_at is null or expires_at>now())),
    'demoTrialsExpiringSoon',(select count(*) from public.food_store_subscriptions where status='trial' and expires_at between now() and now()+make_interval(days=>coalesce(v_settings.demo_warning_days,3))),
    'demoDurationDays',coalesce(v_settings.demo_duration_days,15),
    'demoWarningDays',coalesce(v_settings.demo_warning_days,3),
    'demoCronScheduled',false,
    'demoCronExists',false,
    'demoCronActive',false,
    'demoCronSchedule',null
  );
end;
$$;
revoke all on function public.food_platform_system_check() from public;
grant execute on function public.food_platform_system_check() to authenticated;

-- -----------------------------------------------------------------------------
-- RLS: Food Service completamente separado das tabelas FloriWeb
-- -----------------------------------------------------------------------------
alter table public.food_platform_admins enable row level security;
alter table public.food_stores enable row level security;
alter table public.food_store_users enable row level security;
alter table public.food_plans enable row level security;
alter table public.food_features enable row level security;
alter table public.food_plan_features enable row level security;
alter table public.food_store_subscriptions enable row level security;
alter table public.food_platform_settings enable row level security;
alter table public.food_store_domains enable row level security;
alter table public.food_categories enable row level security;
alter table public.food_products enable row level security;
alter table public.food_product_images enable row level security;
alter table public.food_product_variants enable row level security;
alter table public.food_addons enable row level security;
alter table public.food_product_addons enable row level security;
alter table public.food_option_groups enable row level security;
alter table public.food_option_items enable row level security;
alter table public.food_product_option_groups enable row level security;
alter table public.food_delivery_zones enable row level security;
alter table public.food_orders enable row level security;
alter table public.food_order_items enable row level security;
alter table public.food_order_item_options enable row level security;
alter table public.food_analytics_events enable row level security;

create policy food_platform_admins_self_select on public.food_platform_admins for select to authenticated using (user_id=auth.uid());
create policy food_platform_admins_master_all on public.food_platform_admins for all to authenticated using (public.food_is_platform_admin()) with check (public.food_is_platform_admin());

create policy food_stores_member_select on public.food_stores for select to authenticated using (public.food_is_store_member(id));
create policy food_stores_admin_update on public.food_stores for update to authenticated using (public.food_is_store_admin(id)) with check (public.food_is_store_admin(id));
create policy food_stores_master_all on public.food_stores for all to authenticated using (public.food_is_platform_admin()) with check (public.food_is_platform_admin());

create policy food_store_users_self_select on public.food_store_users for select to authenticated using (user_id=auth.uid() or public.food_is_store_admin(store_id) or public.food_is_platform_admin());
create policy food_store_users_admin_all on public.food_store_users for all to authenticated using (public.food_is_store_admin(store_id)) with check (public.food_is_store_admin(store_id));

create policy food_plans_read on public.food_plans for select to authenticated using (active or public.food_is_platform_admin());
create policy food_plans_master_all on public.food_plans for all to authenticated using (public.food_is_platform_admin()) with check (public.food_is_platform_admin());
create policy food_features_read on public.food_features for select to authenticated using (active or public.food_is_platform_admin());
create policy food_features_master_all on public.food_features for all to authenticated using (public.food_is_platform_admin()) with check (public.food_is_platform_admin());
create policy food_plan_features_read on public.food_plan_features for select to authenticated using (true);
create policy food_plan_features_master_all on public.food_plan_features for all to authenticated using (public.food_is_platform_admin()) with check (public.food_is_platform_admin());
create policy food_subscriptions_member_read on public.food_store_subscriptions for select to authenticated using (public.food_is_store_member(store_id));
create policy food_subscriptions_master_all on public.food_store_subscriptions for all to authenticated using (public.food_is_platform_admin()) with check (public.food_is_platform_admin());
create policy food_platform_settings_master_all on public.food_platform_settings for all to authenticated using (public.food_is_platform_admin()) with check (public.food_is_platform_admin());
create policy food_domains_admin_all on public.food_store_domains for all to authenticated using (public.food_is_store_admin(store_id)) with check (public.food_is_store_admin(store_id));

create policy food_categories_admin_all on public.food_categories for all to authenticated using (public.food_is_store_admin(store_id)) with check (public.food_is_store_admin(store_id));
create policy food_products_admin_all on public.food_products for all to authenticated using (public.food_is_store_admin(store_id)) with check (public.food_is_store_admin(store_id));
create policy food_product_images_admin_all on public.food_product_images for all to authenticated using (exists(select 1 from public.food_products p where p.id=product_id and public.food_is_store_admin(p.store_id))) with check (exists(select 1 from public.food_products p where p.id=product_id and public.food_is_store_admin(p.store_id)));
create policy food_product_variants_admin_all on public.food_product_variants for all to authenticated using (exists(select 1 from public.food_products p where p.id=product_id and public.food_is_store_admin(p.store_id))) with check (exists(select 1 from public.food_products p where p.id=product_id and public.food_is_store_admin(p.store_id)));
create policy food_addons_admin_all on public.food_addons for all to authenticated using (public.food_is_store_admin(store_id)) with check (public.food_is_store_admin(store_id));
create policy food_product_addons_admin_all on public.food_product_addons for all to authenticated using (exists(select 1 from public.food_products p where p.id=product_id and public.food_is_store_admin(p.store_id))) with check (exists(select 1 from public.food_products p where p.id=product_id and public.food_is_store_admin(p.store_id)));
create policy food_option_groups_admin_all on public.food_option_groups for all to authenticated using (public.food_is_store_admin(store_id)) with check (public.food_is_store_admin(store_id));
create policy food_option_items_admin_all on public.food_option_items for all to authenticated using (public.food_is_store_admin(store_id)) with check (public.food_is_store_admin(store_id));
create policy food_product_option_groups_admin_all on public.food_product_option_groups for all to authenticated using (public.food_is_store_admin(store_id)) with check (public.food_is_store_admin(store_id));
create policy food_delivery_zones_admin_all on public.food_delivery_zones for all to authenticated using (public.food_is_store_admin(store_id)) with check (public.food_is_store_admin(store_id));
create policy food_orders_admin_all on public.food_orders for all to authenticated using (public.food_is_store_admin(store_id)) with check (public.food_is_store_admin(store_id));
create policy food_order_items_admin_read on public.food_order_items for select to authenticated using (exists(select 1 from public.food_orders o where o.id=order_id and public.food_is_store_admin(o.store_id)));
create policy food_order_item_options_admin_read on public.food_order_item_options for select to authenticated using (exists(select 1 from public.food_order_items oi join public.food_orders o on o.id=oi.order_id where oi.id=order_item_id and public.food_is_store_admin(o.store_id)));
create policy food_analytics_admin_read on public.food_analytics_events for select to authenticated using (public.food_is_store_admin(store_id));

-- -----------------------------------------------------------------------------
-- Storage exclusivo Food Service
-- -----------------------------------------------------------------------------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('food-product-images','food-product-images',true,5242880,array['image/jpeg','image/png','image/webp','image/avif']),
('food-store-assets','food-store-assets',true,5242880,array['image/jpeg','image/png','image/webp','image/avif'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Caminho esperado: stores/<store_uuid>/...
drop policy if exists food_product_images_storage_insert on storage.objects;
drop policy if exists food_product_images_storage_update on storage.objects;
drop policy if exists food_product_images_storage_delete on storage.objects;
create policy food_product_images_storage_insert on storage.objects for insert to authenticated
with check (bucket_id='food-product-images' and public.food_is_store_admin((storage.foldername(name))[2]::uuid));
create policy food_product_images_storage_update on storage.objects for update to authenticated
using (bucket_id='food-product-images' and public.food_is_store_admin((storage.foldername(name))[2]::uuid))
with check (bucket_id='food-product-images' and public.food_is_store_admin((storage.foldername(name))[2]::uuid));
create policy food_product_images_storage_delete on storage.objects for delete to authenticated
using (bucket_id='food-product-images' and public.food_is_store_admin((storage.foldername(name))[2]::uuid));

drop policy if exists food_store_assets_storage_insert on storage.objects;
drop policy if exists food_store_assets_storage_update on storage.objects;
drop policy if exists food_store_assets_storage_delete on storage.objects;
create policy food_store_assets_storage_insert on storage.objects for insert to authenticated
with check (bucket_id='food-store-assets' and public.food_is_store_admin((storage.foldername(name))[2]::uuid));
create policy food_store_assets_storage_update on storage.objects for update to authenticated
using (bucket_id='food-store-assets' and public.food_is_store_admin((storage.foldername(name))[2]::uuid))
with check (bucket_id='food-store-assets' and public.food_is_store_admin((storage.foldername(name))[2]::uuid));
create policy food_store_assets_storage_delete on storage.objects for delete to authenticated
using (bucket_id='food-store-assets' and public.food_is_store_admin((storage.foldername(name))[2]::uuid));

-- -----------------------------------------------------------------------------
-- Planos e features iniciais
-- -----------------------------------------------------------------------------
insert into public.food_plans(code,name,product_limit,image_limit_per_product,custom_domain,reports,priority_support,monthly_price,setup_price,category_limit,addon_limit,admin_user_limit,sort_order,active) values
('DEMO','Demo',15,3,false,false,false,0,0,5,10,1,0,true),
('BASIC','Essencial',30,4,false,false,false,79.90,0,10,30,2,10,true),
('PRO','Profissional',100,8,false,true,true,119.90,0,30,100,5,20,true),
('PREMIUM','Premium',null,12,true,true,true,179.90,0,null,null,10,30,true)
on conflict(code) do update set name=excluded.name,active=true;

insert into public.food_features(code,name,description,scope) values
('catalog','Cardápio','Categorias, produtos e imagens.','food'),
('orders','Pedidos','Registro e acompanhamento operacional.','food'),
('whatsapp','WhatsApp','Abertura opcional após persistir o pedido.','food'),
('delivery','Delivery e retirada','Zonas, taxas e retirada.','food'),
('analytics','Analytics','Indicadores comerciais sem PII.','core'),
('coupons','Cupons','Cupons e regras promocionais.','shared_future'),
('combos','Combos','Combos configuráveis.','food'),
('pizza','Pizza avançada','Sabores, meio a meio, massa e borda.','food'),
('custom_domain','Domínio próprio','Domínio personalizado.','core'),
('finance','Financeiro','Receitas, despesas e visão gerencial.','shared_future'),
('multi_user','Usuários adicionais','Perfis adicionais por estabelecimento.','core')
on conflict(code) do update set name=excluded.name,description=excluded.description,scope=excluded.scope,active=true;

commit;
