import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const sql = readFileSync('supabase/migrations/20261023153000_food_sales_fulfillment_location_ledger.sql', 'utf8');
const db = new PGlite();
const fn = (name) => {
  const start = sql.toLowerCase().indexOf('create or replace function public.' + name + '(');
  assert.ok(start >= 0, name + ' consta da migration');
  const end = sql.indexOf(name === 'food_sync_default_location_stock' || name === 'food_commit_inventory_on_fulfillment' ? '$$;' : '$function$;', start);
  assert.ok(end > start, name + ' possui delimitador completo');
  return sql.slice(start, end + (sql.slice(end, end + 3) === '$$;' ? 3 : 11));
};
const query = async (statement, params = []) => (await db.query(statement, params)).rows;
const one = async (statement, params = []) => (await query(statement, params))[0];
const store = randomUUID(), owner = randomUUID(), product = randomUUID();
const pointA = randomUUID(), pointB = randomUUID();
let checks = 0;
const equal = (actual, expected, message) => { assert.equal(Number(actual), expected, message); checks++; };
try {
  await db.exec(`
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table food_stores(id uuid primary key,opening_hours jsonb default '{}'::jsonb);
    create table food_products(id uuid primary key,store_id uuid,name text,track_stock boolean,
      stock_quantity integer,stock_reserved_quantity integer,stock_status text,availability_status text,updated_at timestamptz);
    create table food_stock_locations(id uuid primary key,store_id uuid,is_default boolean,active boolean);
    create table food_product_location_stock(store_id uuid,product_id uuid,location_id uuid,
      stock_quantity integer,stock_reserved_quantity integer,updated_at timestamptz,primary key(product_id,location_id));
    create table food_orders(id uuid primary key,store_id uuid,status text,inventory_status text,
      payment_status text,payment_received_at timestamptz,payment_confirmed_by uuid,total numeric,
      scheduled_for timestamptz,desired_date date,stock_location_id uuid,updated_at timestamptz);
    create table food_order_items(id uuid primary key default gen_random_uuid(),order_id uuid,product_id uuid,
      quantity integer,inventory_reserved_quantity integer default 0,created_at timestamptz default now());
    create table food_inventory_order_consumptions(order_id uuid,target_quantity integer,consumed_quantity integer);
    create table food_order_stock_movements(id uuid default gen_random_uuid(),store_id uuid,order_id uuid,
      order_item_id uuid,product_id uuid,location_id uuid,event_type text,quantity integer,created_at timestamptz default now(),
      unique(order_item_id,event_type));
    create function food_is_store_admin(uuid) returns boolean language sql stable as $$select true$$;
    create function food_is_platform_admin() returns boolean language sql stable as $$select false$$;
    create function food_reconcile_order_recipe_consumption(uuid,boolean) returns void language plpgsql as $$begin return; end;$$;
  `);
  for (const name of ['food_sync_default_location_stock','food_reserve_product_inventory',
    'food_commit_order_inventory','food_release_order_inventory','food_reserve_inventory_on_item_insert',
    'food_confirm_order_payment_v1','food_commit_inventory_on_fulfillment']) await db.exec(fn(name));
  await db.exec(`
    create trigger sync_location after update of stock_quantity,stock_reserved_quantity,track_stock on food_products
      for each row execute function food_sync_default_location_stock();
    create trigger reserve_item after insert on food_order_items
      for each row execute function food_reserve_inventory_on_item_insert();
    create trigger fulfill after update of status on food_orders
      for each row execute function food_commit_inventory_on_fulfillment();
  `);
  await db.exec(readFileSync('supabase/migrations/20261030140812_fix_multi_item_quick_sale_reservation.sql', 'utf8'));
  await query('insert into auth.users values ($1)', [owner]);
  await query("select set_config('test.user',$1,false)", [owner]);
  await query('insert into food_stores(id) values ($1)', [store]);
  await query('insert into food_stock_locations values ($1,$3,true,true),($2,$3,false,true)', [pointA,pointB,store]);
  await query("insert into food_products(id,store_id,name,track_stock,stock_quantity,stock_reserved_quantity,stock_status,availability_status) values ($1,$2,'Pipoca',true,25,0,'available','available')", [product,store]);
  await query('insert into food_product_location_stock(store_id,product_id,location_id,stock_quantity,stock_reserved_quantity) values ($1,$2,$3,10,0),($1,$2,$4,15,0)', [store,product,pointA,pointB]);
  const first = randomUUID();
  await query("insert into food_orders(id,store_id,status,inventory_status,payment_status,total,stock_location_id) values ($1,$2,'received','not_tracked','pending',30,$3)", [first,store,pointB]);
  await query('insert into food_order_items(order_id,product_id,quantity) values ($1,$2,3)', [first,product]);
  let b = await one('select stock_quantity,stock_reserved_quantity from food_product_location_stock where location_id=$1 and product_id=$2', [pointB,product]);
  equal(b.stock_quantity,15,'pedido pendente não reduz físico do ponto B');
  equal(b.stock_reserved_quantity,3,'pedido pendente reserva três no ponto B');
  await query('select food_confirm_order_payment_v1($1)', [first]);
  b = await one('select stock_quantity,stock_reserved_quantity from food_product_location_stock where location_id=$1 and product_id=$2', [pointB,product]);
  equal(b.stock_quantity,15,'pagamento confirmado não entrega o produto');
  await query("update food_orders set status='delivered' where id=$1", [first]);
  await query("update food_orders set status='delivered' where id=$1", [first]);
  b = await one('select stock_quantity,stock_reserved_quantity from food_product_location_stock where location_id=$1 and product_id=$2', [pointB,product]);
  equal(b.stock_quantity,12,'entrega reduz físico uma vez no ponto B');
  equal(b.stock_reserved_quantity,0,'entrega limpa reserva');
  const a = await one('select stock_quantity from food_product_location_stock where location_id=$1 and product_id=$2', [pointA,product]);
  equal(a.stock_quantity,10,'estoque A inalterado');
  const movements = await one('select count(*) n from food_order_stock_movements where order_id=$1', [first]);
  equal(movements.n,1,'um movimento de saída por item');
  const cancelled = randomUUID();
  await query("insert into food_orders(id,store_id,status,inventory_status,payment_status,total,stock_location_id) values ($1,$2,'received','not_tracked','pending',30,$3)", [cancelled,store,pointB]);
  await query('insert into food_order_items(order_id,product_id,quantity) values ($1,$2,3)', [cancelled,product]);
  await query('select food_release_order_inventory($1)', [cancelled]);
  b = await one('select stock_quantity,stock_reserved_quantity from food_product_location_stock where location_id=$1 and product_id=$2', [pointB,product]);
  equal(b.stock_quantity,12,'liberar reserva não adiciona ao físico');
  equal(b.stock_reserved_quantity,0,'liberação remove reserva');
  const productTotal = await one('select stock_quantity,stock_reserved_quantity from food_products where id=$1', [product]);
  equal(productTotal.stock_quantity,22,'total geral acompanha os dois pontos');
  equal(productTotal.stock_reserved_quantity,0,'total global sem reserva após ciclo');

  // Exercise the complete admin RPC, including its request key, against SQL.
  // Point B reproduces five physical units, two reserved and three available;
  // the default location has no stock for this product.
  await db.exec(`
    create table food_store_users(store_id uuid,user_id uuid,active boolean,role text);
    create table food_categories(id uuid primary key,store_id uuid,active boolean);
    alter table food_products add category_id uuid,add active boolean default true,
      add price numeric default 10,add promotional_price numeric,add preparation_time_minutes integer;
    alter table food_orders add order_number bigint generated by default as identity,
      add customer_name text,add customer_phone text,add delivery_type text,add source text,
      add payment_method text,add notes text,add review_confirmed boolean,add subtotal numeric,
      add preparation_estimate_minutes integer,add admin_request_id uuid,add admin_request_fingerprint text;
    alter table food_orders add unique(store_id,admin_request_id);
    alter table food_order_items add product_name text,add unit_price numeric,add variant_name text,
      add variant_price_delta numeric,add addons jsonb,add item_total numeric;
    create table food_option_groups(id uuid,store_id uuid,name text,kind text,active boolean,min_choices int,max_choices int,sort_order int);
    create table food_product_option_groups(product_id uuid,option_group_id uuid,store_id uuid,sort_order int);
    create table food_option_items(id uuid,group_id uuid,store_id uuid,name text,active boolean,price_delta numeric);
    create table food_order_item_options(order_item_id uuid,option_group_id uuid,option_item_id uuid,group_name text,option_name text,option_kind text,price_delta numeric,quantity int);
  `);
  await db.exec(fn('food_create_admin_order_v1'));
  const category = randomUUID(), pacoca = randomUUID(), ninho = randomUUID();
  await query("insert into food_store_users values($1,$2,true,'owner')", [store,owner]);
  await query('insert into food_categories values($1,$2,true)', [category,store]);
  await query("insert into food_products(id,store_id,name,track_stock,stock_quantity,stock_reserved_quantity,stock_status,availability_status,category_id) values($1,$2,'Paçoca sintética',true,5,0,'available','available',$3)", [pacoca,store,category]);
  await query("insert into food_products(id,store_id,name,track_stock,stock_quantity,stock_reserved_quantity,stock_status,availability_status,category_id) values($1,$2,'Ninho sintético',true,5,0,'available','available',$3)", [ninho,store,category]);
  await query('insert into food_product_location_stock(store_id,product_id,location_id,stock_quantity,stock_reserved_quantity) values($1,$2,$3,0,0),($1,$2,$4,5,0)', [store,pacoca,pointA,pointB]);
  await query('insert into food_product_location_stock(store_id,product_id,location_id,stock_quantity,stock_reserved_quantity) values($1,$2,$3,0,0),($1,$2,$4,5,0)', [store,ninho,pointA,pointB]);
  const payload = (status, quantity = 1, key = randomUUID()) => ({ store_id:store,stock_location_id:pointB,admin_request_id:key,customer_name:'Venda sintética',delivery_type:'pickup',source:'counter',payment_method:'cash',status,received:false,items:[{product_id:pacoca,quantity,options:[]}] });
  const create = input => one('select * from food_create_admin_order_v1($1::jsonb)', [JSON.stringify(input)]);
  await create(payload('received',2));
  const locationStock = () => one('select stock_quantity,stock_reserved_quantity from food_product_location_stock where product_id=$1 and location_id=$2',[pacoca,pointB]);
  equal((await locationStock()).stock_reserved_quantity,2,'avulso aberto reserva duas no ponto');
  const sale = payload('delivered');
  sale.items.push({product_id:ninho,quantity:1,options:[]});
  const saved = await create(sale);
  equal((await locationStock()).stock_quantity,4,'avulso com várias linhas debita no local escolhido');
  equal((await locationStock()).stock_reserved_quantity,2,'reserva de outro pedido preservada');
  equal((await one('select stock_quantity from food_product_location_stock where product_id=$1 and location_id=$2',[ninho,pointB])).stock_quantity,4,'segunda linha do avulso também é baixada');
  equal((await one('select count(*) n from food_order_stock_movements where order_id=$1',[saved.order_id])).n,2,'avulso com várias linhas grava um movimento por item');
  const replay = await create(sale);
  assert.equal(replay.order_id,saved.order_id); checks++;
  equal((await locationStock()).stock_quantity,4,'retry do RPC não duplica baixa');
  await create(payload('picked_up'));
  equal((await locationStock()).stock_quantity,3,'segunda venda com chave nova debita normalmente');
  equal((await one('select stock_quantity from food_product_location_stock where product_id=$1 and location_id=$2',[pacoca,pointA])).stock_quantity,0,'avulsos não usam o saldo do local padrão');
  equal((await one("select count(*) n from food_order_stock_movements where product_id=$1 and location_id=$2 and event_type='sale'",[pacoca,pointB])).n,2,'duas saídas no ponto com ledger único');
  await assert.rejects(()=>create(payload('delivered',2)),/Estoque insuficiente/); checks++;
  equal((await locationStock()).stock_quantity,3,'falta de saldo reverte a venda integralmente');
  await assert.rejects(()=>create({...sale,items:[{product_id:pacoca,quantity:2,options:[]}]}),/chave já foi usada/); checks++;

  // Run the receipt transaction with the REAL location reservation/debit/ledger
  // functions above, rather than a trigger that merely changes a status.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema auth to authenticated,service_role;
    alter table food_stores add active boolean default true, add access_status text default 'online',add updated_at timestamptz;
    alter table food_orders add created_at timestamptz default now(),add pickup_location_id uuid;
    alter table food_stock_locations add updated_at timestamptz,add unique(id,store_id);
    create table food_pickup_locations(id uuid primary key,store_id uuid references food_stores,
      stock_location_id uuid,name text,active boolean default true,is_public boolean default true,
      updated_at timestamptz,unique(id,store_id));
    create function food_store_accessible(uuid) returns boolean language sql as $$select true$$;
    create function food_dashboard_metrics_v1(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
    create table food_platform_event_log(actor_user_id uuid,store_id uuid,kind text,action text,result text,route text,metadata jsonb);
    create table food_stock_location_movements(store_id uuid,from_location_id uuid,to_location_id uuid);
    create table food_financial_entries(id uuid default gen_random_uuid(),store_id uuid,direction text,source text,order_id uuid,
      category_id uuid,description text,amount numeric,occurred_on date,paid_at timestamptz,status text,
      payment_method text,counterparty text,document_type text,document_number text,notes text,created_by uuid,updated_at timestamptz);
    create unique index on food_financial_entries(store_id,order_id) where source='order' and order_id is not null;
    create table food_financial_categories(id uuid default gen_random_uuid(),store_id uuid,name text);
    create function food_seed_financial_categories(uuid) returns void language sql as $$insert into food_financial_categories(store_id,name) select $1,'Vendas' where not exists(select 1 from food_financial_categories where store_id=$1)$$;
  `);
  await db.exec(readFileSync('supabase/migrations/20261028143000_food_receipt_contacts.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261030185746_food_point_contacts_and_location_lifecycle.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261030213000_food_single_point_receipt_contact.sql','utf8'));
  const finance=readFileSync('supabase/migrations/202609041610_foodweb_v049_order_payment_finance.sql','utf8');
  await db.exec(finance.slice(finance.indexOf('create or replace function public.food_sync_order_financial_entry()'),finance.indexOf('create or replace function public.food_confirm_order_payment_v1')));
  await db.exec(readFileSync('supabase/migrations/20261029171540_food_customer_receipt_payment.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261030160000_food_pickup_receipt_closeout.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261031004025_food_receipt_pickup_integrity.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261030002410_food_fulfillment_reserve_location.sql','utf8'));
  await db.exec('grant all on all tables in schema public to service_role');
  const pickup=randomUUID(),receiptOrder=randomUUID();
  await query('insert into food_pickup_locations(id,store_id,stock_location_id,name)values($1,$2,$3,\'Ponto fictício\')',[pickup,store,pointB]);
  await query('select food_save_pickup_point_contacts_v1($1,$2,$3::jsonb)',[store,pickup,JSON.stringify([{slot:1,name:'Contato sintético',phone:'5511000000001'}])]);
  await query('select food_save_receipt_policy_v2($1,\'[]\'::jsonb,\'[]\'::jsonb,true,$2::jsonb)',[store,JSON.stringify([pickup])]);checks++;
  await query("insert into food_orders(id,store_id,status,inventory_status,payment_status,total,stock_location_id,pickup_location_id,source,delivery_type,payment_method)values($1,$2,'received','not_tracked','pending',20,$3,$4,'site','pickup','pix')",[receiptOrder,store,pointB,pickup]);
  await query("select set_config('food.order_stock_location',$1,false)",[pointB]);
  await query('insert into food_order_items(order_id,product_id,quantity)values($1,$2,2)',[receiptOrder,ninho]);
  await db.exec('set role service_role');
  const declare=()=>one('select food_declare_order_receipt_v1($1,$2,20,0) v',[store,receiptOrder]);
  const declared=await declare();assert.equal(declared.v.autoPickedUp,true);checks++;
  const after=await one('select payment_status,status,payment_received_at from food_orders where id=$1',[receiptOrder]);
  assert.deepEqual(after,{payment_status:'paid',status:'picked_up',payment_received_at:null});checks++;
  equal((await one('select stock_quantity from food_product_location_stock where product_id=$1 and location_id=$2',[ninho,pointB])).stock_quantity,2,'comprovante baixa duas unidades no ponto B');
  equal((await one('select stock_quantity from food_product_location_stock where product_id=$1 and location_id=$2',[ninho,pointA])).stock_quantity,0,'comprovante não usa local principal');
  assert.equal((await one('select status from food_financial_entries where order_id=$1',[receiptOrder])).status,'pending');checks++;
  await declare();
  equal((await one('select count(*) n from food_order_stock_movements where order_id=$1',[receiptOrder])).n,1,'retry de comprovante não duplica saída física');
  const shortOrder=randomUUID();
  await query("insert into food_orders(id,store_id,status,inventory_status,payment_status,total,stock_location_id,pickup_location_id,source,delivery_type,payment_method)values($1,$2,'received','not_tracked','pending',20,$3,$4,'site','pickup','pix')",[shortOrder,store,pointB,pickup]);
  await query('insert into food_order_items(order_id,product_id,quantity)values($1,$2,1)',[shortOrder,ninho]);
  await query('update food_order_items set inventory_reserved_quantity=0 where order_id=$1',[shortOrder]);
  await assert.rejects(()=>query('select food_declare_order_receipt_v1($1,$2,20,0)',[store,shortOrder]),/reserva integral/);checks++;
  assert.equal((await one('select payment_status from food_orders where id=$1',[shortOrder])).payment_status,'pending');checks++;
  equal((await one('select count(*) n from food_order_stock_movements where order_id=$1',[shortOrder])).n,0,'reserva incompleta não cria saída');
  equal((await one('select stock_quantity from food_product_location_stock where product_id=$1 and location_id=$2',[ninho,pointB])).stock_quantity,2,'reserva incompleta não retira saldo restante');
  await query("update food_orders set status='cancelled' where id=$1",[receiptOrder]);
  await assert.rejects(declare,/não aceita declaração/);checks++;
  console.log(`OK: ${checks} verificações de reserva, pagamento, entrega, idempotência e local.`);
} finally { await db.close(); }
