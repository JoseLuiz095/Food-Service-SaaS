// Read-only investigation helper: reproduces an EXISTING defect using synthetic
// rows in disposable PGlite. No Supabase credentials, network or remote writes.
// A passing audit confirms the defect; it does NOT certify the behavior as safe.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const extract = (file, name) => {
  const sql = readFileSync(`supabase/migrations/${file}`, 'utf8');
  const start = sql.toLowerCase().indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, name);
  const end = sql.indexOf('$$;', start);
  assert.ok(end > start, name);
  return sql.slice(start, end + 3);
};
const db = new PGlite();
const q = (sql, params = []) => db.query(sql, params);
const one = async (sql, params = []) => (await q(sql, params)).rows[0];
const store = randomUUID(), otherStore = randomUUID(), owner = randomUUID(), outsider = randomUUID();
const main = randomUUID(), pickup = randomUUID(), product = randomUUID(), order = randomUUID(), item = randomUUID();
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
try {
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table food_stores(id uuid primary key,opening_hours jsonb default '{}');
    create table food_store_users(store_id uuid,user_id uuid);
    create function food_is_store_admin(uuid) returns boolean language sql stable as $$select exists(select 1 from food_store_users where store_id=$1 and user_id=auth.uid())$$;
    create function food_is_platform_admin() returns boolean language sql stable as $$select false$$;
    create table food_products(id uuid primary key,store_id uuid,name text,active boolean default true,availability_status text default 'available',stock_status text default 'available',price numeric default 10,promotional_price numeric,track_stock boolean default true,stock_quantity integer default 10,stock_reserved_quantity integer default 0,updated_at timestamptz default now());
    create table food_orders(id uuid primary key,store_id uuid,stock_location_id uuid,pickup_location_id uuid,payment_status text default 'pending',status text default 'received',inventory_status text default 'not_tracked',scheduled_for timestamptz,desired_date date,delivery_fee numeric default 0,payment_method text default 'pix',needs_change boolean default false,change_for numeric,change_amount numeric,subtotal numeric,total numeric,updated_at timestamptz default now());
    create table food_order_items(id uuid primary key default gen_random_uuid(),order_id uuid,product_id uuid,product_name text,quantity integer,unit_price numeric,variant_name text,variant_price_delta numeric,addons jsonb,item_total numeric,inventory_reserved_quantity integer default 0,created_at timestamptz default now());
    create table food_option_groups(id uuid,store_id uuid,active boolean,min_choices integer);
    create table food_product_option_groups(product_id uuid,option_group_id uuid,store_id uuid);
    create table food_stock_locations(id uuid primary key default gen_random_uuid(),store_id uuid,name text,location_type text,is_default boolean default false,active boolean default true);
    create table food_product_location_stock(store_id uuid,product_id uuid,location_id uuid,stock_quantity integer default 0,stock_reserved_quantity integer default 0,updated_at timestamptz default now(),primary key(product_id,location_id),check(stock_quantity>=0 and stock_reserved_quantity>=0 and stock_reserved_quantity<=stock_quantity));
    create table food_order_stock_movements(order_item_id uuid,event_type text);
    create function food_commit_order_inventory(uuid) returns void language plpgsql as $$begin raise exception 'Not part of this edit audit'; end$$;
  `);
  const ledger = '20261023153000_food_sales_fulfillment_location_ledger.sql';
  for (const name of ['food_sync_default_location_stock','food_reserve_product_inventory','food_release_order_inventory','food_reserve_inventory_on_item_insert']) await db.exec(extract(ledger, name));
  await db.exec(extract('20261022175933_food_operational_rpc_repair.sql','food_update_order_items_v1'));
  await q('insert into food_stores(id) values($1),($2)', [store,otherStore]);
  await q('insert into food_store_users values($1,$2),($3,$4)', [store,owner,otherStore,outsider]);
  await q('insert into food_stock_locations(id,store_id,name,is_default) values($1,$3,\'Principal\',true),($2,$3,\'Retirada\',false)', [main,pickup,store]);
  await q('insert into food_products(id,store_id,name,stock_quantity) values($1,$2,\'Produto sintético\',10)',[product,store]);
  await q('insert into food_product_location_stock(store_id,product_id,location_id,stock_quantity) values($1,$2,$3,5),($1,$2,$4,5)',[store,product,main,pickup]);
  await db.exec(`create trigger sync_stock after update of stock_quantity,stock_reserved_quantity on food_products for each row execute function food_sync_default_location_stock();
    create trigger reserve_item after insert on food_order_items for each row execute function food_reserve_inventory_on_item_insert();`);
  await q('insert into food_orders(id,store_id,stock_location_id) values($1,$2,$3)',[order,store,pickup]);
  await q('insert into food_order_items(id,order_id,product_id,product_name,quantity,unit_price,item_total) values($1,$2,$3,\'Sintético\',1,10,10)',[item,order,product]);
  const reserved = async location => Number((await one('select stock_reserved_quantity from food_product_location_stock where product_id=$1 and location_id=$2',[product,location])).stock_reserved_quantity);
  check(await reserved(pickup) === 1 && await reserved(main) === 0,'initial item reserves selected pickup');
  await q("select set_config('test.user',$1,false)",[owner]);
  const edit = quantity => q('select * from food_update_order_items_v1($1,$2)',[order,JSON.stringify([{item_id:item,quantity}])]);
  await edit(2);
  check(await reserved(main) === 2 && await reserved(pickup) === 0,'DEFECT REPRODUCED: edit silently reserves main instead of pickup');
  check((await one('select stock_location_id from food_orders where id=$1',[order])).stock_location_id === pickup,'order still reports pickup, hiding incorrect reservation');
  check((await one('select stock_quantity from food_products where id=$1',[product])).stock_quantity === 10,'edit does not debit physical stock');
  const beforeFailure = await reserved(main);
  await assert.rejects(() => edit(99)); checks++;
  check(await reserved(main) === beforeFailure,'failed edit rolls back temporary release');
  await q("select set_config('test.user',$1,false)",[outsider]);
  await assert.rejects(() => edit(1),/Acesso negado/); checks++;
  await q("select set_config('test.user','',false)");
  await assert.rejects(() => edit(1),/Acesso negado/); checks++;
  console.log(`Audit: ${checks} checks. Existing edit-location defect reproduced with synthetic data; NOT fixed or deployed.`);
} finally { await db.close(); }
