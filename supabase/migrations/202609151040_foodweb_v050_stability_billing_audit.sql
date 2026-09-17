-- FoodWeb v0.5.0
-- Estabilidade, cobrança e diagnóstico de interações.
-- Toca somente objetos food_*.

begin;

do $$
begin
  if to_regclass('public.food_store_subscriptions') is null
     or to_regclass('public.food_subscription_payments') is null
     or to_regclass('public.food_financial_entries') is null
     or to_regclass('public.food_orders') is null then
    raise exception 'FoodWeb v0.5.0 requer v0.4.9 aplicado.';
  end if;
end $$;

do $$
declare r record;
begin
  for r in
    select conname
      from pg_constraint
     where conrelid='public.food_store_subscriptions'::regclass
       and contype='c'
       and pg_get_constraintdef(oid) ilike '%due_day%'
  loop
    execute format('alter table public.food_store_subscriptions drop constraint %I',r.conname);
  end loop;
end $$;

alter table public.food_store_subscriptions
  add constraint food_store_subscriptions_due_day_ck
  check(due_day is null or due_day between 1 and 31);

create or replace function public.food_subscription_reference_due_v1(
  p_due_day integer,
  p_reference date default null
)
returns date
language plpgsql
stable
set search_path=public,pg_temp
as $$
declare
  v_day integer:=greatest(1,least(coalesce(p_due_day,10),31));
  v_month date;
  v_last_day integer;
  v_due date;
begin
  v_month:=date_trunc('month',coalesce(p_reference,current_date))::date;
  v_last_day:=extract(day from (v_month+interval '1 month - 1 day'))::integer;
  v_due:=make_date(extract(year from v_month)::integer,extract(month from v_month)::integer,least(v_day,v_last_day));

  if p_reference is null and v_due<current_date then
    v_month:=(v_month+interval '1 month')::date;
    v_last_day:=extract(day from (v_month+interval '1 month - 1 day'))::integer;
    v_due:=make_date(extract(year from v_month)::integer,extract(month from v_month)::integer,least(v_day,v_last_day));
  end if;

  return v_due;
end $$;

revoke all on function public.food_subscription_reference_due_v1(integer,date) from public;
grant execute on function public.food_subscription_reference_due_v1(integer,date) to authenticated;

update public.food_store_subscriptions ss
set due_day=greatest(1,least(coalesce(ss.due_day,10),31)),
    next_due_date=public.food_subscription_reference_due_v1(
      greatest(1,least(coalesce(ss.due_day,10),31)),
      ss.next_due_date
    ),
    updated_at=now()
from public.food_plans p
where p.id=ss.plan_id and p.code<>'DEMO' and ss.status<>'cancelled';

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

