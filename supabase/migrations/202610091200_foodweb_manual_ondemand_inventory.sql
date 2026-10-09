-- Garante que o pedido avulso tenha o mesmo comportamento do checkout:
-- item sem saldo pode virar encomenda futura, sem falhar no INSERT do item.
-- Aplicar depois das migrations/patches de estoque e agendamento.
begin;

alter table public.food_products
  add column if not exists stock_reserved_quantity integer not null default 0;
alter table public.food_order_items
  add column if not exists inventory_reserved_quantity integer not null default 0;
alter table public.food_orders
  add column if not exists inventory_status text not null default 'not_tracked';

-- Reaplica o RPC para instalações que ainda estavam usando a versão do piloto
-- que bloqueava stock_status = unavailable mesmo com data futura.
create or replace function public.food_create_admin_order_v1(payload jsonb)
returns table(order_id uuid, order_number bigint, order_total numeric)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_store_id uuid; v_order_id uuid := gen_random_uuid(); v_order_number bigint;
  v_customer_name text; v_customer_phone text; v_delivery_type text; v_source text; v_payment_method text; v_status text;
  v_received boolean := false; v_notes text; v_item jsonb; v_option jsonb; v_product public.food_products%rowtype;
  v_group record; v_option_record record; v_product_id uuid; v_group_id uuid; v_option_id uuid;
  v_quantity integer; v_option_quantity integer; v_choice_count integer; v_unit_price numeric(12,2); v_item_total numeric(12,2);
  v_subtotal numeric(12,2) := 0; v_preparation_extra integer := 0; v_order_item_id uuid;
  v_scheduled_for timestamptz; v_allow_future boolean := false; v_timezone text := 'America/Sao_Paulo';
  v_items_calculated jsonb := '[]'::jsonb; v_options_calculated jsonb;
begin
  if auth.uid() is null then raise exception 'Sessão autenticada obrigatória.' using errcode='42501'; end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then raise exception 'Pedido avulso inválido.'; end if;
  begin v_store_id := (payload->>'store_id')::uuid; exception when others then raise exception 'Loja inválida.'; end;
  if not exists (select 1 from public.food_store_users su where su.store_id=v_store_id and su.user_id=auth.uid() and su.active and su.role in ('owner','admin','manager')) then raise exception 'Acesso negado para lançar pedidos desta loja.' using errcode='42501'; end if;
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
  insert into public.food_orders(id,store_id,customer_name,customer_phone,delivery_type,desired_date,scheduled_for,notes,payment_method,review_confirmed,subtotal,total,status,payment_status,payment_received_at,payment_confirmed_by,preparation_estimate_minutes,source)
  values(v_order_id,v_store_id,v_customer_name,v_customer_phone,v_delivery_type,coalesce((v_scheduled_for at time zone v_timezone)::date,current_date),v_scheduled_for,v_notes,v_payment_method,true,v_subtotal,v_subtotal,v_status,case when v_received then 'paid' else 'pending' end,case when v_received then now() else null end,case when v_received then auth.uid() else null end,v_preparation_extra,v_source) returning food_orders.order_number into v_order_number;
  for v_item in select * from jsonb_array_elements(v_items_calculated) loop
    insert into public.food_order_items(order_id,product_id,product_name,quantity,unit_price,variant_name,variant_price_delta,addons,item_total) values(v_order_id,(v_item->>'product_id')::uuid,v_item->>'product_name',(v_item->>'quantity')::integer,(v_item->>'unit_price')::numeric,null,0,coalesce(v_item->'options','[]'::jsonb),(v_item->>'item_total')::numeric) returning id into v_order_item_id;
    for v_option in select * from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb)) loop
      insert into public.food_order_item_options(order_item_id,option_group_id,option_item_id,group_name,option_name,option_kind,price_delta,quantity) values(v_order_item_id,(v_option->>'group_id')::uuid,(v_option->>'item_id')::uuid,v_option->>'group_name',v_option->>'item_name',v_option->>'kind',(v_option->>'price_delta')::numeric,(v_option->>'quantity')::integer);
    end loop;
  end loop;
  return query select v_order_id,v_order_number,v_subtotal;
end;
$$;
revoke all on function public.food_create_admin_order_v1(jsonb) from public,anon;
grant execute on function public.food_create_admin_order_v1(jsonb) to authenticated;

-- O trigger usa o fuso da loja e o desired_date para não transformar uma
-- encomenda de amanhã em uma baixa de estoque imediata.
create or replace function public.food_reserve_inventory_on_item_insert()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_order public.food_orders%rowtype; v_product public.food_products%rowtype; v_store public.food_stores%rowtype;
  v_reserved integer; v_awaiting boolean; v_allow_future boolean := false; v_timezone text;
  v_local_scheduled_date date; v_local_today date;
