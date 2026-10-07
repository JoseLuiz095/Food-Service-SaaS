-- FoodWeb piloto: identidade visual e comunicação pública por loja.
-- Execute após revisar o diff, no mesmo banco que contém public.food_stores.
begin;

alter table public.food_stores
  add column if not exists visual_theme jsonb not null default '{
    "preset":"foodweb",
    "primaryColor":"#17633D",
    "accentColor":"#A94726",
    "highlightColor":"#CC8618",
    "backgroundColor":"#FAF9F6",
    "surfaceColor":"#FFFFFF",
    "textColor":"#18231D",
    "mutedColor":"#6F746F",
    "borderColor":"#E8E3DC",
    "radius":18
  }'::jsonb,
  add column if not exists storefront_notice text,
  add column if not exists pickup_instructions text,
  add column if not exists hide_public_address boolean not null default false,
  add column if not exists show_whatsapp boolean not null default true;

-- Garante que o PostgREST reconheça as colunas mesmo quando o patch é aplicado
-- em um projeto que já estava em execução.
notify pgrst, 'reload schema';

update public.food_stores
set visual_theme = '{
  "preset":"foodweb",
  "primaryColor":"#17633D",
  "accentColor":"#A94726",
  "highlightColor":"#CC8618",
  "backgroundColor":"#FAF9F6",
  "surfaceColor":"#FFFFFF",
  "textColor":"#18231D",
  "mutedColor":"#6F746F",
  "borderColor":"#E8E3DC",
  "radius":18
}'::jsonb
where visual_theme is null;

-- Configuração inicial da loja piloto, quando ela já existir no ambiente.
-- O filtro por nome evita alterar outras lojas do mesmo banco compartilhado.
update public.food_stores
set visual_theme = '{
    "preset":"doce_lua",
    "primaryColor":"#542114",
    "accentColor":"#C97952",
    "highlightColor":"#C98A38",
    "backgroundColor":"#FFF7EF",
    "surfaceColor":"#FFFFFF",
    "textColor":"#32110C",
    "mutedColor":"#7C6259",
    "borderColor":"#EFD9C9",
    "radius":20
  }'::jsonb,
  logo_url = '/assets/doce-lua/logo.jpg',
  cover_url = '/assets/doce-lua/hero.jpeg',
  storefront_notice = coalesce(nullif(storefront_notice,''), 'Encomendas preparadas a partir das 18h. Confirme o horário com a loja.'),
  pickup_instructions = coalesce(nullif(pickup_instructions,''), 'A retirada acontece em local de trabalho combinado após a confirmação do pedido.'),
  hide_public_address = true,
  show_whatsapp = false
where lower(trim(name)) = 'doce lua';

comment on column public.food_stores.visual_theme is 'Tokens visuais da vitrine pública, isolados por loja.';
comment on column public.food_stores.storefront_notice is 'Aviso operacional opcional visível antes do pedido.';
comment on column public.food_stores.pickup_instructions is 'Orientação pública opcional para retirada.';
comment on column public.food_stores.hide_public_address is 'Quando true, não revela o endereço no checkout público.';
comment on column public.food_stores.show_whatsapp is 'Controla se o WhatsApp da loja aparece na vitrine pública.';

commit;

-- Storage: o upload usa upsert=true e precisa de SELECT além de INSERT/UPDATE.
-- Sem esta política o Supabase retorna "new row violates row-level security policy"
-- mesmo quando a sessão está autenticada e a pasta pertence à loja.
begin;

drop policy if exists food_product_images_storage_select on storage.objects;
create policy food_product_images_storage_select on storage.objects for select to authenticated
using (bucket_id='food-product-images' and public.food_is_store_admin((storage.foldername(name))[2]::uuid));

drop policy if exists food_store_assets_storage_select on storage.objects;
create policy food_store_assets_storage_select on storage.objects for select to authenticated
using (bucket_id='food-store-assets' and public.food_is_store_admin((storage.foldername(name))[2]::uuid));

commit;

