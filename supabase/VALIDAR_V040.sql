-- FoodWeb v0.4.0 - validação pós-migration.
-- Execute no SQL Editor do mesmo Supabase usado pelo FloriWeb.

select
  'food_platform_settings' as objeto,
  exists(
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='food_platform_settings'
      and column_name='billing_pix_city'
  ) as ok;

select
  'food_subscription_payments.payment_intent' as objeto,
  exists(
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='food_subscription_payments'
      and column_name='payment_intent'
  ) as ok;

select
  'food_subscription_payments.previous_plan_id' as objeto,
  exists(
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='food_subscription_payments'
      and column_name='previous_plan_id'
  ) as ok;

select
  demo_enabled,
  demo_duration_days,
  demo_warning_days,
  billing_provider,
  billing_pix_key_type,
  case when nullif(trim(coalesce(billing_pix_key,'')),'') is not null then 'CONFIGURADA' else 'PENDENTE' end as pix_key,
  billing_pix_holder_name,
  billing_pix_city,
  case when nullif(regexp_replace(coalesce(billing_whatsapp,''),'\D','','g'),'') is not null then 'CONFIGURADO' else 'PENDENTE' end as whatsapp,
  billing_proof_required,
  billing_auto_renew,
  billing_grace_days
from public.food_platform_settings
where id=1;

select
  code,
  name,
  monthly_price,
  image_limit_per_product,
  active
from public.food_plans
where code in ('DEMO','ESSENTIAL','STARTER','PROFESSIONAL')
order by sort_order;

select
  p.proname as funcao
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'food_create_manual_subscription_payment',
    'food_mark_subscription_proof_sent',
    'food_confirm_subscription_payment',
    'food_get_billing_settings_for_store',
    'food_platform_system_check',
    'food_suspend_expired_trials',
    'food_suspend_overdue_paid_subscriptions'
  )
order by p.proname;

do $$
declare
  v_jobs jsonb;
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    execute $sql$
      select coalesce(jsonb_agg(jsonb_build_object(
        'jobname',jobname,
        'schedule',schedule,
        'active',active
      ) order by jobname),'[]'::jsonb)
      from cron.job
      where jobname in (
        'foodservice-demo-expiration-hourly',
        'foodservice-paid-expiration-hourly'
      )
    $sql$ into v_jobs;
    raise notice 'Jobs FoodWeb: %',v_jobs;
  else
    raise notice 'pg_cron não está habilitado neste projeto.';
  end if;
end $$;

select
  count(*) filter(where status='proof_sent') as comprovantes_aguardando,
  count(*) filter(where status='paid') as pagamentos_confirmados,
  count(*) filter(where payment_intent='plan_change') as alteracoes_de_plano_registradas
from public.food_subscription_payments;

select
  'isolamento_floriweb' as teste,
  (to_regclass('public.stores') is not null) as floriweb_stores_existe,
  (to_regclass('public.food_stores') is not null) as food_stores_existe,
  (to_regclass('public.orders') is not null) as floriweb_orders_existe,
  (to_regclass('public.food_orders') is not null) as food_orders_existe;
