-- FoodWeb piloto: estoque reservado (pré-venda), baixa após confirmação de
-- pagamento/recebimento e pedidos agendados quando a loja ficará sem saldo.
-- Aplicar depois das migrations principais e do patch 20261007.
begin;

-- Compatibilidade para ambientes do piloto que ainda não aplicaram o patch
-- visual anterior. As funções públicas abaixo dependem destes campos.
alter table public.food_stores
  add column if not exists visual_theme jsonb not null default '{}'::jsonb,
  add column if not exists storefront_notice text,
  add column if not exists pickup_instructions text,
  add column if not exists hide_public_address boolean not null default false,
  add column if not exists show_whatsapp boolean not null default true;

alter table public.food_products
  add column if not exists stock_reserved_quantity integer not null default 0;
alter table public.food_order_items
  add column if not exists inventory_reserved_quantity integer not null default 0;
alter table public.food_orders
  add column if not exists inventory_status text not null default 'not_tracked';

update public.food_stores
   set visual_theme = coalesce(nullif(visual_theme, '{}'::jsonb), '{"preset":"doce_lua","primaryColor":"#542114","accentColor":"#C97952","highlightColor":"#C98A38","backgroundColor":"#FFF7EF","surfaceColor":"#FFFFFF","textColor":"#32110C","mutedColor":"#7C6259","borderColor":"#EFD9C9","radius":20}'::jsonb),
       hide_public_address = true,
       show_whatsapp = false,
       pickup_instructions = coalesce(nullif(pickup_instructions,''), 'A retirada acontece em local de trabalho combinado após a confirmação do pedido.')
 where lower(trim(name)) = 'doce lua';

alter table public.food_products drop constraint if exists food_products_stock_reserved_quantity_check;
alter table public.food_products add constraint food_products_stock_reserved_quantity_check
  check (stock_reserved_quantity >= 0);
alter table public.food_order_items drop constraint if exists food_order_items_inventory_reserved_quantity_check;
alter table public.food_order_items add constraint food_order_items_inventory_reserved_quantity_check
  check (inventory_reserved_quantity >= 0);
alter table public.food_orders drop constraint if exists food_orders_inventory_status_check;
alter table public.food_orders add constraint food_orders_inventory_status_check
  check (inventory_status in ('not_tracked','reserved','awaiting_restock','committed','released'));

update public.food_products set stock_reserved_quantity = 0 where stock_reserved_quantity is null;
update public.food_order_items set inventory_reserved_quantity = 0 where inventory_reserved_quantity is null;
update public.food_orders set inventory_status = 'not_tracked' where inventory_status is null;

create or replace function public.food_reserve_product_inventory(
  p_product_id uuid,
  p_quantity integer,
  p_allow_future boolean default false
)
returns table(reserved_quantity integer, awaiting_restock boolean)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_product public.food_products%rowtype;
  v_available integer;
  v_reserved integer;
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

  v_available := greatest(coalesce(v_product.stock_quantity, 0) - coalesce(v_product.stock_reserved_quantity, 0), 0);
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
$$;

revoke all on function public.food_reserve_product_inventory(uuid,integer,boolean) from public,anon,authenticated;

