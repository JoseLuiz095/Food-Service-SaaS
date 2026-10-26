begin;

-- A place with physical balance, reservations, an active public pickup point
-- or unfinished orders cannot be hidden from the merchant or the customer.
create or replace function public.food_guard_stock_location_deactivation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.active and not new.active then
    if old.is_default then
      raise exception 'O estoque principal não pode ser desativado.' using errcode = '23514';
    end if;
    if exists (select 1 from public.food_product_location_stock b
                where b.store_id = old.store_id and b.location_id = old.id
                  and (b.stock_quantity > 0 or b.stock_reserved_quantity > 0))
       or exists (select 1 from public.food_pickup_locations p
                   where p.store_id = old.store_id and p.stock_location_id = old.id and p.active)
       or exists (select 1 from public.food_orders o
                   where o.store_id = old.store_id and o.stock_location_id = old.id
                     and o.status not in ('cancelled', 'delivered', 'picked_up')) then
      raise exception 'Transfira os saldos e conclua as operações antes de desativar este local.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.food_guard_stock_location_deactivation() from public, anon, authenticated;
drop trigger if exists food_stock_location_deactivation_guard_trg on public.food_stock_locations;
create trigger food_stock_location_deactivation_guard_trg
  before update of active on public.food_stock_locations for each row
  execute function public.food_guard_stock_location_deactivation();

-- The existing transfer RPC checks activity before changing balances. Check
-- again while writing its audit row, locking locations against deactivation.
create or replace function public.food_guard_active_stock_movement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  perform 1 from public.food_stock_locations
   where store_id = new.store_id and active
     and id in (new.from_location_id, new.to_location_id)
   order by id for share;
  get diagnostics v_count = row_count;
  if v_count <> (case when new.movement_type = 'transfer' then 2 else 1 end) then
    raise exception 'Local de estoque indisponível durante a movimentação.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.food_guard_active_stock_movement() from public, anon, authenticated;
drop trigger if exists food_stock_movement_active_guard_trg on public.food_stock_location_movements;
create trigger food_stock_movement_active_guard_trg
  before insert on public.food_stock_location_movements for each row
  execute function public.food_guard_active_stock_movement();

-- A point of sale is public only when the merchant explicitly publishes a
-- pickup point. A private stock location must never become a pickup address.
create or replace function public.food_require_public_pickup_stock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_location uuid;
begin
  if new.source is distinct from 'site' then return new; end if;
  if new.delivery_type = 'pickup' then
    if new.pickup_location_id is null then
      if exists (select 1 from public.food_pickup_locations p
                 join public.food_stock_locations l
                   on l.id = p.stock_location_id and l.store_id = p.store_id and l.active
                 where p.store_id = new.store_id and p.active and p.is_public) then
        raise exception 'Selecione um ponto de retirada antes de confirmar o pedido.' using errcode = '22023';
      end if;
      return new; -- Legacy stores with only the internal default stock.
    end if;
    select p.stock_location_id into v_location
      from public.food_pickup_locations p
      join public.food_stock_locations l
        on l.id = p.stock_location_id and l.store_id = p.store_id and l.active
     where p.id = new.pickup_location_id and p.store_id = new.store_id
       and p.active and p.is_public
     for share of p, l;
    if v_location is null then
      raise exception 'O ponto de retirada está indisponível. Escolha outro ponto.' using errcode = '22023';
    end if;
    if new.stock_location_id is distinct from v_location then
      raise exception 'O estoque do pedido não corresponde ao ponto de retirada.' using errcode = '22023';
    end if;
  elsif new.pickup_location_id is not null then
    raise exception 'Ponto de retirada somente para pedidos de retirada.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.food_require_public_pickup_stock() from public, anon, authenticated;
drop trigger if exists food_orders_require_public_pickup_stock_trg on public.food_orders;
create trigger food_orders_require_public_pickup_stock_trg
  before insert on public.food_orders for each row
  execute function public.food_require_public_pickup_stock();

-- The legacy reservation trigger permits a future order to await replenishment.
-- A published pickup point cannot use that shortcut: stock in another place is
-- not a confirmed reservation for this point, even on a scheduled order.
create or replace function public.food_require_pickup_item_stock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_order public.food_orders%rowtype;
  v_product public.food_products%rowtype;
  v_available integer;
begin
  if new.product_id is null then return new; end if;
  select * into v_order from public.food_orders where id = new.order_id;
  if not found or v_order.source is distinct from 'site'
     or v_order.delivery_type is distinct from 'pickup'
     or v_order.pickup_location_id is null then return new; end if;
  select * into v_product from public.food_products
   where id = new.product_id and store_id = v_order.store_id for update;
  if not found then raise exception 'Produto fora da loja.' using errcode = '22023'; end if;
  if not v_product.track_stock then return new; end if;
  select greatest(stock_quantity - stock_reserved_quantity, 0) into v_available
    from public.food_product_location_stock
   where store_id = v_order.store_id and product_id = new.product_id
     and location_id = v_order.stock_location_id for update;
  if coalesce(v_available, 0) < new.quantity then
    raise exception 'Neste ponto, restam % unidades de %.', coalesce(v_available, 0), v_product.name
      using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.food_require_pickup_item_stock() from public, anon, authenticated;
