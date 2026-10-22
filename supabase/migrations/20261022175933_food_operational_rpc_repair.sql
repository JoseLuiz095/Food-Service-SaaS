-- Repara RPCs ausentes em instalações existentes, sem alterar dados ao aplicar.
-- Reaplicável depois das migrations originais; preserva os contratos públicos.
begin;

-- Relações carregadas em todas as atualizações da fila de pedidos.
create index if not exists food_order_items_order_id_idx
  on public.food_order_items(order_id);
create index if not exists food_order_item_options_order_item_id_idx
  on public.food_order_item_options(order_item_id);

-- Uma contagem é um documento imutável: esperado, contado e a diferença que
-- recalibrou o saldo. Isso evita que uma conferência em lote seja salva pela
-- metade caso um item falhe no meio do processo.
create table if not exists public.food_inventory_counts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.food_inventory_count_items (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.food_inventory_counts(id) on delete cascade,
  inventory_item_id uuid not null references public.food_inventory_items(id) on delete restrict,
  expected_quantity numeric(14,3) not null check (expected_quantity >= 0),
  counted_quantity numeric(14,3) not null check (counted_quantity >= 0),
  quantity_delta numeric(14,3) not null,
  created_at timestamptz not null default now(),
  unique(count_id, inventory_item_id)
);

create index if not exists food_inventory_counts_store_date_idx
  on public.food_inventory_counts(store_id, created_at desc);
create index if not exists food_inventory_count_items_item_idx
  on public.food_inventory_count_items(inventory_item_id, created_at desc);

alter table public.food_inventory_counts enable row level security;
alter table public.food_inventory_count_items enable row level security;

drop policy if exists food_inventory_counts_member_select on public.food_inventory_counts;
create policy food_inventory_counts_member_select on public.food_inventory_counts
  for select to authenticated using (public.food_is_store_member(store_id));
drop policy if exists food_inventory_counts_admin_insert on public.food_inventory_counts;
create policy food_inventory_counts_admin_insert on public.food_inventory_counts
  for insert to authenticated with check (public.food_is_store_admin(store_id) and created_by = (select auth.uid()));
drop policy if exists food_inventory_count_items_member_select on public.food_inventory_count_items;
create policy food_inventory_count_items_member_select on public.food_inventory_count_items
  for select to authenticated using (exists (
    select 1 from public.food_inventory_counts c
    where c.id = count_id and public.food_is_store_member(c.store_id)
  ));
drop policy if exists food_inventory_count_items_admin_insert on public.food_inventory_count_items;
create policy food_inventory_count_items_admin_insert on public.food_inventory_count_items
  for insert to authenticated with check (exists (
    select 1 from public.food_inventory_counts c
    join public.food_inventory_items i on i.id = inventory_item_id and i.store_id = c.store_id
    where c.id = count_id and public.food_is_store_admin(c.store_id)
  ));

grant select, insert on public.food_inventory_counts to authenticated;
grant select, insert on public.food_inventory_count_items to authenticated;