create or replace function public.food_release_order_inventory(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_order public.food_orders%rowtype;
  v_item record;
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
    update public.food_products
       set stock_reserved_quantity = greatest(coalesce(stock_reserved_quantity, 0) - v_item.inventory_reserved_quantity, 0),
           updated_at = now()
     where id = v_item.product_id;
    update public.food_order_items
       set inventory_reserved_quantity = 0
     where id = v_item.id;
  end loop;

  update public.food_orders set inventory_status = 'released', updated_at = now() where id = p_order_id;
end;
$$;

revoke all on function public.food_release_order_inventory(uuid) from public,anon,authenticated;

create or replace function public.food_commit_order_inventory(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_order public.food_orders%rowtype;
  v_item record;
  v_product public.food_products%rowtype;
begin
  select * into v_order from public.food_orders where id = p_order_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if v_order.inventory_status = 'committed' then return; end if;

  for v_item in
    select oi.id, oi.product_id, oi.quantity, oi.inventory_reserved_quantity
      from public.food_order_items oi
     where oi.order_id = p_order_id
     order by oi.created_at, oi.id
     for update
  loop
    if v_item.product_id is null then
      update public.food_order_items set inventory_reserved_quantity = 0 where id = v_item.id;
      continue;
    end if;

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

  update public.food_orders set inventory_status = 'committed', updated_at = now() where id = p_order_id;
end;
$$;

revoke all on function public.food_commit_order_inventory(uuid) from public,anon,authenticated;

create or replace function public.food_reserve_inventory_on_item_insert()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_order public.food_orders%rowtype;
  v_product public.food_products%rowtype;
  v_store public.food_stores%rowtype;
  v_reserved integer;
  v_awaiting boolean;
  v_allow_future boolean := false;
  v_timezone text;
begin
  select * into v_order from public.food_orders where id = new.order_id for update;
  if not found or new.product_id is null then return new; end if;
  -- O pedido ainda está sendo montado quando os itens são inseridos. Mesmo
  -- que o primeiro item de um lançamento avulso já tenha sido pago, os itens
  -- seguintes também precisam passar por reserva/baixa.
  if v_order.inventory_status = 'released' then return new; end if;

  select * into v_product from public.food_products where id = new.product_id for update;
  if not found or not v_product.track_stock then return new; end if;
  select * into v_store from public.food_stores where id = v_order.store_id;
  v_timezone := coalesce(v_store.opening_hours->>'timezone', 'America/Sao_Paulo');
  v_allow_future := v_order.scheduled_for is not null
    and (v_order.scheduled_for at time zone v_timezone)::date >= ((now() at time zone v_timezone)::date + 1);

  select r.reserved_quantity, r.awaiting_restock into v_reserved, v_awaiting
    from public.food_reserve_product_inventory(new.product_id, new.quantity, v_allow_future) r;

  update public.food_order_items
     set inventory_reserved_quantity = coalesce(v_reserved, 0)
   where id = new.id;
  update public.food_orders
     set inventory_status = case
       when v_awaiting then 'awaiting_restock'
       when coalesce(v_reserved, 0) > 0 then 'reserved'
       else inventory_status
     end,
     updated_at = now()
   where id = new.order_id;

  if v_order.payment_status = 'paid' then
    perform public.food_commit_order_inventory(new.order_id);
  end if;
  return new;
end;
$$;

revoke all on function public.food_reserve_inventory_on_item_insert() from public,anon,authenticated;
drop trigger if exists food_order_items_inventory_reserve_trg on public.food_order_items;
create trigger food_order_items_inventory_reserve_trg
after insert on public.food_order_items
for each row execute function public.food_reserve_inventory_on_item_insert();

create or replace function public.food_release_inventory_on_cancel()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled'
     and new.inventory_status in ('reserved','awaiting_restock') then
    perform public.food_release_order_inventory(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.food_release_inventory_on_cancel() from public,anon,authenticated;
drop trigger if exists food_orders_release_inventory_trg on public.food_orders;
create trigger food_orders_release_inventory_trg
after update of status on public.food_orders
for each row execute function public.food_release_inventory_on_cancel();

-- A vitrine mostra o produto esgotado para permitir o agendamento; a reserva
-- continua sendo validada com lock no trigger acima.
create or replace function public.food_get_public_storefront_v1(p_slug text default null, p_hostname text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_store public.food_stores%rowtype;
  v_store_id uuid;
  v_image_limit integer;
  v_custom_banner boolean := false;
begin
  if nullif(trim(coalesce(p_hostname,'')),'') is not null then
    select sd.store_id into v_store_id from public.food_store_domains sd
    where sd.active and lower(sd.domain)=lower(trim(p_hostname))
    order by sd.is_primary desc,sd.created_at asc limit 1;
  end if;
  if v_store_id is not null then
    select * into v_store from public.food_stores where id=v_store_id and archived_at is null limit 1;
  elsif nullif(trim(coalesce(p_slug,'')),'') is not null then
    select * into v_store from public.food_stores where lower(slug)=lower(trim(p_slug)) and archived_at is null limit 1;
  end if;
  if v_store.id is null then return jsonb_build_object('found',false); end if;
  if not public.food_store_accessible(v_store.id) then
    return jsonb_build_object('found',true,'status','unavailable','store',jsonb_build_object('id',v_store.id,'slug',v_store.slug,'name',v_store.name));
  end if;
  v_image_limit := public.food_current_plan_image_limit(v_store.id);
  v_custom_banner := public.food_store_has_feature(v_store.id,'custom_banner');
  return jsonb_build_object(
    'found',true,'status','online',
    'store',(case when coalesce(v_store.hide_public_address,false)
      then (to_jsonb(v_store) - 'owner_email' - 'owner_name' - 'suspension_reason' - 'address' - 'zip_code' - 'city' - 'state' - 'whatsapp' - 'show_whatsapp')
      else (to_jsonb(v_store) - 'owner_email' - 'owner_name' - 'suspension_reason' - 'whatsapp' - 'show_whatsapp') end)
      || jsonb_build_object('whatsapp',case when coalesce(v_store.show_whatsapp,true) then v_store.whatsapp else null end,
        'cover_url',case when v_custom_banner then v_store.cover_url else null end,
        'cover_storage_path',case when v_custom_banner then v_store.cover_storage_path else null end),
    'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order,c.name) from public.food_categories c where c.store_id=v_store.id and c.active),'[]'::jsonb),
    'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.featured desc,p.sort_order,p.name)
      from public.food_products p join public.food_categories c on c.id=p.category_id and c.store_id=p.store_id and c.active
      where p.store_id=v_store.id and p.active and p.availability_status='available' and p.stock_status<>'unavailable'),'[]'::jsonb),
    'product_images',coalesce((select jsonb_agg(to_jsonb(img) - 'rn' order by img.product_id,img.sort_order,img.created_at) from (
      select pi.*,row_number() over(partition by pi.product_id order by pi.is_primary desc,pi.sort_order,pi.created_at) rn
      from public.food_product_images pi join public.food_products p on p.id=pi.product_id where p.store_id=v_store.id and p.active
    ) img where v_image_limit is null or img.rn<=v_image_limit),'[]'::jsonb),
    'option_groups',coalesce((select jsonb_agg(to_jsonb(og) order by og.sort_order,og.name) from public.food_option_groups og where og.store_id=v_store.id and og.active),'[]'::jsonb),
    'option_items',coalesce((select jsonb_agg(to_jsonb(oi) order by oi.sort_order,oi.name) from public.food_option_items oi where oi.store_id=v_store.id and oi.active),'[]'::jsonb),
    'product_option_groups',coalesce((select jsonb_agg(to_jsonb(pog) order by pog.sort_order) from public.food_product_option_groups pog where pog.store_id=v_store.id),'[]'::jsonb),
    'product_variants','[]'::jsonb,'addons','[]'::jsonb,'product_addons','[]'::jsonb,
    'delivery_zones',coalesce((select jsonb_agg(to_jsonb(dz) order by dz.sort_order,dz.name) from public.food_delivery_zones dz where dz.store_id=v_store.id and dz.active),'[]'::jsonb)
  );
end $$;

revoke all on function public.food_get_public_storefront_v1(text,text) from public;
grant execute on function public.food_get_public_storefront_v1(text,text) to anon,authenticated;

-- O pedido público não bloqueia mais um item sem saldo: o trigger de reserva
-- decide se ele será reservado agora ou oferecido para o dia seguinte.
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

-- Pedidos avulsos usam o mesmo mecanismo: o item é reservado ao ser salvo;
-- se o lançamento já vier como recebido, o trigger faz a baixa imediatamente.
create or replace function public.food_create_admin_order_v1(payload jsonb)
returns table(order_id uuid, order_number bigint, order_total numeric)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_store_id uuid; v_order_id uuid := gen_random_uuid(); v_order_number bigint;
  v_customer_name text; v_customer_phone text; v_source text; v_payment_method text; v_status text;
  v_received boolean := false; v_notes text; v_item jsonb; v_option jsonb; v_product public.food_products%rowtype;
  v_group record; v_option_record record; v_product_id uuid; v_group_id uuid; v_option_id uuid;
  v_quantity integer; v_option_quantity integer; v_choice_count integer; v_unit_price numeric(12,2); v_item_total numeric(12,2);
  v_subtotal numeric(12,2) := 0; v_total numeric(12,2) := 0; v_preparation_extra integer := 0; v_order_item_id uuid;
  v_scheduled_for timestamptz; v_allow_future boolean := false; v_timezone text := 'America/Sao_Paulo';
  v_items_calculated jsonb := '[]'::jsonb; v_options_calculated jsonb;
begin
  if auth.uid() is null then raise exception 'Sessão autenticada obrigatória.' using errcode='42501'; end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then raise exception 'Pedido avulso inválido.'; end if;
  begin v_store_id := (payload->>'store_id')::uuid; exception when others then raise exception 'Loja inválida.'; end;
  if not exists (select 1 from public.food_store_users su where su.store_id=v_store_id and su.user_id=auth.uid() and su.active and su.role in ('owner','admin','manager')) then raise exception 'Acesso negado para lançar pedidos desta loja.' using errcode='42501'; end if;
  v_customer_name:=trim(coalesce(payload->>'customer_name','')); v_customer_phone:=nullif(trim(coalesce(payload->>'customer_phone','')),''); v_source:=coalesce(nullif(trim(payload->>'source'),''),'counter'); v_payment_method:=coalesce(nullif(trim(payload->>'payment_method'),''),'cash'); v_status:=coalesce(nullif(trim(payload->>'status'),''),'received'); v_notes:=nullif(left(trim(coalesce(payload->>'notes','')),500),'');
  if length(v_customer_name)<2 then raise exception 'Informe o nome do cliente.'; end if;
  if v_source not in ('counter','whatsapp','phone','ifood','other') then raise exception 'Origem do pedido inválida.'; end if;
  if v_payment_method not in ('confirm','pix','card','cash') then raise exception 'Forma de pagamento inválida.'; end if;
  if v_status not in ('received','confirmed','preparing','ready','out_for_delivery','delivered','picked_up','cancelled') then raise exception 'Status inicial inválido.'; end if;
  begin v_received:=coalesce((payload->>'received')::boolean,false); exception when others then raise exception 'Situação de recebimento inválida.'; end;
  if v_status='cancelled' and v_received then raise exception 'Um pedido cancelado não pode ser marcado como recebido.'; end if;
  if nullif(payload->>'scheduled_for','') is not null then
    begin v_scheduled_for := (payload->>'scheduled_for')::timestamptz; exception when others then raise exception 'Agendamento inválido.'; end;
    select coalesce(nullif(opening_hours->>'timezone',''),'America/Sao_Paulo') into v_timezone from public.food_stores where id=v_store_id;
    if v_scheduled_for <= now() or (v_scheduled_for at time zone v_timezone)::date < ((now() at time zone v_timezone)::date + 1) then
      raise exception 'O lançamento futuro precisa ser agendado a partir de amanhã.';
    end if;
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
  v_subtotal:=round(v_subtotal,2); v_total:=v_subtotal;
  insert into public.food_orders(id,store_id,customer_name,customer_phone,delivery_type,desired_date,scheduled_for,notes,payment_method,review_confirmed,subtotal,total,status,payment_status,payment_received_at,payment_confirmed_by,preparation_estimate_minutes,source)
  values(v_order_id,v_store_id,v_customer_name,v_customer_phone,'pickup',coalesce((v_scheduled_for at time zone v_timezone)::date,current_date),v_scheduled_for,v_notes,v_payment_method,true,v_subtotal,v_total,v_status,case when v_received then 'paid' else 'pending' end,case when v_received then now() else null end,case when v_received then auth.uid() else null end,v_preparation_extra,v_source) returning food_orders.order_number into v_order_number;
  for v_item in select * from jsonb_array_elements(v_items_calculated) loop
    insert into public.food_order_items(order_id,product_id,product_name,quantity,unit_price,variant_name,variant_price_delta,addons,item_total) values(v_order_id,(v_item->>'product_id')::uuid,v_item->>'product_name',(v_item->>'quantity')::integer,(v_item->>'unit_price')::numeric,null,0,coalesce(v_item->'options','[]'::jsonb),(v_item->>'item_total')::numeric) returning id into v_order_item_id;
    for v_option in select * from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb)) loop
      insert into public.food_order_item_options(order_item_id,option_group_id,option_item_id,group_name,option_name,option_kind,price_delta,quantity) values(v_order_item_id,(v_option->>'group_id')::uuid,(v_option->>'item_id')::uuid,v_option->>'group_name',v_option->>'item_name',v_option->>'kind',(v_option->>'price_delta')::numeric,(v_option->>'quantity')::integer);
    end loop;
  end loop;
  return query select v_order_id,v_order_number,v_total;
