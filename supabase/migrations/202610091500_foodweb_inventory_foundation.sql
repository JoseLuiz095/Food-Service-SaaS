-- Base de estoque de insumos, compras, fichas técnicas e custos.
--
-- O estoque atual de food_products continua sendo a fonte de disponibilidade
-- do catálogo. Estas tabelas introduzem o controle de matérias-primas sem
-- alterar o comportamento dos pedidos existentes. A integração entre venda,
-- receita e baixa de insumos será feita em uma migração posterior.

create table if not exists public.food_inventory_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  product_id uuid,
  name text not null check (length(trim(name)) > 0),
  sku text,
  item_type text not null default 'ingredient'
    check (item_type in ('ingredient','packaging','finished_good','operating','other')),
  unit text not null default 'un'
    check (unit in ('g','kg','ml','l','un','pack')),
  current_quantity numeric(14,3) not null default 0 check (current_quantity >= 0),
  average_unit_cost numeric(14,4) not null default 0 check (average_unit_cost >= 0),
  last_unit_cost numeric(14,4) check (last_unit_cost is null or last_unit_cost >= 0),
  reorder_point numeric(14,3) not null default 0 check (reorder_point >= 0),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, store_id),
  constraint food_inventory_items_product_fk
    foreign key (product_id, store_id)
    references public.food_products(id, store_id)
    on delete restrict
);

create unique index if not exists food_inventory_items_store_sku_uidx
  on public.food_inventory_items(store_id, lower(sku))
  where sku is not null and length(trim(sku)) > 0;
create unique index if not exists food_inventory_items_store_name_uidx
  on public.food_inventory_items(store_id, lower(trim(name)));
create index if not exists food_inventory_items_store_type_idx
  on public.food_inventory_items(store_id, item_type, active, name);

create table if not exists public.food_inventory_purchases (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  supplier text,
  document_type text,
  document_number text,
  occurred_on date not null default current_date,
  payment_method text,
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  status text not null default 'received'
    check (status in ('draft','received','cancelled')),
  notes text,
  idempotency_key text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, store_id)
);
create unique index if not exists food_inventory_purchases_idempotency_uidx
  on public.food_inventory_purchases(store_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists food_inventory_purchases_store_date_idx
  on public.food_inventory_purchases(store_id, occurred_on desc, created_at desc);

create table if not exists public.food_inventory_purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.food_inventory_purchases(id) on delete cascade,
  store_id uuid not null,
  inventory_item_id uuid not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  total_cost numeric(14,2) generated always as (round(quantity * unit_cost, 2)) stored,
  notes text,
  created_at timestamptz not null default now(),
  constraint food_inventory_purchase_items_purchase_store_fk
    foreign key (purchase_id, store_id)
    references public.food_inventory_purchases(id, store_id)
    on delete cascade,
  constraint food_inventory_purchase_items_item_store_fk
    foreign key (inventory_item_id, store_id)
    references public.food_inventory_items(id, store_id)
    on delete restrict
);
create index if not exists food_inventory_purchase_items_purchase_idx
  on public.food_inventory_purchase_items(purchase_id);
create index if not exists food_inventory_purchase_items_item_idx
  on public.food_inventory_purchase_items(store_id, inventory_item_id, created_at desc);

create table if not exists public.food_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  inventory_item_id uuid not null,
  movement_type text not null
    check (movement_type in ('purchase','adjustment_in','adjustment_out','consumption','production','loss','return','opening_balance')),
  quantity_delta numeric(14,3) not null check (quantity_delta <> 0),
  quantity_before numeric(14,3) not null check (quantity_before >= 0),
  quantity_after numeric(14,3) not null check (quantity_after >= 0),
  unit_cost numeric(14,4) not null default 0 check (unit_cost >= 0),
  total_cost numeric(14,2) not null default 0,
  source_type text,
  source_id uuid,
  source_reference text,
  reason text,
  notes text,
  idempotency_key text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  constraint food_inventory_movements_item_store_fk
    foreign key (inventory_item_id, store_id)
    references public.food_inventory_items(id, store_id)
    on delete restrict
);
create unique index if not exists food_inventory_movements_idempotency_uidx
  on public.food_inventory_movements(store_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists food_inventory_movements_store_date_idx
  on public.food_inventory_movements(store_id, created_at desc);
create index if not exists food_inventory_movements_item_date_idx
  on public.food_inventory_movements(store_id, inventory_item_id, created_at desc);

create table if not exists public.food_product_recipes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  product_id uuid not null,
  name text not null default 'Receita principal',
  yield_quantity numeric(14,3) not null default 1 check (yield_quantity > 0),
  yield_unit text not null default 'un'
    check (yield_unit in ('g','kg','ml','l','un','pack')),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, product_id),
  unique (id, store_id),
  constraint food_product_recipes_product_store_fk
    foreign key (product_id, store_id)
    references public.food_products(id, store_id)
    on delete cascade
);
create index if not exists food_product_recipes_store_active_idx
  on public.food_product_recipes(store_id, active, product_id);

