import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const migration = readFileSync('supabase/migrations/20261023101500_food_product_stock_adjustments.sql', 'utf8');
const storeApi = readFileSync('src/services/storeApi.ts', 'utf8');
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const one = async (sql, args = []) => (await q(sql, args))[0];
let checks = 0;
const check = (ok, label) => { assert.ok(ok, label); checks++; };
const rejects = async (fn, label) => { await assert.rejects(fn); checks++; };

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table public.food_stores(id uuid primary key);
    create table public.food_store_users(store_id uuid,user_id uuid,active boolean default true,role text default 'owner');
    create function public.food_is_store_admin(uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from public.food_store_users where store_id=$1 and user_id=auth.uid() and active and role in ('owner','admin','manager'))$$;
    create table public.food_products(id uuid primary key,store_id uuid not null references public.food_stores(id),name text,
      track_stock boolean not null default true,stock_quantity integer,stock_reserved_quantity integer not null default 0,
      stock_status text not null default 'available',availability_status text not null default 'available',unique(id,store_id));
    grant usage on schema auth to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
    grant execute on function public.food_is_store_admin(uuid) to authenticated;
    alter table public.food_products enable row level security;
    create policy product_admin_all on public.food_products for all to authenticated using(public.food_is_store_admin(store_id)) with check(public.food_is_store_admin(store_id));
    grant select,update on public.food_products to authenticated;
  `);
  await db.exec(migration);
  const signature = migration.match(/create or replace function public\.food_adjust_product_stock_v1\(([\s\S]*?)\)\s*returns/i)?.[1] || '';
  const rpcBody = storeApi.match(/restFetch<[^>]+>\('rpc\/food_adjust_product_stock_v1',[\s\S]*?body:\s*\{([^}]+)\}/)?.[1] || '';
  const signatureNames = [...signature.matchAll(/\b(p_[a-z_]+)\s+(?:uuid|text|numeric)\b/g)].map((match) => match[1]);
  const payloadNames = [...rpcBody.matchAll(/\b(p_[a-z_]+):/g)].map((match) => match[1]);
  check(signatureNames.length === 6 && signatureNames.join(',') === payloadNames.join(','), 'frontend envia os seis argumentos nomeados da assinatura RPC na mesma ordem contratual');
  const owner = randomUUID(), outsider = randomUUID(), storeA = randomUUID(), storeB = randomUUID(), product = randomUUID(), foreignProduct = randomUUID(), zeroProduct = randomUUID();
  await q('insert into auth.users values ($1),($2)', [owner, outsider]);
  await q('insert into public.food_stores values ($1),($2)', [storeA, storeB]);
  await q('insert into public.food_store_users(store_id,user_id) values ($1,$2),($3,$4)', [storeA, owner, storeB, outsider]);
  await q("insert into public.food_products(id,store_id,name,stock_quantity,stock_reserved_quantity) values ($1,$2,'Estoque demo',15,12),($3,$4,'Outro tenant',4,0),($5,$2,'Estoque zerado',0,0)", [product, storeA, foreignProduct, storeB, zeroProduct]);
  const session = async (user, role = 'authenticated') => { await db.exec('reset role'); await q("select set_config('test.user',$1,false)", [user || '']); await db.exec(`set role ${role}`); };
  const call = (mode, quantity, reason = 'Conferência física', key = randomUUID(), store = storeA, id = product) => q('select public.food_adjust_product_stock_v1(p_store_id => $1, p_product_id => $2, p_mode => $3, p_quantity => $4, p_reason => $5, p_idempotency_key => $6) as result', [store,id,mode,quantity,reason,key]);

  await session(owner);
  const firstKey = randomUUID();
  const first = await one('select public.food_adjust_product_stock_v1(p_store_id => $1, p_product_id => $2, p_mode => $3, p_quantity => $4, p_reason => $5, p_idempotency_key => $6) result', [storeA,product,'set',50,'Contagem física',firstKey]);
  check(first.result.stock_quantity === 50 && first.result.stock_reserved_quantity === 12, 'define saldo físico absoluto sem alterar reserva');
  check((await one("select count(*) n from public.food_product_stock_movements where product_id=$1 and reason='Saldo inicial do cadastro'", [product])).n === 1, 'registra saldo inicial do produto');
  check(first.result.stock_quantity - first.result.stock_reserved_quantity === 38, 'disponível é físico menos reservado');
  const zeroToSeventeen = await one('select public.food_adjust_product_stock_v1(p_store_id => $1, p_product_id => $2, p_mode => $3, p_quantity => $4, p_reason => $5, p_idempotency_key => $6) result', [storeA,zeroProduct,'set',17,'Contagem física',randomUUID()]);
  check(zeroToSeventeen.result.stock_quantity === 17, 'argumentos nomeados definem saldo zerado para 17 pelo contrato usado no PostgREST');
  const duplicate = await one('select public.food_adjust_product_stock_v1($1,$2,$3,$4,$5,$6) result', [storeA,product,'set',50,'Contagem física',firstKey]);
  check(duplicate.result.stock_quantity === 50 && (await one('select count(*) n from public.food_product_stock_movements where idempotency_key=$1', [firstKey])).n === 1, 'repetição com a mesma chave não duplica movimento');
  await call('add', 5, 'Reposição');
  check((await one('select stock_quantity from public.food_products where id=$1', [product])).stock_quantity === 55, 'adiciona unidades ao saldo físico');
  await call('remove', 2, 'Perda registrada');
  check((await one('select stock_quantity from public.food_products where id=$1', [product])).stock_quantity === 53, 'remove unidades do saldo físico');
  await rejects(() => call('set', 11), 'não deixa definir físico abaixo do reservado');
  await rejects(() => call('set', -1), 'rejeita valor negativo');
  await rejects(() => call('set', 2.5), 'rejeita frações em unidade inteira');
  await rejects(() => call('add', 1, '   '), 'exige motivo auditável');
  await rejects(() => call('add', 1, 'Outro', randomUUID(), storeA, foreignProduct), 'não permite cruzar tenant');
  await rejects(() => q('update public.food_products set stock_quantity=99 where id=$1', [product]), 'bloqueia PATCH direto fora da operação transacional');
  const movement = await one("select * from public.food_product_stock_movements where product_id=$1 and reason='Perda registrada' limit 1", [product]);
  check(movement.created_by === owner && movement.reason === 'Perda registrada' && movement.quantity_before === 55 && movement.quantity_after === 53, 'registra usuário, motivo e saldos anterior/novo');
  await session(outsider);
  await rejects(() => call('set', 25, 'Tentativa cruzada'), 'bloqueia RPC de outro tenant');
  await session(null, 'anon');
  await rejects(() => call('set', 25, 'Anônimo'), 'bloqueia chamada anônima');
  await db.exec('reset role');
  console.log(`Product stock DB test: ${checks} checks passed.`);
} finally {
  await db.close();
}
