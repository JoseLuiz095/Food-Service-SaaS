-- food: serialize recipe consumption with unit conversion and restore caller flags.
-- Additive correction; requires 20261025143142. No data repair, no balance backfill.
begin;

create or replace function public.food_reconcile_order_recipe_consumption(
  p_order_id uuid,
  p_allow_partial boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.food_orders%rowtype;
  v_target record;
  v_existing public.food_inventory_order_consumptions%rowtype;
  v_inventory public.food_inventory_items%rowtype;
  v_desired numeric(14,3);
  v_applied numeric(14,3);
  v_delta numeric(14,3);
  v_to_consume numeric(14,3);
  v_before numeric(14,3);
  v_after numeric(14,3);
  v_cost numeric(14,4);
  v_factor numeric;
  v_pending boolean := false;
  v_previous_reconcile text := coalesce(current_setting('foodweb.recipe_reconcile', true), '');
  v_previous_mutation text := coalesce(current_setting('foodweb.inventory_mutation', true), '');
begin
  if v_previous_reconcile = 'on' then
    return;
  end if;
  select * into v_order
    from public.food_orders
   where id = p_order_id
   for update;
  if not found then return; end if;
  if v_order.inventory_status = 'released' and v_order.status <> 'cancelled' then return; end if;

  -- Early returns above do not change flags; nested calls below are suppressed.
  perform set_config('foodweb.recipe_reconcile', 'on', true);

  -- Existing orders retain their ingredient revision when a recipe changes.
  for v_target in
    select oi.id as order_item_id,
           r.id as recipe_id,
           ri.id as recipe_item_id,
           ri.inventory_item_id,
           ri.unit as target_unit,
           oi.quantity as order_quantity,
           greatest(0, case when v_order.status = 'cancelled' then 0
             when c.id is not null then
               coalesce(c.target_quantity * oi.quantity / nullif(c.order_quantity_at_target, 0), c.target_quantity)
             else (oi.quantity::numeric * ri.quantity / nullif(r.yield_quantity, 0))
               * (1 + ri.waste_percent / 100) end) as desired_quantity
      from public.food_order_items oi
      join public.food_product_recipes r
        on r.store_id = v_order.store_id and r.product_id = oi.product_id and r.active
      join public.food_product_recipe_items ri
        on ri.store_id = r.store_id and ri.recipe_id = r.id
      left join public.food_inventory_order_consumptions c
        on c.order_item_id=oi.id and c.recipe_item_id=ri.id
     where oi.order_id = p_order_id
       and (c.id is not null or (ri.active and not exists (
         select 1 from public.food_inventory_order_consumptions prior where prior.order_item_id=oi.id
       )))
  loop
    -- A target cursor can have an older snapshot than the converter. Capture its
    -- unit, then lock the ingredient BEFORE the consumption row (converter order).
    -- Convert the captured target to the locked balance's unit, rather than treating
    -- 100 old grams as 100 new kilograms. No extra product lock in restock triggers.
    select * into v_inventory from public.food_inventory_items
     where id = v_target.inventory_item_id and store_id = v_order.store_id for update;
    if not found then raise exception 'Insumo da ficha técnica não encontrado.'; end if;
    v_factor := case
      when v_target.target_unit = v_inventory.unit then 1
      when v_target.target_unit = 'g' and v_inventory.unit = 'kg' then 0.001
      when v_target.target_unit = 'kg' and v_inventory.unit = 'g' then 1000
      when v_target.target_unit = 'ml' and v_inventory.unit = 'l' then 0.001
      when v_target.target_unit = 'l' and v_inventory.unit = 'ml' then 1000
      else null end;
    if v_factor is null then raise exception 'Unidades incompatíveis na reconciliação.' using errcode = '22023'; end if;
    v_desired := round(v_target.desired_quantity * v_factor, 3);
    select * into v_existing
      from public.food_inventory_order_consumptions c
     where c.order_item_id = v_target.order_item_id
       and c.recipe_item_id = v_target.recipe_item_id
       and c.store_id = v_order.store_id
     for update;
    v_applied := coalesce(v_existing.consumed_quantity, 0);

    if v_desired > v_applied then
      v_delta := v_desired - v_applied;
      if not v_inventory.active then
        raise exception 'Insumo da ficha técnica não encontrado ou inativo.';
      end if;
      v_to_consume := least(v_delta, greatest(v_inventory.current_quantity, 0));
      if not p_allow_partial and v_to_consume < v_delta then
        raise exception 'Estoque insuficiente para o insumo %.', v_inventory.name;
      end if;
      if v_to_consume > 0 then
        v_before := v_inventory.current_quantity;
        v_after := v_before - v_to_consume;
        v_cost := v_inventory.average_unit_cost;
        perform set_config('foodweb.inventory_mutation', 'on', true);
        update public.food_inventory_items
           set current_quantity = v_after,
               updated_at = now()
         where id = v_inventory.id;
        insert into public.food_inventory_movements(
          store_id, inventory_item_id, movement_type, quantity_delta,
          quantity_before, quantity_after, unit_cost, total_cost,
          source_type, source_id, source_reference, reason, created_by
        ) values (
          v_order.store_id, v_inventory.id, 'consumption', -v_to_consume,
          v_before, v_after, v_cost, round(-v_to_consume * v_cost, 2),
          'order_recipe', v_target.order_item_id, p_order_id::text,
          'Consumo automático pela ficha técnica', auth.uid()
        );
      end if;
      v_applied := v_applied + coalesce(v_to_consume, 0);
    elsif v_desired < v_applied then
      v_delta := v_applied - v_desired;
      v_before := v_inventory.current_quantity;
      v_after := v_before + v_delta;
      v_cost := v_inventory.average_unit_cost;
      perform set_config('foodweb.inventory_mutation', 'on', true);
      update public.food_inventory_items
         set current_quantity = v_after,
             updated_at = now()
       where id = v_inventory.id;
      insert into public.food_inventory_movements(
        store_id, inventory_item_id, movement_type, quantity_delta,
        quantity_before, quantity_after, unit_cost, total_cost,
        source_type, source_id, source_reference, reason, created_by
      ) values (
        v_order.store_id, v_inventory.id, 'return', v_delta,
        v_before, v_after, v_cost, round(v_delta * v_cost, 2),
        'order_recipe', v_target.order_item_id, p_order_id::text,
        case when v_order.status = 'cancelled' then 'Estorno de consumo por cancelamento'
             else 'Estorno de consumo após correção do pedido' end,
        auth.uid()
      );
      v_applied := v_desired;
    end if;

    if v_existing.id is null then
      insert into public.food_inventory_order_consumptions(
        store_id, order_id, order_item_id, recipe_id, recipe_item_id,
        inventory_item_id, target_quantity, consumed_quantity, order_quantity_at_target
      ) values (
        v_order.store_id, p_order_id, v_target.order_item_id, v_target.recipe_id,
        v_target.recipe_item_id, v_target.inventory_item_id, v_desired, v_applied, v_target.order_quantity
      );
    else
      update public.food_inventory_order_consumptions
         set target_quantity = v_desired,
             consumed_quantity = v_applied,
             order_quantity_at_target = v_target.order_quantity
       where id = v_existing.id;
    end if;
    if v_applied < v_desired then v_pending := true; end if;
  end loop;

  -- Only cancellation or removal of the ordered item releases past consumption;
  -- archiving an ingredient from the current recipe cannot undo an old order.
  for v_target in
    select c.id as consumption_id, c.order_item_id, c.recipe_id, c.recipe_item_id,
           c.inventory_item_id, c.consumed_quantity
      from public.food_inventory_order_consumptions c
     where c.order_id = p_order_id
       and c.store_id = v_order.store_id
       and c.consumed_quantity > 0
       and (v_order.status = 'cancelled' or not exists (
         select 1 from public.food_order_items oi
         where oi.id = c.order_item_id and oi.order_id = p_order_id
       ))
  loop
    select * into v_inventory
      from public.food_inventory_items
     where id = v_target.inventory_item_id and store_id = v_order.store_id
     for update;
    if found then
      -- Re-read consumed_quantity after the ingredient lock: conversion may have
      -- scaled this row while the cursor was waiting. Match converter lock order.
      select * into v_existing from public.food_inventory_order_consumptions
       where id = v_target.consumption_id and store_id = v_order.store_id for update;
      if not found or v_existing.consumed_quantity <= 0 then continue; end if;
      v_before := v_inventory.current_quantity;
      v_after := v_before + v_existing.consumed_quantity;
      v_cost := v_inventory.average_unit_cost;
      perform set_config('foodweb.inventory_mutation', 'on', true);
      update public.food_inventory_items set current_quantity = v_after, updated_at = now() where id = v_inventory.id;
      insert into public.food_inventory_movements(
        store_id, inventory_item_id, movement_type, quantity_delta,
        quantity_before, quantity_after, unit_cost, total_cost,
        source_type, source_id, source_reference, reason, created_by
      ) values (
        v_order.store_id, v_inventory.id, 'return', v_existing.consumed_quantity,
        v_before, v_after, v_cost, round(v_existing.consumed_quantity * v_cost, 2),
        'order_recipe', v_target.order_item_id, p_order_id::text,
        'Estorno de consumo por item removido ou cancelamento', auth.uid()
      );
      update public.food_inventory_order_consumptions
         set target_quantity = 0, consumed_quantity = 0
       where id = v_existing.id and store_id = v_order.store_id;
    end if;
  end loop;

  if v_order.status <> 'cancelled' and v_order.payment_status = 'paid' then
    select exists (
      select 1 from public.food_inventory_order_consumptions c
       where c.order_id = p_order_id and c.target_quantity > c.consumed_quantity
    ) into v_pending;
    if v_pending then
      update public.food_orders set inventory_status = 'awaiting_restock', updated_at = now() where id = p_order_id;
    elsif v_order.inventory_status = 'awaiting_restock' then
      update public.food_orders set inventory_status = 'committed', updated_at = now() where id = p_order_id;
    end if;
  end if;
  perform set_config('foodweb.recipe_reconcile', v_previous_reconcile, true);
  perform set_config('foodweb.inventory_mutation', v_previous_mutation, true);
exception when others then
  -- GUCs are transaction-scoped, not function-scoped. Restore the caller's
  -- values even when a replenishment trigger catches this error and continues.
  perform set_config('foodweb.recipe_reconcile', v_previous_reconcile, true);
  perform set_config('foodweb.inventory_mutation', v_previous_mutation, true);
  raise;
end;
$$;

revoke all on function public.food_reconcile_order_recipe_consumption(uuid, boolean) from public, anon, authenticated;
grant execute on function public.food_reconcile_order_recipe_consumption(uuid, boolean) to service_role;
notify pgrst, 'reload schema';
commit;
