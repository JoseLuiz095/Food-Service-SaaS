-- Nenhuma operação financeira, métrica ou ferramenta de plataforma aceita
-- chamadas do papel anônimo.
revoke all on function public.food_get_admin_support_contact_v1() from public, anon;
grant execute on function public.food_get_admin_support_contact_v1() to authenticated;
revoke all on function public.food_get_billing_settings_for_store(uuid) from public, anon;
grant execute on function public.food_get_billing_settings_for_store(uuid) to authenticated;
revoke all on function public.food_get_store_billing_overview_v1(uuid) from public, anon;
grant execute on function public.food_get_store_billing_overview_v1(uuid) to authenticated;
revoke all on function public.food_create_manual_subscription_payment(uuid, uuid) from public, anon;
grant execute on function public.food_create_manual_subscription_payment(uuid, uuid) to authenticated;
revoke all on function public.food_mark_subscription_proof_sent(uuid) from public, anon;
grant execute on function public.food_mark_subscription_proof_sent(uuid) to authenticated;
revoke all on function public.food_confirm_subscription_payment(uuid, timestamptz, text) from public, anon;
grant execute on function public.food_confirm_subscription_payment(uuid, timestamptz, text) to authenticated, service_role;
revoke all on function public.food_platform_get_billing_dashboard_v1() from public, anon;
grant execute on function public.food_platform_get_billing_dashboard_v1() to authenticated;
revoke all on function public.food_platform_list_event_log_v1(integer, text, text) from public, anon;
grant execute on function public.food_platform_list_event_log_v1(integer, text, text) to authenticated;
revoke all on function public.food_platform_reject_subscription_payment_v1(uuid, text) from public, anon;
grant execute on function public.food_platform_reject_subscription_payment_v1(uuid, text) to authenticated;
revoke all on function public.food_platform_system_check() from public, anon;
grant execute on function public.food_platform_system_check() to authenticated;
revoke all on function public.food_get_store_analytics_v1(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.food_get_store_analytics_v1(uuid, timestamptz, timestamptz) to authenticated;
revoke all on function public.food_log_platform_event_v1(uuid, text, text, text, text, integer, text, text, text, text) from public, anon;
grant execute on function public.food_log_platform_event_v1(uuid, text, text, text, text, integer, text, text, text, text) to authenticated;