create or replace function public.food_commit_inventory_count(
  p_store_id uuid,
  p_items jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_count_id uuid;
  v_item record;
  v_inventory public.food_inventory_items%rowtype;
  v_expected numeric(14,3);
  v_counted numeric(14,3);
  v_delta numeric(14,3);
  v_adjusted integer := 0;
  v_total integer := 0;
  v_previous_mutation text := coalesce(current_setting('foodweb.inventory_mutation', true), '');
begin
  if (select auth.uid()) is null or not public.food_is_store_admin(p_store_id) then
    raise exception 'Sem permissão para conferir o estoque desta loja.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Informe os saldos contados.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Informe ao menos um saldo contado.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(inventory_item_id uuid, counted_quantity numeric)
    group by inventory_item_id
    having count(*) > 1 or bool_or(inventory_item_id is null or counted_quantity is null or counted_quantity < 0)
  ) then
    raise exception 'A conferência contém item duplicado ou saldo inválido.' using errcode = '22023';
  end if;

  insert into public.food_inventory_counts(store_id, notes, created_by)
  values (p_store_id, nullif(trim(p_notes), ''), (select auth.uid()))
  returning id into v_count_id;

  for v_item in
    select inventory_item_id, counted_quantity
    from jsonb_to_recordset(p_items) as x(inventory_item_id uuid, counted_quantity numeric)
    order by inventory_item_id
  loop
    select * into v_inventory
    from public.food_inventory_items
    where id = v_item.inventory_item_id and store_id = p_store_id and active = true
    for update;
    if not found then
      raise exception 'Insumo não encontrado ou arquivado durante a conferência.' using errcode = '22023';
    end if;

    v_expected := v_inventory.current_quantity;
    v_counted := round(v_item.counted_quantity, 3);
    v_delta := v_counted - v_expected;

    insert into public.food_inventory_count_items(count_id, inventory_item_id, expected_quantity, counted_quantity, quantity_delta)
    values (v_count_id, v_inventory.id, v_expected, v_counted, v_delta);

    if v_delta <> 0 then
      perform set_config('foodweb.inventory_mutation', 'on', true);
      update public.food_inventory_items
         set current_quantity = v_counted
       where id = v_inventory.id;
      insert into public.food_inventory_movements(
        store_id, inventory_item_id, movement_type, quantity_delta, quantity_before, quantity_after,
        unit_cost, total_cost, source_type, source_id, reason, notes, idempotency_key, created_by
      ) values (
        p_store_id, v_inventory.id,
        case when v_delta > 0 then 'adjustment_in' else 'adjustment_out' end,
        v_delta, v_expected, v_counted, v_inventory.average_unit_cost,
        round(v_delta * v_inventory.average_unit_cost, 2), 'physical_count', v_count_id,
        'Conferência de estoque real', nullif(trim(p_notes), ''),
        concat('physical-count:', v_count_id, ':', v_inventory.id), (select auth.uid())
      );
      v_adjusted := v_adjusted + 1;
    end if;
    v_total := v_total + 1;
  end loop;

  perform set_config('foodweb.inventory_mutation', v_previous_mutation, true);
  return jsonb_build_object('count_id', v_count_id, 'items_counted', v_total, 'items_adjusted', v_adjusted);
exception when others then
  perform set_config('foodweb.inventory_mutation', v_previous_mutation, true);
  raise;
end;
$$;

revoke all on function public.food_commit_inventory_count(uuid, jsonb, text) from public, anon;
grant execute on function public.food_commit_inventory_count(uuid, jsonb, text) to authenticated;

notify pgrst, 'reload schema';


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
  v_previous_mutation text := coalesce(current_setting('foodweb.inventory_mutation', true), '');
  v_previous_reconcile text := coalesce(current_setting('foodweb.recipe_reconcile', true), '');
begin
  if (select auth.uid()) is null or not public.food_is_store_admin(p_store_id) then
    raise exception 'Sem permissão para editar a unidade deste insumo.' using errcode = '42501';
  end if;
  if p_new_unit is null or p_new_unit not in ('g','kg','ml','l','un','pack') then
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

  -- A escala dos campos existentes é parte do contrato. Não arredonde saldo,
  -- consumo ou custo silenciosamente ao trocar de unidade.
  if round(v_item.current_quantity * v_factor, 3) <> v_item.current_quantity * v_factor
     or round(v_item.reorder_point * v_factor, 3) <> v_item.reorder_point * v_factor
     or round(v_item.average_unit_cost / v_factor, 4) <> v_item.average_unit_cost / v_factor
     or (v_item.last_unit_cost is not null and round(v_item.last_unit_cost / v_factor, 4) <> v_item.last_unit_cost / v_factor)
     or exists (select 1 from public.food_inventory_movements m where m.inventory_item_id = v_item.id and (
       round(m.quantity_delta * v_factor, 3) <> m.quantity_delta * v_factor
       or round(m.quantity_before * v_factor, 3) <> m.quantity_before * v_factor
       or round(m.quantity_after * v_factor, 3) <> m.quantity_after * v_factor
       or round(m.unit_cost / v_factor, 4) <> m.unit_cost / v_factor))
     or exists (select 1 from public.food_inventory_purchase_items i where i.inventory_item_id = v_item.id and (
       round(i.quantity * v_factor, 3) <> i.quantity * v_factor
       or round(i.unit_cost / v_factor, 4) <> i.unit_cost / v_factor))
     or exists (select 1 from public.food_product_recipe_items i where i.inventory_item_id = v_item.id
       and round(i.quantity * v_factor, 3) <> i.quantity * v_factor)
     or exists (select 1 from public.food_inventory_order_consumptions c where c.inventory_item_id = v_item.id and (
       round(c.target_quantity * v_factor, 3) <> c.target_quantity * v_factor
       or round(c.consumed_quantity * v_factor, 3) <> c.consumed_quantity * v_factor))
     or exists (select 1 from public.food_inventory_count_items c where c.inventory_item_id = v_item.id and (
       round(c.expected_quantity * v_factor, 3) <> c.expected_quantity * v_factor
       or round(c.counted_quantity * v_factor, 3) <> c.counted_quantity * v_factor
       or round(c.quantity_delta * v_factor, 3) <> c.quantity_delta * v_factor)) then
    raise exception 'A conversão perderia precisão de saldo, custo ou histórico. Mantenha a unidade atual.' using errcode = '22023';
  end if;

  perform set_config('foodweb.inventory_mutation', 'on', true);
  -- Uma mudança de escala não é reposição. Impede consumir pedidos pendentes
  -- enquanto saldo, fichas e consumo ainda estão em unidades diferentes.
  perform set_config('foodweb.recipe_reconcile', 'on', true);
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
  perform set_config('foodweb.inventory_mutation', v_previous_mutation, true);
  perform set_config('foodweb.recipe_reconcile', v_previous_reconcile, true);
  return jsonb_build_object('item', to_jsonb(v_item));
