-- shared_future: métricas agregadas isoladas, somente leitura de food_*.
-- Não aplicar a migration ampla de fichas/consumo para instalar esta RPC.
-- Baseline remoto de 28/10: assinatura ausente; colunas e helpers revisados.
begin;
do $baseline$
begin
  if exists (select 1 from pg_proc where oid=to_regprocedure('public.food_dashboard_metrics_v1(uuid)')
    and md5(regexp_replace(prosrc, '\s+', '', 'g')) not in ('4b103960045d44acd56dcce31c5eff0c','adebfe037473dda2d9d27fa2259d7c51')) then
    raise exception 'A função de indicadores diverge da versão revisada; compare a definição antes de continuar.';
  end if;
end;
$baseline$;

create or replace function public.food_dashboard_metrics_v1(p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_tz text; v_today date; v_result jsonb; v_now timestamptz:=now();
begin
  if auth.uid() is null or not public.food_is_store_admin(p_store_id) then
    raise exception 'Sem permissão para visualizar os indicadores desta loja.' using errcode='42501'; end if;
  select nullif(opening_hours->>'timezone','') into v_tz from public.food_stores where id=p_store_id;
  if not found then raise exception 'Loja indisponível.' using errcode='22023'; end if;
  if v_tz is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=v_tz) then v_tz:='America/Sao_Paulo'; end if;
  v_today:=(v_now at time zone v_tz)::date;
  select jsonb_build_object(
    'timezone',v_tz,'asOf',v_now,'ordersTotal',count(*),
    'cancelledOrders',count(*) filter(where status='cancelled'),
    'ordersToday',count(*) filter(where status not in ('cancelled','delivered','picked_up') and (created_at at time zone v_tz)::date=v_today),
    'pendingPayments',count(*) filter(where status not in ('cancelled','delivered','picked_up') and payment_status<>'paid'),
    'pendingAmount',coalesce(sum(total) filter(where status not in ('cancelled','delivered','picked_up') and payment_status<>'paid'),0),
    'processingOrders',count(*) filter(where status not in ('cancelled','delivered','picked_up') and payment_status='paid'),
    'scheduledToday',count(*) filter(where status not in ('cancelled','delivered','picked_up') and scheduled_for is not null and (scheduled_for at time zone v_tz)::date=v_today),
    'paidOrders',count(*) filter(where status<>'cancelled' and payment_status='paid'),
    'totalReceived',coalesce(sum(total) filter(where status<>'cancelled' and payment_status='paid'),0),
    'receivedToday',coalesce(sum(total) filter(where status<>'cancelled' and payment_status='paid' and payment_received_at is not null and (payment_received_at at time zone v_tz)::date=v_today),0),
    'receivedTodayCount',count(*) filter(where status<>'cancelled' and payment_status='paid' and payment_received_at is not null and (payment_received_at at time zone v_tz)::date=v_today),
    -- The customer declaration feature is not installed with this standalone RPC.
    'receiptsToReview',0,'receiptsToReviewAmount',0
  ) into v_result from public.food_orders where store_id=p_store_id;
  return v_result;
end $$;
revoke all on function public.food_dashboard_metrics_v1(uuid) from public,anon;
grant execute on function public.food_dashboard_metrics_v1(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
