-- Seed idempotente - Food Service SaaS MVP v0.1
-- Execute depois de todas as migrations, inclusive 202608280400_foodservice_shared_database.sql.

insert into public.food_plans(
  id,code,name,product_limit,image_limit_per_product,custom_domain,reports,priority_support,active,
  monthly_price,setup_price,category_limit,addon_limit,admin_user_limit,sort_order
) values
('40000000-0000-4000-8000-000000000001','DEMO','Demo',30,5,false,true,false,true,0,0,10,50,2,10),
('40000000-0000-4000-8000-000000000002','BASIC','Básico',50,5,false,false,false,true,79.90,0,15,100,2,20),
('40000000-0000-4000-8000-000000000003','PRO','Pro',150,8,false,true,true,true,129.90,0,30,300,5,30),
('40000000-0000-4000-8000-000000000004','PREMIUM','Premium',null,12,true,true,true,true,199.90,0,null,null,15,40)
on conflict(code) do update set
  name=excluded.name,product_limit=excluded.product_limit,image_limit_per_product=excluded.image_limit_per_product,
  custom_domain=excluded.custom_domain,reports=excluded.reports,priority_support=excluded.priority_support,active=excluded.active,
  monthly_price=excluded.monthly_price,setup_price=excluded.setup_price,category_limit=excluded.category_limit,
  addon_limit=excluded.addon_limit,admin_user_limit=excluded.admin_user_limit,sort_order=excluded.sort_order;

-- Entitlements iniciais. Os recursos futuros ficam cadastrados, mas desabilitados até sua implementação.
insert into public.food_plan_features(plan_id,feature_code,enabled,limit_value)
select p.id, f.feature_code, f.enabled, f.limit_value
from public.food_plans p
join (values
  ('DEMO','catalog',true,null),('DEMO','orders',true,null),('DEMO','whatsapp',true,null),('DEMO','delivery',true,null),('DEMO','analytics',true,null),('DEMO','custom_domain',false,null),('DEMO','coupons',false,null),('DEMO','combos',false,null),('DEMO','pizza',false,null),('DEMO','finance',false,null),('DEMO','multi_user',true,2),
  ('BASIC','catalog',true,null),('BASIC','orders',true,null),('BASIC','whatsapp',true,null),('BASIC','delivery',true,null),('BASIC','analytics',false,null),('BASIC','custom_domain',false,null),('BASIC','coupons',false,null),('BASIC','combos',false,null),('BASIC','pizza',false,null),('BASIC','finance',false,null),('BASIC','multi_user',true,2),
  ('PRO','catalog',true,null),('PRO','orders',true,null),('PRO','whatsapp',true,null),('PRO','delivery',true,null),('PRO','analytics',true,null),('PRO','custom_domain',false,null),('PRO','coupons',false,null),('PRO','combos',false,null),('PRO','pizza',false,null),('PRO','finance',false,null),('PRO','multi_user',true,5),
  ('PREMIUM','catalog',true,null),('PREMIUM','orders',true,null),('PREMIUM','whatsapp',true,null),('PREMIUM','delivery',true,null),('PREMIUM','analytics',true,null),('PREMIUM','custom_domain',true,null),('PREMIUM','coupons',false,null),('PREMIUM','combos',false,null),('PREMIUM','pizza',false,null),('PREMIUM','finance',false,null),('PREMIUM','multi_user',true,15)
) as f(plan_code,feature_code,enabled,limit_value) on f.plan_code=p.code
on conflict(plan_id,feature_code) do update set enabled=excluded.enabled,limit_value=excluded.limit_value,updated_at=now();

