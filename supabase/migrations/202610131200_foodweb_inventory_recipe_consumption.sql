-- Estoque de insumos: alertas de reposição e consumo automático por ficha técnica.
--
-- Cada venda confirmada calcula a quantidade de insumo prevista na ficha do
-- produto. O livro de movimentos continua sendo a fonte de auditoria e uma
-- pequena tabela de saldo por item do pedido permite corrigir quantidade,
-- cancelar ou reprocessar sem debitar duas vezes.

begin;

alter table public.food_inventory_items
  add column if not exists low_stock_alert_enabled boolean not null default true;

create index if not exists food_inventory_items_store_alert_idx
  on public.food_inventory_items(store_id, low_stock_alert_enabled, current_quantity, reorder_point)
  where active;

create table if not exists public.food_inventory_order_consumptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  order_id uuid not null,
  order_item_id uuid not null references public.food_order_items(id) on delete cascade,
  recipe_id uuid not null,
  recipe_item_id uuid not null references public.food_product_recipe_items(id) on delete restrict,
  inventory_item_id uuid not null,
  target_quantity numeric(14,3) not null default 0 check (target_quantity >= 0),
  consumed_quantity numeric(14,3) not null default 0 check (consumed_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_inventory_order_consumptions_order_fk
    foreign key (order_id)
    references public.food_orders(id) on delete cascade,
  constraint food_inventory_order_consumptions_recipe_store_fk
    foreign key (recipe_id, store_id)
    references public.food_product_recipes(id, store_id) on delete cascade,
  constraint food_inventory_order_consumptions_inventory_store_fk
    foreign key (inventory_item_id, store_id)
    references public.food_inventory_items(id, store_id) on delete restrict,
  unique (order_item_id, recipe_item_id)
);

create index if not exists food_inventory_order_consumptions_pending_idx
  on public.food_inventory_order_consumptions(store_id, order_id, target_quantity, consumed_quantity)
  where target_quantity > consumed_quantity;

create index if not exists food_inventory_order_consumptions_item_idx
  on public.food_inventory_order_consumptions(store_id, inventory_item_id, updated_at desc);

create or replace function public.food_inventory_order_consumptions_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.food_inventory_order_consumptions_touch_updated_at() from public, anon, authenticated;
drop trigger if exists food_inventory_order_consumptions_updated_at_trg on public.food_inventory_order_consumptions;
create trigger food_inventory_order_consumptions_updated_at_trg
before update on public.food_inventory_order_consumptions
for each row execute function public.food_inventory_order_consumptions_touch_updated_at();

alter table public.food_inventory_order_consumptions enable row level security;
drop policy if exists food_inventory_order_consumptions_admin_select on public.food_inventory_order_consumptions;
create policy food_inventory_order_consumptions_admin_select on public.food_inventory_order_consumptions
  for select to authenticated
  using (public.food_is_store_admin(store_id));
grant select on public.food_inventory_order_consumptions to authenticated;

-- Retorna os insumos que já atingiram o mínimo configurado. A tela e o PWA
-- podem consultar esta função ao abrir o painel para exibir um alerta sem
-- criar notificações duplicadas a cada atualização do navegador.
create or replace function public.food_list_low_stock_inventory(p_store_id uuid)
returns table(
  inventory_item_id uuid,
  name text,
  item_type text,
  unit text,
  current_quantity numeric,
  reorder_point numeric,
  average_unit_cost numeric,
  alert_enabled boolean
)
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  select i.id, i.name, i.item_type, i.unit, i.current_quantity,
         i.reorder_point, i.average_unit_cost, i.low_stock_alert_enabled
    from public.food_inventory_items i
   where i.store_id = p_store_id
     and i.active
     and i.low_stock_alert_enabled
     and i.current_quantity <= i.reorder_point
   order by i.current_quantity asc, i.name asc;
$$;
revoke all on function public.food_list_low_stock_inventory(uuid) from public, anon;
grant execute on function public.food_list_low_stock_inventory(uuid) to authenticated;

