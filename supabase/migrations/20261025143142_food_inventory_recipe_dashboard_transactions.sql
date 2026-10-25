-- food: atomic inventory details, recipe preservation, authoritative dashboard totals.
-- Requires the recipe consumption, unit conversion and product stock migrations through 20261024001500.
begin;

alter table public.food_product_recipe_items
  add column if not exists active boolean not null default true;
create index if not exists food_product_recipe_items_active_idx
  on public.food_product_recipe_items(store_id,recipe_id,sort_order) where active;
-- Existing consumption rows keep their current target on their first pass.
alter table public.food_inventory_order_consumptions
  add column if not exists order_quantity_at_target numeric;

-- Archived historical lines must not prevent archiving an ingredient after
-- its current recipe no longer uses it.
create or replace function public.food_inventory_guard_archive_in_use()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if old.active and not new.active and exists (
    select 1 from public.food_product_recipe_items ri
    join public.food_product_recipes r on r.id=ri.recipe_id and r.store_id=ri.store_id and r.active
    where ri.store_id=new.store_id and ri.inventory_item_id=new.id and ri.active
  ) then
    raise exception 'Não é possível arquivar este insumo enquanto ele estiver em uma ficha técnica ativa.' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.food_inventory_guard_archive_in_use() from public,anon,authenticated;

-- The key identifies the entire requested adjustment, even when a fulfillment
-- trigger changes the final balance after the requested set/add/remove.
alter table public.food_product_stock_movements
  add column if not exists requested_quantity integer;

-- The existing converter qualifies its relations/functions explicitly; remove
-- writable schemas from its SECURITY DEFINER lookup path without changing its body.
alter function public.food_convert_inventory_unit(uuid,uuid,text) set search_path = '';

