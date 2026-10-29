/** PostgreSQL 17 real, temporário e restrito ao loopback. Não aceita DB URL. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { runStoreNameTests } from './store-name-db-test.mjs';

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
    this.dir = await mkdtemp(path.join(this.parent, 'food-store-name-'));
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
      assert.ok(path.basename(this.dir).startsWith('food-store-name-'));
      await rm(this.dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    }
  }
}

async function concurrentCases({db,eq,ok}) {
 const c1=await db.connection(),c2=await db.connection();
 const a=randomUUID(),b=randomUUID();
 await db.query("insert into food_stores values($1,'Primeira concorrente','concurrent-a'),($2,'Segunda concorrente','concurrent-b')",[a,b]);
 await c1.query('begin');await c1.query("update food_stores set name='Nome Disputado' where id=$1",[a]);
 const pid=(await c2.query('select pg_backend_pid() pid')).rows[0].pid;
 const pending=c2.query("update food_stores set name=' NOME  DISPUTADO ' where id=$1",[b]).then(()=>({ok:true}),error=>({ok:false,error}));
 let waiting=false;const deadline=Date.now()+5000;
 while(Date.now()<deadline) {
  waiting=(await db.query("select wait_event_type='Lock' waiting from pg_stat_activity where pid=$1",[pid])).rows[0]?.waiting;
  if(waiting)break;await new Promise(r=>setTimeout(r,20));
 }
 ok(waiting,'índice único serializa a disputa');await c1.query('commit');
 const result=await pending;eq(result.ok,false,'somente uma loja obtém o nome');eq(result.error?.code,'23505','concorrente rejeitado por unicidade');
 eq((await db.query('select name from food_stores where id=$1',[b])).rows[0].name,'Segunda concorrente','falha não aplica nome parcialmente');
 await c1.query('begin');await c1.query("update food_stores set name='Nome Revertido' where id=$1",[a]);await c1.query('rollback');
 await c2.query("update food_stores set name='Nome Revertido' where id=$1",[b]);
 eq((await db.query('select name from food_stores where id=$1',[b])).rows[0].name,'Nome Revertido','rollback libera nome, sem reserva fantasma');
}
await runStoreNameTests({db:new LocalPostgres(),concurrentCases});
