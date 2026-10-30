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
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select '{"aal":"aal1"}'::jsonb$$;
 create table food_platform_admins(user_id uuid,active boolean);
 create table food_stores(id uuid primary key,opening_hours jsonb,active boolean default true,archived_at timestamptz,approval_status text default 'approved',receipt_click_marks_paid boolean not null default false);
 create table food_store_users(store_id uuid,user_id uuid,active boolean default true,role text default 'owner');
 create function food_save_receipt_policy_v1(uuid,jsonb,jsonb,boolean) returns void language sql as $$select null::void$$;
 create function food_declare_order_receipt_v1(uuid,uuid,numeric,integer) returns jsonb language sql as $$select '{}'::jsonb$$;
 create table food_stock_locations(id uuid primary key,store_id uuid,active boolean default true);
 create table food_pickup_locations(id uuid primary key,store_id uuid,stock_location_id uuid,name text,active boolean default true,is_public boolean default true,auto_pickup_on_receipt boolean default false,updated_at timestamptz default now());
 create table food_financial_entries(store_id uuid,order_id uuid,source text,status text,paid_at timestamptz,notes text,created_by uuid,updated_at timestamptz);
 create table food_platform_event_log(id uuid default gen_random_uuid(),actor_user_id uuid,store_id uuid,kind text,action text,result text,route text,metadata jsonb,app_version text);
 create table food_orders(id uuid primary key default gen_random_uuid(),store_id uuid,status text,payment_status text,total numeric,created_at timestamptz,payment_received_at timestamptz,scheduled_for timestamptz,payment_reported_by_customer boolean not null default false,payment_reported_at timestamptz,payment_method text default 'pix',source text default 'site',delivery_type text default 'pickup',pickup_location_id uuid,stock_location_id uuid,inventory_status text default 'not_tracked');`);
 for(const f of guards.authorization)await db.exec(f.definition);
 await db.exec(migration);await db.exec(migration);
 await db.exec(readFileSync('supabase/migrations/20261030160000_food_pickup_receipt_closeout.sql','utf8'));
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
 await q(`with t as(select date_trunc('day',now() at time zone 'America/Sao_Paulo')+interval '12 hours' d)
 insert into food_orders(store_id,status,payment_status,total,created_at,payment_received_at,payment_reported_by_customer,payment_reported_at)
 select $1,'picked_up','paid',80,(d at time zone 'America/Sao_Paulo'),(d at time zone 'America/Sao_Paulo'),true,(d at time zone 'America/Sao_Paulo') from t`,[a]);
 await q("insert into food_orders(store_id,status,payment_status,total,created_at) values($1,'received','pending',99999,now())",[b]);
 const before=await one('select count(*) n,sum(total) total from food_orders');
 await actor(owner);await db.exec('set role authenticated');
 const m=await metrics(a);
 for(const [key,value] of Object.entries({ordersTotal:158,cancelledOrders:2,ordersToday:151,pendingPayments:151,pendingAmount:304,processingOrders:1,scheduledToday:5,paidOrders:4,totalReceived:67,receivedToday:30,receivedTodayCount:2,receiptsToReview:1,receiptsToReviewAmount:80}))eq(m[key],value,key);
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
 await q("update food_store_users set active=true,role='manager' where store_id=$1",[a]);eq((await metrics(a)).ordersTotal,158,'helper atual de manager preservado');
 await q('update food_stores set active=false where id=$1',[a]);await reject(()=>metrics(a),/Sem permissão/);await q('update food_stores set active=true where id=$1',[a]);
 eq(await one('select count(*) n,sum(total) total from food_orders'),before,'RPC não modifica pedidos');
 // Divergência futura deve bloquear substituição silenciosa.
 await db.exec("create or replace function food_dashboard_metrics_v1(p_store_id uuid) returns jsonb language sql as $$select '{}'::jsonb$$");
 await reject(()=>db.exec(migration),/diverge/);await db.exec('rollback');
 console.log(`OK: ${checks} verificações de métricas acima de 100 pedidos, totais, fuso, permissões, tenant, repetição e ausência de escrita.`);
}finally{await db.close();}
