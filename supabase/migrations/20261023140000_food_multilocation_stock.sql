begin;

-- Multi-location stock. Existing product totals stay canonical during rollout;
-- each existing tracked balance is transferred into a default location.
create table if not exists public.food_stock_locations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  location_type text not null default 'warehouse' check (location_type in ('warehouse','store','vehicle','pickup')),
  active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, store_id)
);
create unique index if not exists food_stock_locations_one_default_idx
  on public.food_stock_locations(store_id) where is_default;

create or replace function public.food_guard_stock_location_update()
returns trigger language plpgsql security invoker set search_path=''
as $
begin
  if new.store_id is distinct from old.store_id or new.is_default is distinct from old.is_default then
    raise exception 'A loja e o local principal não podem ser alterados por edição direta.' using errcode='42501';
  end if;
  return new;
end;
$;
revoke all on function public.food_guard_stock_location_update() from public,anon,authenticated;
drop trigger if exists food_stock_location_update_guard on public.food_stock_locations;
create trigger food_stock_location_update_guard before update on public.food_stock_locations
for each row execute function public.food_guard_stock_location_update();

create table if not exists public.food_product_location_stock (
  store_id uuid not null references public.food_stores(id) on delete cascade,
  product_id uuid not null references public.food_products(id) on delete cascade,
  location_id uuid not null,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  stock_reserved_quantity integer not null default 0 check (stock_reserved_quantity >= 0 and stock_reserved_quantity <= stock_quantity),
  updated_at timestamptz not null default now(),
  primary key (product_id, location_id),
  foreign key (location_id, store_id) references public.food_stock_locations(id, store_id) on delete cascade
);
create index if not exists food_product_location_stock_store_idx
  on public.food_product_location_stock(store_id, location_id, product_id);

create table if not exists public.food_stock_location_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  product_id uuid not null references public.food_products(id) on delete cascade,
  from_location_id uuid,
  to_location_id uuid,
  movement_type text not null check (movement_type in ('adjust','transfer')),
  quantity integer not null check (quantity >= 0),
  request_payload jsonb not null default '{}'::jsonb,
  reason text not null check (length(trim(reason)) between 1 and 160),
  idempotency_key uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (movement_type='adjust' and quantity>=0 and from_location_id is null and to_location_id is not null)
    or (movement_type='transfer' and quantity>0 and from_location_id is not null and to_location_id is not null and from_location_id <> to_location_id)
  ),
  foreign key (from_location_id, store_id) references public.food_stock_locations(id, store_id),
  foreign key (to_location_id, store_id) references public.food_stock_locations(id, store_id),
  unique (store_id, idempotency_key)
);
create index if not exists food_stock_location_movements_product_date_idx
  on public.food_stock_location_movements(store_id, product_id, created_at desc);

-- Pickup addresses remain private unless an administrator explicitly marks a point public.
create table if not exists public.food_pickup_locations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  short_code text not null check (short_code ~ '^[A-Z0-9-]{3,16}$'),
  address text,
  instructions text,
  is_public boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, store_id),
  unique (store_id, short_code)
);
create index if not exists food_pickup_locations_public_idx
  on public.food_pickup_locations(store_id, sort_order) where active and is_public;

alter table public.food_stock_locations enable row level security;
alter table public.food_product_location_stock enable row level security;
alter table public.food_stock_location_movements enable row level security;
alter table public.food_pickup_locations enable row level security;

drop policy if exists food_stock_locations_admin_all on public.food_stock_locations;
create policy food_stock_locations_admin_all on public.food_stock_locations
  for all to authenticated using (public.food_is_store_admin(store_id))
  with check (public.food_is_store_admin(store_id));
drop policy if exists food_product_location_stock_admin_select on public.food_product_location_stock;
create policy food_product_location_stock_admin_select on public.food_product_location_stock
  for select to authenticated using (public.food_is_store_admin(store_id));
drop policy if exists food_stock_location_movements_admin_select on public.food_stock_location_movements;
create policy food_stock_location_movements_admin_select on public.food_stock_location_movements
  for select to authenticated using (public.food_is_store_admin(store_id));
drop policy if exists food_pickup_locations_admin_all on public.food_pickup_locations;
create policy food_pickup_locations_admin_all on public.food_pickup_locations
  for all to authenticated using (public.food_is_store_admin(store_id))
  with check (public.food_is_store_admin(store_id));

