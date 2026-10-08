Attempting to perform the InitializeDefaultDrives operation on the 'FileSystem' provider failed.
-- Permite pedidos agendados de itens sem saldo, mantendo a reserva/baixa
-- condicionada ao agendamento e sem alterar a regra de início do delivery.
begin;

create or replace function public.food_create_public_order(payload jsonb)
returns table(order_id uuid,order_number bigint,order_total numeric)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
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
  v_scheduled_for timestamptz; v_allow_future boolean:=false; v_preparation_extra integer:=0; v_order_item_id uuid;
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
  if payload->>'delivery_type'='delivery' and not v_store.delivery_enabled then raise exception 'Delivery indisponível.'; end if;
  if payload->>'delivery_type'='pickup' and not v_store.pickup_enabled then raise exception 'Retirada indisponível.'; end if;

  if not public.food_store_is_accepting_orders(v_store.id,now()) then
    if not v_store.allow_scheduled_orders then raise exception 'A loja está fechada para novos pedidos.'; end if;
    begin v_scheduled_for := (payload->>'scheduled_for')::timestamptz; exception when others then raise exception 'Informe data e horário para o pedido agendado.'; end;
    if v_scheduled_for <= now() then raise exception 'O agendamento precisa ser futuro.'; end if;
    if not public.food_store_is_accepting_orders(v_store.id,v_scheduled_for) then raise exception 'O horário agendado está fora do funcionamento da loja.'; end if;
    v_allow_future := (v_scheduled_for at time zone coalesce(v_store.opening_hours->>'timezone','America/Sao_Paulo'))::date >= ((now() at time zone coalesce(v_store.opening_hours->>'timezone','America/Sao_Paulo'))::date + 1);
  elsif nullif(payload->>'scheduled_for','') is not null then
    begin v_scheduled_for := (payload->>'scheduled_for')::timestamptz; exception when others then raise exception 'Agendamento inválido.'; end;
    if v_scheduled_for <= now() or not public.food_store_is_accepting_orders(v_store.id,v_scheduled_for) then raise exception 'Horário agendado inválido.'; end if;
    v_allow_future := (v_scheduled_for at time zone coalesce(v_store.opening_hours->>'timezone','America/Sao_Paulo'))::date >= ((now() at time zone coalesce(v_store.opening_hours->>'timezone','America/Sao_Paulo'))::date + 1);
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
      where p.id=v_product_id and p.store_id=v_store.id and p.active
        and p.availability_status='available'
        and (v_allow_future or p.stock_status<>'unavailable')
        and exists(select 1 from public.food_categories c where c.id=p.category_id and c.store_id=p.store_id and c.active);
    if v_product.id is null then raise exception 'Um dos produtos não está mais disponível.'; end if;
    begin v_quantity := (v_item->>'quantity')::integer; exception when others then raise exception 'Quantidade inválida.'; end;
    if v_quantity<1 or v_quantity>99 then raise exception 'Quantidade inválida.'; end if;

    v_unit_price := coalesce(v_product.promotional_price,v_product.price); v_options_calculated := '[]'::jsonb;
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
    v_items_calculated:=v_items_calculated||jsonb_build_array(jsonb_build_object('product_id',v_product.id,'product_name',v_product.name,'quantity',v_quantity,'unit_price',round(v_unit_price,2),'options',v_options_calculated,'item_total',v_item_total));
  end loop;

  v_subtotal:=round(v_subtotal,2); if v_subtotal<v_store.minimum_order then raise exception 'Pedido abaixo do mínimo da loja.'; end if; v_total:=round(v_subtotal+v_delivery_fee,2);
  begin v_review_confirmed:=coalesce((payload->>'review_confirmed')::boolean,false); exception when others then v_review_confirmed:=false; end;
  begin v_needs_change:=coalesce((payload->>'needs_change')::boolean,false); exception when others then v_needs_change:=false; end;
  if v_payment_method<>'cash' then v_needs_change:=false; end if;
  if v_needs_change then begin v_change_for:=(payload->>'change_for')::numeric; exception when others then raise exception 'Valor para troco inválido.'; end; if v_change_for<=v_total then raise exception 'O valor para troco deve ser maior que o total.'; end if; v_change_amount:=round(v_change_for-v_total,2); end if;

  insert into public.food_orders(id,store_id,public_request_id,customer_name,customer_phone,customer_email,delivery_type,desired_date,delivery_address,delivery_zip_code,delivery_street,delivery_number,delivery_complement,delivery_neighborhood,delivery_zone_id,delivery_zone_name,delivery_fee,delivery_city,delivery_state,reference_point,notes,payment_method,review_confirmed,subtotal,total,status,needs_change,change_for,change_amount,scheduled_for,preparation_estimate_minutes,source)
  values(v_order_id,v_store.id,v_request_id,trim(payload->>'customer_name'),trim(payload->>'customer_phone'),nullif(trim(payload->>'customer_email'),''),payload->>'delivery_type',coalesce(v_scheduled_for::date,current_date),case when payload->>'delivery_type'='delivery' then nullif(trim(payload->>'delivery_address'),'') end,case when payload->>'delivery_type'='delivery' then nullif(trim(payload->>'delivery_zip_code'),'') end,case when payload->>'delivery_type'='delivery' then nullif(trim(payload->>'delivery_street'),'') end,case when payload->>'delivery_type'='delivery' then nullif(trim(payload->>'delivery_number'),'') end,case when payload->>'delivery_type'='delivery' then nullif(trim(payload->>'delivery_complement'),'') end,case when payload->>'delivery_type'='delivery' then v_zone.name end,case when payload->>'delivery_type'='delivery' then v_zone.id end,case when payload->>'delivery_type'='delivery' then v_zone.name end,v_delivery_fee,case when payload->>'delivery_type'='delivery' then v_zone.city end,case when payload->>'delivery_type'='delivery' then upper(v_zone.state) end,case when payload->>'delivery_type'='delivery' then nullif(trim(payload->>'reference_point'),'') end,nullif(trim(payload->>'notes'),''),v_payment_method,v_review_confirmed,v_subtotal,v_total,'received',v_needs_change,v_change_for,v_change_amount,v_scheduled_for,greatest(v_store.average_preparation_min,v_store.average_preparation_max)+v_preparation_extra,'site') returning food_orders.order_number into v_order_number;
  for v_item in select * from jsonb_array_elements(v_items_calculated) loop
    insert into public.food_order_items(order_id,product_id,product_name,quantity,unit_price,variant_name,variant_price_delta,addons,item_total) values(v_order_id,(v_item->>'product_id')::uuid,v_item->>'product_name',(v_item->>'quantity')::integer,(v_item->>'unit_price')::numeric,null,0,coalesce(v_item->'options','[]'::jsonb),(v_item->>'item_total')::numeric) returning id into v_order_item_id;
    for v_option in select * from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb)) loop
      insert into public.food_order_item_options(order_item_id,option_group_id,option_item_id,group_name,option_name,option_kind,price_delta,quantity) values(v_order_item_id,(v_option->>'group_id')::uuid,(v_option->>'item_id')::uuid,v_option->>'group_name',v_option->>'item_name',v_option->>'kind',(v_option->>'price_delta')::numeric,(v_option->>'quantity')::integer);
    end loop;
  end loop;
  return query select v_order_id,v_order_number,v_total;
end;
$$;
revoke all on function public.food_create_public_order(jsonb) from public,anon,authenticated;
grant execute on function public.food_create_public_order(jsonb) to service_role;

commit;



