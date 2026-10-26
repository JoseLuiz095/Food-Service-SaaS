begin;

-- Every tracked product must have a balance row for every active stock
-- location. Historically, location creation initialized existing products,
-- but products added later only received their default-location row.
create or replace function public.food_initialize_product_location_balances()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.track_stock, false) then
    insert into public.food_product_location_stock(
      store_id, product_id, location_id, stock_quantity, stock_reserved_quantity
    )
    select new.store_id, new.id, l.id, 0, 0
      from public.food_stock_locations l
     where l.store_id = new.store_id and l.active
    on conflict (product_id, location_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.food_initialize_product_location_balances() from public, anon, authenticated;

drop trigger if exists food_products_initialize_location_balances on public.food_products;
create trigger food_products_initialize_location_balances
  after insert or update of track_stock on public.food_products
  for each row
  when (new.track_stock)
  execute function public.food_initialize_product_location_balances();

-- If an empty location is reactivated, restore any missing zero-balance rows.
drop trigger if exists food_stock_location_initialize_balances_on_activation on public.food_stock_locations;
create trigger food_stock_location_initialize_balances_on_activation
  after update of active on public.food_stock_locations
  for each row
  when (new.active and not old.active)
  execute function public.food_initialize_location_balances();

-- Backfill only missing pairs. Existing physical and reserved quantities are
-- never overwritten; each inserted row represents an actual zero balance.
insert into public.food_product_location_stock(
  store_id, product_id, location_id, stock_quantity, stock_reserved_quantity
)
select p.store_id, p.id, l.id, 0, 0
  from public.food_products p
  join public.food_stock_locations l on l.store_id = p.store_id and l.active
 where p.track_stock
on conflict (product_id, location_id) do nothing;

-- The transfer RPC must tolerate legacy or concurrently missing zero rows.
-- Locations and the product are validated before balances are initialized;
-- the product lock and ordered balance locks serialize competing transfers.
create or replace function public.food_transfer_location_stock_v1(
  p_store_id uuid,
  p_product_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_quantity integer,
  p_reason text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from integer;
  v_reserved integer;
  v_to integer;
  v_existing public.food_stock_location_movements%rowtype;
begin
  if (select auth.uid()) is null or not public.food_is_store_admin(p_store_id) then
    raise exception 'Sem permissão para transferir estoque desta loja.' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity < 1
     or p_from_location_id is null or p_to_location_id is null
     or p_from_location_id = p_to_location_id
     or p_reason is null or length(trim(p_reason)) not between 1 and 160
     or p_idempotency_key is null then
    raise exception 'Dados de transferência inválidos.' using errcode = '22023';
  end if;

  perform 1 from public.food_products
   where id = p_product_id and store_id = p_store_id and track_stock
   for update;
  if not found then
    raise exception 'Produto sem controle de estoque nesta loja.' using errcode = '22023';
  end if;

  select * into v_existing
    from public.food_stock_location_movements
   where store_id = p_store_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.product_id <> p_product_id
       or v_existing.movement_type <> 'transfer'
       or v_existing.from_location_id <> p_from_location_id
       or v_existing.to_location_id <> p_to_location_id
       or v_existing.quantity <> p_quantity
       or v_existing.request_payload <> jsonb_build_object('quantity', p_quantity, 'reason', trim(p_reason)) then
      raise exception 'Identificador já usado por outra operação.' using errcode = '22023';
    end if;
    return jsonb_build_object('replayed', true);
  end if;

  if (select count(*) from public.food_stock_locations
       where store_id = p_store_id and active
         and id in (p_from_location_id, p_to_location_id)) <> 2 then
    raise exception 'Origem ou destino inexistente ou inativo.' using errcode = '22023';
  end if;

  insert into public.food_product_location_stock(
    store_id, product_id, location_id, stock_quantity, stock_reserved_quantity
  )
  select p_store_id, p_product_id, location_id, 0, 0
    from unnest(array[p_from_location_id, p_to_location_id]) as location_id
  on conflict (product_id, location_id) do nothing;

  perform 1 from public.food_product_location_stock
   where store_id = p_store_id and product_id = p_product_id
     and location_id in (p_from_location_id, p_to_location_id)
   order by location_id
   for update;

  select stock_quantity, stock_reserved_quantity into v_from, v_reserved
    from public.food_product_location_stock
   where store_id = p_store_id and product_id = p_product_id
     and location_id = p_from_location_id;
  select stock_quantity into v_to
    from public.food_product_location_stock
   where store_id = p_store_id and product_id = p_product_id
     and location_id = p_to_location_id;

  if v_from is null or v_to is null then
    raise exception 'Origem ou destino não encontrado.' using errcode = '22023';
  end if;
  if v_from - v_reserved < p_quantity then
    raise exception 'Saldo disponível insuficiente na origem.' using errcode = '22023';
  end if;
  if v_to::bigint + p_quantity > 2147483647 then
    raise exception 'O saldo do destino excederia o limite permitido.' using errcode = '22023';
  end if;

  update public.food_product_location_stock
     set stock_quantity = stock_quantity - p_quantity, updated_at = now()
   where store_id = p_store_id and product_id = p_product_id
     and location_id = p_from_location_id;
  update public.food_product_location_stock
     set stock_quantity = stock_quantity + p_quantity, updated_at = now()
   where store_id = p_store_id and product_id = p_product_id
     and location_id = p_to_location_id;

  insert into public.food_stock_location_movements(
    store_id, product_id, from_location_id, to_location_id, movement_type,
    quantity, request_payload, reason, idempotency_key, created_by
  ) values (
    p_store_id, p_product_id, p_from_location_id, p_to_location_id, 'transfer',
    p_quantity, jsonb_build_object('quantity', p_quantity, 'reason', trim(p_reason)),
    trim(p_reason), p_idempotency_key, (select auth.uid())
  );

  return jsonb_build_object('from_stock', v_from - p_quantity, 'to_stock', v_to + p_quantity);
end;
$$;
revoke all on function public.food_transfer_location_stock_v1(uuid, uuid, uuid, uuid, integer, text, uuid)
  from public, anon, authenticated;
grant execute on function public.food_transfer_location_stock_v1(uuid, uuid, uuid, uuid, integer, text, uuid)
  to authenticated;

notify pgrst, 'reload schema';
commit;