begin
  select * into v_order from public.food_orders where id=new.order_id for update;
  if not found or new.product_id is null then return new; end if;
  if v_order.inventory_status='released' then return new; end if;
  select * into v_product from public.food_products where id=new.product_id for update;
  if not found or not v_product.track_stock then return new; end if;
  select * into v_store from public.food_stores where id=v_order.store_id;
  v_timezone:=coalesce(v_store.opening_hours->>'timezone','America/Sao_Paulo');
  v_local_today:=(now() at time zone v_timezone)::date;
  if v_order.scheduled_for is not null then v_local_scheduled_date:=(v_order.scheduled_for at time zone v_timezone)::date; end if;
  v_allow_future:=v_order.scheduled_for is not null
    and (v_local_scheduled_date>=v_local_today+1 or coalesce(v_order.desired_date,date '1900-01-01')>=v_local_today+1);
  if to_regprocedure('public.food_reserve_product_inventory(uuid,integer,boolean)') is null then return new; end if;
  select r.reserved_quantity,r.awaiting_restock into v_reserved,v_awaiting
    from public.food_reserve_product_inventory(new.product_id,new.quantity,v_allow_future) r;
  update public.food_order_items set inventory_reserved_quantity=coalesce(v_reserved,0) where id=new.id;
  update public.food_orders set inventory_status=case when v_awaiting then 'awaiting_restock' when coalesce(v_reserved,0)>0 then 'reserved' else inventory_status end,updated_at=now() where id=new.order_id;
  if v_order.payment_status='paid' and not v_awaiting and to_regprocedure('public.food_commit_order_inventory(uuid)') is not null then perform public.food_commit_order_inventory(new.order_id); end if;
  return new;
end;
$$;
revoke all on function public.food_reserve_inventory_on_item_insert() from public,anon,authenticated;
drop trigger if exists food_order_items_inventory_reserve_trg on public.food_order_items;
create trigger food_order_items_inventory_reserve_trg after insert on public.food_order_items for each row execute function public.food_reserve_inventory_on_item_insert();

-- Confirmar o recebimento financeiro não pode abortar uma encomenda futura
-- enquanto ainda não há saldo. O pedido continua awaiting_restock e poderá
-- ser baixado automaticamente quando o estoque for reposto.
create or replace function public.food_confirm_order_payment_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_order public.food_orders%rowtype; v_already_paid boolean;
begin
  select * into v_order from public.food_orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if not public.food_is_store_admin(v_order.store_id) and not public.food_is_platform_admin() then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if v_order.status='cancelled' then raise exception 'Não é possível confirmar o recebimento de um pedido cancelado.'; end if;
  if coalesce(v_order.total,0)<=0 then raise exception 'O pedido não possui valor válido para recebimento.'; end if;
  v_already_paid:=v_order.payment_status='paid';
  if not v_already_paid and coalesce(v_order.inventory_status,'not_tracked') <> 'awaiting_restock'
     and to_regprocedure('public.food_commit_order_inventory(uuid)') is not null then
    perform public.food_commit_order_inventory(p_order_id);
  end if;
  update public.food_orders set payment_status='paid',payment_received_at=coalesce(payment_received_at,now()),payment_confirmed_by=coalesce(payment_confirmed_by,auth.uid()) where id=p_order_id returning * into v_order;
  return jsonb_build_object('ok',true,'alreadyPaid',v_already_paid,'orderId',v_order.id,'paymentReceivedAt',v_order.payment_received_at,'amount',v_order.total,'inventoryStatus',v_order.inventory_status);
end;
$$;
revoke all on function public.food_confirm_order_payment_v1(uuid) from public;
grant execute on function public.food_confirm_order_payment_v1(uuid) to authenticated;

-- Quando a loja repõe o produto, tenta concluir automaticamente os pedidos
-- futuros já pagos que estavam aguardando reposição.
create or replace function public.food_commit_restocked_orders_on_product_update()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_order_id uuid;
begin
  if coalesce(new.stock_quantity,0) <= coalesce(old.stock_quantity,0)
     and new.stock_status = old.stock_status then return new; end if;
  for v_order_id in
    select distinct oi.order_id
      from public.food_order_items oi
      join public.food_orders o on o.id=oi.order_id
     where oi.product_id=new.id
       and o.payment_status='paid'
       and o.inventory_status='awaiting_restock'
  loop
    begin perform public.food_commit_order_inventory(v_order_id); exception when others then null; end;
  end loop;
  return new;
end;
$$;
revoke all on function public.food_commit_restocked_orders_on_product_update() from public,anon,authenticated;
drop trigger if exists food_products_restock_commit_trg on public.food_products;
create trigger food_products_restock_commit_trg
after update of stock_quantity,stock_status on public.food_products
for each row execute function public.food_commit_restocked_orders_on_product_update();

notify pgrst,'reload schema';
commit;