drop trigger if exists food_order_items_require_pickup_stock_trg on public.food_order_items;
create trigger food_order_items_require_pickup_stock_trg
  before insert on public.food_order_items for each row
  execute function public.food_require_pickup_item_stock();

-- The public API exposes a quantity, never private location names or IDs.
create or replace function public.food_get_public_location_availability_v1(
  p_store_id uuid, p_pickup_location_id uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_location uuid;
begin
  if not public.food_store_accessible(p_store_id) then return '[]'::jsonb; end if;
  select p.stock_location_id into v_location
    from public.food_pickup_locations p
    join public.food_stock_locations l
      on l.id = p.stock_location_id and l.store_id = p.store_id and l.active
   where p.id = p_pickup_location_id and p.store_id = p_store_id
     and p.active and p.is_public;
  if v_location is null then
    raise exception 'Ponto de retirada indisponível.' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'product_id', p.id,
      'available', greatest(coalesce(b.stock_quantity, 0) - coalesce(b.stock_reserved_quantity, 0), 0),
      'available_elsewhere', exists (
        select 1 from public.food_product_location_stock other
        join public.food_stock_locations l on l.id = other.location_id and l.store_id = other.store_id
        where other.store_id = p_store_id and other.product_id = p.id
          and other.location_id <> v_location and l.active
          and other.stock_quantity > other.stock_reserved_quantity
      )
    ) order by p.id)
    from public.food_products p
    left join public.food_product_location_stock b
      on b.product_id = p.id and b.store_id = p_store_id and b.location_id = v_location
   where p.store_id = p_store_id and p.active and p.track_stock
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.food_get_public_location_availability_v1(uuid, uuid) from public;
grant execute on function public.food_get_public_location_availability_v1(uuid, uuid) to anon, authenticated;

create or replace function public.food_get_location_sales_today_v1(
  p_store_id uuid, p_location_id uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_timezone text;
  v_day date;
begin
  if auth.uid() is null or not public.food_is_store_admin(p_store_id) then
    raise exception 'Sem permissão para consultar vendas deste local.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.food_stock_locations
                  where id = p_location_id and store_id = p_store_id) then
    raise exception 'Local fora desta loja.' using errcode = '22023';
  end if;
  select coalesce(nullif(opening_hours->>'timezone', ''), 'America/Sao_Paulo')
    into v_timezone from public.food_stores where id = p_store_id;
  v_day := (now() at time zone v_timezone)::date;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'product_id', sold.product_id,
      'sold_quantity', sold.sold_quantity,
      'returned_quantity', sold.returned_quantity,
      'net_sold', sold.sold_quantity - sold.returned_quantity
    ) order by sold.product_id)
    from (
      select m.product_id,
        sum(m.quantity) filter (where m.event_type = 'sale')::integer as sold_quantity,
        coalesce(sum(m.quantity) filter (where m.event_type = 'return'), 0)::integer as returned_quantity
      from public.food_order_stock_movements m
      where m.store_id = p_store_id and m.location_id = p_location_id
        and m.created_at >= (v_day::timestamp at time zone v_timezone)
        and m.created_at < ((v_day + 1)::timestamp at time zone v_timezone)
      group by m.product_id
    ) sold
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.food_get_location_sales_today_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.food_get_location_sales_today_v1(uuid, uuid) to authenticated;

