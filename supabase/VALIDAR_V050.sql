-- FoodWeb v0.5.0 - validacao de estabilidade/cobranca/auditoria

select
  public.food_subscription_reference_due_v1(31,date '2027-02-01') as fevereiro_dia_31,
  public.food_subscription_reference_due_v1(31,date '2027-03-01') as marco_dia_31,
  public.food_subscription_reference_due_v1(30,date '2028-02-01') as fevereiro_bissexto_dia_30,
  public.food_subscription_reference_due_v1(29,date '2027-02-01') as fevereiro_dia_29;

select
  to_regclass('public.food_platform_event_log') is not null as tabela_eventos_ok,
  to_regprocedure('public.food_log_platform_event_v1(uuid,text,text,text,text,integer,text,text,text,text)') is not null as rpc_log_evento_ok,
  to_regprocedure('public.food_platform_list_event_log_v1(integer,text,text)') is not null as rpc_lista_eventos_ok,
  to_regprocedure('public.food_confirm_subscription_payment(uuid,timestamptz,text)') is not null as rpc_confirmacao_renovacao_ok,
  to_regprocedure('public.food_platform_reject_subscription_payment_v1(uuid,text)') is not null as rpc_negacao_renovacao_ok;

select
  s.name as loja,
  p.name as plano,
  ss.due_day as dia_configurado,
  ss.next_due_date,
  extract(day from ss.next_due_date)::integer as dia_real,
  extract(day from (date_trunc('month',ss.next_due_date)+interval '1 month - 1 day'))::integer as ultimo_dia_mes,
  (extract(day from ss.next_due_date)::integer = least(ss.due_day,extract(day from (date_trunc('month',ss.next_due_date)+interval '1 month - 1 day'))::integer)) as respeita_dia_configurado
from public.food_store_subscriptions ss
join public.food_stores s on s.id=ss.store_id
join public.food_plans p on p.id=ss.plan_id
where p.code<>'DEMO' and ss.status<>'cancelled'
order by s.name;

select result,count(*) as quantidade
from public.food_platform_event_log
where created_at>=now()-interval '7 days'
group by result
order by result;

select action,result,route,app_version,created_at
from public.food_platform_event_log
order by created_at desc
limit 20;
