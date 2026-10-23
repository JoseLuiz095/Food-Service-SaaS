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
    create function food_reconcile_order_recipe_consumption(uuid,boolean) returns void language plpgsql as $begin return; end;$;
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
  console.log(`OK: ${checks} verificações de reserva, pagamento, entrega, idempotência e local.`);
} finally { await db.close(); }
