-- Versão alinhada com o registro da aplicação no Supabase.
-- Auxiliares não fazem parte da API do navegador. Os wrappers SECURITY DEFINER
-- e triggers continuam executando com o proprietário, preservando a operação.
begin;
revoke execute on function public.food_seed_financial_categories(uuid) from public, anon, authenticated;
revoke execute on function public.food_get_public_storefront_v1_base(text, text) from public, anon, authenticated;
grant execute on function public.food_seed_financial_categories(uuid) to service_role;
grant execute on function public.food_get_public_storefront_v1_base(text, text) to service_role;
notify pgrst, 'reload schema';
commit;
