/** PostgreSQL 17 real, temporário e restrito ao loopback. Não aceita DB URL. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { runOrderItemLocationTests } from './order-item-location-db-test.mjs';

assert.notEqual(process.getuid?.(), 0, 'Execute este runner como usuário sem privilégios; não crie usuário do sistema automaticamente.');
assert.ok(process.env.FOOD_DB_TEST_RUNTIME, 'Defina FOOD_DB_TEST_RUNTIME para as dependências isoladas, sem URL de banco.');
const requireRuntime = createRequire(path.join(path.resolve(process.env.FOOD_DB_TEST_RUNTIME), 'food-db-test.cjs'));
const { default: EmbeddedPostgres } = await import(pathToFileURL(requireRuntime.resolve('embedded-postgres')));
const pg = requireRuntime('pg');
const password = randomBytes(24).toString('hex');
class LocalPostgres {
  constructor() { this.ready = this.start(); this.clients = new Set(); }
  async start() {
    this.parent = await realpath(tmpdir());
    this.dir = await mkdtemp(path.join(this.parent, 'food-order-location-'));
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
      assert.ok(path.basename(this.dir).startsWith('food-order-location-'));
      await rm(this.dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    }
  }
}


async function concurrentCases({ db, eq, check }) {
  const c1 = await db.connection(), c2 = await db.connection();
  const store = randomUUID(), owner = randomUUID(), main = randomUUID(), point = randomUUID(), product = randomUUID();
  const o1 = randomUUID(), o2 = randomUUID(), i1 = randomUUID(), i2 = randomUUID();
  await db.query('insert into food_stores(id) values($1)', [store]);
  await db.query('insert into food_store_users values($1,$2)', [store,owner]);
  await db.query("insert into food_stock_locations(id,store_id,name,is_default) values($1,$3,'Principal concorrência',true),($2,$3,'Ponto concorrência',false)",[main,point,store]);
  await db.query("insert into food_products(id,store_id,name,stock_quantity) values($1,$2,'Produto concorrente',13)",[product,store]);
  await db.query('insert into food_product_location_stock(store_id,product_id,location_id,stock_quantity) values($1,$2,$3,10),($1,$2,$4,3)',[store,product,main,point]);
  await db.query('insert into food_orders(id,store_id,stock_location_id) values($1,$3,$4),($2,$3,$4)',[o1,o2,store,point]);
  await db.query("insert into food_order_items(id,order_id,product_id,product_name,quantity,unit_price,item_total) values($1,$2,$5,'Sintético',1,10,10),($3,$4,$5,'Sintético',1,10,10)",[i1,o1,i2,o2,product]);
  for (const client of [c1,c2]) {
    await client.query("select set_config('test.user',$1,false)",[owner]);
    await client.query("select set_config('food.order_stock_location',$1,false)",[main]);
  }
  const edit = (client, order, item) => client.query('select * from food_update_order_items_v1($1,$2)',[order,JSON.stringify([{item_id:item,quantity:2}])]);
  // Duas edições disputam a última unidade. A primeira mantém a transação aberta
  // até a segunda estar comprovadamente aguardando lock, sem depender de sleep.
  await c1.query('begin');
  await edit(c1,o1,i1);
  const pid=(await c2.query('select pg_backend_pid() pid')).rows[0].pid;
  const second = edit(c2,o2,i2).then(()=>({ok:true}), error=>({ok:false,error}));
  const deadline=Date.now()+5000;
  let waiting=false;
  while (Date.now()<deadline) {
    waiting=(await db.query("select wait_event_type='Lock' waiting from pg_stat_activity where pid=$1",[pid])).rows[0]?.waiting;
    if (waiting) break;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  check(waiting,'segunda edição aguarda lock real no produto');
  await c1.query('commit');
  const result=await second;
  check(!result.ok && /Estoque insuficiente/.test(result.error.message),'concorrente perde a disputa sem reserva parcial');
  const balance=async()=> (await db.query('select stock_quantity,stock_reserved_quantity from food_product_location_stock where product_id=$1 and location_id=$2',[product,point])).rows[0];
  eq(await balance(),{stock_quantity:3,stock_reserved_quantity:3},'duas sessões conservam físico e reserva no ponto');
  const principal=(await db.query('select stock_quantity,stock_reserved_quantity from food_product_location_stock where product_id=$1 and location_id=$2',[product,main])).rows[0];
  eq(principal,{stock_quantity:10,stock_reserved_quantity:0},'concorrência não usa o principal do contexto externo');
  await edit(c1,o1,i1);
  eq(await balance(),{stock_quantity:3,stock_reserved_quantity:3},'retry concorrente não duplica compromisso');
  await Promise.all([c1.query("update food_orders set status='delivered' where id=$1",[o1]),c2.query("update food_orders set status='delivered' where id=$1",[o1])]);
  eq(await balance(),{stock_quantity:1,stock_reserved_quantity:1},'duas conclusões simultâneas dão uma saída');
  eq(Number((await db.query('select count(*) n from food_order_stock_movements where order_id=$1',[o1])).rows[0].n),1,'ledger tem saída única após concorrência');
  await c2.query('select food_release_order_inventory($1)',[o2]);
  eq(await balance(),{stock_quantity:1,stock_reserved_quantity:0},'pedido que falhou na edição ainda cancela no ponto original');
}

await runOrderItemLocationTests({ db: new LocalPostgres(), concurrentCases });