exception when others then
  perform set_config('foodweb.inventory_mutation', v_previous_mutation, true);
  perform set_config('foodweb.recipe_reconcile', v_previous_reconcile, true);
  raise;
end;
$$;

revoke all on function public.food_convert_inventory_unit(uuid, uuid, text) from public, anon;
grant execute on function public.food_convert_inventory_unit(uuid, uuid, text) to authenticated;
notify pgrst, 'reload schema';


-- Permite corrigir quantidades/remover/adicionar um produto simples antes da
-- confirmação do pagamento. Toda a operação é transacional e refaz a reserva
-- de estoque para que o pedido continue coerente com a alteração.
create or replace function public.food_update_order_items_v1(
  p_order_id uuid,
  p_items jsonb
)
returns table(subtotal numeric, total numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.food_orders%rowtype;
  v_existing public.food_order_items%rowtype;
  v_product public.food_products%rowtype;
  v_entry jsonb;
  v_item_id uuid;
  v_product_id uuid;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_item_total numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_delivery_fee numeric(12,2) := 0;
  v_seen_ids uuid[] := array[]::uuid[];
  v_reserved integer;
  v_awaiting boolean;
  v_inventory_status text := 'not_tracked';
  v_allow_future boolean := false;
  v_timezone text := 'America/Sao_Paulo';
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Informe os produtos do pedido.';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Mantenha pelo menos um produto no pedido.';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'O pedido excede o limite de itens.';
  end if;

  select * into v_order from public.food_orders where id = p_order_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if not public.food_is_store_admin(v_order.store_id) and not public.food_is_platform_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if v_order.payment_status = 'paid' or v_order.inventory_status = 'committed' then
    raise exception 'Itens de um pedido já recebido não podem ser alterados.';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'Um pedido cancelado não pode ser editado.';
  end if;

  select coalesce(s.opening_hours->>'timezone', 'America/Sao_Paulo')
    into v_timezone
    from public.food_stores s where s.id = v_order.store_id;
  v_allow_future := v_order.scheduled_for is not null
    and (v_order.scheduled_for at time zone v_timezone)::date >= ((now() at time zone v_timezone)::date + 1);
  v_delivery_fee := coalesce(v_order.delivery_fee, 0);

  -- Libera a reserva anterior antes de recalcular as linhas. O status volta a
  -- released durante a edição: o trigger INSERT já existente ignora este
  -- estado. A reserva única de todas as linhas é refeita no loop abaixo.
  if v_order.inventory_status in ('reserved', 'awaiting_restock') then
    perform public.food_release_order_inventory(p_order_id);
  end if;
  update public.food_orders set inventory_status = 'released', updated_at = now() where id = p_order_id;

  for v_entry in select * from jsonb_array_elements(p_items) loop
    begin
      v_quantity := (v_entry->>'quantity')::integer;
    exception when others then
      raise exception 'Quantidade inválida.';
    end;
    if v_quantity is null or v_quantity < 1 or v_quantity > 99 then raise exception 'Quantidade inválida.'; end if;

    v_item_id := null;
    begin
      if nullif(v_entry->>'item_id', '') is not null then v_item_id := (v_entry->>'item_id')::uuid; end if;
    exception when others then raise exception 'Item do pedido inválido.'; end;

    if v_item_id is not null then
      if v_item_id = any(v_seen_ids) then raise exception 'Item duplicado no pedido.'; end if;
      select * into v_existing from public.food_order_items where id = v_item_id and order_id = p_order_id for update;
      if not found then raise exception 'Item do pedido não encontrado.'; end if;
      v_unit_price := round(v_existing.item_total / nullif(v_existing.quantity, 0), 2);
      v_item_total := round(v_unit_price * v_quantity, 2);
      update public.food_order_items
         set quantity = v_quantity, item_total = v_item_total
       where id = v_item_id;
    else
      begin v_product_id := (v_entry->>'product_id')::uuid; exception when others then raise exception 'Produto inválido.'; end;
      select * into v_product from public.food_products p
       where p.id = v_product_id and p.store_id = v_order.store_id and p.active
         and p.availability_status <> 'unavailable' and p.stock_status <> 'unavailable';
      if not found then raise exception 'Produto não disponível para edição.'; end if;
      if exists (
        select 1 from public.food_product_option_groups pog
        join public.food_option_groups og on og.id = pog.option_group_id and og.store_id = pog.store_id
        where pog.product_id = v_product.id and pog.store_id = v_order.store_id and og.active and og.min_choices > 0
      ) then
        raise exception 'O produto % exige opções. Abra o pedido original para manter a personalização.', v_product.name;
      end if;
      v_unit_price := round(coalesce(v_product.promotional_price, v_product.price), 2);
      v_item_total := round(v_unit_price * v_quantity, 2);
      insert into public.food_order_items(order_id, product_id, product_name, quantity, unit_price, variant_name, variant_price_delta, addons, item_total)
      values (p_order_id, v_product.id, v_product.name, v_quantity, v_unit_price, null, 0, '[]'::jsonb, v_item_total)
      returning id into v_item_id;
    end if;
    v_seen_ids := array_append(v_seen_ids, v_item_id);
    v_subtotal := v_subtotal + v_item_total;
  end loop;

  delete from public.food_order_items
   where order_id = p_order_id and not (id = any(v_seen_ids));

  -- Atualiza a reserva de cada linha sem depender de chamadas separadas do
  -- navegador. A função de reserva mantém o lock do produto e trata encomenda
  -- futura sem bloquear o pedido quando ainda não há saldo.
  for v_existing in
    select oi.* from public.food_order_items oi where oi.order_id = p_order_id order by oi.created_at
  loop
    if v_existing.product_id is not null and exists (
      select 1 from public.food_products p where p.id = v_existing.product_id and p.track_stock
    ) then
      select r.reserved_quantity, r.awaiting_restock into v_reserved, v_awaiting
        from public.food_reserve_product_inventory(v_existing.product_id, v_existing.quantity, v_allow_future) r;
      update public.food_order_items set inventory_reserved_quantity = coalesce(v_reserved, 0) where id = v_existing.id;
      if v_awaiting then v_inventory_status := 'awaiting_restock';
      elsif coalesce(v_reserved, 0) > 0 and v_inventory_status <> 'awaiting_restock' then v_inventory_status := 'reserved';
      end if;
    end if;
  end loop;

  v_subtotal := round(v_subtotal, 2);
  v_total := round(v_subtotal + v_delivery_fee, 2);
  if v_order.payment_method = 'cash' and v_order.needs_change
     and (v_order.change_for is null or v_order.change_for <= v_total) then
    raise exception 'O novo total exige revisar o valor para troco antes de editar os produtos.';
  end if;
  update public.food_orders
     set subtotal = v_subtotal, total = v_total, inventory_status = v_inventory_status,
         change_amount = case when v_order.payment_method = 'cash' and v_order.needs_change
           then round(v_order.change_for - v_total, 2) else v_order.change_amount end,
         updated_at = now()
   where id = p_order_id;
  return query select v_subtotal, v_total;
end;
$$;

revoke all on function public.food_update_order_items_v1(uuid, jsonb) from public, anon;
grant execute on function public.food_update_order_items_v1(uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
