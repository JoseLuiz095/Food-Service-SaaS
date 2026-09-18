-- FoodWeb v0.5.4 - reparo da integracao de interacoes do Admin Master
-- Idempotente. Toca somente objetos food_* relacionados a telemetria/auditoria.

begin;

DO $$
BEGIN
  IF to_regclass('public.food_stores') IS NULL THEN
    RAISE EXCEPTION 'FoodWeb: tabela public.food_stores nao encontrada.';
  END IF;

  IF to_regprocedure('public.food_is_platform_admin()') IS NULL THEN
    RAISE EXCEPTION 'FoodWeb: funcao public.food_is_platform_admin() nao encontrada.';
  END IF;

  IF to_regprocedure('public.food_is_store_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FoodWeb: funcao public.food_is_store_admin(uuid) nao encontrada.';
  END IF;
END $$;

create table if not exists public.food_platform_event_log(
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  store_id uuid references public.food_stores(id) on delete set null,
  kind text not null default 'interaction' check(kind in('interaction','audit')),
  action text not null,
  result text not null check(result in('started','success','error','warning')),
  route text not null default '',
  duration_ms integer,
  error_code text,
  error_message text,
  app_version text,
  correlation_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists food_platform_event_log_created_idx
  on public.food_platform_event_log(created_at desc);
create index if not exists food_platform_event_log_result_idx
  on public.food_platform_event_log(result,created_at desc);
create index if not exists food_platform_event_log_correlation_idx
  on public.food_platform_event_log(correlation_id)
  where correlation_id is not null;

alter table public.food_platform_event_log enable row level security;
revoke all on public.food_platform_event_log from anon,authenticated;

create or replace function public.food_log_platform_event_v1(
  p_store_id uuid,
  p_kind text,
  p_action text,
  p_result text,
  p_route text default '',
  p_duration_ms integer default null,
  p_error_code text default null,
  p_error_message text default null,
  p_app_version text default null,
  p_correlation_id text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_id uuid;
  v_store uuid:=p_store_id;
  v_kind text:=case when p_kind in('interaction','audit') then p_kind else 'interaction' end;
begin
  if auth.uid() is null then
    raise exception 'Sessao necessaria.' using errcode='42501';
  end if;

  if p_result not in('started','success','error','warning') then
    raise exception 'Resultado de evento invalido.';
  end if;

  if v_store is not null
     and not (public.food_is_store_admin(v_store) or public.food_is_platform_admin()) then
    v_store:=null;
  end if;

  if v_kind='audit' and not public.food_is_platform_admin() then
    v_kind:='interaction';
  end if;

  insert into public.food_platform_event_log(
    actor_user_id,store_id,kind,action,result,route,duration_ms,
    error_code,error_message,app_version,correlation_id
  ) values(
    auth.uid(),v_store,v_kind,left(coalesce(p_action,'unknown'),120),p_result,
    left(coalesce(p_route,''),240),
    case when p_duration_ms is null then null else greatest(0,least(p_duration_ms,3600000)) end,
    nullif(left(coalesce(p_error_code,''),120),''),
    nullif(left(coalesce(p_error_message,''),500),''),
    nullif(left(coalesce(p_app_version,''),80),''),
    nullif(left(coalesce(p_correlation_id,''),120),'')
  ) returning id into v_id;

  return v_id;
end $$;

revoke all on function public.food_log_platform_event_v1(uuid,text,text,text,text,integer,text,text,text,text) from public;
grant execute on function public.food_log_platform_event_v1(uuid,text,text,text,text,integer,text,text,text,text) to authenticated;

create or replace function public.food_platform_list_event_log_v1(
  p_limit integer default 100,
  p_result text default null,
  p_kind text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
begin
  if not public.food_is_platform_admin() then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',x.id,
      'createdAt',x.created_at,
      'kind',x.kind,
      'action',x.action,
      'result',x.result,
      'route',x.route,
      'storeId',x.store_id,
      'storeName',s.name,
      'durationMs',x.duration_ms,
      'errorCode',x.error_code,
      'errorMessage',x.error_message,
      'appVersion',x.app_version,
      'correlationId',x.correlation_id
    ) order by x.created_at desc)
    from (
      select *
      from public.food_platform_event_log e
      where (p_result is null or e.result=p_result)
        and (p_kind is null or e.kind=p_kind)
      order by e.created_at desc
      limit greatest(1,least(coalesce(p_limit,100),300))
    ) x
    left join public.food_stores s on s.id=x.store_id
  ),'[]'::jsonb);
end $$;

revoke all on function public.food_platform_list_event_log_v1(integer,text,text) from public;
grant execute on function public.food_platform_list_event_log_v1(integer,text,text) to authenticated;

notify pgrst,'reload schema';
commit;
