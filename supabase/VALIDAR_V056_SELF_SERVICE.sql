select
  to_regclass('public.food_self_service_signup_requests') is not null as requests_ok,
  to_regclass('public.food_trial_claims') is not null as trial_claims_ok,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='food_stores' and column_name='approval_status') as approval_status_ok,
  to_regprocedure('public.food_complete_self_service_signup_v1(text,text,text,text,text)') is not null as signup_rpc_ok,
  to_regprocedure('public.food_platform_list_self_service_signups_v1()') is not null as list_rpc_ok,
  to_regprocedure('public.food_platform_approve_self_service_signup_v1(uuid)') is not null as approve_rpc_ok,
  to_regprocedure('public.food_platform_reject_self_service_signup_v1(uuid,text)') is not null as reject_rpc_ok;
