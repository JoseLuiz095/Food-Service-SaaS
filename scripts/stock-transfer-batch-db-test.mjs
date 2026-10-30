import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const baseMigration = readFileSync('supabase/migrations/20261023140000_food_multilocation_stock.sql', 'utf8');
const fastFlowMigration = readFileSync('supabase/migrations/20261026112835_food_location_stock_fast_flow.sql', 'utf8');
const balanceBootstrapMigration = readFileSync('supabase/migrations/20261026115308_food_stock_location_balance_bootstrap.sql', 'utf8');
const db = new PGlite();
const q = (sql, params = []) => db.query(sql, params);
const one = async (sql, params = []) => (await q(sql, params)).rows[0];
const extractFunction = (sql, name) => {
  const start = sql.toLowerCase().indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `${name} exists in its migration source`);
  const end = sql.indexOf('\n$$;', start);
  assert.ok(end > start, `${name} has a complete function body`);
  return sql.slice(start, end + 4);
};
const random = randomUUID;
const storeId = random(), otherStoreId = random(), ownerId = random(), outsiderId = random();
const sourceId = random(), targetId = random();
const firstProductId = random(), secondProductId = random(), reservedProductId = random(), foreignProductId = random();
const newlyCreatedProductId = random();
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const rejects = async (operation, label, expectedMessage) => {
  let error;
  try { await operation(); } catch (cause) { error = cause; }
  assert.ok(error, label);
  if (expectedMessage) assert.match(String(error.message), expectedMessage, label);
  checks++;
};