create or replace function public.food_update_inventory_item_v1(
  p_store_id uuid,p_inventory_item_id uuid,p_data jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item public.food_inventory_items%rowtype; v_unit text; v_point numeric; v_name text; v_type text;
begin
  if auth.uid() is null or not public.food_is_store_admin(p_store_id) then
    raise exception 'Sem permissão para editar este insumo.' using errcode='42501';
  end if;
  if p_data is null or jsonb_typeof(p_data)<>'object' or
    (p_data-array['name','item_type','unit','reorder_point','low_stock_alert_enabled','notes','active'])<>'{}'::jsonb then
    raise exception 'Campos de insumo inválidos.' using errcode='22023';
  end if;
  select * into v_item from public.food_inventory_items
    where id=p_inventory_item_id and store_id=p_store_id for update;
  if not found then raise exception 'Insumo não encontrado nesta loja.' using errcode='22023'; end if;
  if p_data ? 'unit' and jsonb_typeof(p_data->'unit')<>'string' then
    raise exception 'Unidade inválida.' using errcode='22023'; end if;
  v_unit:=coalesce(p_data->>'unit',v_item.unit);
  if v_unit not in ('g','kg','ml','l','un','pack') then raise exception 'Unidade inválida.' using errcode='22023'; end if;
  if p_data ? 'name' then
    if jsonb_typeof(p_data->'name')<>'string' or length(btrim(p_data->>'name')) not between 1 and 120 then
      raise exception 'Informe um nome de até 120 caracteres.' using errcode='22023'; end if;
  end if;
  if p_data ? 'item_type' then
    if jsonb_typeof(p_data->'item_type')<>'string' or p_data->>'item_type' not in ('ingredient','packaging','finished_good','operating','other') then
      raise exception 'Tipo de insumo inválido.' using errcode='22023'; end if;
  end if;
  if p_data ? 'reorder_point' then
    if jsonb_typeof(p_data->'reorder_point')<>'number' then raise exception 'Estoque mínimo inválido.' using errcode='22023'; end if;
    v_point:=(p_data->>'reorder_point')::numeric;
    if v_point<0 or v_point>99999999999.999 or v_point<>round(v_point,3) then
      raise exception 'Estoque mínimo excede a precisão permitida.' using errcode='22023'; end if;
  end if;
  if p_data ? 'low_stock_alert_enabled' and jsonb_typeof(p_data->'low_stock_alert_enabled')<>'boolean' then
    raise exception 'Configuração de alerta inválida.' using errcode='22023'; end if;
  if p_data ? 'active' and jsonb_typeof(p_data->'active')<>'boolean' then
    raise exception 'Estado do insumo inválido.' using errcode='22023'; end if;
  if p_data ? 'notes' and jsonb_typeof(p_data->'notes') not in ('string','null') then
    raise exception 'Observação inválida.' using errcode='22023'; end if;
  if length(coalesce(p_data->>'notes',''))>5000 then
    raise exception 'Observação excede 5000 caracteres.' using errcode='22023'; end if;
  if v_item.unit is distinct from v_unit then
    -- This operation locks the item and converts saldo, threshold, cost and
    -- historical quantities together. It suppresses false replenishment.
    perform public.food_convert_inventory_unit(p_store_id,p_inventory_item_id,v_unit);
  end if;
  update public.food_inventory_items set
    name=case when p_data ? 'name' then btrim(p_data->>'name') else name end,
    item_type=case when p_data ? 'item_type' then p_data->>'item_type' else item_type end,
    reorder_point=case when p_data ? 'reorder_point' then v_point else reorder_point end,
    low_stock_alert_enabled=case when p_data ? 'low_stock_alert_enabled' then (p_data->>'low_stock_alert_enabled')::boolean else low_stock_alert_enabled end,
    notes=case when p_data ? 'notes' then nullif(btrim(p_data->>'notes'),'') else notes end,
    active=case when p_data ? 'active' then (p_data->>'active')::boolean else active end
    where id=p_inventory_item_id and store_id=p_store_id returning * into v_item;
  return jsonb_build_object('item',to_jsonb(v_item));
end $$;
revoke all on function public.food_update_inventory_item_v1(uuid,uuid,jsonb) from public,anon;
grant execute on function public.food_update_inventory_item_v1(uuid,uuid,jsonb) to authenticated;

create or replace function public.food_save_product_recipe_v1(
  p_store_id uuid,p_product_id uuid,p_name text,p_yield_quantity numeric,
  p_yield_unit text,p_notes text,p_items jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_recipe public.food_product_recipes%rowtype; v_inventory public.food_inventory_items%rowtype;
  v_input jsonb; v_id uuid; v_stage text; v_unit text; v_quantity numeric;
  v_waste numeric; v_order integer; v_factor numeric; v_existing uuid; v_seen text[]:=array[]::text[];
  v_rows jsonb; v_product uuid; v_current_ids uuid[]:=array[]::uuid[];
begin
  if auth.uid() is null or not public.food_is_store_admin(p_store_id) then
    raise exception 'Sem permissão para salvar esta ficha.' using errcode='42501'; end if;
  if p_yield_quantity is null or p_yield_quantity<=0 or p_yield_quantity>99999999999.999
    or p_yield_quantity<>round(p_yield_quantity,3) or p_yield_unit is null
    or p_yield_unit not in ('g','kg','ml','l','un','pack') then
    raise exception 'Rendimento da ficha inválido.' using errcode='22023'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Informe de 1 a 100 itens na ficha.' using errcode='22023'; end if;
  if length(coalesce(p_name,''))>120 or length(coalesce(p_notes,''))>5000 then
    raise exception 'Nome ou observação da ficha muito longo.' using errcode='22023'; end if;
  select id into v_product from public.food_products where id=p_product_id and store_id=p_store_id for update;
  if not found then raise exception 'Produto não encontrado nesta loja.' using errcode='22023'; end if;
  -- Lock all ingredients in stable order; concurrent unit conversions wait.
  for v_inventory in select i.* from public.food_inventory_items i
    where i.store_id=p_store_id and i.id in (
      select (value->>'inventory_item_id')::uuid from jsonb_array_elements(p_items) x(value)
      where jsonb_typeof(value)='object' and value->>'inventory_item_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) order by i.id for share loop null; end loop;
  select * into v_recipe from public.food_product_recipes
    where store_id=p_store_id and product_id=p_product_id for update;
  if found then
    update public.food_product_recipes set name=coalesce(nullif(btrim(p_name),''),'Receita principal'),
      yield_quantity=p_yield_quantity,yield_unit=p_yield_unit,notes=nullif(btrim(p_notes),''),active=true
      where id=v_recipe.id returning * into v_recipe;
  else
    insert into public.food_product_recipes(store_id,product_id,name,yield_quantity,yield_unit,notes)
    values(p_store_id,p_product_id,coalesce(nullif(btrim(p_name),''),'Receita principal'),p_yield_quantity,p_yield_unit,nullif(btrim(p_notes),''))
    returning * into v_recipe;
  end if;
  select coalesce(array_agg(id),array[]::uuid[]) into v_current_ids
    from public.food_product_recipe_items where recipe_id=v_recipe.id and store_id=p_store_id and active;
  -- Restrict FK from historical consumptions forbids DELETE. Inactivation
  -- removes ingredients from future consumption without losing audit IDs.
  update public.food_product_recipe_items set active=false where recipe_id=v_recipe.id and store_id=p_store_id and active;
  for v_input in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_input)<>'object' or
      (v_input-array['inventory_item_id','stage','quantity','unit','waste_percent','sort_order'])<>'{}'::jsonb or
      coalesce(v_input->>'inventory_item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or
      jsonb_typeof(v_input->'quantity')<>'number' or
      (v_input ? 'stage' and jsonb_typeof(v_input->'stage') not in ('string','null')) or
      jsonb_typeof(v_input->'unit')<>'string' or
      (v_input ? 'waste_percent' and jsonb_typeof(v_input->'waste_percent')<>'number') or
      (v_input ? 'sort_order' and jsonb_typeof(v_input->'sort_order')<>'number') then
      raise exception 'Linha da ficha inválida.' using errcode='22023'; end if;
    if v_input ? 'sort_order' and (v_input->>'sort_order')::numeric<>trunc((v_input->>'sort_order')::numeric) then
      raise exception 'Ordem dos ingredientes deve ser inteira.' using errcode='22023'; end if;
    v_id:=(v_input->>'inventory_item_id')::uuid;
    v_stage:=coalesce(nullif(btrim(v_input->>'stage'),''),'Geral');
    v_unit:=v_input->>'unit';
    v_waste:=coalesce((v_input->>'waste_percent')::numeric,0);
    v_order:=coalesce((v_input->>'sort_order')::integer,0);
    v_quantity:=(v_input->>'quantity')::numeric;
    if length(v_stage)>80 or v_waste<0 or v_waste>100 or v_waste<>round(v_waste,2)
      or v_order<0 or v_order>10000 or v_quantity<=0 or v_quantity>99999999999.999
      or v_unit not in ('g','kg','ml','l','un','pack') then
      raise exception 'Quantidade, etapa ou perda inválida.' using errcode='22023'; end if;
    if v_id::text||'|'||lower(v_stage)=any(v_seen) then
      raise exception 'Insumo duplicado na mesma etapa.' using errcode='22023'; end if;
    v_seen:=array_append(v_seen,v_id::text||'|'||lower(v_stage));
    select * into v_inventory from public.food_inventory_items
      where id=v_id and store_id=p_store_id and active;
    if not found then raise exception 'Insumo ausente ou inativo nesta loja.' using errcode='22023'; end if;
    v_factor:=case when v_unit=v_inventory.unit then 1
      when v_unit='kg' and v_inventory.unit='g' then 1000
      when v_unit='g' and v_inventory.unit='kg' then .001
      when v_unit='l' and v_inventory.unit='ml' then 1000
      when v_unit='ml' and v_inventory.unit='l' then .001 else null end;
    if v_factor is null then raise exception 'A unidade do ingrediente não é compatível com o saldo.' using errcode='22023'; end if;
    v_quantity:=v_quantity*v_factor;
    if v_quantity<>round(v_quantity,3) or v_quantity>99999999999.999 then
      raise exception 'A quantidade perderia precisão ao converter a unidade.' using errcode='22023'; end if;
    select ri.id into v_existing from public.food_product_recipe_items ri
      where ri.recipe_id=v_recipe.id and ri.store_id=p_store_id
        and ri.id=any(v_current_ids)
        and ri.inventory_item_id=v_id and lower(ri.stage)=lower(v_stage)
        and (not exists (select 1 from public.food_inventory_order_consumptions c where c.recipe_item_id=ri.id)
          or (ri.stage=v_stage and ri.quantity=v_quantity and ri.unit=v_inventory.unit and ri.waste_percent=v_waste))
      order by ri.id limit 1 for update;
    if v_existing is null then
      insert into public.food_product_recipe_items(store_id,recipe_id,inventory_item_id,stage,quantity,unit,waste_percent,sort_order,active)
      values(p_store_id,v_recipe.id,v_id,v_stage,v_quantity,v_inventory.unit,v_waste,v_order,true);
    else
      update public.food_product_recipe_items set stage=v_stage,quantity=v_quantity,unit=v_inventory.unit,
        waste_percent=v_waste,sort_order=v_order,active=true where id=v_existing;
    end if;
    v_existing:=null;
  end loop;
  select coalesce(jsonb_agg(to_jsonb(ri) order by ri.sort_order,ri.id),'[]'::jsonb)
    into v_rows from public.food_product_recipe_items ri where ri.recipe_id=v_recipe.id and ri.active;
  return jsonb_build_object('recipe',to_jsonb(v_recipe),'items',v_rows);
end $$;
revoke all on function public.food_save_product_recipe_v1(uuid,uuid,text,numeric,text,text,jsonb) from public,anon;
grant execute on function public.food_save_product_recipe_v1(uuid,uuid,text,numeric,text,text,jsonb) to authenticated;

-- Preserve historical recipe item IDs while excluding inactive lines from future consumption.
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
  v_pending boolean := false;
begin
  if coalesce(current_setting('foodweb.recipe_reconcile', true), '') = 'on' then
    return;
  end if;
  perform set_config('foodweb.recipe_reconcile', 'on', true);
  select * into v_order
    from public.food_orders
   where id = p_order_id
   for update;
  if not found then return; end if;
  if v_order.inventory_status = 'released' and v_order.status <> 'cancelled' then return; end if;

  -- Existing orders retain their ingredient revision when a recipe changes.
  for v_target in
    select oi.id as order_item_id,
           r.id as recipe_id,
           ri.id as recipe_item_id,
           ri.inventory_item_id,
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
    v_desired := round(v_target.desired_quantity, 3);
    select * into v_existing
      from public.food_inventory_order_consumptions c
     where c.order_item_id = v_target.order_item_id
       and c.recipe_item_id = v_target.recipe_item_id
     for update;
    v_applied := coalesce(v_existing.consumed_quantity, 0);

    if v_desired > v_applied then
      v_delta := v_desired - v_applied;
      select * into v_inventory
        from public.food_inventory_items
       where id = v_target.inventory_item_id and store_id = v_order.store_id
       for update;
      if not found or not v_inventory.active then
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
      select * into v_inventory
        from public.food_inventory_items
       where id = v_target.inventory_item_id and store_id = v_order.store_id
       for update;
      if not found then raise exception 'Insumo da ficha técnica não encontrado.'; end if;
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
    select c.order_item_id, c.recipe_id, c.recipe_item_id,
           c.inventory_item_id, c.consumed_quantity
      from public.food_inventory_order_consumptions c
     where c.order_id = p_order_id
       and c.consumed_quantity > 0
       and (v_order.status = 'cancelled' or not exists (
         select 1 from public.food_order_items oi
         where oi.id = c.order_item_id and oi.order_id = p_order_id
       ))
     for update
  loop
    select * into v_inventory
      from public.food_inventory_items
     where id = v_target.inventory_item_id and store_id = v_order.store_id
     for update;
    if found then
      v_before := v_inventory.current_quantity;
      v_after := v_before + v_target.consumed_quantity;
      v_cost := v_inventory.average_unit_cost;
      perform set_config('foodweb.inventory_mutation', 'on', true);
      update public.food_inventory_items set current_quantity = v_after, updated_at = now() where id = v_inventory.id;
      insert into public.food_inventory_movements(
        store_id, inventory_item_id, movement_type, quantity_delta,
        quantity_before, quantity_after, unit_cost, total_cost,
        source_type, source_id, source_reference, reason, created_by
      ) values (
        v_order.store_id, v_inventory.id, 'return', v_target.consumed_quantity,
        v_before, v_after, v_cost, round(v_target.consumed_quantity * v_cost, 2),
        'order_recipe', v_target.order_item_id, p_order_id::text,
        'Estorno de consumo por item removido ou cancelamento', auth.uid()
      );
      update public.food_inventory_order_consumptions
         set target_quantity = 0, consumed_quantity = 0
       where order_item_id = v_target.order_item_id and recipe_item_id = v_target.recipe_item_id;
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
end;
$$;

-- Full-table aggregate, scoped to one store. `ordersTotal` includes cancelled;
-- amounts include only paid, non-cancelled orders and never duplicate entries.
create or replace function public.food_dashboard_metrics_v1(p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_tz text; v_today date; v_result jsonb; v_now timestamptz:=now();
begin
  if auth.uid() is null or not public.food_is_store_admin(p_store_id) then
    raise exception 'Sem permissão para visualizar os indicadores desta loja.' using errcode='42501'; end if;
  select nullif(opening_hours->>'timezone','') into v_tz from public.food_stores where id=p_store_id;
  if not found then raise exception 'Loja indisponível.' using errcode='22023'; end if;
  if v_tz is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=v_tz) then v_tz:='America/Sao_Paulo'; end if;
  v_today:=(v_now at time zone v_tz)::date;
  select jsonb_build_object(
    'timezone',v_tz,'asOf',v_now,'ordersTotal',count(*),
    'cancelledOrders',count(*) filter(where status='cancelled'),
    'ordersToday',count(*) filter(where status not in ('cancelled','delivered','picked_up') and (created_at at time zone v_tz)::date=v_today),
    'pendingPayments',count(*) filter(where status not in ('cancelled','delivered','picked_up') and payment_status<>'paid'),
    'pendingAmount',coalesce(sum(total) filter(where status not in ('cancelled','delivered','picked_up') and payment_status<>'paid'),0),
    'processingOrders',count(*) filter(where status not in ('cancelled','delivered','picked_up') and payment_status='paid'),
    'scheduledToday',count(*) filter(where status not in ('cancelled','delivered','picked_up') and scheduled_for is not null and (scheduled_for at time zone v_tz)::date=v_today),
    'paidOrders',count(*) filter(where status<>'cancelled' and payment_status='paid'),
    'totalReceived',coalesce(sum(total) filter(where status<>'cancelled' and payment_status='paid'),0),
    'receivedToday',coalesce(sum(total) filter(where status<>'cancelled' and payment_status='paid' and payment_received_at is not null and (payment_received_at at time zone v_tz)::date=v_today),0),
    'receivedTodayCount',count(*) filter(where status<>'cancelled' and payment_status='paid' and payment_received_at is not null and (payment_received_at at time zone v_tz)::date=v_today)
  ) into v_result from public.food_orders where store_id=p_store_id;
  return v_result;
end $$;
revoke all on function public.food_dashboard_metrics_v1(uuid) from public,anon;
grant execute on function public.food_dashboard_metrics_v1(uuid) to authenticated;

-- The original key unique index remains the concurrency fence; compare the full intent on replay.
create or replace function public.food_adjust_product_stock_v1(
  p_store_id uuid,
  p_product_id uuid,
  p_mode text,
  p_quantity numeric,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.food_products%rowtype;
  v_before integer;
  v_after bigint;
  v_reserved integer;
  v_available integer;
  v_existing public.food_product_stock_movements%rowtype;
begin
  if (select auth.uid()) is null or not public.food_is_store_admin(p_store_id) then
    raise exception 'Sem permissão para ajustar o estoque desta loja.' using errcode = '42501';
  end if;
  if p_mode not in ('set','add','remove') or p_mode is null then
    raise exception 'Tipo de ajuste inválido.' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity < 0 or p_quantity <> trunc(p_quantity) or p_quantity > 2147483647 then
    raise exception 'Informe uma quantidade inteira e não negativa.' using errcode = '22023';
  end if;
  if p_mode in ('add','remove') and p_quantity = 0 then
    raise exception 'O ajuste precisa movimentar ao menos uma unidade.' using errcode = '22023';
  end if;
  if nullif(trim(p_reason), '') is null or length(trim(p_reason)) > 160 then
    raise exception 'Informe o motivo do ajuste (até 160 caracteres).' using errcode = '22023';
  end if;
  if p_idempotency_key is null then
    raise exception 'Identificador da operação ausente.' using errcode = '22023';
  end if;

  select * into v_product
  from public.food_products
  where id = p_product_id and store_id = p_store_id
  for update;
  if not found or not v_product.track_stock then
    raise exception 'Produto não encontrado ou sem controle de estoque.' using errcode = '22023';
  end if;

  select * into v_existing
  from public.food_product_stock_movements
  where store_id = p_store_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.product_id <> p_product_id or v_existing.movement_type <> p_mode
      or v_existing.requested_quantity is distinct from p_quantity::integer
      or v_existing.reason is distinct from trim(p_reason) then
      raise exception 'Identificador já utilizado em outra operação.' using errcode = '22023';
    end if;
    return jsonb_build_object('stock_quantity',coalesce(v_product.stock_quantity,0),'stock_reserved_quantity',v_product.stock_reserved_quantity,'stock_status',v_product.stock_status,'availability_status',v_product.availability_status);
  end if;

  v_before := coalesce(v_product.stock_quantity,0);
  v_reserved := coalesce(v_product.stock_reserved_quantity,0);
  v_after := case p_mode
    when 'set' then p_quantity::integer
    when 'add' then v_before::bigint + p_quantity::bigint
    else v_before::bigint - p_quantity::bigint
  end;
  if v_after < 0 or v_after > 2147483647 then
    raise exception 'O estoque físico precisa estar entre 0 e 2.147.483.647.' using errcode = '22023';
  end if;
  if v_after < v_reserved then
    raise exception 'A quantidade física não pode ficar abaixo das % unidade(s) reservadas.', v_reserved using errcode = '22023';
  end if;
  v_available := v_after - v_reserved;

  update public.food_products
     set stock_quantity = v_after::integer,
         stock_status = case when v_available <= 3 then 'low_stock' else 'available' end,
         availability_status = case when v_available = 0 then 'sold_out' else 'available' end
   where id = p_product_id and store_id = p_store_id
   returning * into v_product;
  -- O trigger de reposição pode confirmar pedidos pagos aguardando estoque
  -- dentro da mesma transação; registre e retorne o saldo final efetivo.
  select * into v_product from public.food_products where id = p_product_id and store_id = p_store_id;
  v_after := coalesce(v_product.stock_quantity, 0);

  insert into public.food_product_stock_movements(
    store_id, product_id, product_name, movement_type, quantity_before, quantity_after,
    quantity_delta, reason, idempotency_key, created_by, requested_quantity
  ) values (
    p_store_id, p_product_id, v_product.name, p_mode, v_before, v_after,
    (v_after - v_before)::integer, trim(p_reason), p_idempotency_key, (select auth.uid()), p_quantity::integer
  );

  return jsonb_build_object('stock_quantity',v_product.stock_quantity,'stock_reserved_quantity',v_product.stock_reserved_quantity,'stock_status',v_product.stock_status,'availability_status',v_product.availability_status);
end;
$$;


create index if not exists food_orders_paid_received_store_idx on public.food_orders(store_id,payment_received_at)
  where payment_status='paid' and status<>'cancelled' and payment_received_at is not null;

notify pgrst,'reload schema';
commit;
