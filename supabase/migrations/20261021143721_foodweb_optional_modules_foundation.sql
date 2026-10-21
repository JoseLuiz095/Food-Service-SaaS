-- shared_future: opt-in. Não modifica tabelas, funções ou gatilhos da venda normal.
begin;
create schema if not exists private;

create table public.food_module_organizations (
  id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 120),
  created_at timestamptz not null default now()
);
create table public.food_module_stores (
  store_id uuid primary key references public.food_stores(id),
  organization_id uuid not null references public.food_module_organizations(id),
  unique(organization_id,store_id)
);
create table public.food_module_settings (
  store_id uuid primary key, organization_id uuid not null,
  events_enabled boolean not null default false, combos_enabled boolean not null default false,
  rentals_enabled boolean not null default false, custom_enabled boolean not null default false,
  max_quantity integer not null default 100 check(max_quantity between 1 and 100000),
  lead_hours integer not null default 24 check(lead_hours between 0 and 87600),
  urgency_bps integer not null default 0 check(urgency_bps between 0 and 10000),
  foreign key(organization_id,store_id) references public.food_module_stores(organization_id,store_id)
);
create table public.food_module_offers (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, store_id uuid not null,
  name text not null check(length(name) between 2 and 150),
  kind text not null check(kind in ('product','service','printing3d','custom','rental')),
  price_cents bigint not null check(price_cents between 0 and 100000000),
  active boolean not null default true, published boolean not null default false,
  ready_now boolean not null default false, max_quantity integer not null check(max_quantity between 1 and 100000),
  lead_hours integer not null check(lead_hours between 0 and 87600),
  stock_quantity integer check(stock_quantity >= 0), reserved_quantity integer not null default 0,
  created_at timestamptz not null default now(),
  check(reserved_quantity >= 0 and (stock_quantity is null or reserved_quantity <= stock_quantity)),
  foreign key(organization_id,store_id) references public.food_module_stores(organization_id,store_id),
  unique(id,organization_id,store_id)
);
create index food_module_offers_store_idx on public.food_module_offers(store_id,created_at desc);

create table public.food_combos (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, seller_store_id uuid not null,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  foreign key(organization_id,seller_store_id) references public.food_module_stores(organization_id,store_id),
  unique(id,organization_id,seller_store_id)
);
create table public.food_combo_versions (
  id uuid primary key default gen_random_uuid(), combo_id uuid not null, organization_id uuid not null,
  seller_store_id uuid not null, version integer not null check(version > 0),
  name text not null check(length(name) between 2 and 150), published boolean not null default false,
  created_at timestamptz not null default now(), unique(combo_id,version),
  foreign key(combo_id,organization_id,seller_store_id) references public.food_combos(id,organization_id,seller_store_id)
);
create index food_combo_versions_seller_idx on public.food_combo_versions(seller_store_id,created_at desc);
create table public.food_combo_items (
  id uuid primary key default gen_random_uuid(), version_id uuid not null references public.food_combo_versions(id),
  offer_id uuid not null, organization_id uuid not null, store_id uuid not null,
  quantity integer not null check(quantity between 1 and 100000),
  discount_bps integer not null default 0 check(discount_bps between 0 and 10000),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  approval text not null default 'pending' check(approval in ('pending','approved','rejected')),
  approved_by uuid references auth.users(id), approved_at timestamptz,
  foreign key(offer_id,organization_id,store_id) references public.food_module_offers(id,organization_id,store_id),
  unique(version_id,offer_id)
);
create index food_combo_items_owner_idx on public.food_combo_items(store_id,approval);