-- Privacidade da vitrine: quando a loja trabalha por encomenda, o endereco
-- interno nunca deve sair na resposta publica, mesmo que a UI oculte o campo.
begin;

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
  v_custom_banner boolean:=false;
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

  v_image_limit:=public.food_current_plan_image_limit(v_store.id);
  v_custom_banner:=public.food_store_has_feature(v_store.id,'custom_banner');

  return jsonb_build_object(
    'found',true,'status','online',
    'store',(case when coalesce(v_store.hide_public_address,false)
       then (to_jsonb(v_store) - 'owner_email' - 'owner_name' - 'suspension_reason' - 'address' - 'zip_code' - 'city' - 'state' - 'whatsapp' - 'show_whatsapp')
       else (to_jsonb(v_store) - 'owner_email' - 'owner_name' - 'suspension_reason' - 'whatsapp' - 'show_whatsapp')
    end) || jsonb_build_object(
       'whatsapp',case when coalesce(v_store.show_whatsapp,true) then v_store.whatsapp else null end,
      'cover_url',case when v_custom_banner then v_store.cover_url else null end,
      'cover_storage_path',case when v_custom_banner then v_store.cover_storage_path else null end
    ),
    'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order,c.name) from public.food_categories c where c.store_id=v_store.id and c.active),'[]'::jsonb),
    'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.featured desc,p.sort_order,p.name)
      from public.food_products p join public.food_categories c on c.id=p.category_id and c.store_id=p.store_id and c.active
      where p.store_id=v_store.id and p.active and p.availability_status='available' and p.stock_status<>'unavailable' and (not p.track_stock or coalesce(p.stock_quantity,0)>0)),'[]'::jsonb),
    'product_images',coalesce((
      select jsonb_agg(to_jsonb(img) - 'rn' order by img.product_id,img.sort_order,img.created_at)
      from (
        select pi.*,row_number() over(partition by pi.product_id order by pi.is_primary desc,pi.sort_order,pi.created_at) rn
        from public.food_product_images pi
        join public.food_products p on p.id=pi.product_id
        where p.store_id=v_store.id and p.active
      ) img
      where v_image_limit is null or img.rn<=v_image_limit
    ),'[]'::jsonb),
    'option_groups',coalesce((select jsonb_agg(to_jsonb(og) order by og.sort_order,og.name) from public.food_option_groups og where og.store_id=v_store.id and og.active),'[]'::jsonb),
    'option_items',coalesce((select jsonb_agg(to_jsonb(oi) order by oi.sort_order,oi.name) from public.food_option_items oi where oi.store_id=v_store.id and oi.active),'[]'::jsonb),
    'product_option_groups',coalesce((select jsonb_agg(to_jsonb(pog) order by pog.sort_order) from public.food_product_option_groups pog where pog.store_id=v_store.id),'[]'::jsonb),
    'product_variants','[]'::jsonb,'addons','[]'::jsonb,'product_addons','[]'::jsonb,
    'delivery_zones',coalesce((select jsonb_agg(to_jsonb(dz) order by dz.sort_order,dz.name) from public.food_delivery_zones dz where dz.store_id=v_store.id and dz.active),'[]'::jsonb)
  );
end $$;

