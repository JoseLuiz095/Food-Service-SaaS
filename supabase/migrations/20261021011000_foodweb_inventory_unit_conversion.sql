begin;

-- Troca de unidade apenas entre medidas com equivalência física. Todos os
-- valores dependentes são convertidos na mesma transação para não distorcer
-- saldo, custo médio, compras, fichas técnicas ou futuras devoluções.
create or replace function public.food_convert_inventory_unit(
  p_store_id uuid,
  p_inventory_item_id uuid,
  p_new_unit text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.food_inventory_items%rowtype;
  v_factor numeric(14,6);
begin
  if (select auth.uid()) is null or not public.food_is_store_admin(p_store_id) then
    raise exception 'Sem permissão para editar a unidade deste insumo.' using errcode = '42501';
  end if;
  if p_new_unit not in ('g','kg','ml','l','un','pack') then
    raise exception 'Unidade inválida.' using errcode = '22023';
  end if;
  select * into v_item from public.food_inventory_items
   where id = p_inventory_item_id and store_id = p_store_id for update;
  if not found then raise exception 'Insumo não encontrado.' using errcode = '22023'; end if;
  if v_item.unit = p_new_unit then
    return jsonb_build_object('item', to_jsonb(v_item));
  end if;
  v_factor := case
    when v_item.unit = 'kg' and p_new_unit = 'g' then 1000
    when v_item.unit = 'g' and p_new_unit = 'kg' then 0.001
    when v_item.unit = 'l' and p_new_unit = 'ml' then 1000
    when v_item.unit = 'ml' and p_new_unit = 'l' then 0.001
    else null end;
  if v_factor is null then
    raise exception 'Só é possível converter kg↔g ou L↔mL. Pacotes e unidades não têm equivalência automática.' using errcode = '22023';
  end if;

  perform set_config('foodweb.inventory_mutation', 'on', true);
  update public.food_inventory_items
     set unit = p_new_unit,
         current_quantity = round(current_quantity * v_factor, 3),
         reorder_point = round(reorder_point * v_factor, 3),
         average_unit_cost = round(average_unit_cost / v_factor, 4),
         last_unit_cost = case when last_unit_cost is null then null else round(last_unit_cost / v_factor, 4) end
   where id = v_item.id
   returning * into v_item;

  update public.food_inventory_movements set
    quantity_delta = round(quantity_delta * v_factor, 3), quantity_before = round(quantity_before * v_factor, 3),
    quantity_after = round(quantity_after * v_factor, 3), unit_cost = round(unit_cost / v_factor, 4)
   where inventory_item_id = v_item.id;
  update public.food_inventory_purchase_items set quantity = round(quantity * v_factor, 3), unit_cost = round(unit_cost / v_factor, 4)
   where inventory_item_id = v_item.id and store_id = p_store_id;
  update public.food_product_recipe_items set quantity = round(quantity * v_factor, 3), unit = p_new_unit
   where inventory_item_id = v_item.id and store_id = p_store_id;
  update public.food_inventory_order_consumptions set target_quantity = round(target_quantity * v_factor, 3), consumed_quantity = round(consumed_quantity * v_factor, 3)
   where inventory_item_id = v_item.id and store_id = p_store_id;
  update public.food_inventory_count_items set expected_quantity = round(expected_quantity * v_factor, 3), counted_quantity = round(counted_quantity * v_factor, 3), quantity_delta = round(quantity_delta * v_factor, 3)
   where inventory_item_id = v_item.id;
  return jsonb_build_object('item', to_jsonb(v_item));
end;
$$;

revoke all on function public.food_convert_inventory_unit(uuid, uuid, text) from public, anon;
grant execute on function public.food_convert_inventory_unit(uuid, uuid, text) to authenticated;
notify pgrst, 'reload schema';
commit;
