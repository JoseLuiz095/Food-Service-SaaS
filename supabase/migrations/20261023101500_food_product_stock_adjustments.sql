begin;

create table if not exists public.food_product_stock_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  product_id uuid not null,
  product_name text not null,
  movement_type text not null check (movement_type in ('set','add','remove')),
  quantity_before integer not null check (quantity_before >= 0),
  quantity_after integer not null check (quantity_after >= 0),
  quantity_delta integer not null,
  reason text not null check (length(trim(reason)) between 1 and 160),
  idempotency_key uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint food_product_stock_movements_idempotency_uidx unique (store_id, idempotency_key)
);

create index if not exists food_product_stock_movements_product_date_idx
  on public.food_product_stock_movements(store_id, product_id, created_at desc);

alter table public.food_product_stock_movements enable row level security;
drop policy if exists food_product_stock_movements_admin_select on public.food_product_stock_movements;
create policy food_product_stock_movements_admin_select
  on public.food_product_stock_movements for select to authenticated
  using (public.food_is_store_admin(store_id));

grant select on public.food_product_stock_movements to authenticated;
revoke insert, update, delete on public.food_product_stock_movements from anon, authenticated;

create or replace function public.food_log_initial_product_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.track_stock and coalesce(new.stock_quantity,0) > 0 then
    insert into public.food_product_stock_movements(
      store_id, product_id, product_name, movement_type, quantity_before,
      quantity_after, quantity_delta, reason, idempotency_key, created_by
    ) values (
      new.store_id, new.id, new.name, 'set', 0, new.stock_quantity,
      new.stock_quantity, 'Saldo inicial do cadastro', gen_random_uuid(), (select auth.uid())
    );
  end if;
  return new;
end;
$$;
revoke all on function public.food_log_initial_product_stock() from public, anon, authenticated;
drop trigger if exists food_products_stock_initial_movement on public.food_products;
create trigger food_products_stock_initial_movement
  after insert on public.food_products
  for each row execute function public.food_log_initial_product_stock();

create or replace function public.food_guard_product_stock_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('anon','authenticated')
     and (new.stock_quantity is distinct from old.stock_quantity
       or new.stock_reserved_quantity is distinct from old.stock_reserved_quantity) then
    raise exception 'O saldo de produtos só pode ser alterado por uma operação transacional de estoque.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.food_guard_product_stock_mutation() from public, anon, authenticated;
drop trigger if exists food_products_stock_mutation_guard on public.food_products;
create trigger food_products_stock_mutation_guard
  before update of stock_quantity, stock_reserved_quantity on public.food_products
  for each row execute function public.food_guard_product_stock_mutation();

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
    if v_existing.product_id <> p_product_id or v_existing.movement_type <> p_mode then
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
    quantity_delta, reason, idempotency_key, created_by
  ) values (
    p_store_id, p_product_id, v_product.name, p_mode, v_before, v_after,
    (v_after - v_before)::integer, trim(p_reason), p_idempotency_key, (select auth.uid())
  );

  return jsonb_build_object('stock_quantity',v_product.stock_quantity,'stock_reserved_quantity',v_product.stock_reserved_quantity,'stock_status',v_product.stock_status,'availability_status',v_product.availability_status);
end;
$$;

revoke all on function public.food_adjust_product_stock_v1(uuid,uuid,text,numeric,text,uuid) from public, anon;
grant execute on function public.food_adjust_product_stock_v1(uuid,uuid,text,numeric,text,uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