-- A relative adjustment is calculated while holding the same product lock as
-- the existing absolute adjustment. Repeated requests cannot add stock twice.
create or replace function public.food_change_location_stock_v1(
  p_store_id uuid, p_product_id uuid, p_location_id uuid,
  p_mode text, p_quantity integer, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_existing public.food_stock_location_movements%rowtype;
  v_current integer;
  v_next bigint;
  v_reason text;
begin
  if auth.uid() is null or not public.food_is_store_admin(p_store_id) then
    raise exception 'Sem permissão para ajustar estoque desta loja.' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_mode is null or p_mode not in ('add', 'remove', 'set')
     or p_quantity is null or p_quantity < 0
     or (p_mode in ('add', 'remove') and p_quantity = 0) then
    raise exception 'Informe uma operação e quantidade válidas.' using errcode = '22023';
  end if;
  v_reason := case p_mode when 'add' then 'Adicionar ' when 'remove' then 'Remover '
    else 'Definir ' end || p_quantity::text || ' unidades';
  perform 1 from public.food_products
   where id = p_product_id and store_id = p_store_id and track_stock for update;
  if not found then raise exception 'Produto sem controle de estoque nesta loja.' using errcode = '22023'; end if;
  select * into v_existing from public.food_stock_location_movements
   where store_id = p_store_id and idempotency_key = p_idempotency_key for update;
  if found then
    if v_existing.movement_type <> 'adjust' or v_existing.product_id <> p_product_id
       or v_existing.to_location_id <> p_location_id or v_existing.reason <> v_reason then
      raise exception 'Identificador já usado por outra operação.' using errcode = '22023';
    end if;
    return jsonb_build_object('replayed', true);
  end if;
  select stock_quantity into v_current from public.food_product_location_stock
   where store_id = p_store_id and product_id = p_product_id and location_id = p_location_id for update;
  if not found then raise exception 'Local de estoque não encontrado.' using errcode = '22023'; end if;
  v_next := case p_mode when 'add' then v_current::bigint + p_quantity
    when 'remove' then v_current::bigint - p_quantity else p_quantity end;
  if v_next < 0 or v_next > 2147483647 then
    raise exception 'Quantidade fora do saldo permitido.' using errcode = '22023';
  end if;
  return public.food_adjust_location_stock_v1(
    p_store_id, p_product_id, p_location_id, v_next::integer, v_reason, p_idempotency_key
  );
end;
$$;
revoke all on function public.food_change_location_stock_v1(uuid, uuid, uuid, text, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.food_change_location_stock_v1(uuid, uuid, uuid, text, integer, uuid)
  to authenticated;

-- One request = one transaction, including its audit rows. A retry with the
-- same key returns the recorded result; a changed request is rejected.
create table public.food_stock_transfer_batches (
  store_id uuid not null references public.food_stores(id) on delete cascade,
  idempotency_key uuid not null,
  request_payload jsonb not null,
  result jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (store_id, idempotency_key)
);
alter table public.food_stock_transfer_batches enable row level security;
revoke all on public.food_stock_transfer_batches from public, anon, authenticated;

create or replace function public.food_transfer_location_stock_batch_v1(
  p_store_id uuid, p_from_location_id uuid, p_to_location_id uuid,
  p_items jsonb, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_seen uuid[] := array[]::uuid[];
  v_items jsonb := '[]'::jsonb;
  v_payload jsonb;
  v_existing public.food_stock_transfer_batches%rowtype;
  v_transfer jsonb;
  v_result_items jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if auth.uid() is null or not public.food_is_store_admin(p_store_id) then
    raise exception 'Sem permissão para transferir estoque desta loja.' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_from_location_id is null or p_to_location_id is null
     or p_from_location_id = p_to_location_id
     or p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Selecione locais e produtos válidos.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Selecione locais e produtos válidos.' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' or (v_item->>'quantity') !~ '^[0-9]+$' then
      raise exception 'Quantidade de transferência inválida.' using errcode = '22023';
    end if;
    begin
      v_product_id := (v_item->>'product_id')::uuid;
      v_quantity := (v_item->>'quantity')::integer;
    exception when others then
      raise exception 'Produto ou quantidade inválidos.' using errcode = '22023';
    end;
    if v_product_id is null or v_quantity < 1 or v_product_id = any(v_seen) then
      raise exception 'Produto repetido ou quantidade inválida.' using errcode = '22023';
    end if;
    v_seen := array_append(v_seen, v_product_id);
    v_items := v_items || jsonb_build_array(jsonb_build_object('product_id', v_product_id, 'quantity', v_quantity));
  end loop;
  select jsonb_agg(value order by (value->>'product_id')::uuid) into v_items
    from jsonb_array_elements(v_items);
  v_payload := jsonb_build_object('from', p_from_location_id, 'to', p_to_location_id, 'items', v_items);
  insert into public.food_stock_transfer_batches(store_id, idempotency_key, request_payload, created_by)
  values (p_store_id, p_idempotency_key, v_payload, auth.uid())
  on conflict (store_id, idempotency_key) do nothing;
  if not found then
    select * into v_existing from public.food_stock_transfer_batches
     where store_id = p_store_id and idempotency_key = p_idempotency_key for update;
    if v_existing.request_payload is distinct from v_payload then
      raise exception 'Identificador já usado por outra transferência.' using errcode = '22023';
    end if;
    return coalesce(v_existing.result, '{}'::jsonb) || jsonb_build_object('replayed', true);
  end if;
  -- Product order is stable across concurrent batches. The existing single
  -- transfer RPC performs the balance locks and writes the movement ledger.
  for v_item in select value from jsonb_array_elements(v_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    v_transfer := public.food_transfer_location_stock_v1(
      p_store_id, v_product_id, p_from_location_id, p_to_location_id,
      v_quantity, 'Transferência interna', gen_random_uuid()
    );
    v_result_items := v_result_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'from_stock', v_transfer->'from_stock', 'to_stock', v_transfer->'to_stock'
    ));
  end loop;
  v_result := jsonb_build_object('items', v_result_items, 'replayed', false);
  update public.food_stock_transfer_batches set result = v_result
   where store_id = p_store_id and idempotency_key = p_idempotency_key;
  return v_result;
end;
$$;
revoke all on function public.food_transfer_location_stock_batch_v1(uuid, uuid, uuid, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.food_transfer_location_stock_batch_v1(uuid, uuid, uuid, jsonb, uuid)
  to authenticated;

notify pgrst, 'reload schema';
commit;
