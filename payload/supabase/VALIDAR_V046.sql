-- FoodWeb v0.4.6 - validacao de mensalidade, vencimento e acesso

select
  s.name as loja,
  p.name as plano,
  ss.status,
  ss.billing_amount,
  ss.due_day,
  ss.next_due_date,
  case
    when p.code='DEMO' or ss.status='trial' then 'trial'
    when ss.next_due_date<current_date then 'overdue'
    when ss.status='suspended' then 'suspended'
    else 'current'
  end as situacao_mensalidade,
  extract(day from ss.next_due_date)::integer as dia_real_do_proximo_vencimento,
  case
    when p.code='DEMO' then true
    when ss.next_due_date is null or ss.due_day is null then false
    else extract(day from ss.next_due_date)::integer=ss.due_day
  end as respeita_dia_configurado
from public.food_store_subscriptions ss
join public.food_stores s on s.id=ss.store_id
join public.food_plans p on p.id=ss.plan_id
where ss.status<>'cancelled'
order by s.name;

select
  to_regprocedure('public.food_subscription_reference_due_v1(integer,date)') is not null as funcao_vencimento_ok,
  to_regprocedure('public.food_get_store_billing_overview_v1(uuid)') is not null as overview_loja_ok,
  to_regprocedure('public.food_platform_get_billing_dashboard_v1()') is not null as dashboard_master_ok,
  to_regprocedure('public.food_platform_reject_subscription_payment_v1(uuid,text)') is not null as rejeicao_ok,
  to_regprocedure('public.food_confirm_subscription_payment(uuid,timestamptz,text)') is not null as confirmacao_ok;

select
  count(*) filter(where status='rejected') as pagamentos_negados,
  count(*) filter(where status='paid') as pagamentos_confirmados,
  count(*) filter(where status in('pending','proof_sent')) as aguardando_decisao
from public.food_subscription_payments;