create index if not exists food_platform_event_log_created_idx on public.food_platform_event_log(created_at desc);
create index if not exists food_platform_event_log_result_idx on public.food_platform_event_log(result,created_at desc);
create index if not exists food_platform_event_log_correlation_idx on public.food_platform_event_log(correlation_id) where correlation_id is not null;

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
  if auth.uid() is null then raise exception 'Sessão necessária.' using errcode='42501'; end if;
  if p_result not in('started','success','error','warning') then raise exception 'Resultado de evento inválido.'; end if;
  if v_store is not null and not (public.food_is_store_admin(v_store) or public.food_is_platform_admin()) then v_store:=null; end if;
  if v_kind='audit' and not public.food_is_platform_admin() then v_kind:='interaction'; end if;

  insert into public.food_platform_event_log(
    actor_user_id,store_id,kind,action,result,route,duration_ms,error_code,error_message,app_version,correlation_id
  ) values(
    auth.uid(),v_store,v_kind,left(coalesce(p_action,'unknown'),120),p_result,left(coalesce(p_route,''),240),
    case when p_duration_ms is null then null else greatest(0,least(p_duration_ms,3600000)) end,
    nullif(left(coalesce(p_error_code,''),120),''),nullif(left(coalesce(p_error_message,''),500),''),
    nullif(left(coalesce(p_app_version,''),80),''),nullif(left(coalesce(p_correlation_id,''),120),'')
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
  if not public.food_is_platform_admin() then raise exception 'Acesso negado.' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',x.id,'createdAt',x.created_at,'kind',x.kind,'action',x.action,'result',x.result,'route',x.route,
      'storeId',x.store_id,'storeName',s.name,'durationMs',x.duration_ms,'errorCode',x.error_code,
      'errorMessage',x.error_message,'appVersion',x.app_version,'correlationId',x.correlation_id
    ) order by x.created_at desc)
    from (
      select * from public.food_platform_event_log e
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

create or replace function public.food_confirm_subscription_payment(
  p_payment_id uuid,
  p_paid_at timestamptz default now(),
  p_provider_event_id text default null
)
returns public.food_subscription_payments
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_payment public.food_subscription_payments%rowtype;
  v_sub public.food_store_subscriptions%rowtype;
  v_reference_due date;
  v_next_due date;
  v_paid_at timestamptz:=coalesce(p_paid_at,now());
  v_due_day integer;
begin
  if auth.role()<>'service_role' and not public.food_is_platform_admin() then raise exception 'Somente a plataforma pode confirmar pagamentos.'; end if;
  select * into v_payment from public.food_subscription_payments where id=p_payment_id for update;
  if not found then raise exception 'Cobrança não encontrada.'; end if;
  if v_payment.status='paid' then return v_payment; end if;
  if v_payment.status in('rejected','cancelled','refunded') then raise exception 'Esta cobrança foi negada/cancelada e não pode ser confirmada.'; end if;
  if v_payment.provider='manual' and v_payment.proof_required and v_payment.proof_sent_at is null then raise exception 'O comprovante deve ser enviado antes da confirmação manual.'; end if;

  select * into v_sub from public.food_store_subscriptions where id=v_payment.subscription_id for update;
  if v_sub.id is null then
    select * into v_sub from public.food_store_subscriptions where store_id=v_payment.store_id order by started_at desc limit 1 for update;
  end if;
  if v_sub.id is null then raise exception 'Assinatura da loja não encontrada.'; end if;

  v_due_day:=greatest(1,least(coalesce(v_sub.due_day,extract(day from v_payment.due_date)::integer,10),31));
  v_reference_due:=public.food_subscription_reference_due_v1(v_due_day,coalesce(v_payment.due_date,v_sub.next_due_date,v_paid_at::date));
  v_next_due:=public.food_subscription_reference_due_v1(v_due_day,(date_trunc('month',v_reference_due)+interval '1 month')::date);

  update public.food_store_subscriptions
     set plan_id=v_payment.plan_id,status='active',status_before_suspension=null,expires_at=null,
         billing_amount=v_payment.amount,due_day=v_due_day,next_due_date=v_next_due,
         notes=concat_ws(E'\n',notes,'Pagamento PIX confirmado em '||to_char(v_paid_at,'DD/MM/YYYY HH24:MI')||' | referência '||to_char(v_reference_due,'DD/MM/YYYY')||' | próximo vencimento '||to_char(v_next_due,'DD/MM/YYYY')),
         updated_at=now()
   where id=v_sub.id returning * into v_sub;

  update public.food_stores set access_status='online',active=true,suspended_at=null,suspension_reason=null,updated_at=now() where id=v_payment.store_id;

  update public.food_subscription_payments
     set status='paid',paid_at=v_paid_at,subscription_id=v_sub.id,due_date=v_reference_due,rejected_at=null,rejection_reason=null,reviewed_by=auth.uid(),updated_at=now()
   where id=v_payment.id returning * into v_payment;

  if p_provider_event_id is not null then update public.food_billing_webhook_events set processed_at=now() where event_id=p_provider_event_id; end if;

  insert into public.food_platform_event_log(actor_user_id,store_id,kind,action,result,route,app_version,metadata)
  values(auth.uid(),v_payment.store_id,'audit',
    case when v_payment.payment_intent='plan_change' then 'subscription_plan_change_confirmed' else 'subscription_renewal_confirmed' end,
    'success','/admin-master/pagamentos','0.5.0',jsonb_build_object('paymentId',v_payment.id,'amount',v_payment.amount,'referenceDueDate',v_reference_due,'nextDueDate',v_next_due));

  return v_payment;
end $$;

revoke all on function public.food_confirm_subscription_payment(uuid,timestamptz,text) from public;
grant execute on function public.food_confirm_subscription_payment(uuid,timestamptz,text) to authenticated,service_role;

create or replace function public.food_platform_reject_subscription_payment_v1(
  p_payment_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_payment public.food_subscription_payments%rowtype;
  v_reason text;
begin
  if not public.food_is_platform_admin() then raise exception 'Acesso negado.' using errcode='42501'; end if;
  select * into v_payment from public.food_subscription_payments where id=p_payment_id for update;
  if not found then raise exception 'Cobrança não encontrada.'; end if;
  if v_payment.status='paid' then raise exception 'Pagamento já confirmado não pode ser negado.'; end if;
  if v_payment.status in('cancelled','rejected','refunded') then return jsonb_build_object('ok',true,'alreadyRejected',true); end if;

  v_reason:=nullif(trim(coalesce(p_reason,'')),'');
  update public.food_subscription_payments
     set status='rejected',rejected_at=now(),rejection_reason=coalesce(v_reason,'Pagamento/renovação não confirmado pelo Admin Master.'),reviewed_by=auth.uid(),updated_at=now()
   where id=p_payment_id;

  insert into public.food_platform_event_log(actor_user_id,store_id,kind,action,result,route,app_version,metadata)
  values(auth.uid(),v_payment.store_id,'audit',
    case when v_payment.payment_intent='plan_change' then 'subscription_plan_change_rejected' else 'subscription_renewal_rejected' end,
    'success','/admin-master/pagamentos','0.5.0',jsonb_build_object('paymentId',v_payment.id,'reason',coalesce(v_reason,'Pagamento/renovação não confirmado pelo Admin Master.')));

  return jsonb_build_object('ok',true);
end $$;

revoke all on function public.food_platform_reject_subscription_payment_v1(uuid,text) from public;
grant execute on function public.food_platform_reject_subscription_payment_v1(uuid,text) to authenticated;

create or replace function public.food_confirm_order_payment_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_order public.food_orders%rowtype;
  v_already_paid boolean;
begin
  select * into v_order from public.food_orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if not public.food_is_store_admin(v_order.store_id) and not public.food_is_platform_admin() then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if v_order.status='cancelled' then raise exception 'Não é possível confirmar o recebimento de um pedido cancelado.'; end if;
  if coalesce(v_order.total,0)<=0 then raise exception 'O pedido não possui valor válido para recebimento.'; end if;

  v_already_paid:=v_order.payment_status='paid';
  update public.food_orders
     set payment_status='paid',payment_received_at=coalesce(payment_received_at,now()),payment_confirmed_by=coalesce(payment_confirmed_by,auth.uid())
   where id=p_order_id returning * into v_order;

  if not v_already_paid then
    insert into public.food_platform_event_log(actor_user_id,store_id,kind,action,result,route,app_version,metadata)
    values(auth.uid(),v_order.store_id,'audit','order_payment_confirmed','success','/admin/pedidos','0.5.0',jsonb_build_object('orderId',v_order.id,'orderNumber',v_order.order_number,'amount',v_order.total));
  end if;

  return jsonb_build_object('ok',true,'alreadyPaid',v_already_paid,'orderId',v_order.id,'paymentReceivedAt',v_order.payment_received_at,'amount',v_order.total);
end $$;

revoke all on function public.food_confirm_order_payment_v1(uuid) from public;
grant execute on function public.food_confirm_order_payment_v1(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