create table if not exists public.food_product_recipe_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  recipe_id uuid not null,
  inventory_item_id uuid not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null check (unit in ('g','kg','ml','l','un','pack')),
  waste_percent numeric(5,2) not null default 0 check (waste_percent between 0 and 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_product_recipe_items_recipe_store_fk
    foreign key (recipe_id, store_id)
    references public.food_product_recipes(id, store_id)
    on delete cascade,
  constraint food_product_recipe_items_item_store_fk
    foreign key (inventory_item_id, store_id)
    references public.food_inventory_items(id, store_id)
    on delete restrict,
  unique (recipe_id, inventory_item_id)
);
create index if not exists food_product_recipe_items_store_recipe_idx
  on public.food_product_recipe_items(store_id, recipe_id, sort_order);

-- Os livros de movimentos são append-only. A quantidade só pode ser alterada
-- pelas funções transacionais abaixo, que também gravam a movimentação.
create or replace function public.food_inventory_guard_quantity_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT'
     and (new.current_quantity <> 0 or new.average_unit_cost <> 0 or new.last_unit_cost is not null)
     and coalesce(current_setting('foodweb.inventory_mutation', true), '') <> 'on' then
    raise exception 'O saldo inicial deve ser registrado por uma movimentação.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and (new.current_quantity is distinct from old.current_quantity
       or new.average_unit_cost is distinct from old.average_unit_cost
       or new.last_unit_cost is distinct from old.last_unit_cost)
     and coalesce(current_setting('foodweb.inventory_mutation', true), '') <> 'on' then
    raise exception 'A quantidade do estoque só pode ser alterada por uma movimentação.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.food_inventory_guard_quantity_mutation() from public, anon, authenticated;

drop trigger if exists food_inventory_guard_quantity_trg on public.food_inventory_items;
create trigger food_inventory_guard_quantity_trg
before update on public.food_inventory_items
for each row execute function public.food_inventory_guard_quantity_mutation();

create or replace function public.food_inventory_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.food_inventory_touch_updated_at() from public, anon, authenticated;

drop trigger if exists food_inventory_items_updated_at_trg on public.food_inventory_items;
create trigger food_inventory_items_updated_at_trg before update on public.food_inventory_items for each row execute function public.food_inventory_touch_updated_at();
drop trigger if exists food_inventory_purchases_updated_at_trg on public.food_inventory_purchases;
create trigger food_inventory_purchases_updated_at_trg before update on public.food_inventory_purchases for each row execute function public.food_inventory_touch_updated_at();
drop trigger if exists food_product_recipes_updated_at_trg on public.food_product_recipes;
create trigger food_product_recipes_updated_at_trg before update on public.food_product_recipes for each row execute function public.food_inventory_touch_updated_at();
drop trigger if exists food_product_recipe_items_updated_at_trg on public.food_product_recipe_items;
create trigger food_product_recipe_items_updated_at_trg before update on public.food_product_recipe_items for each row execute function public.food_inventory_touch_updated_at();

alter table public.food_inventory_items enable row level security;
alter table public.food_inventory_purchases enable row level security;
alter table public.food_inventory_purchase_items enable row level security;
alter table public.food_inventory_movements enable row level security;
alter table public.food_product_recipes enable row level security;
alter table public.food_product_recipe_items enable row level security;

drop policy if exists food_inventory_items_member_select on public.food_inventory_items;
create policy food_inventory_items_member_select on public.food_inventory_items
  for select to authenticated using (public.food_is_store_member(store_id));
drop policy if exists food_inventory_items_admin_insert on public.food_inventory_items;
create policy food_inventory_items_admin_insert on public.food_inventory_items
  for insert to authenticated with check (public.food_is_store_admin(store_id));
