/** Native PostgreSQL, two independent sessions. Never accepts a remote DB URL or loads .env.
 * FOOD_DB_TEST_RUNTIME points to node_modules containing embedded-postgres@17.9.0-beta.17 and pg@8.16.3.
 * Runtime is deliberately external to the application's dependencies. See SUPABASE_PENDING_HANDOFF.md.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtemp, rm, realpath } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { runInventoryTransactionTests } from './inventory-transaction-db-test.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = path.resolve(root, process.env.FOOD_DB_TEST_RUNTIME || '../vendeweb-db-test-runtime/node_modules');
const requireRuntime = createRequire(path.join(runtime, 'food-db-test.cjs'));
const { default: EmbeddedPostgres } = await import(pathToFileURL(requireRuntime.resolve('embedded-postgres')));
const pg = requireRuntime('pg');
pg.types.setTypeParser(20, Number); // Same count(*) representation as the existing PGlite tests.
const password = randomBytes(24).toString('hex');

class LocalPostgres {
  constructor() { this.ready = this.start(); this.clients = new Set(); }
  async start() {
    this.parent = await realpath(tmpdir());
    this.dir = await mkdtemp(path.join(this.parent, 'food-recipe-locks-'));
    const socket = net.createServer();
    await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
    const port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
    this.config = { host: '127.0.0.1', port, user: 'postgres', database: 'postgres', password,
      connectionTimeoutMillis: 10000, options: '-c statement_timeout=20000 -c lock_timeout=15000' };
    this.server = new EmbeddedPostgres({ databaseDir: path.join(this.dir, 'data'), port, user: 'postgres', password,
      authMethod: 'scram-sha-256', persistent: true, initdbFlags: ['--encoding=UTF8', '--locale=C'],
      postgresFlags: ['-h', '127.0.0.1', '-c', 'log_statement=none', '-c', 'log_min_error_statement=panic'],
      onLog: () => {}, onError: () => {},
    });
    await this.server.initialise(); await this.server.start();
    this.client = new pg.Client(this.config); await this.client.connect(); this.clients.add(this.client);
    const version = (await this.client.query('show server_version')).rows[0].server_version;
    assert.match(version, /^17\./); console.log(`Isolated PostgreSQL ${version}, loopback only.`);
  }
  async query(sql, args = []) {
    await this.ready;
    return this.client.query(sql, args.map(v => v !== null && typeof v === 'object' ? JSON.stringify(v) : v));
  }
  async exec(sql) { await this.ready; return this.client.query(sql); }
  async connection() {
    await this.ready; const c = new pg.Client(this.config); await c.connect(); this.clients.add(c); return c;
  }
  async close() {
    await this.ready.catch(() => {});
    await Promise.allSettled([...this.clients].map(c => c.end()));
    if (this.server) await this.server.stop();
    if (this.dir) {
      assert.equal(path.dirname(this.dir), this.parent);
      assert.ok(path.basename(this.dir).startsWith('food-recipe-locks-'));
      await rm(this.dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    }
  }
}

async function concurrentCases({ db, q, one, check, rejects, owner, outsider, storeA, product, item, recipe, session }) {
  const a = await db.connection(), b = await db.connection();
  const begin = async c => { await c.query('reset role'); await c.query('begin'); };
  const waitForLock = async c => {
    const pid = (await c.query('select pg_backend_pid() pid')).rows[0].pid;
    return async () => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        if ((await one("select wait_event_type='Lock' waiting from pg_stat_activity where pid=$1", [pid])).waiting) return;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error('Expected PostgreSQL lock wait did not occur.');
    };
  };
  try {
    for (const c of [a, b]) { await c.query("select set_config('test.user',$1,false)", [owner]); await c.query('set role authenticated'); }
    const stockProduct = randomUUID();
    await q("insert into food_products(id,store_id,name,stock_quantity) values($1,$2,'Concurrent stock',0)", [stockProduct, storeA]);
    const add = (c, key, amount = 1) => c.query('select food_adjust_product_stock_v1($1,$2,$3,$4,$5,$6)', [storeA, stockProduct, 'add', amount, 'Concurrency test', key]);
    await Promise.all([add(a, randomUUID()), add(b, randomUUID())]);
    check((await one('select stock_quantity from food_products where id=$1', [stockProduct])).stock_quantity === 2, 'concurrent stock additions do not lose updates');
    const key = randomUUID(); await Promise.all([add(a, key), add(b, key)]);
    check((await one('select stock_quantity from food_products where id=$1', [stockProduct])).stock_quantity === 3, 'concurrent stock retry has one effect');
    await rejects(() => add(a, key, 2), 'different quantity cannot replay the same key');
    await q('update food_products set stock_reserved_quantity=3 where id=$1', [stockProduct]);
    await rejects(() => a.query('select food_adjust_product_stock_v1($1,$2,$3,$4,$5,$6)', [storeA, stockProduct, 'remove', 1, 'Reserved', randomUUID()]), 'reservation remains protected');

    await db.exec(`alter table food_inventory_items enable row level security;
      create policy test_inventory_select on food_inventory_items for select to authenticated using(food_is_store_admin(store_id));
      create policy test_inventory_update on food_inventory_items for update to authenticated using(food_is_store_admin(store_id)) with check(food_is_store_admin(store_id));`);
    await session(outsider);
    check((await q('select id from food_inventory_items where store_id=$1', [storeA])).length === 0, 'RLS hides other tenant inventory');
    check((await q("update food_inventory_items set name='Forbidden' where id=$1 returning id", [item])).length === 0, 'RLS prevents other tenant update');
    await db.exec('reset role');

    const fixture = async (unit, balance, amount) => {
      const productId = randomUUID(), itemId = randomUUID(), orderId = randomUUID(), lineId = randomUUID();
      await db.exec('reset role');
      await q("insert into food_products(id,store_id,name,track_stock,stock_quantity) values($1,$2,'Recipe concurrency',false,0)", [productId, storeA]);
      await q("insert into food_inventory_items(id,store_id,name,unit,current_quantity,average_unit_cost) values($1,$2,'Concurrent ingredient',$3,$4,0)", [itemId, storeA, unit, balance]);
      await session(owner);
      await recipe([{ inventory_item_id: itemId, stage: 'Base', quantity: amount, unit }], productId);
      await db.exec('reset role');
      await q("insert into food_orders(id,store_id,status,payment_status,total) values($1,$2,'received','paid',10)", [orderId, storeA]);
      await q('insert into food_order_items(id,order_id,product_id,quantity) values($1,$2,$3,1)', [lineId, orderId, productId]);
      return { productId, itemId, orderId };
    };
    // Both directions, mass and volume. Targets must be read AFTER the converter commits.
    for (const [from, to, balance, amount, expected] of [
      ['g','kg',1000,100,0.9], ['kg','g',1,0.1,900], ['ml','l',1000,100,0.9], ['l','ml',1,0.1,900],
    ]) {
      const f = await fixture(from, balance, amount);
      await begin(a); await begin(b);
      await a.query('select food_convert_inventory_unit($1,$2,$3)', [storeA, f.itemId, to]);
      const wait = await waitForLock(b);
      const consuming = b.query('select food_reconcile_order_recipe_consumption($1,true)', [f.orderId]);
      // Mark rejection handled while polling, but still propagate it after releasing A.
      consuming.catch(() => {});
      await wait(); await a.query('commit'); await consuming;
      const row = (await b.query('select current_quantity from food_inventory_items where id=$1', [f.itemId])).rows[0];
      check(Number(row.current_quantity) === expected, `${from}->${to} concurrent consumption preserves physical amount`);
      await b.query('rollback');
    }

    const first = await fixture('g',1000,100), second = await fixture('g',1000,100);
    await begin(b);
    await b.query("select set_config('foodweb.recipe_reconcile','caller',true),set_config('foodweb.inventory_mutation','caller',true)");
    for (const f of [first, second]) await b.query('select food_reconcile_order_recipe_consumption($1,true)', [f.orderId]);
    check((await b.query('select count(*) n from food_inventory_order_consumptions where order_id in ($1,$2)', [first.orderId,second.orderId])).rows[0].n === 2, 'both orders reconcile in one transaction');
    const flags = async () => (await b.query("select current_setting('foodweb.recipe_reconcile',true) r,current_setting('foodweb.inventory_mutation',true) m")).rows[0];
    check((await flags()).r === 'caller' && (await flags()).m === 'caller', 'success restores caller flags');
    await b.query('select food_reconcile_order_recipe_consumption($1,true)', [randomUUID()]);
    check((await flags()).r === 'caller', 'missing-order early return preserves flag');
    await b.query("update food_orders set inventory_status='released' where id=$1", [first.orderId]);
    await b.query('select food_reconcile_order_recipe_consumption($1,true)', [first.orderId]);
    check((await flags()).r === 'caller', 'released-order early return preserves flag');
    await b.query("select set_config('foodweb.recipe_reconcile','on',true)");
    await b.query('select food_reconcile_order_recipe_consumption($1,true)', [second.orderId]);
    check((await flags()).r === 'on' && (await flags()).m === 'caller', 'nested guard leaves caller state untouched');
    await b.query('rollback');

    const empty = await fixture('g',0,100);
    await begin(b);
    await b.query("select set_config('foodweb.recipe_reconcile','caller',true),set_config('foodweb.inventory_mutation','caller',true)");
    await b.query('savepoint before_failure');
    await rejects(() => b.query('select food_reconcile_order_recipe_consumption($1,false)', [empty.orderId]), 'strict consumption fails without stock');
    await b.query('rollback to savepoint before_failure');
    check((await flags()).r === 'caller' && (await flags()).m === 'caller', 'failed reconciliation leaves caller flags intact');
    await b.query('select food_reconcile_order_recipe_consumption($1,true)', [second.orderId]);
    check((await b.query('select count(*) n from food_inventory_order_consumptions where order_id=$1', [second.orderId])).rows[0].n === 1, 'reconciliation after caught error still works');
    await b.query('rollback');

    await locationCases({ db, q, one, check, rejects, owner, outsider, storeA, session }, a, b);
  } finally {
    await Promise.allSettled([a.query('rollback'), b.query('rollback')]);
    // Main harness closes every registered connection, including these two.
  }
}

async function locationCases({ db, q, one, check, rejects, owner, outsider, storeA, session }, a, b) {
  await db.exec('reset role');
  await db.exec(`
    alter table public.food_products add column active boolean not null default true;
    alter table public.food_orders add column source text, add column delivery_type text,
      add column pickup_location_id uuid, add column stock_location_id uuid;
    create function public.food_store_accessible(uuid) returns boolean language sql stable as $$select true$$;
    create table public.food_stock_locations(id uuid primary key,store_id uuid not null,
      name text not null default 'Local',is_default boolean not null default false,active boolean not null default true);
    create table public.food_pickup_locations(id uuid primary key,store_id uuid not null,
      stock_location_id uuid,is_public boolean not null default false,active boolean not null default true);
    create table public.food_product_location_stock(store_id uuid not null,product_id uuid not null,
      location_id uuid not null,stock_quantity integer not null check(stock_quantity>=0),
      stock_reserved_quantity integer not null default 0 check(stock_reserved_quantity>=0 and stock_reserved_quantity<=stock_quantity),
      updated_at timestamptz not null default now(),
      primary key(product_id,location_id));
    create table public.food_stock_location_movements(id uuid primary key default gen_random_uuid(),store_id uuid not null,
      product_id uuid not null,from_location_id uuid,to_location_id uuid,movement_type text not null,
      quantity integer not null,request_payload jsonb not null,reason text not null,idempotency_key uuid not null,
      created_by uuid,created_at timestamptz default now(),unique(store_id,idempotency_key));
    create table public.food_order_stock_movements(store_id uuid not null,product_id uuid not null,
      location_id uuid not null,event_type text not null,quantity integer not null,created_at timestamptz default now());
    grant select,insert,update on public.food_stock_locations,public.food_pickup_locations,
      public.food_product_location_stock,public.food_stock_location_movements to authenticated;
  `);
  const old = readFileSync('supabase/migrations/20261023140000_food_multilocation_stock.sql', 'utf8');
  const transfer = old.match(/create or replace function public\.food_transfer_location_stock_v1\([\s\S]*?\n\$\$;/i)?.[0];
  const adjust = old.match(/create or replace function public\.food_adjust_location_stock_v1\([\s\S]*?\n\$\$;/i)?.[0];
  assert.ok(transfer, 'real existing single-transfer function');
  assert.ok(adjust, 'real existing absolute-adjustment function');
  await db.exec(adjust);
  await db.exec(transfer);
  await db.exec(`revoke all on function public.food_transfer_location_stock_v1(uuid,uuid,uuid,uuid,integer,text,uuid) from public,anon;
    grant execute on function public.food_transfer_location_stock_v1(uuid,uuid,uuid,uuid,integer,text,uuid) to authenticated;
    revoke all on function public.food_adjust_location_stock_v1(uuid,uuid,uuid,integer,text,uuid) from public,anon;
    grant execute on function public.food_adjust_location_stock_v1(uuid,uuid,uuid,integer,text,uuid) to authenticated;`);
  await db.exec(readFileSync('supabase/migrations/20261026014407_food_location_stock_fast_flow.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261026014408_food_public_pickup_order_guards.sql', 'utf8'));
  const home = randomUUID(), work = randomUUID(), privatePlace = randomUUID(), emptyPlace = randomUUID(), point = randomUUID();
  const first = randomUUID(), second = randomUUID();
  await db.exec('reset role');
  await q('insert into public.food_products(id,store_id,name,stock_quantity) values ($1,$3,\'Pipoca\',30),($2,$3,\'Embalagem\',6)', [first,second,storeA]);
  await q('insert into public.food_stock_locations(id,store_id) values ($1,$5),($2,$5),($3,$5),($4,$5)',[home,work,privatePlace,emptyPlace,storeA]);
  await q('update public.food_stock_locations set is_default=true where id=$1',[home]);
  await q('insert into public.food_pickup_locations(id,store_id,stock_location_id,is_public) values ($1,$2,$3,true)',[point,storeA,work]);
  await q('insert into public.food_product_location_stock(store_id,product_id,location_id,stock_quantity) values ($1,$2,$4,20),($1,$2,$5,10),($1,$3,$4,6),($1,$3,$5,0)',[storeA,first,second,home,work]);
  await q("insert into public.food_order_stock_movements(store_id,product_id,location_id,event_type,quantity) values ($1,$2,$3,'sale',3),($1,$2,$3,'return',1)",[storeA,first,work]);
  await session(owner);
  await rejects(()=>q('update public.food_stock_locations set active=false where id=$1',[work]),'published pickup place cannot be deactivated');
  await rejects(()=>q('update public.food_stock_locations set active=false where id=$1',[home]),'default stock cannot be deactivated');
  await q('update public.food_stock_locations set active=false where id=$1',[emptyPlace]);
  check((await one('select active from public.food_stock_locations where id=$1',[emptyPlace])).active===false,'empty secondary place can be deactivated');
  await rejects(()=>q("insert into public.food_stock_location_movements(store_id,product_id,from_location_id,to_location_id,movement_type,quantity,request_payload,reason,idempotency_key) values ($1,$2,$3,$4,'transfer',1,'{}','Teste',$5)",[storeA,first,home,emptyPlace,randomUUID()]),'audit guard rejects movement into inactive destination');
  const batch = (key,items,from=home,to=work) => one('select public.food_transfer_location_stock_batch_v1($1,$2,$3,$4,$5) result',[storeA,from,to,items,key]);
  const key = randomUUID(), items = [{product_id:first,quantity:5},{product_id:second,quantity:2}];
  const moved = (await batch(key,items)).result;
  check(moved.items.length===2 && !moved.replayed,'batch transfers two products atomically');
  const stock = async (productId,locationId) => Number((await one('select stock_quantity from public.food_product_location_stock where product_id=$1 and location_id=$2',[productId,locationId])).stock_quantity);
  check(await stock(first,home)===15 && await stock(first,work)===15 && await stock(first,home)+await stock(first,work)===30,'20+10 becomes 15+15; total stays 30');
  check(await stock(second,home)===4 && await stock(second,work)===2,'second batch item moved');
  check((await batch(key,[...items].reverse())).result.replayed===true,'batch retry is idempotent regardless of item order');
  check(await stock(first,home)===15,'retry did not move stock again');
  await rejects(()=>batch(key,[{product_id:first,quantity:4}]),'changed payload with reused key rejected');
  await rejects(()=>batch(randomUUID(),[{product_id:first,quantity:2},{product_id:second,quantity:99}]),'failed second item rolls back first');
  check(await stock(first,home)===15 && await stock(first,work)===15,'failed batch left original balances');
  await rejects(()=>batch(randomUUID(),[{product_id:first,quantity:2},{product_id:first,quantity:1}]),'duplicate product rejected');
  const change = (mode,quantity,key) => one('select public.food_change_location_stock_v1($1,$2,$3,$4,$5,$6) result',[storeA,first,home,mode,quantity,key]);
  const addKey=randomUUID();
  await change('add',2,addKey);
  check(await stock(first,home)===17,'relative add applies to selected location');
  check((await change('add',2,addKey)).result.replayed===true && await stock(first,home)===17,'relative add retry does not double stock');
  await change('remove',1,randomUUID());
  check(await stock(first,home)===16,'relative removal uses server balance');
  await change('set',15,randomUUID());
  check(await stock(first,home)===15,'absolute set works through quick RPC');
  await session(outsider);
  await rejects(()=>batch(randomUUID(),items),'other tenant cannot transfer');
  await session(owner);
  await db.exec('reset role');
  await q('update public.food_product_location_stock set stock_reserved_quantity=2 where product_id=$1 and location_id=$2',[first,work]);
  await session(owner);
  const availability = (await one('select public.food_get_public_location_availability_v1($1,$2) result',[storeA,point])).result;
  check(availability.find(row=>row.product_id===first).available===13,'public stock subtracts local reservations only once');
  check(availability.find(row=>row.product_id===first).available_elsewhere===true,'public API exposes only a boolean for stock elsewhere');
  await rejects(()=>one('select public.food_get_public_location_availability_v1($1,$2)',[randomUUID(),point]),'foreign point cannot be queried for another store');
  await session(null,'anon');
  check((await one('select public.food_get_public_location_availability_v1($1,$2) result',[storeA,point])).result[0].available>=0,'anonymous customer can read public point balance');
  await session(owner);
  const sales=(await one('select public.food_get_location_sales_today_v1($1,$2) result',[storeA,work])).result;
  check(sales.find(row=>row.product_id===first).net_sold===2,'mobile load shows net sales today at selected location');
  await session(outsider);
  await rejects(()=>one('select public.food_get_location_sales_today_v1($1,$2)',[storeA,work]),'other tenant cannot read location sales');
  await session(owner);
  const order = (pickupId, locationId, deliveryType='pickup') => q('insert into public.food_orders(store_id,source,delivery_type,pickup_location_id,stock_location_id) values ($1,\'site\',$2,$3,$4)',[storeA,deliveryType,pickupId,locationId]);
  await rejects(()=>order(null,null),'public pickup cannot silently use default stock');
  await rejects(()=>order(point,home),'point cannot consume home stock');
  await rejects(()=>order(point,work,'delivery'),'delivery cannot claim a pickup point');
  await order(point,work);
  check((await one('select count(*) n from public.food_orders where pickup_location_id=$1 and stock_location_id=$2',[point,work])).n===1,'valid point and stock persisted together');
  const pickupOrder = (await one('select id from public.food_orders where pickup_location_id=$1 and stock_location_id=$2',[point,work])).id;
  await rejects(()=>q('insert into public.food_order_items(order_id,product_id,quantity) values ($1,$2,16)',[pickupOrder,first]),'scheduled pickup cannot borrow units from home');
  await q('insert into public.food_order_items(order_id,product_id,quantity) values ($1,$2,2)',[pickupOrder,first]);
  check((await one('select count(*) n from public.food_order_items where order_id=$1',[pickupOrder])).n===1,'valid point item persists');
  check((await one("select has_function_privilege('anon','public.food_transfer_location_stock_batch_v1(uuid,uuid,uuid,jsonb,uuid)','EXECUTE') permitted")).permitted===false,'anon cannot transfer');
  check((await one("select has_function_privilege('anon','public.food_change_location_stock_v1(uuid,uuid,uuid,text,integer,uuid)','EXECUTE') permitted")).permitted===false,'anon cannot change stock');

  // Two sessions contend for the last available units at one source.
  await db.exec('reset role');
  await q('update public.food_product_location_stock set stock_quantity=5 where product_id=$1 and location_id=$2',[second,home]);
  for (const c of [a,b]) { await c.query('reset role'); await c.query("select set_config('test.user',$1,false)",[owner]); await c.query('set role authenticated'); }
  await a.query('begin'); await b.query('begin');
  const firstMove = a.query('select public.food_transfer_location_stock_batch_v1($1,$2,$3,$4,$5)',[storeA,home,work,JSON.stringify([{product_id:second,quantity:4}]),randomUUID()]);
  await firstMove;
  const secondMove = b.query('select public.food_transfer_location_stock_batch_v1($1,$2,$3,$4,$5)',[storeA,home,work,JSON.stringify([{product_id:second,quantity:4}]),randomUUID()]);
  secondMove.catch(()=>{});
  await new Promise(resolve=>setTimeout(resolve,50));
  await a.query('commit');
  await rejects(()=>secondMove,'competing batch cannot oversell source');
  await b.query('rollback');
  await db.exec('reset role');
  check(await stock(second,home)===1,'concurrent sale leaves one unit in source');
}

try {
  await runInventoryTransactionTests(new LocalPostgres(), concurrentCases);
  console.log('Native concurrency regression: PASS');
} catch (error) {
  console.error('Native concurrency regression: FAIL — ' + String(error?.stack || error).replaceAll(password, '[redacted]'));
  if (error?.position || error?.where) console.error(`SQL position: ${error.position || '?'}; context: ${error.where || '?'}`);
  process.exit(1);
}
