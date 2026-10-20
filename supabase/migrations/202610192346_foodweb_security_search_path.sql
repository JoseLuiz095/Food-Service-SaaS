-- Corrige os dois avisos de search_path mutável do Supabase Advisor.
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.food_self_service_slug(text) set search_path = public, pg_temp;
