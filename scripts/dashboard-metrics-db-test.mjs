import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const migration=readFileSync('supabase/migrations/20261028130144_food_dashboard_metrics_standalone.sql','utf8');
const guards=JSON.parse(readFileSync('scripts/fixtures/order-location-guards-baseline.json','utf8'));
const q=(sql,args=[])=>db.query(sql,args);
const one=async(sql,args=[])=> (await q(sql,args)).rows[0];
let checks=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const reject=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++;};
const owner=randomUUID(),outsider=randomUUID(),a=randomUUID(),b=randomUUID(),empty=randomUUID();
const actor=id=>q("select set_config('test.user',$1,false)",[id]);
const metrics=async id=>(await one('select food_dashboard_metrics_v1($1) result',[id])).result;
try{
 await db.exec(`create role anon;create role authenticated;
 create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select '{"aal":"aal1"}'::jsonb$$;
 create table food_platform_admins(user_id uuid,active boolean);
 create table food_stores(id uuid primary key,opening_hours jsonb,active boolean default true,archived_at timestamptz,approval_status text default 'approved');
 create table food_store_users(store_id uuid,user_id uuid,active boolean default true,role text default 'owner');
 create table food_orders(id uuid primary key default gen_random_uuid(),store_id uuid,status text,payment_status text,total numeric,created_at timestamptz,payment_received_at timestamptz,scheduled_for timestamptz);`);
 for(const f of guards.authorization)await db.exec(f.definition);
 await db.exec(migration);await db.exec(migration);
 await q("insert into food_stores(id,opening_hours) values($1,'{\"timezone\":\"America/Sao_Paulo\"}'),($2,'{}'),($3,'{\"timezone\":\"invalid/fuso\"}')",[a,b,empty]);
 await q('insert into food_store_users(store_id,user_id) values($1,$2),($3,$4),($5,$2)',[a,owner,b,outsider,empty]);
 await q(`insert into food_orders(store_id,status,payment_status,total,created_at,scheduled_for)
 select $1,'received','pending',2,(date_trunc('day',now() at time zone 'America/Sao_Paulo')+interval '12 hours') at time zone 'America/Sao_Paulo',
 case when i<=3 then (date_trunc('day',now() at time zone 'America/Sao_Paulo')+interval '12 hours') at time zone 'America/Sao_Paulo' end from generate_series(1,150) i`,[a]);
 await q(`with t as(select date_trunc('day',now() at time zone 'America/Sao_Paulo')+interval '12 hours' d)
 insert into food_orders(store_id,status,payment_status,total,created_at,payment_received_at,scheduled_for)
 select $1,v.status,v.payment,v.total,(d+v.created_offset*interval '1 day') at time zone 'America/Sao_Paulo',
 case when v.payment='paid' then (d+v.received_offset*interval '1 day') at time zone 'America/Sao_Paulo' end,
 case when v.scheduled then d at time zone 'America/Sao_Paulo' end from t cross join(values
 ('preparing','paid',10,0,0,true),('delivered','paid',20,0,0,false),('picked_up','paid',30,0,-1,false),
 ('cancelled','paid',999,0,0,false),('cancelled','pending',999,0,0,false),('received','pending',4,-1,0,true),('delivered','paid',7,-1,-1,false)
 )v(status,payment,total,created_offset,received_offset,scheduled)`,[a]);
 await q("insert into food_orders(store_id,status,payment_status,total,created_at) values($1,'received','pending',99999,now())",[b]);
 const before=await one('select count(*) n,sum(total) total from food_orders');
 await actor(owner);await db.exec('set role authenticated');
 const m=await metrics(a);
 for(const [key,value] of Object.entries({ordersTotal:157,cancelledOrders:2,ordersToday:151,pendingPayments:151,pendingAmount:304,processingOrders:1,scheduledToday:5,paidOrders:4,totalReceived:67,receivedToday:30,receivedTodayCount:2}))eq(m[key],value,key);
 eq(m.timezone,'America/Sao_Paulo','fuso da loja');
 eq(Number.isFinite(Date.parse(m.asOf)),true,'timestamp explícito');
 const zero=await metrics(empty);
 eq(zero.ordersTotal,0,'loja vazia sem pedidos de outra loja');eq(zero.pendingAmount,0,'loja vazia sem receita inventada');eq(zero.timezone,'America/Sao_Paulo','fuso inválido usa fallback validado');
 await reject(()=>metrics(b),/Sem permissão/);
 await reject(()=>q('select * from food_orders'),/permission denied/);
 await actor('');await reject(()=>metrics(a),/Sem permissão/);
 await db.exec('set role anon');await reject(()=>metrics(a),/permission denied/);
 await db.exec('reset role');await actor(owner);
 await q("update food_store_users set active=false where store_id=$1",[a]);await reject(()=>metrics(a),/Sem permissão/);
 await q("update food_store_users set active=true,role='manager' where store_id=$1",[a]);eq((await metrics(a)).ordersTotal,157,'helper atual de manager preservado');
 await q('update food_stores set active=false where id=$1',[a]);await reject(()=>metrics(a),/Sem permissão/);await q('update food_stores set active=true where id=$1',[a]);
 eq(await one('select count(*) n,sum(total) total from food_orders'),before,'RPC não modifica pedidos');
 // Divergência futura deve bloquear substituição silenciosa.
 await db.exec("create or replace function food_dashboard_metrics_v1(p_store_id uuid) returns jsonb language sql as $$select '{}'::jsonb$$");
 await reject(()=>db.exec(migration),/diverge/);await db.exec('rollback');
 console.log(`OK: ${checks} verificações de métricas acima de 100 pedidos, totais, fuso, permissões, tenant, repetição e ausência de escrita.`);
}finally{await db.close();}
