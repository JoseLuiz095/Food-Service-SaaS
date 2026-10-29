/** PostgreSQL 17 real, temporário e restrito ao loopback. Não aceita DB URL. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import {runRelocationTests} from './order-relocation-db-test.mjs';

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
    this.dir = await mkdtemp(path.join(this.parent, 'food-relocation-'));
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
      assert.ok(path.basename(this.dir).startsWith('food-relocation-'));
      await rm(this.dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    }
  }
}

async function concurrentCases({db,o,pb,u,eq}){
 const a=await db.connection(),b=await db.connection();
 for(const c of[a,b])await c.query("select set_config('test.user',$1,false)",[u]);
 await a.query('begin');
 const edit=c=>c.query('select food_edit_order_pickup_v1($1,$2,$2,$3)',[o,pb,JSON.stringify({customerName:'Pessoa sintética'})]);
 await edit(a);const pending=edit(b);await a.query('commit');await pending;
 eq(Number((await db.query("select count(*) n from food_platform_event_log where action='order_pickup_changed'")).rows[0].n),1);
}
await runRelocationTests(new LocalPostgres(),concurrentCases);
