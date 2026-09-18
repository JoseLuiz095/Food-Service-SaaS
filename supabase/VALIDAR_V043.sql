-- FoodWeb v0.4.3 - validação pós-migration
select
  demo_enabled,
  demo_duration_days,
  marketing_whatsapp,
  support_whatsapp,
  billing_whatsapp
from public.food_platform_settings
where id=1;

select public.food_get_public_landing_v1();

select
  to_regprocedure('public.food_get_public_landing_v1()') is not null as landing_rpc_ok,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='food_platform_settings' and column_name='marketing_whatsapp') as marketing_whatsapp_ok,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='food_platform_settings' and column_name='support_whatsapp') as support_whatsapp_ok;
