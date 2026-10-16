-- FoodWeb: endurece a projeção da vitrine pública.
--
-- A função pública anterior serializava linhas inteiras com to_jsonb(...), o
-- que incluía preferências administrativas, dados de cobrança, caminhos de
-- Storage e metadados de estoque. A vitrine precisa apenas do contrato de
-- catálogo/checkout; este RPC mantém esse contrato por whitelist explícita.
begin;

-- Compatibilidade para ambientes que ainda não aplicaram os patches visuais
-- do piloto. A criação do RPC abaixo precisa ocorrer somente depois que as
-- colunas referenciadas existirem no catálogo do Postgres.
alter table public.food_stores
  add column if not exists visual_theme jsonb not null default '{}'::jsonb,
  add column if not exists storefront_notice text,
  add column if not exists pickup_instructions text,
  add column if not exists hide_public_address boolean not null default false,
  add column if not exists show_whatsapp boolean not null default true;

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
  v_hide_address boolean := false;
  v_show_whatsapp boolean := true;
begin
  if nullif(trim(coalesce(p_hostname,'')),'') is not null then
    select sd.store_id into v_store_id
      from public.food_store_domains sd
     where sd.active and lower(sd.domain)=lower(trim(p_hostname))
     order by sd.is_primary desc,sd.created_at asc
     limit 1;
  end if;

  if v_store_id is not null then
    select * into v_store from public.food_stores
     where id=v_store_id and archived_at is null limit 1;
  elsif nullif(trim(coalesce(p_slug,'')),'') is not null then
    select * into v_store from public.food_stores
     where lower(slug)=lower(trim(p_slug)) and archived_at is null limit 1;
  end if;

  if v_store.id is null then
    return jsonb_build_object('found',false);
  end if;
  if not public.food_store_accessible(v_store.id) then
    return jsonb_build_object(
      'found',true,
      'status','unavailable',
      'store',jsonb_build_object('id',v_store.id,'slug',v_store.slug,'name',v_store.name)
    );
  end if;

  v_image_limit := public.food_current_plan_image_limit(v_store.id);
  v_custom_banner := public.food_store_has_feature(v_store.id,'custom_banner');
  v_hide_address := coalesce(v_store.hide_public_address,false);
  v_show_whatsapp := coalesce(v_store.show_whatsapp,true);

  return jsonb_build_object(
    'found',true,
    'status','online',
    'store',jsonb_build_object(
      'id',v_store.id,
      'slug',v_store.slug,
      'name',v_store.name,
      'description',v_store.description,
      'logo_url',v_store.logo_url,
      'cover_url',case when v_custom_banner then v_store.cover_url else null end,
      'whatsapp',case when v_show_whatsapp then v_store.whatsapp else null end,
      'instagram',v_store.instagram,
      'address',case when v_hide_address then null else v_store.address end,
      'city',case when v_hide_address then null else v_store.city end,
      'state',case when v_hide_address then null else v_store.state end,
      'zip_code',case when v_hide_address then null else v_store.zip_code end,
      'delivery_enabled',v_store.delivery_enabled,
      'pickup_enabled',v_store.pickup_enabled,
      'show_whatsapp',v_show_whatsapp,
      'pix_enabled',v_store.pix_enabled,
      'pix_receipt_mode',v_store.pix_receipt_mode,
      'pix_key_type',v_store.pix_key_type,
      'pix_key',v_store.pix_key,
      'pix_copy_paste',v_store.pix_copy_paste,
      'pix_holder_name',v_store.pix_holder_name,
      'show_pix_before_confirmation',v_store.show_pix_before_confirmation,
      'confirmation_payment_enabled',v_store.confirmation_payment_enabled,
      'card_payment_enabled',v_store.card_payment_enabled,
      'cash_payment_enabled',v_store.cash_payment_enabled,
      'payment_method_order',v_store.payment_method_order,
      'minimum_order',v_store.minimum_order,
      'opening_hours',v_store.opening_hours,
      'active',v_store.active,
      'access_status',v_store.access_status,
      'average_preparation_min',v_store.average_preparation_min,
      'average_preparation_max',v_store.average_preparation_max,
      'allow_scheduled_orders',v_store.allow_scheduled_orders,
      'visual_theme',v_store.visual_theme,
      'storefront_notice',v_store.storefront_notice,
      'pickup_instructions',v_store.pickup_instructions,
      'hide_public_address',v_hide_address
    ),
    'categories',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'store_id',c.store_id,'name',c.name,'slug',c.slug,
        'description',c.description,'active',c.active,'sort_order',c.sort_order
      ) order by c.sort_order,c.name)
      from public.food_categories c
      where c.store_id=v_store.id and c.active
    ),'[]'::jsonb),
    'products',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,'store_id',p.store_id,'category_id',p.category_id,
        'name',p.name,'slug',p.slug,'description',p.description,
        'price',p.price,'promotional_price',p.promotional_price,
        'active',p.active,'featured',p.featured,'made_to_order',p.made_to_order,
        'production_days',p.production_days,'stock_status',p.stock_status,
        'visual_emoji',p.visual_emoji,'availability_status',p.availability_status,
        'track_stock',p.track_stock,'stock_quantity',p.stock_quantity,
        'stock_reserved_quantity',p.stock_reserved_quantity,
        'preparation_time_minutes',p.preparation_time_minutes,'sort_order',p.sort_order
      ) order by p.featured desc,p.sort_order,p.name)
      from public.food_products p
      join public.food_categories c
        on c.id=p.category_id and c.store_id=p.store_id and c.active
      where p.store_id=v_store.id and p.active
        and p.availability_status='available'
        and p.stock_status<>'unavailable'
    ),'[]'::jsonb),
    'product_images',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',img.id,'product_id',img.product_id,'url',img.url,
        'alt_text',img.alt_text,'sort_order',img.sort_order,'is_primary',img.is_primary
      ) order by img.product_id,img.sort_order,img.created_at)
      from (
        select pi.*,row_number() over(
          partition by pi.product_id
          order by pi.is_primary desc,pi.sort_order,pi.created_at
        ) rn
        from public.food_product_images pi
        join public.food_products p on p.id=pi.product_id
        where p.store_id=v_store.id and p.active
      ) img
      where v_image_limit is null or img.rn<=v_image_limit
    ),'[]'::jsonb),
    'option_groups',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',og.id,'store_id',og.store_id,'name',og.name,
        'description',og.description,'kind',og.kind,'min_choices',og.min_choices,
        'max_choices',og.max_choices,'active',og.active,'sort_order',og.sort_order
      ) order by og.sort_order,og.name)
      from public.food_option_groups og
      where og.store_id=v_store.id and og.active
    ),'[]'::jsonb),
    'option_items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',oi.id,'group_id',oi.group_id,'store_id',oi.store_id,
        'name',oi.name,'description',oi.description,'price_delta',oi.price_delta,
        'active',oi.active,'sort_order',oi.sort_order
      ) order by oi.sort_order,oi.name)
      from public.food_option_items oi
      where oi.store_id=v_store.id and oi.active
    ),'[]'::jsonb),
    'product_option_groups',coalesce((
      select jsonb_agg(jsonb_build_object(
        'store_id',pog.store_id,'product_id',pog.product_id,
        'option_group_id',pog.option_group_id,'sort_order',pog.sort_order
      ) order by pog.sort_order)
      from public.food_product_option_groups pog
      where pog.store_id=v_store.id
    ),'[]'::jsonb),
    'product_variants','[]'::jsonb,
    'addons','[]'::jsonb,
    'product_addons','[]'::jsonb,
    'delivery_zones',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',dz.id,'store_id',dz.store_id,'name',dz.name,'aliases',dz.aliases,
        'city',dz.city,'state',dz.state,'fee',dz.fee,'active',dz.active,
        'sort_order',dz.sort_order
      ) order by dz.sort_order,dz.name)
      from public.food_delivery_zones dz
      where dz.store_id=v_store.id and dz.active
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.food_get_public_storefront_v1(text,text) from public;
grant execute on function public.food_get_public_storefront_v1(text,text) to anon,authenticated;

notify pgrst, 'reload schema';

commit;