try {
  await db.exec(`
    create role authenticated;
    create role anon;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('test.user', true), '')::uuid $$;
    create table public.food_stores(id uuid primary key, opening_hours jsonb not null default '{}'::jsonb);
    create table public.food_store_users(
      store_id uuid not null, user_id uuid not null, active boolean not null default true, role text not null default 'owner'
    );
    create function public.food_is_store_admin(p_store_id uuid) returns boolean
      language sql stable security definer set search_path = ''
      as $$ select exists (
        select 1 from public.food_store_users
        where store_id = p_store_id and user_id = auth.uid() and active and role in ('owner','admin','manager')
      ) $$;
    create function public.food_store_accessible(p_store_id uuid) returns boolean
      language sql stable security definer set search_path = ''
      as $$ select exists (select 1 from public.food_stores where id = p_store_id) $$;
    create table public.food_products(
      id uuid primary key, store_id uuid not null, name text not null default 'Produto', active boolean not null default true,
      track_stock boolean not null default true, stock_quantity integer not null default 0,
      stock_reserved_quantity integer not null default 0, stock_status text not null default 'available',
      availability_status text not null default 'available', updated_at timestamptz not null default now()
    );
    create table public.food_stock_locations(
      id uuid primary key, store_id uuid not null, name text not null default 'Local',
      is_default boolean not null default false, active boolean not null default true
    );
    create table public.food_pickup_locations(
      id uuid primary key, store_id uuid not null, stock_location_id uuid, name text not null default 'Retirada',
      short_code text, address text, instructions text, is_public boolean not null default false,
      active boolean not null default true, sort_order integer not null default 0
    );
    create table public.food_product_location_stock(
      store_id uuid not null, product_id uuid not null, location_id uuid not null,
      stock_quantity integer not null check (stock_quantity >= 0),
      stock_reserved_quantity integer not null default 0 check (stock_reserved_quantity >= 0),
      updated_at timestamptz not null default now(), primary key (product_id, location_id)
    );
    create table public.food_orders(
      id uuid primary key default gen_random_uuid(), store_id uuid not null,
      source text, delivery_type text, pickup_location_id uuid, stock_location_id uuid,
      status text not null default 'received'
    );
    create table public.food_order_items(
      id uuid primary key default gen_random_uuid(), order_id uuid not null, product_id uuid, quantity integer not null
    );
    create table public.food_order_stock_movements(
      id bigint generated always as identity primary key, store_id uuid not null, product_id uuid not null,
      location_id uuid not null, event_type text not null, quantity integer not null, created_at timestamptz not null default now()
    );
    create table public.food_stock_location_movements(
      id bigint generated always as identity primary key, store_id uuid not null, product_id uuid not null,
      from_location_id uuid, to_location_id uuid, movement_type text not null, quantity integer not null,
      request_payload jsonb not null, reason text not null, idempotency_key uuid not null,
      created_by uuid, created_at timestamptz not null default now(), unique (store_id, idempotency_key)
    );
    grant usage on schema public, auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    grant execute on function public.food_is_store_admin(uuid) to authenticated;
    grant execute on function public.food_store_accessible(uuid) to authenticated, anon;
    grant insert, select, update on public.food_orders, public.food_order_items to authenticated;
  `);

  await db.exec(extractFunction(baseMigration, 'food_adjust_location_stock_v1'));
  await db.exec(extractFunction(baseMigration, 'food_transfer_location_stock_v1'));
  await db.exec(extractFunction(baseMigration, 'food_initialize_location_balances'));
  await db.exec(`
    revoke all on function public.food_adjust_location_stock_v1(uuid,uuid,uuid,integer,text,uuid) from public, anon;
    grant execute on function public.food_adjust_location_stock_v1(uuid,uuid,uuid,integer,text,uuid) to authenticated;
    revoke all on function public.food_transfer_location_stock_v1(uuid,uuid,uuid,uuid,integer,text,uuid) from public, anon;
    grant execute on function public.food_transfer_location_stock_v1(uuid,uuid,uuid,uuid,integer,text,uuid) to authenticated;
  `);
  await db.exec(fastFlowMigration);

  await q('insert into auth.users(id) values ($1),($2)', [ownerId, outsiderId]);
  await q('insert into public.food_stores(id) values ($1),($2)', [storeId, otherStoreId]);
  await q("insert into public.food_store_users(store_id,user_id) values ($1,$2),($3,$4)", [storeId, ownerId, otherStoreId, outsiderId]);
  await q(`insert into public.food_stock_locations(id,store_id,is_default) values ($1,$3,true),($2,$3,false)`,
    [sourceId, targetId, storeId]);
  const pickupLocationId = random(), emptyLocationId = random();
  await q('insert into public.food_stock_locations(id,store_id,is_default) values ($1,$2,false)', [emptyLocationId, storeId]);
  await q('insert into public.food_pickup_locations(id,store_id,stock_location_id,is_public) values ($1,$2,$3,true)',
    [pickupLocationId, storeId, targetId]);
  await q('insert into public.food_products(id,store_id) values ($1,$5),($2,$5),($3,$5),($4,$6)',
    [firstProductId, secondProductId, reservedProductId, foreignProductId, storeId, otherStoreId]);
  await q(`insert into public.food_product_location_stock(store_id,product_id,location_id,stock_quantity,stock_reserved_quantity)
    values ($1,$2,$3,20,2),($1,$2,$4,10,0),($1,$5,$3,10,0)`,
    [storeId, firstProductId, sourceId, targetId, secondProductId]);
  await q(`insert into public.food_product_location_stock(store_id,product_id,location_id,stock_quantity,stock_reserved_quantity)
    values ($1,$2,$3,10,8),($1,$2,$4,0,0)`, [storeId, reservedProductId, sourceId, targetId]);
  await db.exec(balanceBootstrapMigration);

  const session = async (userId, role = 'authenticated') => {
    await db.exec('reset role');
    await q('select set_config(\'test.user\',$1,false)', [userId || '']);
    await db.exec(`set role ${role}`);
  };
  const batch = (items, key, from = sourceId, to = targetId, store = storeId) =>
    one('select public.food_transfer_location_stock_batch_v1($1,$2,$3,$4,$5) as result',
      [store, from, to, JSON.stringify(items), key]);
  const balance = async (productId, locationId, store = storeId) => {
    await db.exec('reset role');
    return Number((await one(`select stock_quantity from public.food_product_location_stock
      where store_id=$1 and product_id=$2 and location_id=$3`, [store, productId, locationId])).stock_quantity);
  };
  const moveCount = async (store = storeId) => {
    await db.exec('reset role');
    return Number((await one('select count(*) as count from public.food_stock_location_movements where store_id=$1', [store])).count);
  };

  check(await balance(secondProductId, targetId) === 0,
    'migration backfills a missing active product-location pair with zero');
  check(await balance(firstProductId, sourceId) === 20 && await balance(firstProductId, targetId) === 10,
    'migration preserves existing physical balances');

  await session(ownerId);
  await db.exec('reset role');
  await rejects(() => q('update public.food_stock_locations set active=false where id=$1', [sourceId]),
    'default stock location cannot be deactivated', /principal não pode ser desativado/i);
  await rejects(() => q('update public.food_stock_locations set active=false where id=$1', [targetId]),
    'location with a published pickup point cannot be deactivated', /Transfira os saldos/i);
  await q('update public.food_stock_locations set active=false where id=$1', [emptyLocationId]);
  check((await one('select active from public.food_stock_locations where id=$1', [emptyLocationId])).active === false,
    'empty secondary location can be deactivated');
  await q('delete from public.food_product_location_stock where store_id=$1 and product_id=$2 and location_id=$3',
    [storeId, firstProductId, emptyLocationId]);
  await q('update public.food_stock_locations set active=true where id=$1', [emptyLocationId]);
  check(Number((await one(`select count(*) as count from public.food_product_location_stock
    where store_id=$1 and product_id=$2 and location_id=$3`, [storeId, firstProductId, emptyLocationId])).count) === 1,
    'reactivating a location recreates a missing zero balance');
  await q('update public.food_stock_locations set active=false where id=$1', [emptyLocationId]);
  await db.exec('reset role');
  await rejects(() => q(`insert into public.food_stock_location_movements
    (store_id,product_id,from_location_id,to_location_id,movement_type,quantity,request_payload,reason,idempotency_key)
    values ($1,$2,$3,$4,'transfer',1,'{}','Teste',$5)`,
  [storeId, firstProductId, sourceId, emptyLocationId, random()]), 'movement guard rejects a deactivated destination',
  /Local de estoque indisponível durante a movimentação/i);
  await session(ownerId);

  const key = random();
  const items = [{ product_id: firstProductId, quantity: 4 }, { product_id: secondProductId, quantity: 5 }];
  const first = (await batch(items, key)).result;
  check(first.items.length === 2 && first.replayed === false, 'valid batch moves each requested product');
  check(await balance(firstProductId, sourceId) === 16 && await balance(firstProductId, targetId) === 14,
    'source physical stock and target stock change by the requested amount');
  check(await balance(firstProductId, sourceId) + await balance(firstProductId, targetId) === 30,
    'transfer preserves the product total');
  check(await balance(secondProductId, sourceId) === 5 && await balance(secondProductId, targetId) === 5,
    'second product is transferred in the same call');
  check(await moveCount() === 2, 'one audit movement is stored for each product');

  const replay = (await batch([...items].reverse(), key)).result;
  check(replay.replayed === true && await moveCount() === 2, 'same key and normalized payload replay without duplicate movements');
  await rejects(() => batch([{ product_id: firstProductId, quantity: 3 }], key),
    'reusing the batch key with a different payload is rejected');

  const beforeRollback = await moveCount();
  await rejects(() => batch([{ product_id: firstProductId, quantity: 2 }, { product_id: secondProductId, quantity: 99 }], random()),
    'insufficient balance in a later item rejects the entire batch');
  check(await balance(firstProductId, sourceId) === 16 && await balance(firstProductId, targetId) === 14,
    'failed batch rolls back the earlier product transfer');
  check(await moveCount() === beforeRollback, 'failed batch rolls back audit rows and receipt');

  await rejects(() => batch([{ product_id: firstProductId, quantity: 1 }, { product_id: firstProductId, quantity: 2 }], random()),
    'duplicate product IDs are rejected');
  await rejects(() => batch([{ product_id: firstProductId, quantity: 0 }], random()), 'zero quantity is rejected');
  await rejects(() => batch([{ product_id: firstProductId, quantity: 1.5 }], random()), 'fractional quantity is rejected');
  await rejects(() => batch([{ product_id: firstProductId, quantity: 1 }], random(), sourceId, sourceId),
    'source and destination must be different');
  await rejects(() => batch([{ product_id: reservedProductId, quantity: 3 }], random()),
    'reserved stock is not transferable');
  check(await balance(reservedProductId, sourceId) === 10 && await moveCount() === beforeRollback,
    'reserved-stock rejection leaves balances and history unchanged');
  const reservedTransfer = (await batch([{ product_id: reservedProductId, quantity: 2 }], random())).result;
  check(reservedTransfer.items.length === 1 && await balance(reservedProductId, sourceId) === 8,
    'transfer up to physical minus reserved is accepted');

  const change = (mode, quantity, idempotencyKey) => one(
    'select public.food_change_location_stock_v1($1,$2,$3,$4,$5,$6) as result',
    [storeId, firstProductId, sourceId, mode, quantity, idempotencyKey]);
  const addKey = random();
  await change('add', 2, addKey);
  check(await balance(firstProductId, sourceId) === 18, 'quick relative adjustment adds stock on the server');
  check((await change('add', 2, addKey)).result.replayed === true && await balance(firstProductId, sourceId) === 18,
    'quick adjustment retry does not add twice');
  await change('remove', 1, random());
  check(await balance(firstProductId, sourceId) === 17, 'quick relative adjustment removes stock on the server');
  await change('set', 15, random());
  check(await balance(firstProductId, sourceId) === 15, 'quick absolute adjustment sets the physical balance');

  await db.exec('reset role');
  await q(`update public.food_product_location_stock set stock_reserved_quantity=2
    where store_id=$1 and product_id=$2 and location_id=$3`, [storeId, firstProductId, targetId]);
  await q(`insert into public.food_order_stock_movements(store_id,product_id,location_id,event_type,quantity)
    values ($1,$2,$3,'sale',3),($1,$2,$3,'return',1)`, [storeId, firstProductId, targetId]);
  await session(ownerId);
  const availability = (await one('select public.food_get_public_location_availability_v1($1,$2) as result',
    [storeId, pickupLocationId])).result;
  check(availability.find(row => row.product_id === firstProductId).available === 12,
    'public availability subtracts the local reservation once');
  check(availability.find(row => row.product_id === firstProductId).available_elsewhere === true,
    'public availability exposes only a boolean for other locations');
  const sales = (await one('select public.food_get_location_sales_today_v1($1,$2) as result', [storeId, targetId])).result;
  check(sales.find(row => row.product_id === firstProductId).net_sold === 2,
    'sales summary returns net movements for the selected location');

  const insertOrder = (pickupId, locationId, deliveryType = 'pickup') => one(`insert into public.food_orders
    (store_id,source,delivery_type,pickup_location_id,stock_location_id)
    values ($1,'site',$2,$3,$4) returning id`, [storeId, deliveryType, pickupId, locationId]);
  await db.exec('reset role');
  await rejects(() => insertOrder(null, null), 'public pickup requires an explicit published pickup point', /Selecione um ponto de retirada/i);
  await rejects(() => insertOrder(pickupLocationId, sourceId), 'pickup stock must match the selected pickup point', /não corresponde ao ponto/i);
  await rejects(() => insertOrder(pickupLocationId, targetId, 'delivery'), 'delivery orders cannot include a pickup point', /somente para pedidos de retirada/i);
  const pickupOrderId = (await insertOrder(pickupLocationId, targetId)).id;
  await rejects(() => q('insert into public.food_order_items(order_id,product_id,quantity) values ($1,$2,13)',
    [pickupOrderId, firstProductId]), 'pickup order item cannot exceed local available stock', /restam 12 unidades/i);
  await q('insert into public.food_order_items(order_id,product_id,quantity) values ($1,$2,2)',
    [pickupOrderId, firstProductId]);
  check(Number((await one('select count(*) as count from public.food_order_items where order_id=$1', [pickupOrderId])).count) === 1,
    'valid pickup item persists');

  const stockBeforePickupArchive = await balance(firstProductId, targetId);
  await q('update public.food_pickup_locations set active=false,is_public=false where id=$1 and store_id=$2',
    [pickupLocationId, storeId]);
  const archivedPoint = await one('select active,is_public from public.food_pickup_locations where id=$1', [pickupLocationId]);
  check(archivedPoint.active === false && archivedPoint.is_public === false,
    'archiving a pickup point removes it from new public orders');
  check((await one('select pickup_location_id from public.food_orders where id=$1', [pickupOrderId])).pickup_location_id === pickupLocationId,
    'archiving preserves the point reference on existing orders');
  check(await balance(firstProductId, targetId) === stockBeforePickupArchive,
    'archiving a pickup point does not change its stock or reservations');
  await rejects(() => insertOrder(pickupLocationId, targetId), 'archived pickup point rejects new orders', /ponto de retirada está indisponível/i);

  await db.exec('reset role');
  await q('insert into public.food_products(id,store_id,name) values ($1,$2,$3)',
    [newlyCreatedProductId, storeId, 'New tracked product']);
  check(Number((await one(`select count(*) as count from public.food_product_location_stock
    where store_id=$1 and product_id=$2`, [storeId, newlyCreatedProductId])).count) === 2,
    'new tracked product receives zero rows for all active locations');
  await q(`update public.food_product_location_stock set stock_quantity=5
    where store_id=$1 and product_id=$2 and location_id=$3`, [storeId, newlyCreatedProductId, sourceId]);
  await q('delete from public.food_product_location_stock where store_id=$1 and product_id=$2 and location_id=$3',
    [storeId, newlyCreatedProductId, targetId]);
  const movesBeforeMissingBalance = await moveCount();
  await session(ownerId);
  const missingBalanceTransfer = (await batch([{ product_id: newlyCreatedProductId, quantity: 2 }], random())).result;
  check(missingBalanceTransfer.items[0].from_stock === 3 && missingBalanceTransfer.items[0].to_stock === 2,
    'transfer creates an absent zero destination row and succeeds atomically');
  check(await balance(newlyCreatedProductId, sourceId) === 3 && await balance(newlyCreatedProductId, targetId) === 2,
    'missing-balance transfer preserves the total physical quantity');
  check(await moveCount() === movesBeforeMissingBalance + 1,
    'missing-balance transfer writes exactly one ledger movement');

  await session(outsiderId);
  await rejects(() => batch(items, random()), 'administrator from another store cannot transfer this tenant stock');
  await session(null, 'anon');
  await rejects(() => batch(items, random()), 'anonymous role cannot call the transfer RPC');
  await db.exec('reset role');
  check((await one("select has_function_privilege('authenticated','public.food_transfer_location_stock_batch_v1(uuid,uuid,uuid,jsonb,uuid)','EXECUTE') as allowed")).allowed,
    'authenticated role has execute permission');
  check(!(await one("select has_function_privilege('anon','public.food_transfer_location_stock_batch_v1(uuid,uuid,uuid,jsonb,uuid)','EXECUTE') as allowed")).allowed,
    'anonymous role has no execute permission');
  check(!(await one("select has_table_privilege('authenticated','public.food_stock_transfer_batches','SELECT') as allowed")).allowed,
    'authenticated role has no direct access to idempotency receipts');
  check((await one("select relrowsecurity from pg_class where oid='public.food_stock_transfer_batches'::regclass")).relrowsecurity === true,
    'receipt table has row-level security enabled');
  const signature = await one("select proargnames from pg_proc where oid='public.food_transfer_location_stock_batch_v1(uuid,uuid,uuid,jsonb,uuid)'::regprocedure");
  check(signature.proargnames.join(',') === 'p_store_id,p_from_location_id,p_to_location_id,p_items,p_idempotency_key',
    'batch RPC exposes the exact named arguments used by the frontend');

  console.log(`Stock transfer batch DB test: ${checks} checks passed (PGlite; no remote database).`);
} finally {
  await db.close();
}
