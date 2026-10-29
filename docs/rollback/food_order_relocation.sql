begin;
CREATE OR REPLACE FUNCTION public.food_guard_order_stock_location()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.stock_location_id is distinct from old.stock_location_id or new.pickup_location_id is distinct from old.pickup_location_id then
    if exists(select 1 from public.food_order_items where order_id=old.id) then
      raise exception 'O local de estoque não pode mudar depois de reservar os itens.' using errcode='23514';
    end if;
  end if;
  return new;
end;
$function$

drop function public.food_edit_order_pickup_v1(uuid,uuid,uuid,jsonb);
notify pgrst,'reload schema';
commit;
