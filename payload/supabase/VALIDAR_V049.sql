-- FoodWeb v0.4.9 - validacao do recebimento automatico no Financeiro

select
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='food_orders' and column_name='payment_status') as orders_payment_status,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='food_orders' and column_name='payment_received_at') as orders_payment_received_at,
  to_regprocedure('public.food_confirm_order_payment_v1(uuid)') is not null as rpc_confirmacao,
  exists(select 1 from pg_trigger where tgname='food_orders_financial_sync_trg' and not tgisinternal) as trigger_financeiro,
  to_regclass('public.food_financial_entries_order_uidx') is not null as indice_antiduplicidade;

-- Deve retornar zero linhas.
select store_id,order_id,count(*) as duplicados
from public.food_financial_entries
where source='order' and order_id is not null
group by store_id,order_id
having count(*)>1;

-- Diagnostico dos ultimos pedidos e respectivos lancamentos.
select
  o.order_number,
  o.customer_name,
  o.total,
  o.status as order_status,
  o.payment_status,
  o.payment_received_at,
  f.id as financial_entry_id,
  f.amount as financial_amount,
  f.status as financial_status,
  f.occurred_on
from public.food_orders o
left join public.food_financial_entries f
  on f.store_id=o.store_id and f.order_id=o.id and f.source='order'
order by o.created_at desc
limit 20;
