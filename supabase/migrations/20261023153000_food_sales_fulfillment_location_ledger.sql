begin;

-- Depends on 20261023140000_food_multilocation_stock.sql. This is forward-only:
-- historical rows remain unchanged and are reviewed by the audit query.
alter table public.food_orders
  add column if not exists stock_location_id uuid,
  add column if not exists pickup_location_id uuid,
  add column if not exists admin_request_id uuid,
  add column if not exists admin_request_fingerprint text;
create or replace function public.food_guard_order_stock_location()
returns trigger language plpgsql set search_path to 'public','pg_temp' as $
begin
  if new.stock_location_id is distinct from old.stock_location_id or new.pickup_location_id is distinct from old.pickup_location_id then
    if exists(select 1 from public.food_order_items where order_id=old.id) then
      raise exception 'O local de estoque não pode mudar depois de reservar os itens.' using errcode='23514';
    end if;
  end if;
  return new;
end;
$;
drop trigger if exists food_orders_stock_location_guard_trg on public.food_orders;
create trigger food_orders_stock_location_guard_trg before update of stock_location_id,pickup_location_id on public.food_orders
for each row execute function public.food_guard_order_stock_location();

alter table public.food_orders
  add constraint food_orders_stock_location_store_fk foreign key(stock_location_id,store_id)
    references public.food_stock_locations(id,store_id);
alter table public.food_orders
  add constraint food_orders_pickup_location_store_fk foreign key(pickup_location_id,store_id)
    references public.food_pickup_locations(id,store_id);
create unique index if not exists food_orders_admin_request_once
  on public.food_orders(store_id,admin_request_id) where admin_request_id is not null;
create index if not exists food_orders_stock_location_idx
  on public.food_orders(store_id,stock_location_id,created_at desc);
alter table public.food_pickup_locations add column if not exists stock_location_id uuid;
alter table public.food_pickup_locations
  add constraint food_pickup_stock_location_store_fk foreign key(stock_location_id,store_id)
    references public.food_stock_locations(id,store_id);

create table if not exists public.food_order_stock_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id),
  order_id uuid not null references public.food_orders(id),
  order_item_id uuid not null references public.food_order_items(id),
  product_id uuid not null references public.food_products(id),
  location_id uuid not null,
  event_type text not null check(event_type in ('sale','return')),
  quantity integer not null check(quantity>0),
  created_at timestamptz not null default now(),
  unique(order_item_id,event_type),
  foreign key(location_id,store_id) references public.food_stock_locations(id,store_id)
);
create index if not exists food_order_stock_movements_order_idx
  on public.food_order_stock_movements(store_id,order_id,created_at desc);
alter table public.food_order_stock_movements enable row level security;
create policy food_order_stock_movements_store_read on public.food_order_stock_movements
  for select to authenticated using(public.food_is_store_admin(store_id));
revoke all on public.food_order_stock_movements from anon,authenticated;
grant select on public.food_order_stock_movements to authenticated;

