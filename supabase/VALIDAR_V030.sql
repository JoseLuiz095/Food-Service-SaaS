-- FoodWeb v0.3.0 - validação rápida após migration.

select code,name,monthly_price,image_limit_per_product,reports,active
from public.food_plans
where code in ('DEMO','ESSENTIAL','STARTER','PROFESSIONAL')
order by sort_order;

select p.code,p.name,pf.feature_code,pf.enabled
from public.food_plans p
join public.food_plan_features pf on pf.plan_id=p.id
where p.code in ('DEMO','ESSENTIAL','STARTER','PROFESSIONAL')
order by p.sort_order,pf.feature_code;

select demo_duration_days,demo_warning_days,billing_provider,billing_proof_required,billing_auto_renew,billing_grace_days
from public.food_platform_settings
where id=1;

select to_regclass('public.food_subscription_payments') as subscription_payments,
       to_regclass('public.food_financial_entries') as financial_entries,
       to_regclass('public.food_financial_documents') as financial_documents;

select proname
from pg_proc
where proname in (
  'food_confirm_subscription_payment',
  'food_suspend_overdue_paid_subscriptions',
  'food_enforce_product_image_plan_limit',
  'food_enforce_custom_banner_plan',
  'food_get_store_analytics_v1'
)
order by proname;

select id,name,public,file_size_limit
from storage.buckets
where id in ('food-product-images','food-store-assets','food-finance-documents')
order by id;

-- Deve continuar existindo o namespace original do FloriWeb sem substituição.
select to_regclass('public.stores') as flori_stores,
       to_regclass('public.food_stores') as food_stores,
       to_regclass('public.orders') as flori_orders,
       to_regclass('public.food_orders') as food_orders;