drop policy if exists food_inventory_items_admin_update on public.food_inventory_items;
create policy food_inventory_items_admin_update on public.food_inventory_items
  for update to authenticated using (public.food_is_store_admin(store_id))
  with check (public.food_is_store_admin(store_id));

drop policy if exists food_inventory_purchases_admin_all on public.food_inventory_purchases;
create policy food_inventory_purchases_admin_all on public.food_inventory_purchases
  for all to authenticated using (public.food_is_store_admin(store_id))
  with check (public.food_is_store_admin(store_id) and created_by = auth.uid());

drop policy if exists food_inventory_purchase_items_admin_all on public.food_inventory_purchase_items;
create policy food_inventory_purchase_items_admin_all on public.food_inventory_purchase_items
  for all to authenticated using (public.food_is_store_admin(store_id))
  with check (public.food_is_store_admin(store_id));

drop policy if exists food_inventory_movements_member_select on public.food_inventory_movements;
create policy food_inventory_movements_member_select on public.food_inventory_movements
  for select to authenticated using (public.food_is_store_member(store_id));
drop policy if exists food_inventory_movements_admin_insert on public.food_inventory_movements;
create policy food_inventory_movements_admin_insert on public.food_inventory_movements
  for insert to authenticated
  with check (public.food_is_store_admin(store_id) and created_by = auth.uid());

drop policy if exists food_product_recipes_member_select on public.food_product_recipes;
create policy food_product_recipes_member_select on public.food_product_recipes
  for select to authenticated using (public.food_is_store_member(store_id));
drop policy if exists food_product_recipes_admin_all on public.food_product_recipes;
create policy food_product_recipes_admin_all on public.food_product_recipes
  for all to authenticated using (public.food_is_store_admin(store_id))
  with check (public.food_is_store_admin(store_id));

drop policy if exists food_product_recipe_items_member_select on public.food_product_recipe_items;
create policy food_product_recipe_items_member_select on public.food_product_recipe_items
  for select to authenticated using (public.food_is_store_member(store_id));
drop policy if exists food_product_recipe_items_admin_all on public.food_product_recipe_items;
create policy food_product_recipe_items_admin_all on public.food_product_recipe_items
  for all to authenticated using (public.food_is_store_admin(store_id))
  with check (public.food_is_store_admin(store_id));

grant select, insert, update on public.food_inventory_items to authenticated;
grant select, insert, update, delete on public.food_inventory_purchases to authenticated;
grant select, insert, update, delete on public.food_inventory_purchase_items to authenticated;
grant select, insert on public.food_inventory_movements to authenticated;
grant select, insert, update, delete on public.food_product_recipes to authenticated;
grant select, insert, update, delete on public.food_product_recipe_items to authenticated;