-- Aplica a diferença entre a ficha técnica e o que já foi debitado para um
-- item do pedido. Quando não existe saldo suficiente, a baixa é parcial e
-- continua pendente; a próxima entrada de estoque tenta concluir o saldo.
create or replace function public.food_reconcile_order_recipe_consumption(
  p_order_id uuid,
  p_allow_partial boolean default true
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
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

  -- Primeiro reconcilia todas as linhas ativas da ficha técnica.
  for v_target in
    select oi.id as order_item_id,
           r.id as recipe_id,
           ri.id as recipe_item_id,
           ri.inventory_item_id,
           greatest(0, case when v_order.status = 'cancelled' then 0
             else (oi.quantity::numeric * ri.quantity / nullif(r.yield_quantity, 0))
               * (1 + ri.waste_percent / 100) end) as desired_quantity
      from public.food_order_items oi
      join public.food_product_recipes r
        on r.store_id = v_order.store_id and r.product_id = oi.product_id and r.active
      join public.food_product_recipe_items ri
        on ri.store_id = r.store_id and ri.recipe_id = r.id
     where oi.order_id = p_order_id
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
        inventory_item_id, target_quantity, consumed_quantity
      ) values (
        v_order.store_id, p_order_id, v_target.order_item_id, v_target.recipe_id,
        v_target.recipe_item_id, v_target.inventory_item_id, v_desired, v_applied
      );
    else
      update public.food_inventory_order_consumptions
         set target_quantity = v_desired,
             consumed_quantity = v_applied
       where id = v_existing.id;
    end if;
    if v_applied < v_desired then v_pending := true; end if;
  end loop;

  -- Linhas removidas da ficha, itens excluídos ou pedidos cancelados também
  -- precisam devolver o que já havia sido baixado.
  for v_target in
    select c.order_item_id, c.recipe_id, c.recipe_item_id,
           c.inventory_item_id, c.consumed_quantity
      from public.food_inventory_order_consumptions c
     where c.order_id = p_order_id
       and c.consumed_quantity > 0
       and (v_order.status = 'cancelled' or not exists (
         select 1 from public.food_order_items oi
         join public.food_product_recipes r on r.store_id = c.store_id and r.product_id = oi.product_id and r.active
         join public.food_product_recipe_items ri on ri.store_id = c.store_id and ri.recipe_id = r.id
           and ri.id = c.recipe_item_id
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
revoke all on function public.food_reconcile_order_recipe_consumption(uuid, boolean) from public, anon, authenticated;

-- O commit de produto continua idempotente, mas agora também processa fichas
-- técnicas e pode ser chamado novamente quando uma reposição chegar.
create or replace function public.food_commit_order_inventory(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.food_orders%rowtype;
  v_item record;
  v_product public.food_products%rowtype;
begin
  select * into v_order from public.food_orders where id = p_order_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if v_order.status = 'cancelled' or v_order.inventory_status = 'released' then return; end if;

  for v_item in
    select oi.id, oi.product_id, oi.quantity, oi.inventory_reserved_quantity
      from public.food_order_items oi
     where oi.order_id = p_order_id and oi.inventory_reserved_quantity > 0
     order by oi.created_at, oi.id
     for update
  loop
    select * into v_product from public.food_products where id = v_item.product_id for update;
    if not found or not v_product.track_stock then
      update public.food_order_items set inventory_reserved_quantity = 0 where id = v_item.id;
      continue;
    end if;
    if coalesce(v_product.stock_quantity, 0) < v_item.quantity then
      raise exception 'Estoque insuficiente para confirmar %.', v_product.name;
    end if;
    update public.food_products
       set stock_quantity = coalesce(stock_quantity, 0) - v_item.quantity,
           stock_reserved_quantity = greatest(coalesce(stock_reserved_quantity, 0) - coalesce(v_item.inventory_reserved_quantity, 0), 0),
           stock_status = case when coalesce(stock_quantity, 0) - v_item.quantity <= 0 then 'low_stock' else stock_status end,
           updated_at = now()
     where id = v_item.product_id;
    update public.food_order_items set inventory_reserved_quantity = 0 where id = v_item.id;
  end loop;

  update public.food_orders set inventory_status = case
    when exists (select 1 from public.food_inventory_order_consumptions c where c.order_id = p_order_id and c.target_quantity > c.consumed_quantity) then 'awaiting_restock'
    else 'committed' end, updated_at = now() where id = p_order_id;
  perform public.food_reconcile_order_recipe_consumption(p_order_id, true);
end;
$$;
revoke all on function public.food_commit_order_inventory(uuid) from public, anon, authenticated;

-- Recalcula automaticamente quando um item do pedido é corrigido ou removido.
create or replace function public.food_reconcile_recipe_after_order_item_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
begin
  if v_order_id is not null and exists (
    select 1 from public.food_orders o where o.id = v_order_id and o.payment_status = 'paid'
  ) then
    perform public.food_reconcile_order_recipe_consumption(v_order_id, true);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.food_reconcile_recipe_after_order_item_change() from public, anon, authenticated;
drop trigger if exists food_order_items_recipe_reconcile_trg on public.food_order_items;
create trigger food_order_items_recipe_reconcile_trg
after insert or update of quantity, product_id or delete on public.food_order_items
for each row execute function public.food_reconcile_recipe_after_order_item_change();

-- Cancelamento devolve reservas de produto e também os insumos já consumidos.
create or replace function public.food_release_inventory_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    if new.inventory_status in ('reserved','awaiting_restock') then
      perform public.food_release_order_inventory(new.id);
    end if;
    perform public.food_reconcile_order_recipe_consumption(new.id, true);
  end if;
  return new;
end;
$$;
revoke all on function public.food_release_inventory_on_cancel() from public, anon, authenticated;
drop trigger if exists food_orders_release_inventory_trg on public.food_orders;
create trigger food_orders_release_inventory_trg
after update of status on public.food_orders
for each row execute function public.food_release_inventory_on_cancel();

-- Uma compra/ajuste positivo tenta concluir pedidos pagos que aguardavam
-- reposição de insumos, sem recursão quando a própria baixa atualiza o saldo.
create or replace function public.food_reconcile_recipe_orders_on_inventory_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_order_id uuid;
begin
  if coalesce(current_setting('foodweb.recipe_reconcile', true), '') = 'on' then return new; end if;
  if new.current_quantity <= old.current_quantity then return new; end if;
  for v_order_id in
    select distinct c.order_id
      from public.food_inventory_order_consumptions c
      join public.food_orders o on o.id = c.order_id
     where c.store_id = new.store_id
       and c.inventory_item_id = new.id
       and c.target_quantity > c.consumed_quantity
       and o.payment_status = 'paid'
       and o.status <> 'cancelled'
     order by c.order_id
  loop
    begin perform public.food_reconcile_order_recipe_consumption(v_order_id, true); exception when others then null; end;
  end loop;
  return new;
end;
$$;
revoke all on function public.food_reconcile_recipe_orders_on_inventory_update() from public, anon, authenticated;
drop trigger if exists food_inventory_recipe_reconcile_trg on public.food_inventory_items;
create trigger food_inventory_recipe_reconcile_trg
after update of current_quantity on public.food_inventory_items
for each row execute function public.food_reconcile_recipe_orders_on_inventory_update();

notify pgrst, 'reload schema';
commit;