grant select, insert, update on public.food_stock_locations, public.food_pickup_locations to authenticated;
grant select on public.food_product_location_stock, public.food_stock_location_movements to authenticated;
revoke all on public.food_product_location_stock, public.food_stock_location_movements from anon, authenticated;
grant select on public.food_product_location_stock, public.food_stock_location_movements to authenticated;

insert into public.food_stock_locations(store_id,name,location_type,is_default)
select s.id, 'Estoque principal', 'warehouse', true
from public.food_stores s
where not exists (select 1 from public.food_stock_locations l where l.store_id=s.id and l.is_default)
on conflict do nothing;

insert into public.food_product_location_stock(store_id,product_id,location_id,stock_quantity,stock_reserved_quantity)
select p.store_id,p.id,l.id,
  case when coalesce(p.track_stock,false) then greatest(coalesce(p.stock_quantity,0),0) else 0 end,
  case when coalesce(p.track_stock,false) then least(greatest(coalesce(p.stock_reserved_quantity,0),0),greatest(coalesce(p.stock_quantity,0),0)) else 0 end
from public.food_products p
join public.food_stock_locations l on l.store_id=p.store_id and l.is_default
on conflict (product_id,location_id) do nothing;

create or replace function public.food_initialize_location_balances()
returns trigger language plpgsql security definer set search_path=''
as $
begin
  insert into public.food_product_location_stock(store_id,product_id,location_id,stock_quantity,stock_reserved_quantity)
  select p.store_id,p.id,new.id,0,0 from public.food_products p
   where p.store_id=new.store_id and coalesce(p.track_stock,false)
  on conflict(product_id,location_id) do nothing;
  return new;
end;
$;
revoke all on function public.food_initialize_location_balances() from public,anon,authenticated;
drop trigger if exists food_stock_location_initialize_balances on public.food_stock_locations;
create trigger food_stock_location_initialize_balances after insert on public.food_stock_locations
for each row execute function public.food_initialize_location_balances();

create or replace function public.food_sync_default_location_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_location_id uuid;
  v_quantity_delta integer;
  v_reserved_delta integer;
  v_quantity integer;
  v_reserved integer;
begin
  if current_setting('food.stock_location_sync', true) = 'on' then return new; end if;
  if tg_op = 'UPDATE' and not coalesce(new.track_stock,false) then return new; end if;
  select id into v_location_id from public.food_stock_locations
   where store_id=new.store_id and is_default and active limit 1;
  if v_location_id is null then
    insert into public.food_stock_locations(store_id,name,location_type,is_default)
    values(new.store_id,'Estoque principal','warehouse',true)
    returning id into v_location_id;
  end if;
  if tg_op = 'INSERT' then
    v_quantity := case when coalesce(new.track_stock,false) then greatest(coalesce(new.stock_quantity,0),0) else 0 end;
    v_reserved := case when coalesce(new.track_stock,false) then least(greatest(coalesce(new.stock_reserved_quantity,0),0),v_quantity) else 0 end;
    insert into public.food_product_location_stock(store_id,product_id,location_id,stock_quantity,stock_reserved_quantity)
    values(new.store_id,new.id,v_location_id,v_quantity,v_reserved)
    on conflict(product_id,location_id) do nothing;
    return new;
  end if;
  if new.store_id is distinct from old.store_id then
    raise exception 'A loja do produto não pode mudar depois de criar saldos por local.' using errcode='23514';
  end if;
  if new.track_stock is distinct from old.track_stock and not coalesce(new.track_stock,false) then
    raise exception 'Desative o controle por local antes de desativar o estoque do produto.' using errcode='23514';
  end if;
  if coalesce(new.track_stock,false) and not coalesce(old.track_stock,false) then
    insert into public.food_product_location_stock(store_id,product_id,location_id,stock_quantity,stock_reserved_quantity)
    values(new.store_id,new.id,v_location_id,greatest(coalesce(new.stock_quantity,0),0),least(greatest(coalesce(new.stock_reserved_quantity,0),0),greatest(coalesce(new.stock_quantity,0),0)))
    on conflict(product_id,location_id) do update
      set stock_quantity=excluded.stock_quantity,stock_reserved_quantity=excluded.stock_reserved_quantity,updated_at=now();
    return new;
  end if;
  v_quantity_delta := coalesce(new.stock_quantity,0)-coalesce(old.stock_quantity,0);
  v_reserved_delta := coalesce(new.stock_reserved_quantity,0)-coalesce(old.stock_reserved_quantity,0);
  if v_quantity_delta <> 0 or v_reserved_delta <> 0 then
    insert into public.food_product_location_stock(store_id,product_id,location_id)
    values(new.store_id,new.id,v_location_id) on conflict(product_id,location_id) do nothing;
    update public.food_product_location_stock
       set stock_quantity=stock_quantity+v_quantity_delta,
           stock_reserved_quantity=stock_reserved_quantity+v_reserved_delta,
           updated_at=now()
     where product_id=new.id and location_id=v_location_id
       and stock_quantity+v_quantity_delta>=0
       and stock_reserved_quantity+v_reserved_delta>=0
       and stock_reserved_quantity+v_reserved_delta<=stock_quantity+v_quantity_delta;
    if not found then
      raise exception 'O ajuste do estoque principal não cobre o saldo solicitado; use a operação por local.' using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.food_sync_default_location_stock() from public, anon, authenticated;