revoke all on function public.food_get_public_storefront_v1(text,text) from public;
grant execute on function public.food_get_public_storefront_v1(text,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;

-- Pedido avulso: fluxo exclusivo do painel administrativo da própria loja.
-- O navegador envia apenas IDs e escolhas; preços e regras são recalculados aqui.
begin;

create or replace function public.food_create_admin_order_v1(payload jsonb)
returns table(order_id uuid, order_number bigint, order_total numeric)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_store_id uuid;
  v_order_id uuid := gen_random_uuid();
  v_order_number bigint;
  v_customer_name text;
  v_customer_phone text;
  v_source text;
  v_payment_method text;
  v_status text;
  v_received boolean := false;
  v_notes text;
  v_item jsonb;
  v_option jsonb;
  v_product public.food_products%rowtype;
  v_group record;
  v_option_record record;
  v_product_id uuid;
  v_group_id uuid;
  v_option_id uuid;
  v_quantity integer;
  v_option_quantity integer;
  v_choice_count integer;
  v_unit_price numeric(12,2);
  v_item_total numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_preparation_extra integer := 0;
  v_order_item_id uuid;
  v_items_calculated jsonb := '[]'::jsonb;
  v_options_calculated jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sessão autenticada obrigatória.' using errcode='42501';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Pedido avulso inválido.';
  end if;

  begin
    v_store_id := (payload->>'store_id')::uuid;
  exception when others then
    raise exception 'Loja inválida.';
  end;

  -- Não usamos food_is_store_admin porque esta operação não deve aceitar um
  -- Admin Master sem vínculo com a loja informada no payload.
  if not exists (
    select 1
      from public.food_store_users su
     where su.store_id = v_store_id
       and su.user_id = auth.uid()
       and su.active = true
       and su.role in ('owner','admin','manager')
  ) then
    raise exception 'Acesso negado para lançar pedidos desta loja.' using errcode='42501';
  end if;

  v_customer_name := trim(coalesce(payload->>'customer_name', ''));
  v_customer_phone := nullif(trim(coalesce(payload->>'customer_phone', '')), '');
  v_source := coalesce(nullif(trim(payload->>'source'), ''), 'counter');
  v_payment_method := coalesce(nullif(trim(payload->>'payment_method'), ''), 'cash');
  v_status := coalesce(nullif(trim(payload->>'status'), ''), 'received');
  v_notes := nullif(left(trim(coalesce(payload->>'notes', '')), 500), '');

  if length(v_customer_name) < 2 then
    raise exception 'Informe o nome do cliente.';
  end if;
  if v_source not in ('counter','whatsapp','phone','ifood','other') then
    raise exception 'Origem do pedido inválida.';
  end if;
  if v_payment_method not in ('confirm','pix','card','cash') then
    raise exception 'Forma de pagamento inválida.';
  end if;
  if v_status not in ('received','confirmed','preparing','ready','out_for_delivery','delivered','picked_up','cancelled') then
    raise exception 'Status inicial inválido.';
  end if;
  begin
    v_received := coalesce((payload->>'received')::boolean, false);
  exception when others then
    raise exception 'Situação de recebimento inválida.';
  end;
  if v_status = 'cancelled' and v_received then
    raise exception 'Um pedido cancelado não pode ser marcado como recebido.';
  end if;
  if jsonb_typeof(payload->'items') <> 'array' or jsonb_array_length(payload->'items') = 0 then
    raise exception 'Selecione ao menos um produto.';
  end if;
  if jsonb_array_length(payload->'items') > 50 then
    raise exception 'O pedido excede o limite de itens.';
  end if;

  for v_item in select * from jsonb_array_elements(payload->'items') loop
    begin
      v_product_id := (v_item->>'product_id')::uuid;
      v_quantity := (v_item->>'quantity')::integer;
    exception when others then
      raise exception 'Produto ou quantidade inválidos.';
    end;
    if v_quantity < 1 or v_quantity > 99 then
      raise exception 'Quantidade inválida.';
    end if;

    select * into v_product
      from public.food_products p
     where p.id = v_product_id
       and p.store_id = v_store_id
       and p.active
       and p.availability_status = 'available'
       and p.stock_status <> 'unavailable'
       and (not p.track_stock or coalesce(p.stock_quantity, 0) > 0)
       and exists (
         select 1 from public.food_categories c
          where c.id = p.category_id and c.store_id = p.store_id and c.active
       );
    if v_product.id is null then
      raise exception 'Um dos produtos não está disponível.';
    end if;
    if v_product.track_stock and v_quantity > coalesce(v_product.stock_quantity, 0) then
      raise exception 'Estoque insuficiente para %.', v_product.name;
    end if;

    v_unit_price := coalesce(v_product.promotional_price, v_product.price);
    v_options_calculated := '[]'::jsonb;

    for v_group in
      select og.*
        from public.food_option_groups og
        join public.food_product_option_groups pog
          on pog.option_group_id = og.id and pog.store_id = og.store_id
       where pog.product_id = v_product.id
         and pog.store_id = v_store_id
         and og.active
       order by pog.sort_order, og.sort_order
    loop
      select count(distinct entry->>'item_id')::integer into v_choice_count
        from jsonb_array_elements(coalesce(v_item->'options', '[]'::jsonb)) entry
       where entry->>'group_id' = v_group.id::text;
      if v_choice_count < v_group.min_choices then
        raise exception 'Faltam escolhas obrigatórias em %.', v_group.name;
      end if;
      if v_choice_count > v_group.max_choices then
        raise exception 'Quantidade de escolhas excedida em %.', v_group.name;
      end if;
    end loop;

    for v_option in select * from jsonb_array_elements(coalesce(v_item->'options', '[]'::jsonb)) loop
      begin
        v_group_id := (v_option->>'group_id')::uuid;
        v_option_id := (v_option->>'item_id')::uuid;
        v_option_quantity := coalesce((v_option->>'quantity')::integer, 1);
      exception when others then
        raise exception 'Opção inválida.';
      end;
      if v_option_quantity < 1 or v_option_quantity > 20 then
        raise exception 'Quantidade da opção inválida.';
      end if;

      select og.id as group_id, og.name as group_name, og.kind,
             oi.id as item_id, oi.name as item_name, oi.price_delta
        into v_option_record
        from public.food_option_groups og
        join public.food_product_option_groups pog
          on pog.option_group_id = og.id and pog.store_id = og.store_id
        join public.food_option_items oi
          on oi.group_id = og.id and oi.store_id = og.store_id
       where pog.product_id = v_product.id
         and pog.store_id = v_store_id
         and og.id = v_group_id
         and oi.id = v_option_id
         and og.active
         and oi.active;
      if not found then
        raise exception 'Uma das opções não está disponível.';
      end if;
      if v_option_record.kind <> 'addon' and v_option_quantity <> 1 then
        raise exception 'Quantidade inválida para a opção.';
      end if;
      if v_option_record.kind = 'removal' and v_option_record.price_delta <> 0 then
        raise exception 'Remoção com preço inválido.';
      end if;
      if exists (
        select 1 from jsonb_array_elements(v_options_calculated) selected
         where selected->>'item_id' = v_option_record.item_id::text
      ) then
        raise exception 'Opção duplicada.';
      end if;

      v_unit_price := v_unit_price + v_option_record.price_delta * v_option_quantity;
      v_options_calculated := v_options_calculated || jsonb_build_array(jsonb_build_object(
        'group_id', v_option_record.group_id,
        'group_name', v_option_record.group_name,
        'kind', v_option_record.kind,
        'item_id', v_option_record.item_id,
        'item_name', v_option_record.item_name,
        'price_delta', v_option_record.price_delta,
        'quantity', v_option_quantity
      ));
    end loop;

    if v_unit_price < 0 then
      raise exception 'Preço final inválido.';
    end if;
    v_item_total := round(v_unit_price * v_quantity, 2);
    v_subtotal := v_subtotal + v_item_total;
    v_preparation_extra := greatest(v_preparation_extra, coalesce(v_product.preparation_time_minutes, 0));
    v_items_calculated := v_items_calculated || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'product_name', v_product.name,
      'quantity', v_quantity,
      'unit_price', round(v_unit_price, 2),
      'options', v_options_calculated,
      'item_total', v_item_total
    ));
  end loop;

  v_subtotal := round(v_subtotal, 2);
  v_total := v_subtotal;

  insert into public.food_orders(
    id, store_id, customer_name, customer_phone, delivery_type, desired_date,
    notes, payment_method, review_confirmed, subtotal, total, status,
    payment_status, payment_received_at, payment_confirmed_by,
    preparation_estimate_minutes, source
  ) values (
    v_order_id, v_store_id, v_customer_name, v_customer_phone, 'pickup', current_date,
    v_notes, v_payment_method, true, v_subtotal, v_total, v_status,
    case when v_received then 'paid' else 'pending' end,
    case when v_received then now() else null end,
    case when v_received then auth.uid() else null end,
    v_preparation_extra, v_source
  ) returning food_orders.order_number into v_order_number;

  for v_item in select * from jsonb_array_elements(v_items_calculated) loop
    insert into public.food_order_items(
      order_id, product_id, product_name, quantity, unit_price,
      variant_name, variant_price_delta, addons, item_total
    ) values (
      v_order_id,
      (v_item->>'product_id')::uuid,
      v_item->>'product_name',
      (v_item->>'quantity')::integer,
      (v_item->>'unit_price')::numeric,
      null, 0, coalesce(v_item->'options', '[]'::jsonb), (v_item->>'item_total')::numeric
    ) returning id into v_order_item_id;

    for v_option in select * from jsonb_array_elements(coalesce(v_item->'options', '[]'::jsonb)) loop
      insert into public.food_order_item_options(
        order_item_id, option_group_id, option_item_id, group_name, option_name,
        option_kind, price_delta, quantity
      ) values (
        v_order_item_id,
        (v_option->>'group_id')::uuid,
        (v_option->>'item_id')::uuid,
        v_option->>'group_name',
        v_option->>'item_name',
        v_option->>'kind',
        (v_option->>'price_delta')::numeric,
        (v_option->>'quantity')::integer
      );
    end loop;
  end loop;

  return query select v_order_id, v_order_number, v_total;
end;
$$;

revoke all on function public.food_create_admin_order_v1(jsonb) from public, anon;
grant execute on function public.food_create_admin_order_v1(jsonb) to authenticated;
notify pgrst,'reload schema';

commit;
