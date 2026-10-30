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
  const category = randomUUID(), pacoca = randomUUID();
  await query("insert into food_store_users values($1,$2,true,'owner')", [store,owner]);
  await query('insert into food_categories values($1,$2,true)', [category,store]);
  await query("insert into food_products(id,store_id,name,track_stock,stock_quantity,stock_reserved_quantity,stock_status,availability_status,category_id) values($1,$2,'Paçoca sintética',true,5,0,'available','available',$3)", [pacoca,store,category]);
  await query('insert into food_product_location_stock(store_id,product_id,location_id,stock_quantity,stock_reserved_quantity) values($1,$2,$3,0,0),($1,$2,$4,5,0)', [store,pacoca,pointA,pointB]);
  const payload = (status, quantity = 1, key = randomUUID()) => ({ store_id:store,stock_location_id:pointB,admin_request_id:key,customer_name:'Venda sintética',delivery_type:'pickup',source:'counter',payment_method:'cash',status,received:false,items:[{product_id:pacoca,quantity,options:[]}] });
  const create = input => one('select * from food_create_admin_order_v1($1::jsonb)', [JSON.stringify(input)]);
  await create(payload('received',2));
  const locationStock = () => one('select stock_quantity,stock_reserved_quantity from food_product_location_stock where product_id=$1 and location_id=$2',[pacoca,pointB]);
  equal((await locationStock()).stock_reserved_quantity,2,'avulso aberto reserva duas no ponto');
  const sale = payload('delivered');
  const saved = await create(sale);
  equal((await locationStock()).stock_quantity,4,'avulso entregue debita uma das três disponíveis');
  equal((await locationStock()).stock_reserved_quantity,2,'reserva de outro pedido preservada');
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
  console.log(`OK: ${checks} verificações de reserva, pagamento, entrega, idempotência e local.`);
} finally { await db.close(); }
