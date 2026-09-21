begin;

-- FoodWeb v0.5.7
-- Reposicionamento comercial de teste + janela Demo mais curta.
-- Precos sugeridos para validar conversao, ainda abaixo dos benchmarks publicos
-- consultados em setembro/2026 para solucoes de foodservice.

do $$
begin
  if to_regclass('public.food_plans') is null
     or to_regclass('public.food_store_subscriptions') is null
     or to_regclass('public.food_platform_settings') is null then
    raise exception 'FoodWeb v0.5.7 requer food_plans, food_store_subscriptions e food_platform_settings.';
  end if;
end $$;

update public.food_plans
set monthly_price = case code
  when 'ESSENTIAL' then 49.90
  when 'STARTER' then 79.90
  when 'PROFESSIONAL' then 129.90
  else monthly_price
end,
updated_at = now()
where code in ('ESSENTIAL','STARTER','PROFESSIONAL');

-- Atualiza apenas assinaturas que ainda usam exatamente a tabela anterior.
-- Valores negociados/manualizados ficam preservados.
update public.food_store_subscriptions ss
set billing_amount = case p.code
  when 'ESSENTIAL' then 49.90
  when 'STARTER' then 79.90
  when 'PROFESSIONAL' then 129.90
  else ss.billing_amount
end,
updated_at = now()
from public.food_plans p
where p.id = ss.plan_id
  and p.code in ('ESSENTIAL','STARTER','PROFESSIONAL')
  and (
    ss.billing_amount is null
    or (p.code='ESSENTIAL' and ss.billing_amount=49.90)
    or (p.code='STARTER' and ss.billing_amount=89.90)
    or (p.code='PROFESSIONAL' and ss.billing_amount=149.90)
  );

-- O relogio do Demo continua comecando somente na aprovacao Master.
-- A janela futura passa de 30 para 14 dias; trials ja iniciados nao sao encurtados.
update public.food_platform_settings
set demo_duration_days = 14,
    updated_at = now()
where id = 1;

commit;