drop trigger if exists food_products_sync_default_location_stock on public.food_products;
create trigger food_products_sync_default_location_stock
  after insert or update of stock_quantity, stock_reserved_quantity, track_stock on public.food_products
  for each row execute function public.food_sync_default_location_stock();

create or replace function public.food_adjust_location_stock_v1(
  p_store_id uuid,p_product_id uuid,p_location_id uuid,p_quantity integer,p_reason text,p_idempotency_key uuid
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_product public.food_products%rowtype;
  v_before integer;
  v_reserved integer;
  v_total integer;
  v_existing public.food_stock_location_movements%rowtype;
begin
  if (select auth.uid()) is null or not public.food_is_store_admin(p_store_id) then
    raise exception 'Sem permissão para ajustar estoque desta loja.' using errcode='42501';
  end if;
  if p_quantity is null or p_quantity<0 or p_reason is null or length(trim(p_reason)) not between 1 and 160 or p_idempotency_key is null then
    raise exception 'Informe quantidade, motivo e identificador válidos.' using errcode='22023';
  end if;
  select * into v_product from public.food_products where id=p_product_id and store_id=p_store_id and track_stock for update;
  if not found then raise exception 'Produto sem controle de estoque nesta loja.' using errcode='22023'; end if;
  perform 1 from public.food_stock_locations where id=p_location_id and store_id=p_store_id and active;
  if not found then raise exception 'Local de estoque inexistente ou inativo.' using errcode='22023'; end if;
  select * into v_existing from public.food_stock_location_movements where store_id=p_store_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.product_id<>p_product_id or v_existing.movement_type<>'adjust'
       or v_existing.to_location_id<>p_location_id
       or v_existing.request_payload<>jsonb_build_object('quantity',p_quantity,'reason',trim(p_reason)) then
      raise exception 'Identificador já usado por outra operação.' using errcode='22023';
    end if;
    return jsonb_build_object('replayed',true);
  end if;
  select stock_quantity,stock_reserved_quantity into v_before,v_reserved
    from public.food_product_location_stock where product_id=p_product_id and location_id=p_location_id for update;
  if not found then raise exception 'Local de estoque não encontrado.' using errcode='22023'; end if;
  if p_quantity<v_reserved then raise exception 'O saldo não pode ficar abaixo das unidades reservadas.' using errcode='22023'; end if;
  update public.food_product_location_stock set stock_quantity=p_quantity,updated_at=now()
    where product_id=p_product_id and location_id=p_location_id;
  select sum(stock_quantity)::integer into v_total from public.food_product_location_stock where product_id=p_product_id;
  perform set_config('food.stock_location_sync','on',true);
  update public.food_products set stock_quantity=v_total,
    stock_status=case when v_total-coalesce(stock_reserved_quantity,0)<=3 then 'low_stock' else 'available' end,
    availability_status=case when v_total-coalesce(stock_reserved_quantity,0)=0 then 'sold_out' else 'available' end
   where id=p_product_id and store_id=p_store_id;
  perform set_config('food.stock_location_sync','off',true);
  insert into public.food_stock_location_movements(store_id,product_id,to_location_id,movement_type,quantity,request_payload,reason,idempotency_key,created_by)
    values(p_store_id,p_product_id,p_location_id,'adjust',abs(p_quantity-v_before),jsonb_build_object('quantity',p_quantity,'reason',trim(p_reason)),trim(p_reason),p_idempotency_key,(select auth.uid()));
  return jsonb_build_object('stock_quantity',v_total,'location_stock',p_quantity);
end;
$$;

create or replace function public.food_transfer_location_stock_v1(
  p_store_id uuid,p_product_id uuid,p_from_location_id uuid,p_to_location_id uuid,
  p_quantity integer,p_reason text,p_idempotency_key uuid
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_from integer; v_reserved integer; v_to integer;
  v_existing public.food_stock_location_movements%rowtype;
begin
  if (select auth.uid()) is null or not public.food_is_store_admin(p_store_id) then
    raise exception 'Sem permissão para transferir estoque desta loja.' using errcode='42501';
  end if;
  if p_quantity is null or p_quantity<1 or p_from_location_id is null or p_to_location_id is null or p_from_location_id=p_to_location_id
     or p_reason is null or length(trim(p_reason)) not between 1 and 160 or p_idempotency_key is null then
    raise exception 'Dados de transferência inválidos.' using errcode='22023';
  end if;
  perform 1 from public.food_products where id=p_product_id and store_id=p_store_id and track_stock for update;
  if not found then raise exception 'Produto sem controle de estoque nesta loja.' using errcode='22023'; end if;
  select * into v_existing from public.food_stock_location_movements where store_id=p_store_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.product_id<>p_product_id or v_existing.movement_type<>'transfer'
       or v_existing.from_location_id<>p_from_location_id or v_existing.to_location_id<>p_to_location_id
       or v_existing.quantity<>p_quantity or v_existing.request_payload<>jsonb_build_object('quantity',p_quantity,'reason',trim(p_reason)) then
      raise exception 'Identificador já usado por outra operação.' using errcode='22023';
    end if;
    return jsonb_build_object('replayed',true);
  end if;
  if (select count(*) from public.food_stock_locations
      where store_id=p_store_id and active and id in (p_from_location_id,p_to_location_id))<>2 then
    raise exception 'Origem ou destino inexistente ou inativo.' using errcode='22023';
  end if;
  -- Lock both balance rows in a stable order to avoid deadlocks.
  perform 1 from public.food_product_location_stock
   where store_id=p_store_id and product_id=p_product_id and location_id in (p_from_location_id,p_to_location_id)
   order by location_id for update;
  select stock_quantity,stock_reserved_quantity into v_from,v_reserved
    from public.food_product_location_stock where product_id=p_product_id and location_id=p_from_location_id;
  select stock_quantity into v_to from public.food_product_location_stock where product_id=p_product_id and location_id=p_to_location_id;
  if v_from is null or v_to is null then raise exception 'Origem ou destino não encontrado.' using errcode='22023'; end if;
  if v_from-v_reserved<p_quantity then raise exception 'Saldo disponível insuficiente na origem.' using errcode='22023'; end if;
  if v_to::bigint+p_quantity>2147483647 then raise exception 'O saldo do destino excederia o limite permitido.' using errcode='22023'; end if;
  update public.food_product_location_stock set stock_quantity=stock_quantity-p_quantity,updated_at=now()
   where product_id=p_product_id and location_id=p_from_location_id;
  update public.food_product_location_stock set stock_quantity=stock_quantity+p_quantity,updated_at=now()
   where product_id=p_product_id and location_id=p_to_location_id;
  insert into public.food_stock_location_movements(store_id,product_id,from_location_id,to_location_id,movement_type,quantity,request_payload,reason,idempotency_key,created_by)
    values(p_store_id,p_product_id,p_from_location_id,p_to_location_id,'transfer',p_quantity,jsonb_build_object('quantity',p_quantity,'reason',trim(p_reason)),trim(p_reason),p_idempotency_key,(select auth.uid()));
  return jsonb_build_object('from_stock',v_from-p_quantity,'to_stock',v_to+p_quantity);
end;
$$;

create or replace function public.food_get_public_pickup_locations_v1(p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
  if not public.food_store_accessible(p_store_id) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',id,'name',name,'short_code',short_code,
      'address',case when is_public then address else null end,
      'instructions',case when is_public then instructions else null end
    ) order by sort_order,name)
    from public.food_pickup_locations where store_id=p_store_id and active and is_public
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.food_adjust_location_stock_v1(uuid,uuid,uuid,integer,text,uuid) from public,anon;
revoke all on function public.food_transfer_location_stock_v1(uuid,uuid,uuid,uuid,integer,text,uuid) from public,anon;
grant execute on function public.food_adjust_location_stock_v1(uuid,uuid,uuid,integer,text,uuid) to authenticated;
grant execute on function public.food_transfer_location_stock_v1(uuid,uuid,uuid,uuid,integer,text,uuid) to authenticated;
revoke all on function public.food_get_public_pickup_locations_v1(uuid) from public;
grant execute on function public.food_get_public_pickup_locations_v1(uuid) to anon,authenticated;

notify pgrst,'reload schema';
commit;
