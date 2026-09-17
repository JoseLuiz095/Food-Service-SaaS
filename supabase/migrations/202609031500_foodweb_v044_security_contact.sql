-- FoodWeb v0.4.4 - seguranca de contato publico e suporte interno
-- 1) Remove telefones comercial/suporte da RPC publica da landing.
-- 2) Libera suporte da plataforma somente para usuario autenticado owner/admin ou Admin Master.
-- 3) O contato comercial publico passa pela Edge Function food-public-contact + Turnstile.
-- Somente namespace FoodWeb.
begin;

create or replace function public.food_get_public_landing_v1()
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select jsonb_build_object(
    'demo_store_slug', coalesce(
      (select s.slug
       from public.food_stores s
       where s.archived_at is null
         and s.active
         and s.access_status='online'
         and public.food_store_accessible(s.id)
       order by (s.slug='central-food-demo') desc,s.created_at asc
       limit 1),
      'central-food-demo'
    ),
    'demo_enabled', coalesce((select ps.demo_enabled from public.food_platform_settings ps where ps.id=1),true),
    'demo_duration_days', coalesce((select ps.demo_duration_days from public.food_platform_settings ps where ps.id=1),30),
    'contact_protected', true,
    'stores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,
        'slug',s.slug,
        'name',s.name,
        'description',s.description,
        'logo_url',s.logo_url,
        'cover_url',case when public.food_store_has_feature(s.id,'custom_banner') then s.cover_url else null end,
        'city',s.city,
        'state',s.state,
        'delivery_enabled',s.delivery_enabled,
        'pickup_enabled',s.pickup_enabled,
        'minimum_order',s.minimum_order,
        'average_preparation_min',s.average_preparation_min,
        'average_preparation_max',s.average_preparation_max
      ) order by s.created_at desc)
      from public.food_stores s
      where s.archived_at is null
        and s.active
        and s.access_status='online'
        and public.food_store_accessible(s.id)
    ),'[]'::jsonb),
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,
        'code',p.code,
        'name',p.name,
        'monthly_price',p.monthly_price,
        'feature_codes',coalesce((
          select jsonb_agg(pf.feature_code order by pf.feature_code)
          from public.food_plan_features pf
          where pf.plan_id=p.id and pf.enabled
        ),'[]'::jsonb)
      ) order by p.sort_order,p.monthly_price,p.name)
      from public.food_plans p
      where p.active and p.code<>'DEMO'
    ),'[]'::jsonb)
  );
$$;

revoke all on function public.food_get_public_landing_v1() from public;
grant execute on function public.food_get_public_landing_v1() to anon,authenticated;

create or replace function public.food_get_admin_support_contact_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_phone text := '';
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  if not exists (
      select 1 from public.food_platform_admins pa
      where pa.user_id=v_uid and pa.active
    )
    and not exists (
      select 1 from public.food_store_users su
      where su.user_id=v_uid
        and su.active
        and su.role in ('owner','admin')
    ) then
    raise exception 'SUPPORT_FOR_ADMINS_ONLY' using errcode='42501';
  end if;

  select regexp_replace(coalesce(nullif(ps.support_whatsapp,''),nullif(ps.billing_whatsapp,''),''),'[^0-9]','','g')
    into v_phone
  from public.food_platform_settings ps
  where ps.id=1;

  return jsonb_build_object('support_whatsapp',coalesce(v_phone,''));
end;
$$;

revoke all on function public.food_get_admin_support_contact_v1() from public,anon;
grant execute on function public.food_get_admin_support_contact_v1() to authenticated;


create table if not exists public.food_public_contact_rate_limits (
  fingerprint_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_attempt_at timestamptz not null default now()
);
alter table public.food_public_contact_rate_limits enable row level security;
revoke all on public.food_public_contact_rate_limits from public,anon,authenticated;

create or replace function public.food_enforce_public_contact_rate_limit(p_fingerprint text)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_row public.food_public_contact_rate_limits%rowtype;
begin
  if coalesce(length(p_fingerprint),0)<32 then
    raise exception 'INVALID_CONTACT_FINGERPRINT' using errcode='22023';
  end if;
  delete from public.food_public_contact_rate_limits where last_attempt_at < now()-interval '24 hours';
  select * into v_row from public.food_public_contact_rate_limits where fingerprint_hash=p_fingerprint for update;
  if not found then
    insert into public.food_public_contact_rate_limits(fingerprint_hash,attempts) values(p_fingerprint,1);
    return;
  end if;
  if v_row.window_started_at < now()-interval '10 minutes' then
    update public.food_public_contact_rate_limits set window_started_at=now(),attempts=1,last_attempt_at=now() where fingerprint_hash=p_fingerprint;
    return;
  end if;
  if v_row.attempts>=5 then
    raise exception 'TOO_MANY_CONTACT_ATTEMPTS' using errcode='P0001';
  end if;
  update public.food_public_contact_rate_limits set attempts=attempts+1,last_attempt_at=now() where fingerprint_hash=p_fingerprint;
end;
$$;
revoke all on function public.food_enforce_public_contact_rate_limit(text) from public,anon,authenticated;
grant execute on function public.food_enforce_public_contact_rate_limit(text) to service_role;

notify pgrst,'reload schema';
commit;
