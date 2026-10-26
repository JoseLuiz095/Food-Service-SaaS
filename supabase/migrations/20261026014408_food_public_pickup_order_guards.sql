begin;

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

notify pgrst, 'reload schema';
commit;
