-- Recebimento informado pelo cliente: conclusão opcional de retirada imediata
-- e indicadores financeiros que não confundem declaração com crédito bancário.
begin;
set local lock_timeout='5s';

do $$begin
 if to_regprocedure('public.food_save_receipt_policy_v1(uuid,jsonb,jsonb,boolean)') is null
    or to_regprocedure('public.food_declare_order_receipt_v1(uuid,uuid,numeric,integer)') is null
    or to_regprocedure('public.food_is_store_admin(uuid)') is null
    or to_regprocedure('public.food_dashboard_metrics_v1(uuid)') is null
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='food_orders' and column_name='payment_reported_by_customer')
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='food_stores' and column_name='receipt_click_marks_paid') then
  raise exception 'Instale e revise as migrations de comprovantes e indicadores antes deste fluxo.';
 end if;
end$$;

alter table public.food_pickup_locations
 add column if not exists auto_pickup_on_receipt boolean not null default false;

-- Substituição completa, tenant-scoped e atômica dos contatos e da política.
-- Só pontos públicos/ativos podem concluir retiradas automaticamente.
create or replace function public.food_save_receipt_policy_v2(
 p_store_id uuid,p_contacts jsonb,p_points jsonb,p_auto_paid boolean,p_auto_pickup_points jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare point_id uuid;
begin
 if auth.uid() is null or not coalesce(public.food_is_store_admin(p_store_id),false) then
  raise exception 'Acesso negado.' using errcode='42501';
 end if;
 if jsonb_typeof(p_auto_pickup_points) is distinct from 'array' then raise exception 'Pontos de retirada inválidos.'; end if;
 if jsonb_array_length(p_auto_pickup_points)>0 and not coalesce(p_auto_paid,false) then
  raise exception 'Habilite primeiro a declaração de envio do comprovante.';
 end if;
 if exists(select 1 from jsonb_array_elements_text(p_auto_pickup_points) values(value) group by value having count(*)>1) then
  raise exception 'Ponto de retirada duplicado.';
 end if;
 for point_id in select value::uuid from jsonb_array_elements_text(p_auto_pickup_points) loop
  if not exists(select 1 from public.food_pickup_locations p
    join public.food_stock_locations l on l.id=p.stock_location_id and l.store_id=p.store_id and l.active
    where p.id=point_id and p.store_id=p_store_id and p.active and p.is_public) then
   raise exception 'O ponto precisa estar ativo e publicado para concluir retiradas.';
  end if;
 end loop;
 perform 1 from public.food_stores where id=p_store_id for update;
 perform public.food_save_receipt_policy_v1(p_store_id,p_contacts,p_points,p_auto_paid);
 update public.food_pickup_locations p set
  auto_pickup_on_receipt=(p.active and p.is_public and p.id in(select value::uuid from jsonb_array_elements_text(p_auto_pickup_points))),
  updated_at=now()
 where p.store_id=p_store_id;
end$$;
revoke all on function public.food_save_receipt_policy_v2(uuid,jsonb,jsonb,boolean,jsonb) from public,anon;
grant execute on function public.food_save_receipt_policy_v2(uuid,jsonb,jsonb,boolean,jsonb) to authenticated;

-- Uma afirmação só é aceita depois da ação explícita “Já enviei o comprovante”.
-- Retirada automática é restrita a pedido online, não agendado, marcado para
-- retirada e vinculado a um ponto ativo que habilitou essa regra.
create or replace function public.food_declare_order_receipt_v1(
 p_store_id uuid,p_order_id uuid,p_amount numeric,p_version integer
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.food_orders%rowtype; enabled boolean; v_auto_pickup boolean:=false;
begin
 select * into o from public.food_orders where id=p_order_id and store_id=p_store_id for update;
 if not found then raise exception 'Pedido indisponível.';end if;
 select receipt_click_marks_paid into enabled from public.food_stores
  where id=o.store_id and active and access_status='online' for share;
 if enabled is distinct from true then raise exception 'A declaração de pagamento não está habilitada nesta loja.';end if;
 if p_version is distinct from o.payment_receipt_version or p_version<>0 or p_amount is distinct from o.total then
  raise exception 'O pedido foi alterado ou revisado. Solicite orientação à loja.' using errcode='40001';
 end if;
 if o.payment_status='paid' and o.payment_reported_by_customer then
  return jsonb_build_object('ok',true,'alreadyPaid',true,'autoPickedUp',o.status='picked_up');
 end if;
 if o.status in ('cancelled','delivered','picked_up') or o.payment_method<>'pix' or o.total<=0 then
  raise exception 'Este pedido não aceita declaração de pagamento.';
 end if;
 if o.payment_status<>'pending' then raise exception 'Este pedido não aceita declaração de pagamento.';end if;
 if o.source='site' and o.delivery_type='pickup' and o.pickup_location_id is not null and o.scheduled_for is null then
  select coalesce(p.auto_pickup_on_receipt,false) into v_auto_pickup
  from public.food_pickup_locations p
  join public.food_stock_locations l on l.id=p.stock_location_id and l.store_id=p.store_id and l.active
  where p.id=o.pickup_location_id and p.store_id=o.store_id and p.active and p.is_public for share of p,l;
  v_auto_pickup:=coalesce(v_auto_pickup,false);
 end if;
 update public.food_orders set
  payment_status='paid',payment_reported_by_customer=true,payment_reported_at=now(),
  payment_received_at=now(),payment_confirmed_by=null,
  status=case when v_auto_pickup then 'picked_up' else status end,updated_at=now()
 where id=o.id;
 insert into public.food_platform_event_log(store_id,kind,action,result,route,metadata)
  values(o.store_id,'audit','order_receipt_declared','success','/pagamento',
    jsonb_build_object('order_id',o.id,'source','customer_declaration','auto_picked_up',v_auto_pickup));
 return jsonb_build_object('ok',true,'alreadyPaid',false,'autoPickedUp',v_auto_pickup);
end$$;
revoke all on function public.food_declare_order_receipt_v1(uuid,uuid,numeric,integer) from public,anon,authenticated;
grant execute on function public.food_declare_order_receipt_v1(uuid,uuid,numeric,integer) to service_role;

-- A declaração não entra como dinheiro já recebido. A conferência administrativa
-- existente sincroniza o lançamento para pago; a devolução mantém A receber.
create or replace function public.food_hold_reported_receipt_in_finance()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.food_financial_entries set status='pending',paid_at=null,
  notes='Cliente informou o envio do comprovante; aguardando conferência bancária da loja.',
  created_by=null,updated_at=now()
 where store_id=new.store_id and order_id=new.id and source='order';
 return new;
end$$;
revoke all on function public.food_hold_reported_receipt_in_finance() from public,anon,authenticated;
drop trigger if exists zzz_food_orders_reported_receipt_finance on public.food_orders;
create trigger zzz_food_orders_reported_receipt_finance
after insert or update of status,total,payment_status,payment_received_at,payment_method
on public.food_orders for each row
when(new.payment_reported_by_customer and new.payment_status='paid')
execute function public.food_hold_reported_receipt_in_finance();

-- Devolve recebimentos comprovados, declarações aguardando conferência e valores
-- a receber em campos independentes para evitar somar alegações como caixa.
create or replace function public.food_dashboard_metrics_v1(p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_tz text; v_today date; v_result jsonb; v_now timestamptz:=now();
begin
 if auth.uid() is null or not public.food_is_store_admin(p_store_id) then
  raise exception 'Sem permissão para visualizar os indicadores desta loja.' using errcode='42501';
 end if;
 select nullif(opening_hours->>'timezone','') into v_tz from public.food_stores where id=p_store_id;
 if not found then raise exception 'Loja indisponível.' using errcode='22023';end if;
 if v_tz is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=v_tz) then v_tz:='America/Sao_Paulo';end if;
 v_today:=(v_now at time zone v_tz)::date;
 select jsonb_build_object(
  'timezone',v_tz,'asOf',v_now,'ordersTotal',count(*),
  'cancelledOrders',count(*) filter(where status='cancelled'),
  'ordersToday',count(*) filter(where status not in ('cancelled','delivered','picked_up') and (created_at at time zone v_tz)::date=v_today),
  'pendingPayments',count(*) filter(where status not in ('cancelled','delivered','picked_up') and payment_status<>'paid'),
  'pendingAmount',coalesce(sum(total) filter(where status not in ('cancelled','delivered','picked_up') and payment_status<>'paid'),0),
  'processingOrders',count(*) filter(where status not in ('cancelled','delivered','picked_up') and payment_status='paid' and not payment_reported_by_customer),
  'scheduledToday',count(*) filter(where status not in ('cancelled','delivered','picked_up') and scheduled_for is not null and (scheduled_for at time zone v_tz)::date=v_today),
  'paidOrders',count(*) filter(where status<>'cancelled' and payment_status='paid' and not payment_reported_by_customer),
  'totalReceived',coalesce(sum(total) filter(where status<>'cancelled' and payment_status='paid' and not payment_reported_by_customer),0),
  'receivedToday',coalesce(sum(total) filter(where status<>'cancelled' and payment_status='paid' and not payment_reported_by_customer and payment_received_at is not null and (payment_received_at at time zone v_tz)::date=v_today),0),
  'receivedTodayCount',count(*) filter(where status<>'cancelled' and payment_status='paid' and not payment_reported_by_customer and payment_received_at is not null and (payment_received_at at time zone v_tz)::date=v_today),
  'receiptsToReview',count(*) filter(where status<>'cancelled' and payment_reported_by_customer),
  'receiptsToReviewAmount',coalesce(sum(total) filter(where status<>'cancelled' and payment_reported_by_customer),0)
 ) into v_result from public.food_orders where store_id=p_store_id;
 return v_result;
end$$;
revoke all on function public.food_dashboard_metrics_v1(uuid) from public,anon;
grant execute on function public.food_dashboard_metrics_v1(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