insert into public.food_stores(
  id,slug,name,description,logo_url,cover_url,whatsapp,instagram,address,city,state,zip_code,
  delivery_enabled,pickup_enabled,pix_enabled,pix_receipt_mode,pix_key_type,pix_key,pix_holder_name,
  show_pix_before_confirmation,confirmation_payment_enabled,card_payment_enabled,cash_payment_enabled,
  payment_method_order,minimum_order,opening_hours,average_preparation_min,average_preparation_max,
  allow_scheduled_orders,active,access_status,owner_name,owner_email
) values(
  '00000000-0000-4000-8000-000000000001','central-food-demo','Central Food',
  'Hambúrgueres, porções, bebidas e sobremesas com pedido online rápido.',
  '/assets/food-logo.svg','/assets/food-hero.svg','5527999999999','@centralfood',
  'Av. Demo, 100 - Centro','Linhares','ES','29900-000',true,true,true,'key','E-mail','demo@foodservice.local','Central Food',
  true,false,true,true,'["pix","card","cash","confirm"]'::jsonb,20,
  '{"display":"Seg 18:00–23:00 · Ter 18:00–23:00 · Qua 18:00–23:00 · Qui 18:00–23:30 · Sex 18:00–00:30 · Sáb 18:00–00:30 · Dom 18:00–23:00","timezone":"America/Sao_Paulo","days":[{"day":0,"enabled":true,"open":"18:00","close":"23:00"},{"day":1,"enabled":true,"open":"18:00","close":"23:00"},{"day":2,"enabled":true,"open":"18:00","close":"23:00"},{"day":3,"enabled":false,"open":"18:00","close":"23:00"},{"day":4,"enabled":true,"open":"18:00","close":"23:30"},{"day":5,"enabled":true,"open":"18:00","close":"00:30"},{"day":6,"enabled":true,"open":"18:00","close":"00:30"}]}'::jsonb,
  30,45,true,true,'online','Cliente Demo','admin@foodservice.demo'
)
on conflict(id) do update set
  slug=excluded.slug,name=excluded.name,description=excluded.description,logo_url=excluded.logo_url,cover_url=excluded.cover_url,
  whatsapp=excluded.whatsapp,instagram=excluded.instagram,address=excluded.address,city=excluded.city,state=excluded.state,zip_code=excluded.zip_code,
  delivery_enabled=excluded.delivery_enabled,pickup_enabled=excluded.pickup_enabled,pix_enabled=excluded.pix_enabled,
  pix_receipt_mode=excluded.pix_receipt_mode,pix_key_type=excluded.pix_key_type,pix_key=excluded.pix_key,pix_holder_name=excluded.pix_holder_name,
  show_pix_before_confirmation=excluded.show_pix_before_confirmation,confirmation_payment_enabled=excluded.confirmation_payment_enabled,
  card_payment_enabled=excluded.card_payment_enabled,cash_payment_enabled=excluded.cash_payment_enabled,payment_method_order=excluded.payment_method_order,
  minimum_order=excluded.minimum_order,opening_hours=excluded.opening_hours,average_preparation_min=excluded.average_preparation_min,
  average_preparation_max=excluded.average_preparation_max,allow_scheduled_orders=excluded.allow_scheduled_orders,active=excluded.active,
  access_status=excluded.access_status,owner_name=excluded.owner_name,owner_email=excluded.owner_email;

insert into public.food_categories(id,store_id,name,slug,description,active,sort_order) values
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Hambúrgueres','hamburgueres','Lanches artesanais',true,10),
('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Porções','porcoes','Porções para compartilhar',true,20),
('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Bebidas','bebidas','Bebidas geladas',true,30),
('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','Açaí','acai','Monte do seu jeito',true,40),
('10000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','Sobremesas','sobremesas','Para fechar o pedido',true,50)
on conflict(id) do update set name=excluded.name,slug=excluded.slug,description=excluded.description,active=excluded.active,sort_order=excluded.sort_order;

insert into public.food_products(
  id,store_id,category_id,name,slug,description,price,promotional_price,active,featured,made_to_order,production_days,stock_status,
  internal_code,availability_status,track_stock,stock_quantity,preparation_time_minutes,sort_order
) values
('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','X-Bacon Artesanal','x-bacon-artesanal','Pão brioche, hambúrguer artesanal, bacon, queijo, alface, tomate e molho da casa.',28.00,25.90,true,true,false,0,'available','XB001','available',false,null,10,10),
('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','X-Salada','x-salada','Pão, hambúrguer, queijo, presunto, alface, tomate e molho especial.',23.90,null,true,false,false,0,'available','XS001','available',false,null,8,20),
('30000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Batata Frita','batata-frita','Batata crocante, sequinha e preparada na hora.',18.00,null,true,true,false,0,'available','POR001','available',false,null,5,30),
('30000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','Refrigerante Cola','refrigerante-cola','Refrigerante gelado para acompanhar seu pedido.',6.00,null,true,false,false,0,'available','BEB001','available',false,null,0,40),
('30000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','Açaí Tradicional','acai-tradicional','Açaí cremoso com tamanhos e complementos à sua escolha.',14.00,null,true,true,false,0,'available','ACA001','available',false,null,5,50),
('30000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','Brownie com Sorvete','brownie-com-sorvete','Brownie aquecido com sorvete e calda de chocolate.',19.90,null,true,false,false,0,'available','SOB001','available',false,null,4,60)
on conflict(id) do update set
  category_id=excluded.category_id,name=excluded.name,slug=excluded.slug,description=excluded.description,price=excluded.price,
  promotional_price=excluded.promotional_price,active=excluded.active,featured=excluded.featured,stock_status=excluded.stock_status,
  internal_code=excluded.internal_code,availability_status=excluded.availability_status,track_stock=excluded.track_stock,
  stock_quantity=excluded.stock_quantity,preparation_time_minutes=excluded.preparation_time_minutes,sort_order=excluded.sort_order;

insert into public.food_product_images(id,product_id,url,alt_text,sort_order,is_primary) values
('31000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','/assets/food-burger.svg','X-Bacon Artesanal',0,true),
('31000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','/assets/food-burger.svg','X-Salada',0,true),
('31000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003','/assets/food-fries.svg','Batata Frita',0,true),
('31000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000004','/assets/food-soda.svg','Refrigerante Cola',0,true),
('31000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000005','/assets/food-acai.svg','Açaí Tradicional',0,true),
('31000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000006','/assets/food-dessert.svg','Brownie com Sorvete',0,true)
on conflict(id) do update set url=excluded.url,alt_text=excluded.alt_text,sort_order=excluded.sort_order,is_primary=excluded.is_primary;

