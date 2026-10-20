-- Rotinas públicas são chamadas exclusivamente pelas Edge Functions.
revoke all on function public.food_create_public_order(jsonb) from public, anon, authenticated;
grant execute on function public.food_create_public_order(jsonb) to service_role;
revoke all on function public.food_enforce_public_order_rate_limit(uuid) from public, anon, authenticated;
grant execute on function public.food_enforce_public_order_rate_limit(uuid) to service_role;
revoke all on function public.food_enforce_public_self_signup_rate_limit(text) from public, anon, authenticated;
grant execute on function public.food_enforce_public_self_signup_rate_limit(text) to service_role;
revoke all on function public.food_complete_self_service_signup_for_user_v1(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.food_complete_self_service_signup_for_user_v1(uuid, text, text, text, text, text, text, text) to service_role;
revoke all on function public.food_platform_seed_new_store(uuid, text, text) from public, anon, authenticated;
grant execute on function public.food_platform_seed_new_store(uuid, text, text) to service_role;