end;
$$;
revoke all on function public.food_create_admin_order_v1(jsonb) from public,anon;
grant execute on function public.food_create_admin_order_v1(jsonb) to authenticated;

-- A confirmação financeira é o ponto único de confirmação do pedido: só aqui
-- o saldo físico é debitado. O pagamento continua manual, como já exige o piloto.
create or replace function public.food_confirm_order_payment_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_order public.food_orders%rowtype;
  v_already_paid boolean;
begin
  select * into v_order from public.food_orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if not public.food_is_store_admin(v_order.store_id) and not public.food_is_platform_admin() then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if v_order.status='cancelled' then raise exception 'Não é possível confirmar o recebimento de um pedido cancelado.'; end if;
  if coalesce(v_order.total,0)<=0 then raise exception 'O pedido não possui valor válido para recebimento.'; end if;
  v_already_paid:=v_order.payment_status='paid';
  if not v_already_paid then perform public.food_commit_order_inventory(p_order_id); end if;
  update public.food_orders set payment_status='paid',payment_received_at=coalesce(payment_received_at,now()),payment_confirmed_by=coalesce(payment_confirmed_by,auth.uid()) where id=p_order_id returning * into v_order;
  if not v_already_paid then
    insert into public.food_platform_event_log(actor_user_id,store_id,kind,action,result,route,app_version,metadata)
    values(auth.uid(),v_order.store_id,'audit','order_payment_confirmed','success','/admin/pedidos','0.6.6',jsonb_build_object('orderId',v_order.id,'orderNumber',v_order.order_number,'amount',v_order.total,'inventoryStatus',v_order.inventory_status));
  end if;
  return jsonb_build_object('ok',true,'alreadyPaid',v_already_paid,'orderId',v_order.id,'paymentReceivedAt',v_order.payment_received_at,'amount',v_order.total,'inventoryStatus',v_order.inventory_status);
end;
$$;
revoke all on function public.food_confirm_order_payment_v1(uuid) from public;
grant execute on function public.food_confirm_order_payment_v1(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
