begin;

-- FoodWeb v0.5.1
-- Alinha a escada comercial ao FloriWeb sem introduzir a complexidade de multiusuario.
-- Mantemos os IDs dos planos para nao quebrar assinaturas existentes.
update public.food_plans
set name='Teste gratis',
    product_limit=120,
    image_limit_per_product=5,
    custom_domain=false,
    reports=true,
    priority_support=false,
    monthly_price=0,
    category_limit=30,
    addon_limit=120,
    admin_user_limit=1,
    sort_order=0,
    updated_at=now()
where code='DEMO';

update public.food_plans
set name='Essencial',
    product_limit=40,
    image_limit_per_product=1,
    custom_domain=false,
    reports=false,
    priority_support=false,
    monthly_price=49.90,
    category_limit=12,
    addon_limit=40,
    admin_user_limit=1,
    sort_order=10,
    updated_at=now()
where code='ESSENTIAL';

update public.food_plans
set name='Profissional',
    product_limit=120,
    image_limit_per_product=5,
    custom_domain=false,
    reports=true,
    priority_support=false,
    monthly_price=89.90,
    category_limit=30,
    addon_limit=120,
    admin_user_limit=1,
    sort_order=20,
    updated_at=now()
where code='STARTER';

update public.food_plans
set name='Premium',
    product_limit=null,
    image_limit_per_product=10,
    custom_domain=true,
    reports=true,
    priority_support=true,
    monthly_price=149.90,
    category_limit=null,
    addon_limit=null,
    admin_user_limit=1,
    sort_order=30,
    updated_at=now()
where code='PROFESSIONAL';

-- Mantem contratos existentes coerentes quando ainda usam exatamente os valores antigos.
update public.food_store_subscriptions ss
set billing_amount = case p.code
  when 'ESSENTIAL' then 49.90
  when 'STARTER' then 89.90
  when 'PROFESSIONAL' then 149.90
  else ss.billing_amount
end,
updated_at=now()
from public.food_plans p
where ss.plan_id=p.id
  and p.code in ('ESSENTIAL','STARTER','PROFESSIONAL')
  and (
    ss.billing_amount is null
    or (p.code='ESSENTIAL' and ss.billing_amount=49.90)
    or (p.code='STARTER' and ss.billing_amount=79.90)
    or (p.code='PROFESSIONAL' and ss.billing_amount=119.90)
  );

-- O Financeiro passa a fazer parte do Profissional e do Premium.
insert into public.food_features(code,name,description,scope)
values ('financial_documents','Leitura de documentos','Leitura assistida de notas, cupons, boletos e comprovantes.','food')
on conflict(code) do update
set name=excluded.name,description=excluded.description,scope=excluded.scope,active=true,updated_at=now();

insert into public.food_plan_features(plan_id,feature_code,enabled,limit_value)
select p.id, f.code, true, null
from public.food_plans p
join public.food_features f on f.code in ('finance','financial_documents')
where p.code in ('DEMO','STARTER','PROFESSIONAL')
on conflict(plan_id,feature_code) do update
set enabled=true,limit_value=null,updated_at=now();

-- Multiusuario fica explicitamente desabilitado por enquanto.
update public.food_plan_features pf
set enabled=false,updated_at=now()
where pf.feature_code='multi_user'
  and pf.plan_id in (
    select id from public.food_plans where code in ('DEMO','ESSENTIAL','STARTER','PROFESSIONAL')
  );

commit;
