begin;

-- Quantidades reservadas persistem positivas; o efeito na disponibilidade é negativo.
alter table public.food_product_location_stock drop constraint food_product_location_stock_check;
alter table public.food_product_location_stock add constraint food_product_location_stock_reserved_nonnegative check (stock_reserved_quantity >= 0);
-- Compatível com instalações que ainda não receberam o reforço de idempotência.
alter table public.food_product_stock_movements add column if not exists requested_quantity integer;

CREATE OR REPLACE FUNCTION public.food_sync_default_location_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_location_id uuid;
  v_quantity_delta integer;
  v_reserved_delta integer;
  v_quantity integer;
  v_reserved integer;
  v_routed_location uuid;
begin
  if current_setting('food.stock_location_sync', true) = 'on' then return new; end if;
  if tg_op = 'UPDATE' and not coalesce(new.track_stock,false) then return new; end if;
  select id into v_location_id from public.food_stock_locations
   where store_id=new.store_id and is_default and active limit 1;
  if v_location_id is null then
    insert into public.food_stock_locations(store_id,name,location_type,is_default)
    values(new.store_id,'Estoque principal','warehouse',true)
    returning id into v_location_id;
  end if;
  if tg_op = 'INSERT' then
    v_quantity := case when coalesce(new.track_stock,false) then greatest(coalesce(new.stock_quantity,0),0) else 0 end;
    v_reserved := case when coalesce(new.track_stock,false) then greatest(coalesce(new.stock_reserved_quantity,0),0) else 0 end;
    insert into public.food_product_location_stock(store_id,product_id,location_id,stock_quantity,stock_reserved_quantity)
    values(new.store_id,new.id,v_location_id,v_quantity,v_reserved)
    on conflict(product_id,location_id) do update
      set stock_quantity=excluded.stock_quantity,
          stock_reserved_quantity=excluded.stock_reserved_quantity,
          updated_at=now();
    return new;
  end if;
  if new.store_id is distinct from old.store_id then
    raise exception 'A loja do produto não pode mudar depois de criar saldos por local.' using errcode='23514';
  end if;
  if new.track_stock is distinct from old.track_stock and not coalesce(new.track_stock,false) then
    raise exception 'Desative o controle por local antes de desativar o estoque do produto.' using errcode='23514';
  end if;
  if coalesce(new.track_stock,false) and not coalesce(old.track_stock,false) then
    insert into public.food_product_location_stock(store_id,product_id,location_id,stock_quantity,stock_reserved_quantity)
    values(new.store_id,new.id,v_location_id,greatest(coalesce(new.stock_quantity,0),0),greatest(coalesce(new.stock_reserved_quantity,0),0))
    on conflict(product_id,location_id) do update
      set stock_quantity=excluded.stock_quantity,stock_reserved_quantity=excluded.stock_reserved_quantity,updated_at=now();
    return new;
  end if;
  begin v_routed_location := nullif(current_setting('food.order_stock_location',true),'')::uuid; exception when others then raise exception 'Local de estoque inválido.'; end;
  if v_routed_location is not null then
    if not exists(select 1 from public.food_stock_locations where id=v_routed_location and store_id=new.store_id and active) then raise exception 'Local de estoque fora da loja.'; end if;
    v_location_id := v_routed_location;
  end if;
  v_quantity_delta := coalesce(new.stock_quantity,0)-coalesce(old.stock_quantity,0);
  v_reserved_delta := coalesce(new.stock_reserved_quantity,0)-coalesce(old.stock_reserved_quantity,0);
  if v_quantity_delta <> 0 or v_reserved_delta <> 0 then
    insert into public.food_product_location_stock(store_id,product_id,location_id)
    values(new.store_id,new.id,v_location_id) on conflict(product_id,location_id) do nothing;
    update public.food_product_location_stock
       set stock_quantity=stock_quantity+v_quantity_delta,
           stock_reserved_quantity=stock_reserved_quantity+v_reserved_delta,
           updated_at=now()
     where product_id=new.id and location_id=v_location_id
       and stock_quantity+v_quantity_delta>=0
       and stock_reserved_quantity+v_reserved_delta>=0;
    if not found then
      raise exception 'O ajuste do estoque principal não cobre o saldo solicitado; use a operação por local.' using errcode='23514';
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.food_reserve_product_inventory(p_product_id uuid, p_quantity integer, p_allow_future boolean DEFAULT false)
 RETURNS TABLE(reserved_quantity integer, awaiting_restock boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_product public.food_products%rowtype;
  v_available integer;
  v_reserved integer;
  v_location_id uuid;
  v_local_available integer;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Quantidade de estoque inválida.';
  end if;

  select * into v_product
    from public.food_products
   where id = p_product_id
   for update;
  if not found then raise exception 'Produto não encontrado.'; end if;

  if not v_product.track_stock then
    return query select 0, false;
    return;
  end if;

  begin v_location_id := nullif(current_setting('food.order_stock_location',true),'')::uuid; exception when others then raise exception 'Local de estoque inválido.'; end;
  if v_location_id is null then select id into v_location_id from public.food_stock_locations where store_id=v_product.store_id and is_default; end if;
  select greatest(stock_quantity-stock_reserved_quantity,0) into v_local_available from public.food_product_location_stock where product_id=p_product_id and location_id=v_location_id and store_id=v_product.store_id for update;
  if not found then raise exception 'Produto sem saldo no local selecionado.'; end if;
  v_available := least(greatest(coalesce(v_product.stock_quantity, 0) - coalesce(v_product.stock_reserved_quantity, 0), 0),v_local_available);
  if v_available >= p_quantity then
    v_reserved := p_quantity;
    update public.food_products
       set stock_reserved_quantity = coalesce(stock_reserved_quantity, 0) + v_reserved,
           stock_status = case when coalesce(stock_quantity, 0) - coalesce(stock_reserved_quantity, 0) - v_reserved <= 3 then 'low_stock' else 'available' end,
           availability_status = case when coalesce(stock_quantity, 0) - coalesce(stock_reserved_quantity, 0) - v_reserved <= 0 then 'sold_out' else 'available' end,
           updated_at = now()
     where id = p_product_id;
    return query select v_reserved, false;
    return;
  end if;

  if not p_allow_future then
    raise exception 'Estoque insuficiente para %.', v_product.name;
  end if;

  -- Encomenda futura compromete a quantidade inteira, mesmo sem físico.
  v_reserved := p_quantity;
  update public.food_products
     set stock_reserved_quantity = coalesce(stock_reserved_quantity, 0) + v_reserved,
         stock_status = 'low_stock',
         availability_status = 'sold_out',
         updated_at = now()
   where id = p_product_id;
  return query select v_reserved, true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.food_release_order_inventory(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order public.food_orders%rowtype;
  v_item record;
  v_location_id uuid; v_previous_location text;
begin
  select * into v_order from public.food_orders where id = p_order_id for update;
  if not found then return; end if;
  if v_order.inventory_status in ('committed','released','not_tracked') then return; end if;

  for v_item in
    select oi.id, oi.product_id, oi.inventory_reserved_quantity
      from public.food_order_items oi
     where oi.order_id = p_order_id
       and oi.inventory_reserved_quantity > 0
     for update
  loop
    select id into v_location_id from public.food_stock_locations where store_id=v_order.store_id and id=coalesce(v_order.stock_location_id,(select id from public.food_stock_locations where store_id=v_order.store_id and is_default)) and active;
    if v_location_id is null then raise exception 'Local de estoque indisponível.'; end if;
    v_previous_location := current_setting('food.order_stock_location',true);
    perform set_config('food.order_stock_location',v_location_id::text,true);
    update public.food_products
       set stock_reserved_quantity = greatest(coalesce(stock_reserved_quantity, 0) - v_item.inventory_reserved_quantity, 0),
           stock_status = case when stock_status = 'unavailable' then 'unavailable' when coalesce(stock_quantity, 0) - greatest(coalesce(stock_reserved_quantity, 0) - v_item.inventory_reserved_quantity, 0) <= 3 then 'low_stock' else 'available' end,
           availability_status = case when availability_status = 'unavailable' then 'unavailable' when coalesce(stock_quantity, 0) - greatest(coalesce(stock_reserved_quantity, 0) - v_item.inventory_reserved_quantity, 0) <= 0 then 'sold_out' else 'available' end,
           updated_at = now()
     where id = v_item.product_id;
    perform set_config('food.order_stock_location',coalesce(v_previous_location,''),true);
    update public.food_order_items
       set inventory_reserved_quantity = 0
     where id = v_item.id;
  end loop;

  update public.food_orders set inventory_status = 'released', updated_at = now() where id = p_order_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.food_reserve_inventory_on_item_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order public.food_orders%rowtype; v_product public.food_products%rowtype; v_store public.food_stores%rowtype;
  v_reserved integer; v_awaiting boolean; v_allow_future boolean := false; v_timezone text;
  v_local_scheduled_date date; v_local_today date; v_inventory_status text;
  v_location_id uuid; v_previous_location text;
begin
  select * into v_order from public.food_orders where id=new.order_id for update;
  if not found or new.product_id is null or v_order.inventory_status='released' then return new; end if;
  select * into v_product from public.food_products where id=new.product_id for update;
  if not found or not v_product.track_stock then return new; end if;
  select * into v_store from public.food_stores where id=v_order.store_id;
  v_timezone:=coalesce(v_store.opening_hours->>'timezone','America/Sao_Paulo');
  v_local_today:=(now() at time zone v_timezone)::date;
  if v_order.scheduled_for is not null then v_local_scheduled_date:=(v_order.scheduled_for at time zone v_timezone)::date; end if;
  v_allow_future:=v_order.scheduled_for is not null and (v_local_scheduled_date>=v_local_today+1 or coalesce(v_order.desired_date,date '1900-01-01')>=v_local_today+1);
  if to_regprocedure('public.food_reserve_product_inventory(uuid,integer,boolean)') is null then return new; end if;
  select id into v_location_id from public.food_stock_locations where store_id=v_order.store_id and id=coalesce(v_order.stock_location_id,(select id from public.food_stock_locations where store_id=v_order.store_id and is_default)) and active;
  if v_location_id is null then raise exception 'Local de estoque indisponível.'; end if;
  v_previous_location := current_setting('food.order_stock_location',true);
  perform set_config('food.order_stock_location',v_location_id::text,true);
  select r.reserved_quantity,r.awaiting_restock into v_reserved,v_awaiting from public.food_reserve_product_inventory(new.product_id,new.quantity,v_allow_future) r;
  perform set_config('food.order_stock_location',coalesce(v_previous_location,''),true);
  update public.food_order_items set inventory_reserved_quantity=coalesce(v_reserved,0) where id=new.id;
  select case
    when v_awaiting or v_order.inventory_status='awaiting_restock' then 'awaiting_restock'
    when exists (select 1 from public.food_order_items oi join public.food_products p on p.id=oi.product_id where oi.order_id=new.order_id and p.track_stock and coalesce(oi.inventory_reserved_quantity,0)>0) then 'reserved'
    else coalesce(v_order.inventory_status,'not_tracked') end into v_inventory_status;
  update public.food_orders set inventory_status=v_inventory_status,updated_at=now() where id=new.order_id;
  if v_order.status in ('delivered','picked_up') then
    if v_inventory_status='awaiting_restock' then raise exception 'Não é possível entregar um item sem saldo integral reservado.' using errcode='23514'; end if;
    perform public.food_commit_order_inventory(new.order_id);
  end if;
  return new;
end;
$function$;

create or replace function public.food_commit_inventory_on_fulfillment()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $$
begin
  if new.status in ('delivered','picked_up') and old.status is distinct from new.status then
    -- A baixa valida o físico no local e encerra a reserva na mesma transação.
    perform public.food_commit_order_inventory(new.id);
  end if;
  return new;
end;
$$;

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
  v_available := v_after - v_reserved;

  update public.food_products
     set stock_quantity = v_after::integer,
         stock_status = case when v_available <= 3 then 'low_stock' else 'available' end,
         availability_status = case when v_available <= 0 then 'sold_out' else 'available' end
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

create or replace function public.food_adjust_location_stock_v1(
  p_store_id uuid,p_product_id uuid,p_location_id uuid,p_quantity integer,p_reason text,p_idempotency_key uuid
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_product public.food_products%rowtype;
  v_before integer;
  v_reserved integer;
  v_total integer;
  v_existing public.food_stock_location_movements%rowtype;
begin
  if (select auth.uid()) is null or not public.food_is_store_admin(p_store_id) then
    raise exception 'Sem permissão para ajustar estoque desta loja.' using errcode='42501';
  end if;
  if p_quantity is null or p_quantity<0 or p_reason is null or length(trim(p_reason)) not between 1 and 160 or p_idempotency_key is null then
    raise exception 'Informe quantidade, motivo e identificador válidos.' using errcode='22023';
  end if;
  select * into v_product from public.food_products where id=p_product_id and store_id=p_store_id and track_stock for update;
  if not found then raise exception 'Produto sem controle de estoque nesta loja.' using errcode='22023'; end if;
  perform 1 from public.food_stock_locations where id=p_location_id and store_id=p_store_id and active;
  if not found then raise exception 'Local de estoque inexistente ou inativo.' using errcode='22023'; end if;
  select * into v_existing from public.food_stock_location_movements where store_id=p_store_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.product_id<>p_product_id or v_existing.movement_type<>'adjust'
       or v_existing.to_location_id<>p_location_id
       or v_existing.request_payload<>jsonb_build_object('quantity',p_quantity,'reason',trim(p_reason)) then
      raise exception 'Identificador já usado por outra operação.' using errcode='22023';
    end if;
    return jsonb_build_object('replayed',true);
  end if;
  select stock_quantity,stock_reserved_quantity into v_before,v_reserved
    from public.food_product_location_stock where product_id=p_product_id and location_id=p_location_id for update;
  if not found then raise exception 'Local de estoque não encontrado.' using errcode='22023'; end if;
  update public.food_product_location_stock set stock_quantity=p_quantity,updated_at=now()
    where product_id=p_product_id and location_id=p_location_id;
  select sum(stock_quantity)::integer into v_total from public.food_product_location_stock where product_id=p_product_id;
  perform set_config('food.stock_location_sync','on',true);
  update public.food_products set stock_quantity=v_total,
    stock_status=case when v_total-coalesce(stock_reserved_quantity,0)<=3 then 'low_stock' else 'available' end,
    availability_status=case when v_total-coalesce(stock_reserved_quantity,0)<=0 then 'sold_out' else 'available' end
   where id=p_product_id and store_id=p_store_id;
  perform set_config('food.stock_location_sync','off',true);
  insert into public.food_stock_location_movements(store_id,product_id,to_location_id,movement_type,quantity,request_payload,reason,idempotency_key,created_by)
    values(p_store_id,p_product_id,p_location_id,'adjust',abs(p_quantity-v_before),jsonb_build_object('quantity',p_quantity,'reason',trim(p_reason)),trim(p_reason),p_idempotency_key,(select auth.uid()));
  return jsonb_build_object('stock_quantity',v_total,'location_stock',p_quantity);
end;
$$;

notify pgrst, 'reload schema';
commit;
