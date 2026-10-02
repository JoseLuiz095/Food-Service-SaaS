-- FoodWeb - limite próprio do auto cadastro público.
-- O limite fica separado do rate limit de e-mail do Supabase Auth.
begin;

create schema if not exists private;

create table if not exists private.food_self_signup_rate_limits (
  fingerprint text primary key,
  attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on table private.food_self_signup_rate_limits from public, anon, authenticated;

create or replace function public.food_enforce_public_self_signup_rate_limit(p_fingerprint text)
returns void
language plpgsql
security definer
set search_path=private,public,pg_temp
as $$
declare
  v_row private.food_self_signup_rate_limits%rowtype;
begin
  if nullif(trim(coalesce(p_fingerprint,'')),'') is null then
    raise exception 'SELF_SIGNUP_RATE_LIMIT_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('food-public-self-signup:' || p_fingerprint,0));
  select * into v_row from private.food_self_signup_rate_limits where fingerprint=p_fingerprint for update;

  if not found then
    insert into private.food_self_signup_rate_limits(fingerprint,attempts) values(p_fingerprint,1);
  elsif v_row.window_started_at < now() - interval '15 minutes' then
    update private.food_self_signup_rate_limits
    set attempts=1,window_started_at=now(),updated_at=now()
    where fingerprint=p_fingerprint;
  elsif v_row.attempts >= 5 then
    raise exception 'SELF_SIGNUP_RATE_LIMITED';
  else
    update private.food_self_signup_rate_limits
    set attempts=attempts+1,updated_at=now()
    where fingerprint=p_fingerprint;
  end if;
end;
$$;

revoke all on function public.food_enforce_public_self_signup_rate_limit(text) from public, anon, authenticated;
grant execute on function public.food_enforce_public_self_signup_rate_limit(text) to service_role;

-- Permite que a Edge Function registre a solicitação na mesma transação lógica
-- antes de devolver sucesso ao navegador. Só service_role pode chamar.
create or replace function public.food_complete_self_service_signup_for_user_v1(
  p_user_id uuid,
  p_store_name text default null,
  p_owner_name text default null,
  p_plan_code text default null,
  p_city text default null,
  p_state text default null,
  p_contact_phone text default null,
  p_business_document text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Acesso restrito ao cadastro seguro.' using errcode='42501';
  end if;
  if p_user_id is null then raise exception 'Usuário do cadastro não informado.'; end if;
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  return public.food_complete_self_service_signup_v2(p_store_name,p_owner_name,p_plan_code,p_city,p_state,p_contact_phone,p_business_document);
end;
$$;

revoke all on function public.food_complete_self_service_signup_for_user_v1(uuid,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.food_complete_self_service_signup_for_user_v1(uuid,text,text,text,text,text,text,text) to service_role;

commit;