-- Registra uma compra já recebida, calcula a média ponderada e cria o livro
-- de movimentos na mesma transação. O idempotency_key evita duplicação em
-- retries de rede do painel.
create or replace function public.food_record_inventory_purchase(
  p_store_id uuid,
  p_items jsonb,
  p_supplier text default null,
  p_occurred_on date default current_date,
  p_payment_method text default null,
  p_document_type text default null,
  p_document_number text default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_purchase public.food_inventory_purchases%rowtype;
  v_item jsonb;
  v_inventory public.food_inventory_items%rowtype;
  v_item_id uuid;
  v_quantity numeric(14,3);
  v_unit_cost numeric(14,4);
  v_before numeric(14,3);
  v_after numeric(14,3);
  v_average numeric(14,4);
  v_total numeric(14,2) := 0;
  v_existing public.food_inventory_purchases%rowtype;
begin
  if auth.uid() is null or not public.food_is_store_admin(p_store_id) then
    raise exception 'Sem permissão para movimentar o estoque desta loja.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A compra precisa ter pelo menos um item.' using errcode = '22023';
  end if;
  p_idempotency_key := nullif(trim(p_idempotency_key), '');
  if p_idempotency_key is not null then
    select * into v_existing from public.food_inventory_purchases
      where store_id = p_store_id and idempotency_key = p_idempotency_key limit 1;
    if found then
      return jsonb_build_object('purchase_id', v_existing.id, 'total_amount', v_existing.total_amount, 'duplicate', true);
    end if;
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) x
    group by x->>'inventory_item_id' having count(*) > 1
  ) then
    raise exception 'A compra não pode repetir o mesmo insumo.' using errcode = '22023';
  end if;

  insert into public.food_inventory_purchases(store_id, supplier, document_type, document_number, occurred_on, payment_method, notes, idempotency_key, created_by)
    values (p_store_id, nullif(trim(p_supplier), ''), nullif(trim(p_document_type), ''), nullif(trim(p_document_number), ''), coalesce(p_occurred_on, current_date), nullif(trim(p_payment_method), ''), nullif(trim(p_notes), ''), nullif(trim(p_idempotency_key), ''), auth.uid())
    returning * into v_purchase;

  perform set_config('foodweb.inventory_mutation', 'on', true);
  for v_item in select value from jsonb_array_elements(p_items) loop
    begin v_item_id := (v_item->>'inventory_item_id')::uuid; exception when others then raise exception 'Insumo inválido na compra.' using errcode = '22023'; end;
    begin v_quantity := (v_item->>'quantity')::numeric; exception when others then raise exception 'Quantidade inválida na compra.' using errcode = '22023'; end;
    begin v_unit_cost := (v_item->>'unit_cost')::numeric; exception when others then raise exception 'Custo unitário inválido na compra.' using errcode = '22023'; end;
    if v_quantity is null or v_quantity <= 0 or v_unit_cost is null or v_unit_cost < 0 then
      raise exception 'Quantidade e custo da compra devem ser válidos.' using errcode = '22023';
    end if;
    select * into v_inventory from public.food_inventory_items where id = v_item_id and store_id = p_store_id for update;
    if not found or not v_inventory.active then
      raise exception 'Insumo não encontrado ou inativo.' using errcode = '22023';
    end if;
    v_before := v_inventory.current_quantity;
    v_after := v_before + v_quantity;
    v_average := case when v_after = 0 then v_unit_cost else round(((v_before * v_inventory.average_unit_cost) + (v_quantity * v_unit_cost)) / v_after, 4) end;
    insert into public.food_inventory_purchase_items(purchase_id, store_id, inventory_item_id, quantity, unit_cost, notes)
      values (v_purchase.id, p_store_id, v_item_id, v_quantity, v_unit_cost, nullif(trim(v_item->>'notes'), ''));
    update public.food_inventory_items set current_quantity = v_after, average_unit_cost = v_average, last_unit_cost = v_unit_cost where id = v_item_id;
    insert into public.food_inventory_movements(store_id, inventory_item_id, movement_type, quantity_delta, quantity_before, quantity_after, unit_cost, total_cost, source_type, source_id, reason, notes, idempotency_key, created_by)
      values (p_store_id, v_item_id, 'purchase', v_quantity, v_before, v_after, v_unit_cost, round(v_quantity * v_unit_cost, 2), 'purchase', v_purchase.id, 'Compra recebida', nullif(trim(v_item->>'notes'), ''), case when p_idempotency_key is null then null else p_idempotency_key || ':' || v_item_id::text end, auth.uid());
    v_total := v_total + round(v_quantity * v_unit_cost, 2);
  end loop;
  update public.food_inventory_purchases set total_amount = v_total, status = 'received' where id = v_purchase.id;
  return jsonb_build_object('purchase_id', v_purchase.id, 'total_amount', v_total, 'duplicate', false);
end;
$$;

