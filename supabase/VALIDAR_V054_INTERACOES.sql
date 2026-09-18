-- FoodWeb v0.5.4 - validar integracao de interacoes
select
  to_regclass('public.food_platform_event_log') is not null as tabela_eventos_ok,
  to_regprocedure('public.food_log_platform_event_v1(uuid,text,text,text,text,integer,text,text,text,text)') is not null as rpc_gravar_evento_ok,
  to_regprocedure('public.food_platform_list_event_log_v1(integer,text,text)') is not null as rpc_listar_eventos_ok;

select result,count(*) as quantidade
from public.food_platform_event_log
where created_at >= now() - interval '7 days'
group by result
order by result;
