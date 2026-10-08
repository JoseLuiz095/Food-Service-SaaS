-- Corrige o caso em que um datetime-local à meia-noite era interpretado
-- no fuso do banco como o dia anterior e fazia o agendamento cair na regra
-- de estoque imediato. Pedidos futuros continuam sem baixa até a confirmação.
begin;

create or replace function public.food_reserve_inventory_on_item_insert()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_order public.food_orders%rowtype;
  v_product public.food_products%rowtype;
  v_store public.food_stores%rowtype;
  v_reserved integer;
  v_awaiting boolean;
  v_allow_future boolean := false;
  v_timezone text;
  v_local_scheduled_date date;
  v_local_today date;
begin
  select * into v_order from public.food_orders where id = new.order_id for update;
  if not found or new.product_id is null then return new; end if;
  if v_order.inventory_status = 'released' then return new; end if;

  select * into v_product from public.food_products where id = new.product_id for update;
  if not found or not v_product.track_stock then return new; end if;
  select * into v_store from public.food_stores where id = v_order.store_id;
  v_timezone := coalesce(v_store.opening_hours->>'timezone', 'America/Sao_Paulo');
  v_local_today := (now() at time zone v_timezone)::date;
  if v_order.scheduled_for is not null then
    v_local_scheduled_date := (v_order.scheduled_for at time zone v_timezone)::date;
  end if;
  -- desired_date é uma segunda proteção para instalações que receberam um
  -- agendamento antigo sem offset de fuso horário.
  v_allow_future := v_order.scheduled_for is not null
    and (v_local_scheduled_date >= v_local_today + 1
      or coalesce(v_order.desired_date, date '1900-01-01') >= v_local_today + 1);

  select r.reserved_quantity, r.awaiting_restock into v_reserved, v_awaiting
    from public.food_reserve_product_inventory(new.product_id, new.quantity, v_allow_future) r;

  update public.food_order_items
     set inventory_reserved_quantity = coalesce(v_reserved, 0)
   where id = new.id;
  update public.food_orders
     set inventory_status = case
       when v_awaiting then 'awaiting_restock'
       when coalesce(v_reserved, 0) > 0 then 'reserved'
       else inventory_status
     end,
     updated_at = now()
   where id = new.order_id;

  if v_order.payment_status = 'paid' and not v_awaiting then
    perform public.food_commit_order_inventory(new.order_id);
  end if;
  return new;
end;
$$;

revoke all on function public.food_reserve_inventory_on_item_insert() from public,anon,authenticated;

commit;
