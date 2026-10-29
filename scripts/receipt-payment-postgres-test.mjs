/** PostgreSQL 17 real, temporário e restrito ao loopback. Não aceita DB URL. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import {runReceiptPaymentTests} from './receipt-payment-db-test.mjs';

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
    this.dir = await mkdtemp(path.join(this.parent, 'food-receipt-payment-'));
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
      assert.ok(path.basename(this.dir).startsWith('food-receipt-payment-'));
      await rm(this.dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    }
  }
}

async function concurrentCases({db,A,U,O,check}){
 await db.exec(`reset role;delete from food_orders where id='${O}';delete from food_financial_entries;insert into food_orders(id,store_id)values('${O}','${A}');`);
 const a=await db.connection(),b=await db.connection();
 for(const c of[a,b])await c.query('set role service_role');
 const declare=c=>c.query('select food_declare_order_receipt_v1($1,$2,12.5,0)',[A,O]);
 const before=Number((await db.query("select count(*) n from food_platform_event_log where action='order_receipt_declared'")).rows[0].n);
 await a.query('begin');await declare(a);const pending=declare(b);await a.query('commit');await pending;
 check(Number((await db.query("select count(*) n from food_platform_event_log where action='order_receipt_declared'")).rows[0].n)===before+1,'duas declarações concorrentes têm uma auditoria');
 check((await db.query('select * from food_financial_entries')).rows.length===1,'duas declarações concorrentes têm uma receita');
 await a.query("set role authenticated");await a.query("select set_config('test.user',$1,false)",[U]);
 await a.query('begin');await a.query('select food_review_receipt_report_v1($1,false)',[O]);
 const replay=declare(b).then(()=>false,()=>true);await a.query('commit');check(await replay,'reversão bloqueia declaração que esperava o lock');
 check((await db.query('select payment_status,payment_receipt_version from food_orders where id=$1',[O])).rows[0].payment_status==='pending','corrida termina A receber');
}
await runReceiptPaymentTests(new LocalPostgres(),concurrentCases);
