-- Food Service SaaS v0.2 - validacao SOMENTE LEITURA
-- Execute depois da migration no mesmo projeto Supabase do FloriWeb.

select 'flori_stores' as objeto, count(*)::bigint as quantidade from public.stores
union all
select 'food_stores', count(*)::bigint from public.food_stores
union all
select 'flori_products', count(*)::bigint from public.products
union all
select 'food_products', count(*)::bigint from public.food_products
union all
select 'flori_orders', count(*)::bigint from public.orders
union all
select 'food_orders', count(*)::bigint from public.food_orders;

select
  to_regclass('public.food_platform_admins') as food_platform_admins,
  to_regclass('public.food_stores') as food_stores,
  to_regclass('public.food_store_users') as food_store_users,
  to_regclass('public.food_products') as food_products,
  to_regclass('public.food_orders') as food_orders,
  to_regprocedure('public.food_create_public_order(jsonb)') as food_checkout_rpc,
  to_regprocedure('public.food_get_public_storefront_v1(text,text)') as food_storefront_rpc;

select id, name, public
from storage.buckets
where id in ('food-product-images','food-store-assets')
order by id;

select user_id, name, active
from public.food_platform_admins
order by created_at;