-- Grupos de opções do X-Bacon.
insert into public.food_option_groups(id,store_id,name,description,kind,min_choices,max_choices,active,sort_order) values
('60000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Tamanho','Escolha o tamanho do lanche','variant',1,1,true,10),
('60000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Ponto da carne','Escolha o ponto do hambúrguer','choice',1,1,true,20),
('60000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Adicionais','Escolha até 3 adicionais','addon',0,3,true,30),
('60000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','Retirar ingredientes','Marque o que deseja retirar','removal',0,4,true,40),
('60000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','Tamanho','Escolha o tamanho do açaí','variant',1,1,true,10),
('60000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','Complementos','Escolha até 5 complementos','addon',0,5,true,20),
('60000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001','Tamanho','Escolha a porção','variant',1,1,true,10)
on conflict(id) do update set name=excluded.name,description=excluded.description,kind=excluded.kind,min_choices=excluded.min_choices,max_choices=excluded.max_choices,active=excluded.active,sort_order=excluded.sort_order;

insert into public.food_option_items(id,group_id,store_id,name,description,price_delta,active,sort_order) values
('61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Tradicional',null,0,true,10),
('61000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Duplo',null,9,true,20),
('61000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Mal passada',null,0,true,10),
('61000000-0000-4000-8000-000000000004','60000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Ao ponto',null,0,true,20),
('61000000-0000-4000-8000-000000000005','60000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Bem passada',null,0,true,30),
('61000000-0000-4000-8000-000000000006','60000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Bacon',null,4,true,10),
('61000000-0000-4000-8000-000000000007','60000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Cheddar',null,3,true,20),
('61000000-0000-4000-8000-000000000008','60000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Ovo',null,2,true,30),
('61000000-0000-4000-8000-000000000009','60000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Hambúrguer adicional',null,8,true,40),
('61000000-0000-4000-8000-000000000010','60000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','Cebola',null,0,true,10),
('61000000-0000-4000-8000-000000000011','60000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','Tomate',null,0,true,20),
('61000000-0000-4000-8000-000000000012','60000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','Alface',null,0,true,30),
('61000000-0000-4000-8000-000000000013','60000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','Molho da casa',null,0,true,40),
('61000000-0000-4000-8000-000000000014','60000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','300 ml',null,0,true,10),
('61000000-0000-4000-8000-000000000015','60000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','500 ml',null,5,true,20),
('61000000-0000-4000-8000-000000000016','60000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','700 ml',null,9,true,30),
('61000000-0000-4000-8000-000000000017','60000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','Granola',null,2,true,10),
('61000000-0000-4000-8000-000000000018','60000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','Leite em pó',null,3,true,20),
('61000000-0000-4000-8000-000000000019','60000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','Banana',null,2,true,30),
('61000000-0000-4000-8000-000000000020','60000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','Paçoca',null,2,true,40),
('61000000-0000-4000-8000-000000000021','60000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001','Média',null,0,true,10),
('61000000-0000-4000-8000-000000000022','60000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001','Grande',null,8,true,20)
on conflict(id) do update set name=excluded.name,description=excluded.description,price_delta=excluded.price_delta,active=excluded.active,sort_order=excluded.sort_order;

insert into public.food_product_option_groups(store_id,product_id,option_group_id,sort_order) values
('00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',10),
('00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002',20),
('00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003',30),
('00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000004',40),
('00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000005','60000000-0000-4000-8000-000000000005',10),
('00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000005','60000000-0000-4000-8000-000000000006',20),
('00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000007',10)
on conflict(product_id,option_group_id) do update set sort_order=excluded.sort_order,store_id=excluded.store_id;

insert into public.food_delivery_zones(id,store_id,name,aliases,city,state,fee,active,sort_order) values
('50000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Centro','{}','Linhares','ES',5,true,10),
('50000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Shell',array['Pó do Shell','Po do Shell'],'Linhares','ES',7,true,20),
('50000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Interlagos','{}','Linhares','ES',8,true,30),
('50000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','Aviso','{}','Linhares','ES',10,true,40),
('50000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','Jardim Laguna',array['Jardim Laguna I','Jardim Laguna II'],'Linhares','ES',10,true,50)
on conflict(id) do update set name=excluded.name,aliases=excluded.aliases,city=excluded.city,state=excluded.state,fee=excluded.fee,active=excluded.active,sort_order=excluded.sort_order;

insert into public.food_store_subscriptions(id,store_id,plan_id,status,started_at,expires_at,billing_amount)
select '41000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',p.id,'trial',now(),now()+interval '15 days',0 from public.food_plans p where p.code='DEMO'
on conflict(id) do update set plan_id=excluded.plan_id,status=excluded.status,expires_at=excluded.expires_at,billing_amount=excluded.billing_amount;
