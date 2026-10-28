import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();let count=0;const q=async(s,a=[])=>(await db.query(s,a)).rows;const ok=(x)=>{assert.ok(x);count++};const no=async(f)=>{await assert.rejects(f);count++};
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002',P='30000000-0000-4000-8000-000000000001',Q='30000000-0000-4000-8000-000000000002',O='40000000-0000-4000-8000-000000000001';
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create table food_stores(id uuid primary key);create table food_stock_locations(id uuid primary key,store_id uuid,active boolean default true);create table food_pickup_locations(id uuid primary key,store_id uuid,stock_location_id uuid,active boolean default true,is_public boolean default true,unique(id,store_id));create table food_orders(id uuid primary key,store_id uuid,total numeric,status text,stock_location_id uuid);
 insert into food_stores values('${A}'),('${B}');insert into food_stock_locations(id,store_id) values('${P}','${A}'),('${Q}','${B}');insert into food_pickup_locations(id,store_id,stock_location_id) values('${P}','${A}','${P}'),('${Q}','${B}','${Q}');
 -- Stub proposital: estes testes verificam o wrapper, não substituem a suíte do checkout/estoque.
 create function food_create_public_order(payload jsonb) returns table(order_id uuid,order_number bigint,order_total numeric) language plpgsql as $$begin
 if (payload->>'total')::numeric<1 then raise exception 'Preço inválido';end if;
 if payload ? 'receipt_pickup_location_id' then raise exception 'Campo de comunicação chegou à RPC legada';end if;
 insert into public.food_orders values((payload->>'id')::uuid,(payload->>'store_id')::uuid,(payload->>'total')::numeric,'received',null) on conflict(id) do nothing;
 return query select (payload->>'id')::uuid,42::bigint,(payload->>'total')::numeric;end;$$;
 revoke all on function food_create_public_order(jsonb) from public;grant execute on function food_create_public_order(jsonb) to service_role;`);
 await db.exec(readFileSync('supabase/migrations/20261028150000_food_order_receipt_source.sql','utf8'));
 const make=(extra={})=>({id:O,store_id:A,total:12.5,delivery_type:'delivery',receipt_pickup_location_id:P,...extra});
 const create=(p)=>q('select * from food_create_public_order_with_receipt_v1($1::jsonb)',[JSON.stringify(p)]);
 await db.exec('set role anon');await no(()=>create(make()));await no(()=>q('select * from food_order_receipt_sources'));
 await db.exec('reset role;set role authenticated');await no(()=>create(make()));await db.exec('reset role;set role service_role');
 await create(make());await db.exec('reset role');let row=(await q('select * from food_order_receipt_sources'))[0];ok(row.store_id===A&&row.pickup_location_id===P);ok((await q('select * from food_orders'))[0].stock_location_id===null);ok((await q('select * from food_orders'))[0].status==='received');
 await create(make({receipt_pickup_location_id:null}));ok((await q('select * from food_order_receipt_sources'))[0].pickup_location_id===P);ok((await q('select * from food_orders')).length===1);
 await no(()=>create(make({id:Q,receipt_pickup_location_id:Q})));ok((await q('select * from food_orders')).length===1);
 await db.exec('update food_pickup_locations set active=false');await no(()=>create(make({id:Q})));await db.exec('update food_pickup_locations set active=true');
 await no(()=>create(make({id:Q,total:0})));ok((await q('select * from food_order_receipt_sources')).length===1);
 await db.exec(`create function test_fail_source() returns trigger language plpgsql as $$begin raise exception 'Falha sintética após criar pedido';end$$;create trigger test_fail before insert on food_order_receipt_sources for each row execute function test_fail_source()`);await no(()=>create(make({id:Q})));ok((await q('select * from food_orders where id=$1',[Q])).length===0);await db.exec('drop trigger test_fail on food_order_receipt_sources');
 await create(make({id:Q,receipt_pickup_location_id:null}));ok((await q('select * from food_order_receipt_sources where order_id=$1',[Q]))[0].pickup_location_id===null);await create(make({id:Q}));ok((await q('select * from food_order_receipt_sources where order_id=$1',[Q]))[0].pickup_location_id===null);
 console.log(`${count} verificações da origem transacional aprovadas (RPC legada simulada).`);
}finally{await db.close()}