-- A product total is the sum across points. The trusted order functions set a
-- transaction-local location, so delta mirroring reaches the selected point.
create or replace function public.food_sync_default_location_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
    v_reserved := case when coalesce(new.track_stock,false) then least(greatest(coalesce(new.stock_reserved_quantity,0),0),v_quantity) else 0 end;
    insert into public.food_product_location_stock(store_id,product_id,location_id,stock_quantity,stock_reserved_quantity)
    values(new.store_id,new.id,v_location_id,v_quantity,v_reserved)
    on conflict(product_id,location_id) do nothing;
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
    values(new.store_id,new.id,v_location_id,greatest(coalesce(new.stock_quantity,0),0),least(greatest(coalesce(new.stock_reserved_quantity,0),0),greatest(coalesce(new.stock_quantity,0),0)))
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
       and stock_reserved_quantity+v_reserved_delta>=0
       and stock_reserved_quantity+v_reserved_delta<=stock_quantity+v_quantity_delta;
    if not found then
      raise exception 'O ajuste do estoque principal não cobre o saldo solicitado; use a operação por local.' using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;

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
           updated_at = now()
     where id = p_product_id;
    return query select v_reserved, false;
    return;
  end if;

  if not p_allow_future then
    raise exception 'Estoque insuficiente para %.', v_product.name;
  end if;

  v_reserved := v_available;
  if v_reserved > 0 then
    update public.food_products
       set stock_reserved_quantity = coalesce(stock_reserved_quantity, 0) + v_reserved,
           updated_at = now()
     where id = p_product_id;
  end if;
  return query select v_reserved, true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.food_commit_order_inventory(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order public.food_orders%rowtype;
  v_item record;
  v_product public.food_products%rowtype;
  v_location_id uuid;
  v_previous_location text;
begin
  select * into v_order from public.food_orders where id = p_order_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if v_order.status = 'cancelled' or v_order.inventory_status = 'released' then return; end if;
  if exists (
    select 1 from public.food_order_items i join public.food_products p on p.id=i.product_id
    where i.order_id=p_order_id and p.track_stock and i.inventory_reserved_quantity<>i.quantity
      and not exists(select 1 from public.food_order_stock_movements m where m.order_item_id=i.id and m.event_type='sale')
  ) then raise exception 'Itens sem reserva integral; revise o pedido antes de entregar.' using errcode='23514'; end if;

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
    if v_item.inventory_reserved_quantity <> v_item.quantity then
      raise exception 'O item precisa estar totalmente reservado antes da saída física.' using errcode='23514';
    end if;
    select id into v_location_id from public.food_stock_locations where store_id=v_order.store_id and id=coalesce(v_order.stock_location_id,(select id from public.food_stock_locations where store_id=v_order.store_id and is_default)) and active;
    if v_location_id is null then raise exception 'Local de estoque indisponível.'; end if;
    v_previous_location := current_setting('food.order_stock_location',true);
    perform set_config('food.order_stock_location',v_location_id::text,true);
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
    insert into public.food_order_stock_movements(store_id,order_id,order_item_id,product_id,location_id,event_type,quantity)
    values(v_order.store_id,v_order.id,v_item.id,v_item.product_id,v_location_id,'sale',v_item.quantity)
    on conflict(order_item_id,event_type) do nothing;
    perform set_config('food.order_stock_location',coalesce(v_previous_location,''),true);
  end loop;

  update public.food_orders set inventory_status = case
    when exists (select 1 from public.food_inventory_order_consumptions c where c.order_id = p_order_id and c.target_quantity > c.consumed_quantity) then 'awaiting_restock'
    else 'committed' end, updated_at = now() where id = p_order_id;
  perform public.food_reconcile_order_recipe_consumption(p_order_id, true);
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
    when exists (select 1 from public.food_order_items oi join public.food_products p on p.id=oi.product_id where oi.order_id=new.order_id and p.track_stock and coalesce(oi.inventory_reserved_quantity,0)<oi.quantity) then 'awaiting_restock'
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

CREATE OR REPLACE FUNCTION public.food_confirm_order_payment_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_order public.food_orders%rowtype; v_already_paid boolean;
begin
  select * into v_order from public.food_orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if not public.food_is_store_admin(v_order.store_id) and not public.food_is_platform_admin() then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if v_order.status='cancelled' then raise exception 'Não é possível confirmar o recebimento de um pedido cancelado.'; end if;
  if coalesce(v_order.total,0)<=0 then raise exception 'O pedido não possui valor válido para recebimento.'; end if;
  v_already_paid:=v_order.payment_status='paid';
  update public.food_orders set payment_status='paid',payment_received_at=coalesce(payment_received_at,now()),payment_confirmed_by=coalesce(payment_confirmed_by,auth.uid()) where id=p_order_id returning * into v_order;
  return jsonb_build_object('ok',true,'alreadyPaid',v_already_paid,'orderId',v_order.id,'paymentReceivedAt',v_order.payment_received_at,'amount',v_order.total,'inventoryStatus',v_order.inventory_status);
end;
$function$;


-- Physical handoff, independent of payment, consumes once. Existing completed
-- orders are not replayed by this trigger because it only sees new transitions.
create or replace function public.food_commit_inventory_on_fulfillment()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $$
begin
  if new.status in ('delivered','picked_up') and old.status is distinct from new.status then
    if new.inventory_status='awaiting_restock' then
      raise exception 'Não é possível concluir a entrega enquanto houver estoque pendente.' using errcode='23514';
    end if;
    perform public.food_commit_order_inventory(new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.food_commit_inventory_on_fulfillment() from public,anon,authenticated;
drop trigger if exists food_orders_commit_inventory_on_fulfillment_trg on public.food_orders;
create trigger food_orders_commit_inventory_on_fulfillment_trg
  after update of status on public.food_orders for each row
  execute function public.food_commit_inventory_on_fulfillment();

-- Restock must not silently settle an old, delivered order or consume stock
-- automatically without a new, authorized handoff.
drop trigger if exists food_products_restock_commit_trg on public.food_products;

CREATE OR REPLACE FUNCTION public.food_create_admin_order_v1(payload jsonb)
 RETURNS TABLE(order_id uuid, order_number bigint, order_total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_store_id uuid; v_order_id uuid := gen_random_uuid(); v_order_number bigint;
  v_customer_name text; v_customer_phone text; v_delivery_type text; v_source text; v_payment_method text; v_status text;
  v_received boolean := false; v_notes text; v_item jsonb; v_option jsonb; v_product public.food_products%rowtype;
  v_group record; v_option_record record; v_product_id uuid; v_group_id uuid; v_option_id uuid;
  v_quantity integer; v_option_quantity integer; v_choice_count integer; v_unit_price numeric(12,2); v_item_total numeric(12,2);
  v_subtotal numeric(12,2) := 0; v_preparation_extra integer := 0; v_order_item_id uuid;
  v_scheduled_for timestamptz; v_allow_future boolean := false; v_timezone text := 'America/Sao_Paulo';
  v_items_calculated jsonb := '[]'::jsonb; v_options_calculated jsonb;
  v_location_id uuid; v_request_id uuid; v_request_fingerprint text;
begin
  if auth.uid() is null then raise exception 'Sessão autenticada obrigatória.' using errcode='42501'; end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then raise exception 'Pedido avulso inválido.'; end if;
  begin v_store_id := (payload->>'store_id')::uuid; exception when others then raise exception 'Loja inválida.'; end;
  if not exists (select 1 from public.food_store_users su where su.store_id=v_store_id and su.user_id=auth.uid() and su.active and su.role in ('owner','admin','manager')) then raise exception 'Acesso negado para lançar pedidos desta loja.' using errcode='42501'; end if;
  begin v_location_id:=nullif(payload->>'stock_location_id','')::uuid; v_request_id:=nullif(payload->>'admin_request_id','')::uuid;
  exception when others then raise exception 'Identificador do local ou da tentativa inválido.'; end;
  if v_location_id is not null and not exists(select 1 from public.food_stock_locations where id=v_location_id and store_id=v_store_id and active) then raise exception 'Local de estoque indisponível.'; end if;
  if v_request_id is not null then
    v_request_fingerprint:=md5(payload::text);
    perform pg_advisory_xact_lock(hashtextextended(v_store_id::text||v_request_id::text,0));
    if exists(select 1 from public.food_orders where store_id=v_store_id and admin_request_id=v_request_id) then
      if exists(select 1 from public.food_orders where store_id=v_store_id and admin_request_id=v_request_id and admin_request_fingerprint is distinct from v_request_fingerprint) then
        raise exception 'Esta chave já foi usada para uma venda diferente.' using errcode='23505';
      end if;
      return query select o.id,o.order_number,o.total from public.food_orders o where o.store_id=v_store_id and o.admin_request_id=v_request_id;
      return;
    end if;
  end if;
  v_customer_name:=trim(coalesce(payload->>'customer_name','')); v_customer_phone:=nullif(trim(coalesce(payload->>'customer_phone','')),''); v_delivery_type:=coalesce(nullif(trim(payload->>'delivery_type'),''),'pickup'); v_source:=coalesce(nullif(trim(payload->>'source'),''),'counter'); v_payment_method:=coalesce(nullif(trim(payload->>'payment_method'),''),'cash'); v_status:=coalesce(nullif(trim(payload->>'status'),''),'received'); v_notes:=nullif(left(trim(coalesce(payload->>'notes','')),500),'');
  if length(v_customer_name)<2 then raise exception 'Informe o nome do cliente.'; end if;
  if v_delivery_type not in ('delivery','pickup') then raise exception 'Forma de recebimento inválida.'; end if;
  if v_source not in ('counter','whatsapp','phone','ifood','other') then raise exception 'Origem do pedido inválida.'; end if;
  if v_payment_method not in ('confirm','pix','card','cash') then raise exception 'Forma de pagamento inválida.'; end if;
  if v_status not in ('received','confirmed','preparing','ready','out_for_delivery','delivered','picked_up','cancelled') then raise exception 'Status inicial inválido.'; end if;
  begin v_received:=coalesce((payload->>'received')::boolean,false); exception when others then raise exception 'Situação de recebimento inválida.'; end;
  if v_status='cancelled' and v_received then raise exception 'Um pedido cancelado não pode ser marcado como recebido.'; end if;
  if nullif(payload->>'scheduled_for','') is not null then
    begin v_scheduled_for := (payload->>'scheduled_for')::timestamptz; exception when others then raise exception 'Agendamento inválido.'; end;
    select coalesce(nullif(opening_hours->>'timezone',''),'America/Sao_Paulo') into v_timezone from public.food_stores where id=v_store_id;
    if v_scheduled_for <= now() or (v_scheduled_for at time zone v_timezone)::date < ((now() at time zone v_timezone)::date + 1) then raise exception 'O lançamento futuro precisa ser agendado a partir de amanhã.'; end if;
    v_allow_future := true;
  end if;
  if jsonb_typeof(payload->'items')<>'array' or jsonb_array_length(payload->'items')=0 then raise exception 'Selecione ao menos um produto.'; end if;
  if jsonb_array_length(payload->'items')>50 then raise exception 'O pedido excede o limite de itens.'; end if;
  for v_item in select * from jsonb_array_elements(payload->'items') loop
    begin v_product_id:=(v_item->>'product_id')::uuid; v_quantity:=(v_item->>'quantity')::integer; exception when others then raise exception 'Produto ou quantidade inválidos.'; end;
    if v_quantity<1 or v_quantity>99 then raise exception 'Quantidade inválida.'; end if;
    select * into v_product from public.food_products p where p.id=v_product_id and p.store_id=v_store_id and p.active and (v_allow_future or (p.availability_status='available' and p.stock_status<>'unavailable')) and exists(select 1 from public.food_categories c where c.id=p.category_id and c.store_id=p.store_id and c.active);
    if v_product.id is null then raise exception 'Um dos produtos não está disponível.'; end if;
    v_unit_price:=coalesce(v_product.promotional_price,v_product.price); v_options_calculated:='[]'::jsonb;
    for v_group in select og.* from public.food_option_groups og join public.food_product_option_groups pog on pog.option_group_id=og.id and pog.store_id=og.store_id where pog.product_id=v_product.id and pog.store_id=v_store_id and og.active order by pog.sort_order,og.sort_order loop
      select count(distinct entry->>'item_id')::integer into v_choice_count from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb)) entry where entry->>'group_id'=v_group.id::text;
      if v_choice_count<v_group.min_choices then raise exception 'Faltam escolhas obrigatórias em %.',v_group.name; end if;
      if v_choice_count>v_group.max_choices then raise exception 'Quantidade de escolhas excedida em %.',v_group.name; end if;
    end loop;
    for v_option in select * from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb)) loop
      begin v_group_id:=(v_option->>'group_id')::uuid; v_option_id:=(v_option->>'item_id')::uuid; v_option_quantity:=coalesce((v_option->>'quantity')::integer,1); exception when others then raise exception 'Opção inválida.'; end;
      if v_option_quantity<1 or v_option_quantity>20 then raise exception 'Quantidade da opção inválida.'; end if;
      select og.id group_id,og.name group_name,og.kind,oi.id item_id,oi.name item_name,oi.price_delta into v_option_record from public.food_option_groups og join public.food_product_option_groups pog on pog.option_group_id=og.id and pog.store_id=og.store_id join public.food_option_items oi on oi.group_id=og.id and oi.store_id=og.store_id where pog.product_id=v_product.id and pog.store_id=v_store_id and og.id=v_group_id and oi.id=v_option_id and og.active and oi.active;
      if not found then raise exception 'Uma das opções não está disponível.'; end if;
      if v_option_record.kind<>'addon' and v_option_quantity<>1 then raise exception 'Quantidade inválida para a opção.'; end if;
      if v_option_record.kind='removal' and v_option_record.price_delta<>0 then raise exception 'Remoção com preço inválido.'; end if;
      if exists(select 1 from jsonb_array_elements(v_options_calculated) selected where selected->>'item_id'=v_option_record.item_id::text) then raise exception 'Opção duplicada.'; end if;
      v_unit_price:=v_unit_price+v_option_record.price_delta*v_option_quantity;
      v_options_calculated:=v_options_calculated||jsonb_build_array(jsonb_build_object('group_id',v_option_record.group_id,'group_name',v_option_record.group_name,'kind',v_option_record.kind,'item_id',v_option_record.item_id,'item_name',v_option_record.item_name,'price_delta',v_option_record.price_delta,'quantity',v_option_quantity));
    end loop;
    if v_unit_price<0 then raise exception 'Preço final inválido.'; end if;
    v_item_total:=round(v_unit_price*v_quantity,2); v_subtotal:=v_subtotal+v_item_total; v_preparation_extra:=greatest(v_preparation_extra,coalesce(v_product.preparation_time_minutes,0));
    v_items_calculated:=v_items_calculated||jsonb_build_array(jsonb_build_object('product_id',v_product.id,'product_name',v_product.name,'quantity',v_quantity,'unit_price',round(v_unit_price,2),'options',v_options_calculated,'item_total',v_item_total));
  end loop;
  v_subtotal:=round(v_subtotal,2);
  insert into public.food_orders(id,store_id,customer_name,customer_phone,delivery_type,desired_date,scheduled_for,notes,payment_method,review_confirmed,subtotal,total,status,payment_status,payment_received_at,payment_confirmed_by,preparation_estimate_minutes,source,stock_location_id,admin_request_id,admin_request_fingerprint)
  values(v_order_id,v_store_id,v_customer_name,v_customer_phone,v_delivery_type,coalesce((v_scheduled_for at time zone v_timezone)::date,current_date),v_scheduled_for,v_notes,v_payment_method,true,v_subtotal,v_subtotal,v_status,case when v_received then 'paid' else 'pending' end,case when v_received then now() else null end,case when v_received then auth.uid() else null end,v_preparation_extra,v_source,v_location_id,v_request_id,v_request_fingerprint) returning food_orders.order_number into v_order_number;
  for v_item in select * from jsonb_array_elements(v_items_calculated) loop
    insert into public.food_order_items(order_id,product_id,product_name,quantity,unit_price,variant_name,variant_price_delta,addons,item_total) values(v_order_id,(v_item->>'product_id')::uuid,v_item->>'product_name',(v_item->>'quantity')::integer,(v_item->>'unit_price')::numeric,null,0,coalesce(v_item->'options','[]'::jsonb),(v_item->>'item_total')::numeric) returning id into v_order_item_id;
    for v_option in select * from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb)) loop
      insert into public.food_order_item_options(order_item_id,option_group_id,option_item_id,group_name,option_name,option_kind,price_delta,quantity) values(v_order_item_id,(v_option->>'group_id')::uuid,(v_option->>'item_id')::uuid,v_option->>'group_name',v_option->>'item_name',v_option->>'kind',(v_option->>'price_delta')::numeric,(v_option->>'quantity')::integer);
    end loop;
  end loop;
  return query select v_order_id,v_order_number,v_subtotal;
