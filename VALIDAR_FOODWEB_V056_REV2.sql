select
  to_regclass('public.food_self_service_signup_requests') is not null as signup_requests,
  to_regclass('public.food_trial_claim_keys') is not null as trial_claim_keys,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='food_self_service_signup_requests' and column_name='contact_phone') as contact_phone,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='food_self_service_signup_requests' and column_name='business_document') as business_document,
  to_regprocedure('public.food_complete_self_service_signup_v2(text,text,text,text,text,text,text)') is not null as signup_v2,
  to_regprocedure('public.food_platform_list_self_service_signups_v2()') is not null as list_v2,
  to_regprocedure('public.food_platform_approve_self_service_signup_v2(uuid)') is not null as approve_v2;
