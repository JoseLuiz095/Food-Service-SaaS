-- FoodWeb v0.5.1 - validacao da escada comercial
select code,
       name,
       monthly_price,
       custom_domain,
       reports,
       priority_support,
       admin_user_limit,
       active
from public.food_plans
where code in ('DEMO','ESSENTIAL','STARTER','PROFESSIONAL')
order by sort_order, name;

-- Esperado:
-- ESSENTIAL    = Essencial     / 49.90
-- STARTER      = Profissional / 89.90
-- PROFESSIONAL = Premium      / 149.90 / custom_domain=true

-- Deve retornar zero linhas.
select code,name,admin_user_limit
from public.food_plans
where code in ('DEMO','ESSENTIAL','STARTER','PROFESSIONAL')
  and coalesce(admin_user_limit,1) <> 1;

-- Deve retornar zero linhas: multi_user nao deve estar habilitado.
select p.code,p.name
from public.food_plan_features pf
join public.food_plans p on p.id=pf.plan_id
where pf.feature_code='multi_user'
  and pf.enabled=true
  and p.code in ('DEMO','ESSENTIAL','STARTER','PROFESSIONAL');

-- Deve retornar Profissional e Premium (e Demo, se habilitada) com Financeiro.
select p.code,p.name,pf.feature_code,pf.enabled
from public.food_plan_features pf
join public.food_plans p on p.id=pf.plan_id
where pf.feature_code in ('finance','financial_documents')
  and p.code in ('DEMO','STARTER','PROFESSIONAL')
order by p.sort_order,pf.feature_code;

-- Deve retornar true.
select exists(
  select 1 from public.food_plans where code='PROFESSIONAL' and custom_domain=true
) as premium_com_dominio_proprio;