end;
$function$;

CREATE OR REPLACE FUNCTION public.food_create_public_order(payload jsonb)
 RETURNS TABLE(order_id uuid, order_number bigint, order_total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_store public.food_stores%rowtype;
  v_product public.food_products%rowtype;
  v_zone public.food_delivery_zones%rowtype;
  v_order_id uuid := gen_random_uuid();
  v_order_number bigint;
  v_request_id uuid;
  v_item jsonb; v_option jsonb; v_group record; v_option_record record;
  v_items_calculated jsonb := '[]'::jsonb; v_options_calculated jsonb;
  v_subtotal numeric(12,2):=0; v_delivery_fee numeric(12,2):=0; v_total numeric(12,2):=0;
  v_product_id uuid; v_group_id uuid; v_option_id uuid; v_quantity integer; v_option_quantity integer; v_choice_count integer;
  v_unit_price numeric(12,2); v_item_total numeric(12,2); v_payment_method text; v_review_confirmed boolean;
  v_needs_change boolean:=false; v_change_for numeric(12,2); v_change_amount numeric(12,2);
  v_scheduled_for timestamptz; v_preparation_extra integer:=0; v_order_item_id uuid;
  v_delivery_start time; v_timezone text; v_local timestamp; v_timing_confirmed boolean:=false;
  v_party_weight numeric(12,3); v_pickup_id uuid; v_location_id uuid;
begin
  if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'Pedido inválido.'; end if;
  begin v_request_id := (payload->>'public_request_id')::uuid; exception when others then raise exception 'Identificador de tentativa inválido.'; end;
  begin select * into v_store from public.food_stores where id=(payload->>'store_id')::uuid; exception when others then raise exception 'Loja inválida.'; end;
  if v_store.id is null or not public.food_store_accessible(v_store.id) then raise exception 'Loja indisponível.'; end if;
  perform public.food_enforce_public_order_rate_limit(v_store.id);
  select o.id,o.order_number,o.total into order_id,order_number,order_total from public.food_orders o where o.store_id=v_store.id and o.public_request_id=v_request_id limit 1;
  if order_id is not null then return next; return; end if;

  if length(trim(coalesce(payload->>'customer_name',''))) < 2 then raise exception 'Informe seu nome.'; end if;
  if length(regexp_replace(coalesce(payload->>'customer_phone',''),'\D','','g')) < 10 then raise exception 'Informe um telefone válido.'; end if;
  if payload->>'delivery_type' not in ('delivery','pickup') then raise exception 'Forma de recebimento inválida.'; end if;
  begin v_pickup_id := nullif(payload->>'pickup_location_id','')::uuid; exception when others then raise exception 'Ponto de retirada inválido.'; end;
  if v_pickup_id is not null then
    if payload->>'delivery_type'<>'pickup' then raise exception 'Ponto de retirada somente para pedidos de retirada.'; end if;
    select pickup.stock_location_id into v_location_id from public.food_pickup_locations pickup
      join public.food_stock_locations location on location.id=pickup.stock_location_id and location.store_id=pickup.store_id and location.active
      where pickup.id=v_pickup_id and pickup.store_id=v_store.id and pickup.active and pickup.is_public;
    if not found or v_location_id is null then raise exception 'Ponto de retirada sem estoque autorizado.'; end if;
  end if;
  if payload->>'delivery_type'='delivery' and not v_store.delivery_enabled then raise exception 'Delivery indisponível.'; end if;
  if payload->>'delivery_type'='pickup' and not v_store.pickup_enabled then raise exception 'Retirada indisponível.'; end if;

  v_timezone := coalesce(nullif(v_store.opening_hours->>'timezone',''),'America/Sao_Paulo');
  begin v_delivery_start := nullif(v_store.opening_hours->>'delivery_start_time','')::time; exception when others then v_delivery_start := null; end;
  begin v_timing_confirmed := coalesce((payload->>'flexible_timing_confirmed')::boolean,false); exception when others then v_timing_confirmed := false; end;
  v_local := now() at time zone v_timezone;

  if not public.food_store_is_accepting_orders(v_store.id,now()) and not v_store.allow_scheduled_orders then
    raise exception 'A loja está fechada para novos pedidos.';
  end if;

  if nullif(payload->>'scheduled_for','') is not null then
    begin v_scheduled_for := (payload->>'scheduled_for')::timestamptz; exception when others then raise exception 'Agendamento inválido.'; end;
    if v_scheduled_for <= now() then raise exception 'O agendamento precisa ser futuro.'; end if;
    if payload->>'delivery_type'='delivery' then
      if v_delivery_start is not null then
        v_local := v_scheduled_for at time zone v_timezone;
        if v_local::time < v_delivery_start then raise exception 'As entregas começam às %. Selecione um horário a partir desse horário.', to_char(v_delivery_start,'HH24:MI'); end if;
      elsif not public.food_store_is_accepting_orders(v_store.id,v_scheduled_for) then
        raise exception 'O horário agendado está fora do funcionamento da loja.';
      end if;
    elsif not public.food_store_is_accepting_orders(v_store.id,v_scheduled_for) then
      raise exception 'O horário agendado está fora da janela de retirada da loja.';
    end if;
  elsif not public.food_store_is_accepting_orders(v_store.id,now())
     or (payload->>'delivery_type'='delivery' and v_delivery_start is not null and v_local::time < v_delivery_start) then
    if not v_store.allow_scheduled_orders then
      if payload->>'delivery_type'='delivery' and v_delivery_start is not null and v_local::time < v_delivery_start then
        raise exception 'As entregas começam às %. Se preferir, selecione retirada ou agende.', to_char(v_delivery_start,'HH24:MI');
      end if;
      raise exception 'A loja está fechada para novos pedidos.';
    end if;
    if not v_timing_confirmed then
      if payload->>'delivery_type'='delivery' then raise exception 'Confirme que aceita a entrega conforme a próxima janela disponível.'; end if;
      raise exception 'Confirme que aceita retirar o pedido conforme a próxima janela da loja.';
    end if;
  end if;

  v_payment_method := coalesce(nullif(payload->>'payment_method',''),'confirm');
  if v_payment_method not in ('confirm','pix','card','cash') then raise exception 'Forma de pagamento inválida.'; end if;
  if v_payment_method='pix' and not v_store.pix_enabled then raise exception 'PIX indisponível.'; end if;
  if v_payment_method='card' and (not v_store.card_payment_enabled or not coalesce(v_store.show_whatsapp,false) or nullif(trim(coalesce(v_store.whatsapp,'')),'') is null) then raise exception 'Pagamento por cartão exige WhatsApp disponível na loja.'; end if;
  if v_payment_method='cash' and not v_store.cash_payment_enabled then raise exception 'Dinheiro indisponível.'; end if;
  if v_payment_method='confirm' and not v_store.confirmation_payment_enabled then raise exception 'Pagamento a combinar indisponível.'; end if;

  if payload->>'delivery_type'='delivery' then
    begin select * into v_zone from public.food_delivery_zones where id=(payload->>'delivery_zone_id')::uuid and store_id=v_store.id and active; exception when others then raise exception 'Bairro de entrega inválido.'; end;
    if v_zone.id is null then raise exception 'Bairro de entrega indisponível.'; end if;
    v_delivery_fee := v_zone.fee;
  end if;
  if jsonb_typeof(payload->'items')<>'array' or jsonb_array_length(payload->'items')=0 then raise exception 'Carrinho vazio.'; end if;
  if jsonb_array_length(payload->'items')>50 then raise exception 'O pedido excede o limite de itens.'; end if;

  for v_item in select * from jsonb_array_elements(payload->'items') loop
    begin v_product_id := (v_item->>'product_id')::uuid; exception when others then raise exception 'Produto inválido.'; end;
    select * into v_product from public.food_products p
      where p.id=v_product_id and p.store_id=v_store.id and p.active and p.availability_status='available'
        and p.stock_status<>'unavailable'
        and exists(select 1 from public.food_categories c where c.id=p.category_id and c.store_id=p.store_id and c.active);
    if v_product.id is null then raise exception 'Um dos produtos não está mais disponível.'; end if;
    begin v_quantity := (v_item->>'quantity')::integer; exception when others then raise exception 'Quantidade inválida.'; end;
    if v_quantity<1 or v_quantity>99 then raise exception 'Quantidade inválida.'; end if;

    v_party_weight := null;
    if coalesce(v_product.party_order_enabled, false) then
      begin v_party_weight := nullif(v_item->>'party_package_weight_grams','')::numeric; exception when others then raise exception 'Gramatura inválida.'; end;
      v_party_weight := greatest(1, coalesce(v_party_weight, v_product.party_package_weight_grams, 100));
      if v_quantity < coalesce(v_product.party_minimum_packages, 1) then raise exception 'A encomenda de % exige pelo menos % pacote(s).', v_product.name, coalesce(v_product.party_minimum_packages, 1); end if;
      if v_scheduled_for is null then raise exception 'A encomenda de % precisa de uma data agendada.', v_product.name; end if;
      if (v_scheduled_for at time zone v_timezone)::date < ((now() at time zone v_timezone)::date + coalesce(v_product.party_lead_time_days, 0)) then raise exception 'A encomenda de % precisa de pelo menos % dia(s) de antecedência.', v_product.name, coalesce(v_product.party_lead_time_days, 0); end if;
      v_unit_price := coalesce(nullif(v_product.party_price_per_gram,0) * v_party_weight, coalesce(v_product.promotional_price,v_product.price));
    else
      v_unit_price := coalesce(v_product.promotional_price,v_product.price);
    end if;
    v_options_calculated := '[]'::jsonb;
    for v_group in select og.* from public.food_option_groups og join public.food_product_option_groups pog on pog.option_group_id=og.id and pog.store_id=og.store_id where pog.product_id=v_product.id and pog.store_id=v_store.id and og.active order by pog.sort_order,og.sort_order loop
      select count(distinct(entry->>'item_id'))::integer into v_choice_count from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb)) entry where entry->>'group_id'=v_group.id::text;
      if v_choice_count<v_group.min_choices then raise exception 'Faltam escolhas obrigatórias em %.',v_group.name; end if;
      if v_choice_count>v_group.max_choices then raise exception 'Quantidade de escolhas excedida em %.',v_group.name; end if;
    end loop;
    for v_option in select * from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb)) loop
      begin v_group_id:=(v_option->>'group_id')::uuid; v_option_id:=(v_option->>'item_id')::uuid; v_option_quantity:=coalesce((v_option->>'quantity')::integer,1); exception when others then raise exception 'Opção inválida.'; end;
      if v_option_quantity<1 or v_option_quantity>20 then raise exception 'Quantidade da opção inválida.'; end if;
      select og.id group_id,og.name group_name,og.kind,oi.id item_id,oi.name item_name,oi.price_delta into v_option_record from public.food_option_groups og join public.food_product_option_groups pog on pog.option_group_id=og.id and pog.store_id=og.store_id join public.food_option_items oi on oi.group_id=og.id and oi.store_id=og.store_id where pog.product_id=v_product.id and pog.store_id=v_store.id and og.id=v_group_id and oi.id=v_option_id and og.active and oi.active;
      if not found then raise exception 'Uma das opções não está disponível.'; end if;
      if v_option_record.kind<>'addon' and v_option_quantity<>1 then raise exception 'Quantidade inválida para a opção.'; end if;
      if v_option_record.kind='removal' and v_option_record.price_delta<>0 then raise exception 'Remoção com preço inválido.'; end if;
      if exists(select 1 from jsonb_array_elements(v_options_calculated) x where x->>'item_id'=v_option_record.item_id::text) then raise exception 'Opção duplicada.'; end if;
      v_unit_price:=v_unit_price+v_option_record.price_delta*v_option_quantity;
      v_options_calculated:=v_options_calculated||jsonb_build_array(jsonb_build_object('group_id',v_option_record.group_id,'group_name',v_option_record.group_name,'kind',v_option_record.kind,'item_id',v_option_record.item_id,'item_name',v_option_record.item_name,'price_delta',v_option_record.price_delta,'quantity',v_option_quantity));
    end loop;
    if v_unit_price<0 then raise exception 'Preço final inválido.'; end if;
    v_item_total:=round(v_unit_price*v_quantity,2); v_subtotal:=v_subtotal+v_item_total; v_preparation_extra:=greatest(v_preparation_extra,coalesce(v_product.preparation_time_minutes,0));
    v_items_calculated:=v_items_calculated||jsonb_build_array(jsonb_build_object('product_id',v_product.id,'product_name',v_product.name,'quantity',v_quantity,'party_package_weight_grams',v_party_weight,'unit_price',round(v_unit_price,2),'options',v_options_calculated,'item_total',v_item_total));
  end loop;

  v_subtotal:=round(v_subtotal,2); if v_subtotal<v_store.minimum_order then raise exception 'Pedido abaixo do mínimo da loja.'; end if; v_total:=round(v_subtotal+v_delivery_fee,2);
  begin v_review_confirmed:=coalesce((payload->>'review_confirmed')::boolean,false); exception when others then v_review_confirmed:=false; end;
  begin v_needs_change:=coalesce((payload->>'needs_change')::boolean,false); exception when others then v_needs_change:=false; end;
  if v_payment_method<>'cash' then v_needs_change:=false; end if;
  if v_needs_change then begin v_change_for:=(payload->>'change_for')::numeric; exception when others then raise exception 'Valor para troco inválido.'; end; if v_change_for<=v_total then raise exception 'O valor para troco deve ser maior que o total.'; end if; v_change_amount:=round(v_change_for-v_total,2); end if;

  insert into public.food_orders(id,store_id,public_request_id,customer_name,customer_phone,customer_email,delivery_type,desired_date,delivery_address,delivery_zip_code,delivery_street,delivery_number,delivery_complement,delivery_neighborhood,delivery_zone_id,delivery_zone_name,delivery_fee,delivery_city,delivery_state,reference_point,notes,payment_method,review_confirmed,subtotal,total,status,needs_change,change_for,change_amount,scheduled_for,preparation_estimate_minutes,source,stock_location_id,pickup_location_id)
  values(v_order_id,v_store.id,v_request_id,trim(payload->>'customer_name'),trim(payload->>'customer_phone'),nullif(trim(payload->>'customer_email'),''),payload->>'delivery_type',coalesce(v_scheduled_for::date,current_date),case when payload->>'delivery_type'='delivery' then nullif(trim(payload->>'delivery_address'),'') end,case when payload->>'delivery_type'='delivery' then nullif(trim(payload->>'delivery_zip_code'),'') end,case when payload->>'delivery_type'='delivery' then nullif(trim(payload->>'delivery_street'),'') end,case when payload->>'delivery_type'='delivery' then nullif(trim(payload->>'delivery_number'),'') end,case when payload->>'delivery_type'='delivery' then nullif(trim(payload->>'delivery_complement'),'') end,case when payload->>'delivery_type'='delivery' then v_zone.name end,case when payload->>'delivery_type'='delivery' then v_zone.id end,case when payload->>'delivery_type'='delivery' then v_zone.name end,v_delivery_fee,case when payload->>'delivery_type'='delivery' then v_zone.city end,case when payload->>'delivery_type'='delivery' then upper(v_zone.state) end,case when payload->>'delivery_type'='delivery' then nullif(trim(payload->>'reference_point'),'') end,nullif(trim(payload->>'notes'),''),v_payment_method,v_review_confirmed,v_subtotal,v_total,'received',v_needs_change,v_change_for,v_change_amount,v_scheduled_for,greatest(v_store.average_preparation_min,v_store.average_preparation_max)+v_preparation_extra,'site',v_location_id,v_pickup_id) returning food_orders.order_number into v_order_number;
  for v_item in select * from jsonb_array_elements(v_items_calculated) loop
    insert into public.food_order_items(order_id,product_id,product_name,quantity,party_package_weight_grams,unit_price,variant_name,variant_price_delta,addons,item_total) values(v_order_id,(v_item->>'product_id')::uuid,v_item->>'product_name',(v_item->>'quantity')::integer,nullif(v_item->>'party_package_weight_grams','')::numeric,(v_item->>'unit_price')::numeric,null,0,coalesce(v_item->'options','[]'::jsonb),(v_item->>'item_total')::numeric) returning id into v_order_item_id;
    for v_option in select * from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb)) loop
      insert into public.food_order_item_options(order_item_id,option_group_id,option_item_id,group_name,option_name,option_kind,price_delta,quantity) values(v_order_item_id,(v_option->>'group_id')::uuid,(v_option->>'item_id')::uuid,v_option->>'group_name',v_option->>'item_name',v_option->>'kind',(v_option->>'price_delta')::numeric,(v_option->>'quantity')::integer);
    end loop;
  end loop;
  return query select v_order_id,v_order_number,v_total;
end;
$function$;

-- Only configured points are displayed to customers.
create or replace function public.food_get_public_pickup_locations_v1(p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $
begin
  if not public.food_store_accessible(p_store_id) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',p.id,'name',p.name,'short_code',p.short_code,
      'address',p.address,'instructions',p.instructions
    ) order by p.sort_order,p.name)
    from public.food_pickup_locations p
    join public.food_stock_locations l on l.id=p.stock_location_id and l.store_id=p.store_id and l.active
    where p.store_id=p_store_id and p.active and p.is_public
  ),'[]'::jsonb);
end;
$;
notify pgrst,'reload schema';
commit;
