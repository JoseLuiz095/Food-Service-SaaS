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
begin
  if (select auth.uid()) is null or not public.food_is_store_admin(p_store_id) then
    raise exception 'Sem permissão para conferir o estoque desta loja.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
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

  return jsonb_build_object('count_id', v_count_id, 'items_counted', v_total, 'items_adjusted', v_adjusted);
end;
$$;

revoke all on function public.food_commit_inventory_count(uuid, jsonb, text) from public, anon;
grant execute on function public.food_commit_inventory_count(uuid, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
commit;
