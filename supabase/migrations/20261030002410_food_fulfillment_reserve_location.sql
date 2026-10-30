-- Scheduled orders can be created with an unreserved shortfall. At physical
-- handoff, claim the now available stock in their original location first.
-- The status update, reservation, sale ledger and physical debit share a
-- transaction: any shortfall rolls everything back.
create or replace function public.food_commit_inventory_on_fulfillment()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  v_item record;
  v_location_id uuid;
  v_previous_location text;
  v_reserved integer;
  v_awaiting boolean;
begin
  if new.status not in ('delivered','picked_up') or old.status is not distinct from new.status then
    return new;
  end if;
  if new.inventory_status='released' then
    raise exception 'Pedido com estoque liberado não pode ser entregue.' using errcode='23514';
  end if;

  select id into v_location_id from public.food_stock_locations
   where store_id=new.store_id
     and id=coalesce(new.stock_location_id,
       (select id from public.food_stock_locations where store_id=new.store_id and is_default))
     and active;
  if v_location_id is null then
    raise exception 'Local de estoque do pedido indisponível.' using errcode='23514';
  end if;

  for v_item in
    select oi.id,oi.product_id,oi.quantity,coalesce(oi.inventory_reserved_quantity,0) as reserved,
           p.name
      from public.food_order_items oi join public.food_products p on p.id=oi.product_id
     where oi.order_id=new.id and p.track_stock
       and not exists (select 1 from public.food_order_stock_movements m
                        where m.order_item_id=oi.id and m.event_type='sale')
     order by oi.product_id,oi.id
     for update of oi
  loop
    if v_item.reserved > v_item.quantity then
      raise exception 'Reserva inconsistente para %.',v_item.name using errcode='23514';
    end if;
    if v_item.reserved < v_item.quantity then
      v_previous_location := current_setting('food.order_stock_location',true);
      perform set_config('food.order_stock_location',v_location_id::text,true);
      select r.reserved_quantity,r.awaiting_restock into v_reserved,v_awaiting
        from public.food_reserve_product_inventory(v_item.product_id,v_item.quantity-v_item.reserved,false) r;
      perform set_config('food.order_stock_location',coalesce(v_previous_location,''),true);
      if v_awaiting or v_reserved <> v_item.quantity-v_item.reserved then
        raise exception 'Estoque insuficiente no local do pedido para %.',v_item.name using errcode='23514';
      end if;
      update public.food_order_items set inventory_reserved_quantity=v_item.reserved+v_reserved where id=v_item.id;
    end if;
  end loop;
  perform public.food_commit_order_inventory(new.id);
  return new;
end;
$$;

revoke all on function public.food_commit_inventory_on_fulfillment() from public,anon,authenticated;
