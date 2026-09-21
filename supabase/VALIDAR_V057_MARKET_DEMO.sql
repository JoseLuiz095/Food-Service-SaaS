select
  (select monthly_price=49.90 from public.food_plans where code='ESSENTIAL') as essential_49_90,
  (select monthly_price=79.90 from public.food_plans where code='STARTER') as professional_79_90,
  (select monthly_price=129.90 from public.food_plans where code='PROFESSIONAL') as premium_129_90,
  (select demo_duration_days=14 from public.food_platform_settings where id=1) as demo_14_dias,
  to_regclass('public.food_self_service_signup_requests') is not null as self_service_preservado,
  to_regclass('public.food_trial_claims') is not null as elegibilidade_demo_preservada;