-- Ajuste unitário para inventário inicial, perda, correção ou consumo manual.
create or replace function public.food_adjust_inventory(
  p_store_id uuid,
  p_inventory_item_id uuid,
  p_quantity_delta numeric,
  p_reason text,
  p_notes text default null,
  p_unit_cost numeric default null,
  p_movement_type text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_inventory public.food_inventory_items%rowtype;
  v_existing public.food_inventory_movements%rowtype;
  v_before numeric(14,3);
  v_after numeric(14,3);
  v_cost numeric(14,4);
  v_average numeric(14,4);
  v_type text;
  v_movement public.food_inventory_movements%rowtype;
begin
  if auth.uid() is null or not public.food_is_store_admin(p_store_id) then
    raise exception 'Sem permissão para movimentar o estoque desta loja.' using errcode = '42501';
  end if;
  if p_quantity_delta is null or p_quantity_delta = 0 or nullif(trim(p_reason), '') is null then
    raise exception 'Informe uma quantidade diferente de zero e o motivo do ajuste.' using errcode = '22023';
  end if;
  p_idempotency_key := nullif(trim(p_idempotency_key), '');
  if p_idempotency_key is not null then
    select * into v_existing from public.food_inventory_movements where store_id = p_store_id and idempotency_key = p_idempotency_key limit 1;
    if found then return jsonb_build_object('movement_id', v_existing.id, 'quantity_after', v_existing.quantity_after, 'duplicate', true); end if;
  end if;
  v_type := coalesce(p_movement_type, case when p_quantity_delta > 0 then 'adjustment_in' else 'adjustment_out' end);
  if v_type not in ('adjustment_in','adjustment_out','consumption','production','loss','return','opening_balance') then
    raise exception 'Tipo de movimentação inválido.' using errcode = '22023';
  end if;
  if p_quantity_delta > 0 and v_type = 'adjustment_out' then v_type := 'adjustment_in'; end if;
  if p_quantity_delta < 0 and v_type in ('adjustment_in','production','return','opening_balance') then v_type := 'adjustment_out'; end if;
  select * into v_inventory from public.food_inventory_items where id = p_inventory_item_id and store_id = p_store_id for update;
  if not found or not v_inventory.active then raise exception 'Insumo não encontrado ou inativo.' using errcode = '22023'; end if;
  v_before := v_inventory.current_quantity;
  v_after := v_before + p_quantity_delta;
  if v_after < 0 then raise exception 'O ajuste deixaria o estoque negativo.' using errcode = '23514'; end if;
  v_cost := case when p_quantity_delta > 0 then coalesce(p_unit_cost, v_inventory.average_unit_cost) else v_inventory.average_unit_cost end;
  if v_cost < 0 then raise exception 'O custo unitário não pode ser negativo.' using errcode = '22023'; end if;
  v_average := case when p_quantity_delta > 0 and v_after > 0 then round(((v_before * v_inventory.average_unit_cost) + (p_quantity_delta * v_cost)) / v_after, 4) else v_inventory.average_unit_cost end;
  perform set_config('foodweb.inventory_mutation', 'on', true);
  update public.food_inventory_items set current_quantity = v_after, average_unit_cost = v_average, last_unit_cost = case when p_quantity_delta > 0 then v_cost else last_unit_cost end where id = p_inventory_item_id;
  insert into public.food_inventory_movements(store_id, inventory_item_id, movement_type, quantity_delta, quantity_before, quantity_after, unit_cost, total_cost, source_type, reason, notes, idempotency_key, created_by)
    values (p_store_id, p_inventory_item_id, v_type, p_quantity_delta, v_before, v_after, v_cost, round(p_quantity_delta * v_cost, 2), 'manual', nullif(trim(p_reason), ''), nullif(trim(p_notes), ''), nullif(trim(p_idempotency_key), ''), auth.uid())
    returning * into v_movement;
  return jsonb_build_object('movement_id', v_movement.id, 'quantity_after', v_after, 'average_unit_cost', v_average, 'duplicate', false);
end;
$$;

revoke all on function public.food_record_inventory_purchase(uuid, jsonb, text, date, text, text, text, text, text) from public, anon;
grant execute on function public.food_record_inventory_purchase(uuid, jsonb, text, date, text, text, text, text, text) to authenticated;
revoke all on function public.food_adjust_inventory(uuid, uuid, numeric, text, text, numeric, text, text) from public, anon;
grant execute on function public.food_adjust_inventory(uuid, uuid, numeric, text, text, numeric, text, text) to authenticated;

comment on table public.food_inventory_items is 'Ingredientes, embalagens e produtos prontos controlados por loja.';
comment on table public.food_inventory_movements is 'Livro append-only das entradas e saídas do estoque.';
comment on column public.food_inventory_items.average_unit_cost is 'Custo médio ponderado na unidade cadastrada.';
comment on function public.food_record_inventory_purchase(uuid, jsonb, text, date, text, text, text, text, text) is 'Registra compra recebida, recalcula custo médio e grava movimentações atomicamente.';
comment on function public.food_adjust_inventory(uuid, uuid, numeric, text, text, numeric, text, text) is 'Aplica ajuste de estoque com validação de saldo e trilha de auditoria.';

notify pgrst, 'reload schema';