create table public.food_module_orders (
  id uuid primary key default gen_random_uuid(), code bigint generated always as identity unique,
  organization_id uuid not null, seller_store_id uuid not null,
  version_id uuid references public.food_combo_versions(id), request_id uuid not null,
  capability_hash bytea not null, customer_name text not null check(length(customer_name) between 2 and 120),
  customer_phone text not null check(length(customer_phone) between 10 and 30),
  scheduled_for timestamptz not null, ends_at timestamptz not null, check(ends_at > scheduled_for),
  status text not null default 'draft' check(status in ('draft','payment_pending','paid','cancelled')),
  total_cents bigint not null default 0 check(total_cents >= 0),
  charged_cents bigint not null default 0 check(charged_cents >= 0),
  paid_cents bigint not null default 0 check(paid_cents >= 0),
  pix_snapshot jsonb, payment_reference text, paid_at timestamptz,
  expires_at timestamptz not null default now()+interval '2 hours',
  created_at timestamptz not null default now(), unique(seller_store_id,request_id),
  foreign key(organization_id,seller_store_id) references public.food_module_stores(organization_id,store_id)
);
create index food_module_orders_seller_idx on public.food_module_orders(seller_store_id,created_at desc);
create table public.food_module_order_parts (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.food_module_orders(id),
  organization_id uuid not null, store_id uuid not null,
  code bigint not null, scheduled_for timestamptz not null,
  status text not null default 'active' check(status in ('active','cancelled')),
  total_cents bigint not null default 0 check(total_cents >= 0),
  urgency text not null default 'not_needed' check(urgency in ('not_needed','pending','accepted','rejected')),
  foreign key(organization_id,store_id) references public.food_module_stores(organization_id,store_id),
  unique(order_id,store_id), unique(id,organization_id,store_id)
);
create index food_module_order_parts_store_idx on public.food_module_order_parts(store_id,scheduled_for);
create table public.food_module_order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.food_module_orders(id),
  part_id uuid not null, organization_id uuid not null, store_id uuid not null,
  offer_id uuid not null, combo_item_id uuid references public.food_combo_items(id),
  quantity integer not null check(quantity between 1 and 100000),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'), total_cents bigint not null check(total_cents >= 0),
  status text not null default 'active' check(status in ('active','removed','cancelled')),
  inventory_state text not null default 'reserved' check(inventory_state in ('reserved','consumed','released')),
  foreign key(part_id,organization_id,store_id) references public.food_module_order_parts(id,organization_id,store_id),
  foreign key(offer_id,organization_id,store_id) references public.food_module_offers(id,organization_id,store_id),
  unique(order_id,offer_id)
);
create index food_module_order_items_order_idx on public.food_module_order_items(order_id);
create index food_module_order_items_part_idx on public.food_module_order_items(part_id);
create table public.food_module_receivables (
  part_id uuid primary key, organization_id uuid not null, store_id uuid not null,
  amount_cents bigint not null check(amount_cents >= 0),
  status text not null default 'pending' check(status in ('pending','settled','cancelled','recovery_due')),
  settled_cents bigint not null default 0 check(settled_cents >= 0),
  reference text, settled_at timestamptz,
  foreign key(part_id,organization_id,store_id) references public.food_module_order_parts(id,organization_id,store_id)
);
create table public.food_module_refunds (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.food_module_orders(id),
  part_id uuid not null unique, organization_id uuid not null, store_id uuid not null,
  amount_cents bigint not null check(amount_cents > 0), status text not null default 'pending' check(status in ('pending','paid')),
  reference text, paid_at timestamptz,
  foreign key(part_id,organization_id,store_id) references public.food_module_order_parts(id,organization_id,store_id)
);
create table public.food_custom_requests (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, store_id uuid not null,
  customer_name text not null check(length(customer_name) between 2 and 120),
  customer_phone text not null, quantity integer not null check(quantity between 1 and 100000),
  size text not null, material text not null, color text not null, due_at timestamptz not null,
  notes text not null default '', quote jsonb, final_cents bigint check(final_cents >= 0),
  status text not null default 'quote' check(status in ('quote','artwork_whatsapp','approved','rejected','completed')),
  created_at timestamptz not null default now(),
  foreign key(organization_id,store_id) references public.food_module_stores(organization_id,store_id),
  unique(id,organization_id,store_id)
);
create table public.food_custom_files (
  id uuid primary key default gen_random_uuid(), request_id uuid not null, organization_id uuid not null, store_id uuid not null,
  storage_path text not null unique, name text not null, size_bytes integer not null check(size_bytes between 1 and 26214400),
  foreign key(request_id,organization_id,store_id) references public.food_custom_requests(id,organization_id,store_id)
);
create index food_custom_requests_store_idx on public.food_custom_requests(store_id,created_at desc);
create table public.food_rental_assets (
  offer_id uuid primary key, organization_id uuid not null, store_id uuid not null,
  maintenance boolean not null default false, maintenance_notes text not null default '',
  foreign key(offer_id,organization_id,store_id) references public.food_module_offers(id,organization_id,store_id)
);
create table public.food_rental_reservations (
  id uuid primary key default gen_random_uuid(), offer_id uuid not null references public.food_rental_assets(offer_id),
  item_id uuid not null unique references public.food_module_order_items(id),
  organization_id uuid not null, store_id uuid not null,
  starts_at timestamptz not null, ends_at timestamptz not null, check(ends_at > starts_at),
  status text not null default 'reserved' check(status in ('reserved','cancelled','returned')),
  deposit_cents bigint not null default 0 check(deposit_cents >= 0), deposit_reference text,
  contract text not null default '', assembly_checklist jsonb not null default '[]',
  return_checklist jsonb not null default '[]',
  foreign key(organization_id,store_id) references public.food_module_stores(organization_id,store_id)
);
create index food_rental_reservations_interval_idx on public.food_rental_reservations(offer_id,starts_at,ends_at) where status='reserved';
create table public.food_module_audit (
  id bigint generated always as identity primary key, organization_id uuid not null, store_id uuid not null,
  actor_id uuid, action text not null, entity_id uuid, details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key(organization_id,store_id) references public.food_module_stores(organization_id,store_id)
);
create index food_module_audit_store_idx on public.food_module_audit(store_id,created_at desc);

