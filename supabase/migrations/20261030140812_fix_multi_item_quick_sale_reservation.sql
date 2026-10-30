-- Excludes already committed lines from the unreserved inventory status check for immediate multi-item sales.
CREATE OR REPLACE FUNCTION public.food_reserve_inventory_on_item_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order public.food_orders%rowtype; v_product public.food_products%rowtype; v_store public.food_stores%rowtype;
  v_reserved integer; v_awaiting boolean; v_allow_future boolean := false; v_timezone text;
  v_local_scheduled_date date; v_local_today date; v_inventory_status text;
  v_location_id uuid; v_previous_location text;
begin
  select * into v_order from public.food_orders where id=new.order_id for update;
  if not found or new.product_id is null or v_order.inventory_status='released' then return new; end if;
  select * into v_product from public.food_products where id=new.product_id for update;
  if not found or not v_product.track_stock then return new; end if;
  select * into v_store from public.food_stores where id=v_order.store_id;
  v_timezone:=coalesce(v_store.opening_hours->>'timezone','America/Sao_Paulo');
  v_local_today:=(now() at time zone v_timezone)::date;
  if v_order.scheduled_for is not null then v_local_scheduled_date:=(v_order.scheduled_for at time zone v_timezone)::date; end if;
  v_allow_future:=v_order.scheduled_for is not null and (v_local_scheduled_date>=v_local_today+1 or coalesce(v_order.desired_date,date '1900-01-01')>=v_local_today+1);
  if to_regprocedure('public.food_reserve_product_inventory(uuid,integer,boolean)') is null then return new; end if;
  select id into v_location_id from public.food_stock_locations where store_id=v_order.store_id and id=coalesce(v_order.stock_location_id,(select id from public.food_stock_locations where store_id=v_order.store_id and is_default)) and active;
  if v_location_id is null then raise exception 'Local de estoque indisponível.'; end if;
  v_previous_location := current_setting('food.order_stock_location',true);
  perform set_config('food.order_stock_location',v_location_id::text,true);
  select r.reserved_quantity,r.awaiting_restock into v_reserved,v_awaiting from public.food_reserve_product_inventory(new.product_id,new.quantity,v_allow_future) r;
  perform set_config('food.order_stock_location',coalesce(v_previous_location,''),true);
  update public.food_order_items set inventory_reserved_quantity=coalesce(v_reserved,0) where id=new.id;
  select case
    when exists (select 1 from public.food_order_items oi join public.food_products p on p.id=oi.product_id where oi.order_id=new.order_id and p.track_stock and coalesce(oi.inventory_reserved_quantity,0)<oi.quantity and not exists (select 1 from public.food_order_stock_movements m where m.order_item_id=oi.id and m.event_type='sale')) then 'awaiting_restock'
    when exists (select 1 from public.food_order_items oi join public.food_products p on p.id=oi.product_id where oi.order_id=new.order_id and p.track_stock and coalesce(oi.inventory_reserved_quantity,0)>0) then 'reserved'
    else coalesce(v_order.inventory_status,'not_tracked') end into v_inventory_status;
  update public.food_orders set inventory_status=v_inventory_status,updated_at=now() where id=new.order_id;
  if v_order.status in ('delivered','picked_up') then
    if v_inventory_status='awaiting_restock' then raise exception 'Não é possível entregar um item sem saldo integral reservado.' using errcode='23514'; end if;
    perform public.food_commit_order_inventory(new.order_id);
  end if;
  return new;
end;
$function$;