-- Helpers privados: uma associação em outra loja da mesma organização não autoriza acesso.
create function private.food_modules_master() returns boolean language sql stable security definer set search_path=''
as $$ select coalesce(auth.uid() is not null and public.food_is_platform_admin() and auth.jwt()->>'aal'='aal2',false) $$;
create function private.food_modules_access(p_org uuid,p_store uuid,p_manage boolean default false)
returns boolean language sql stable security definer set search_path=''
as $$
  select auth.uid() is not null and exists(
    select 1 from public.food_module_stores ms join public.food_stores s on s.id=ms.store_id
    where ms.organization_id=p_org and ms.store_id=p_store
      and (private.food_modules_master() or (s.active and s.archived_at is null and exists(select 1 from public.food_store_users su
        where su.store_id=p_store and su.user_id=auth.uid() and su.active
          and su.role in ('owner','admin','manager','finance')
          and (not p_manage or su.role in ('owner','admin','manager'))))))
$$;
create function private.food_modules_enabled(p_store uuid,p_module text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.food_module_settings m join public.food_stores s on s.id=m.store_id
    where m.store_id=p_store and s.active and s.archived_at is null and s.access_status='online'
      and s.approval_status='approved' and case p_module when 'events' then m.events_enabled
      when 'combos' then m.combos_enabled when 'rentals' then m.rentals_enabled when 'custom' then m.custom_enabled else false end)
$$;

-- ACL de leitura; gravações passam exclusivamente por RPCs transacionais.
do $$ declare t text; begin
  foreach t in array array['food_module_organizations','food_module_stores','food_module_settings','food_module_offers',
    'food_combos','food_combo_versions','food_combo_items','food_module_orders','food_module_order_parts',
    'food_module_order_items','food_module_receivables','food_module_refunds','food_custom_requests','food_custom_files',
    'food_rental_assets','food_rental_reservations','food_module_audit'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
  foreach t in array array['food_module_stores','food_module_settings','food_module_offers','food_combo_items',
    'food_module_order_parts','food_module_order_items','food_module_receivables','food_module_refunds',
    'food_custom_requests','food_custom_files','food_rental_assets','food_rental_reservations','food_module_audit'] loop
    execute format('create policy %I on public.%I for select to authenticated using(private.food_modules_access(organization_id,store_id))',t||'_read',t);
  end loop;
  foreach t in array array['food_combos','food_combo_versions','food_module_orders'] loop
    execute format('create policy %I on public.%I for select to authenticated using(private.food_modules_access(organization_id,seller_store_id))',t||'_read',t);
  end loop;
end $$;
create policy food_module_organizations_read on public.food_module_organizations for select to authenticated
using(private.food_modules_master() or exists(select 1 from public.food_module_stores s where s.organization_id=id and private.food_modules_access(s.organization_id,s.store_id)));

-- Bucket privado. Não altera nenhuma policy de bucket existente.
insert into storage.buckets(id,name,public,file_size_limit) values('food-custom-files','food-custom-files',false,26214400);
create function private.food_modules_file_access(p_path text) returns boolean language sql stable security definer set search_path=''
as $$
  select exists(select 1 from public.food_custom_requests r
    where p_path like r.organization_id::text||'/'||r.store_id::text||'/'||r.id::text||'/%'
      and private.food_modules_access(r.organization_id,r.store_id,true)
      and lower(p_path) ~ '\.(png|jpg|jpeg|webp|pdf|stl|obj|3mf)$')
$$;
create policy food_custom_storage_read on storage.objects for select to authenticated
using(bucket_id='food-custom-files' and private.food_modules_file_access(name));
create policy food_custom_storage_insert on storage.objects for insert to authenticated
with check(bucket_id='food-custom-files' and private.food_modules_file_access(name));
-- Sem UPDATE/upsert: anexos novos usam UUID; histórico não é sobrescrito.
revoke all on function private.food_modules_master() from public,anon;
revoke all on function private.food_modules_access(uuid,uuid,boolean) from public,anon;
revoke all on function private.food_modules_enabled(uuid,text) from public,anon,authenticated;
revoke all on function private.food_modules_file_access(text) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.food_modules_master(),private.food_modules_access(uuid,uuid,boolean),private.food_modules_file_access(text) to authenticated;
commit;
