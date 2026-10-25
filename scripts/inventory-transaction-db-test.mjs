import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const one = async (sql, args = []) => (await q(sql, args))[0];
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const rejects = async (action, label) => { await assert.rejects(action, undefined, label); checks++; };

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table public.food_stores(id uuid primary key,opening_hours jsonb not null default '{}'::jsonb);
    create table public.food_store_users(store_id uuid,user_id uuid,active boolean default true,role text default 'owner');
    create function public.food_is_store_admin(uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from public.food_store_users where store_id=$1 and user_id=auth.uid() and active and role in ('owner','admin','manager'))$$;
    create table public.food_products(id uuid primary key,store_id uuid not null references public.food_stores(id),name text,
      track_stock boolean not null default true,stock_quantity integer,stock_reserved_quantity integer not null default 0,
      stock_status text not null default 'available',availability_status text not null default 'available',unique(id,store_id));
    create table public.food_inventory_items(id uuid primary key,store_id uuid not null,name text not null,item_type text not null default 'ingredient',
      unit text not null,current_quantity numeric(14,3) not null default 0,average_unit_cost numeric(14,4) not null default 0,
      last_unit_cost numeric(14,4),reorder_point numeric(14,3) not null default 0,low_stock_alert_enabled boolean not null default true,
      active boolean not null default true,notes text,updated_at timestamptz default now(),unique(id,store_id));
    create table public.food_inventory_movements(id uuid primary key default gen_random_uuid(),store_id uuid,inventory_item_id uuid,
      movement_type text,quantity_delta numeric(14,3),quantity_before numeric(14,3),quantity_after numeric(14,3),unit_cost numeric(14,4),total_cost numeric(14,2),
      source_type text,source_id uuid,source_reference text,reason text,created_by uuid,created_at timestamptz default now());
    create table public.food_inventory_purchase_items(id uuid primary key default gen_random_uuid(),store_id uuid,inventory_item_id uuid,quantity numeric(14,3),unit_cost numeric(14,4));
    create table public.food_inventory_count_items(id uuid primary key default gen_random_uuid(),inventory_item_id uuid,expected_quantity numeric(14,3),counted_quantity numeric(14,3),quantity_delta numeric(14,3));
    create table public.food_product_recipes(id uuid primary key default gen_random_uuid(),store_id uuid not null,product_id uuid not null,
      name text,yield_quantity numeric(14,3),yield_unit text,notes text,active boolean default true,unique(store_id,product_id),unique(id,store_id));
    create table public.food_product_recipe_items(id uuid primary key default gen_random_uuid(),store_id uuid not null,recipe_id uuid not null,
      inventory_item_id uuid not null,stage text not null default 'Geral',quantity numeric(14,3),unit text,waste_percent numeric(5,2) default 0,
      sort_order integer default 0,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.food_orders(id uuid primary key default gen_random_uuid(),store_id uuid not null,status text not null default 'received',
      payment_status text not null default 'pending',payment_received_at timestamptz,total numeric(12,2) not null default 0,
      created_at timestamptz not null default now(),scheduled_for timestamptz,inventory_status text default 'not_tracked',updated_at timestamptz default now());
    create table public.food_order_items(id uuid primary key default gen_random_uuid(),order_id uuid,product_id uuid,quantity integer);
    create table public.food_inventory_order_consumptions(id uuid primary key default gen_random_uuid(),store_id uuid,order_id uuid,order_item_id uuid,
      recipe_id uuid,recipe_item_id uuid references public.food_product_recipe_items(id) on delete restrict,inventory_item_id uuid,
      target_quantity numeric(14,3) default 0,consumed_quantity numeric(14,3) default 0,updated_at timestamptz default now(),unique(order_item_id,recipe_item_id));
    grant usage on schema auth to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
    grant execute on function public.food_is_store_admin(uuid) to authenticated;
    grant select,insert,update,delete on all tables in schema public to authenticated;
  `);
  // Execute actual stock migration and the existing production unit converter.
  await db.exec(readFileSync('supabase/migrations/20261023101500_food_product_stock_adjustments.sql', 'utf8'));
  const unitSource = readFileSync('supabase/migrations/20261022175933_food_operational_rpc_repair.sql', 'utf8');
  const unitFunction = unitSource.match(/create or replace function public\.food_convert_inventory_unit\([\s\S]*?revoke all on function public\.food_convert_inventory_unit\(uuid, uuid, text\) from public, anon;[\s\S]*?grant execute on function public\.food_convert_inventory_unit\(uuid, uuid, text\) to authenticated;/i)?.[0];
  assert.ok(unitFunction, 'unit converter migration source');
  await db.exec(unitFunction);
  await db.exec(readFileSync('supabase/migrations/20261025143142_food_inventory_recipe_dashboard_transactions.sql', 'utf8'));
  await db.exec(`create trigger test_inventory_archive_guard before update of active on public.food_inventory_items
    for each row execute function public.food_inventory_guard_archive_in_use();
    create function public.test_false_reconcile() returns trigger language plpgsql as $$begin
      if new.current_quantity>old.current_quantity and current_setting('foodweb.recipe_reconcile',true)<>'on' then
        perform set_config('test.false_reconcile','yes',true);
      end if; return new; end $$;
    create trigger test_false_reconcile after update of current_quantity on public.food_inventory_items
      for each row execute function public.test_false_reconcile();`);
  const owner = randomUUID(), outsider = randomUUID(), storeA = randomUUID(), storeB = randomUUID();
  const product = randomUUID(), foreignProduct = randomUUID(), item = randomUUID(), otherItem = randomUUID(), foreignItem = randomUUID();
  await q('insert into auth.users values ($1),($2)', [owner, outsider]);
  await q('insert into public.food_stores(id,opening_hours) values ($1,$3),($2,$3)', [storeA,storeB,JSON.stringify({timezone:'America/Sao_Paulo'})]);
  await q('insert into public.food_store_users(store_id,user_id) values ($1,$2),($3,$4)', [storeA,owner,storeB,outsider]);
  const session = async (user, role='authenticated') => {
    await db.exec('reset role');
    await q("select set_config('test.user',$1,false)",[user || '']);
    await db.exec(`set role ${role}`);
  };
  await session(owner);
  await q("insert into public.food_products(id,store_id,name,stock_quantity) values ($1,$2,'Produto demo',0)",[product,storeA]);
  await db.exec('reset role');
  await q("insert into public.food_products(id,store_id,name,stock_quantity) values ($1,$2,'Produto externo',3)",[foreignProduct,storeB]);
  await session(owner);
  await q("insert into public.food_inventory_items(id,store_id,name,item_type,unit,current_quantity,average_unit_cost,reorder_point) values ($1,$2,'Farinha','ingredient','kg',5,2,1),($3,$2,'Leite','ingredient','l',4,3,1),($4,$5,'Outra loja','ingredient','kg',1,1,1)",[item,storeA,otherItem,foreignItem,storeB]);
  await q("insert into public.food_inventory_movements(store_id,inventory_item_id,movement_type,quantity_delta,quantity_before,quantity_after,unit_cost) values ($1,$2,'purchase',5,0,5,2)",[storeA,item]);
  const edit = (id,payload,store=storeA) => one('select public.food_update_inventory_item_v1($1,$2,$3) as result',[store,id,payload]);
  const changed = (await edit(item,{name:'Farinha integral',unit:'g',reorder_point:1000})).result.item;
  check(changed.unit==='g'&&Number(changed.current_quantity)===5000&&Number(changed.reorder_point)===1000&&Number(changed.average_unit_cost)===.002,'unit + details + target threshold commit once');
  check(Number((await one('select quantity_after from public.food_inventory_movements where inventory_item_id=$1',[item])).quantity_after)===5000,'historical movement converted');
  check((await one("select current_setting('test.false_reconcile',true) as flag")).flag!=='yes','unit scale does not look like replenishment');
  const liters=(await edit(otherItem,{unit:'ml'})).result.item;
  check(liters.unit==='ml'&&Number(liters.current_quantity)===4000&&Number(liters.reorder_point)===1000&&Number(liters.average_unit_cost)===.003,'liters convert to milliliters including minimum and cost');
  const restored=(await edit(otherItem,{unit:'l'})).result.item;
  check(restored.unit==='l'&&Number(restored.current_quantity)===4&&Number(restored.reorder_point)===1&&Number(restored.average_unit_cost)===3,'milliliters convert back without double scaling');
  await q("update public.food_inventory_movements set quantity_delta=.001 where inventory_item_id=$1",[item]);
  await rejects(()=>edit(item,{name:'Inconsistente',unit:'kg',reorder_point:1}), 'invalid precision rolls back entire edit');
  check((await one('select name,unit from public.food_inventory_items where id=$1',[item])).name==='Farinha integral','failed conversion did not save name');
  await rejects(()=>edit(item,{name:'Inválido',unit:null}),'null unit rejected');
  await rejects(()=>edit(foreignItem,{name:'Vazamento'}),'cross-tenant inventory edit rejected');
  const recipe = async (items,prod=product,store=storeA) => one('select public.food_save_product_recipe_v1($1,$2,$3,$4,$5,$6,$7) as result',
    [store,prod,'Receita',1,'un','Teste',items]);
  const first = (await recipe([{inventory_item_id:item,stage:'Base',quantity:100,unit:'g',waste_percent:0,sort_order:0},{inventory_item_id:otherItem,stage:'Finalização',quantity:200,unit:'ml',waste_percent:0,sort_order:1}])).result;
  check(first.items.length===2&&first.recipe.product_id===product,'recipe creates active lines atomically');
  const archivedId=first.items.find(x=>x.inventory_item_id===otherItem).id;
  const orderId=randomUUID(), orderItemId=randomUUID();
  await q('insert into public.food_orders(id,store_id,status,payment_status,total) values ($1,$2,$3,$4,$5)',[orderId,storeA,'delivered','paid',20]);
  await q('insert into public.food_order_items(id,order_id,product_id,quantity) values ($1,$2,$3,1)',[orderItemId,orderId,product]);
  await q('insert into public.food_inventory_order_consumptions(store_id,order_id,order_item_id,recipe_id,recipe_item_id,inventory_item_id,target_quantity,consumed_quantity) values ($1,$2,$3,$4,$5,$6,200,200)',[storeA,orderId,orderItemId,first.recipe.id,archivedId,otherItem]);
  const replacement=(await recipe([{inventory_item_id:item,stage:'Base',quantity:110,unit:'g',waste_percent:0,sort_order:0}])).result;
  check(replacement.items.length===1&&replacement.items[0].id===first.items.find(x=>x.inventory_item_id===item).id,'recipe retains stable line ID and returns active only');
  check((await one('select active from public.food_product_recipe_items where id=$1',[archivedId])).active===false,'historic referenced line archived rather than deleted');
  check((await one('select recipe_item_id from public.food_inventory_order_consumptions where order_id=$1',[orderId])).recipe_item_id===archivedId,'historic consumption reference preserved');
  const nextOrder=randomUUID(), nextOrderItem=randomUUID();
  await q("insert into public.food_orders(id,store_id,status,payment_status,total) values ($1,$2,'received','pending',10)",[nextOrder,storeA]);
  await q('insert into public.food_order_items(id,order_id,product_id,quantity) values ($1,$2,$3,1)',[nextOrderItem,nextOrder,product]);
  await db.exec('reset role');
  await q('select public.food_reconcile_order_recipe_consumption($1,true)',[nextOrder]);
  await session(owner);
  const consumed=await q('select recipe_item_id from public.food_inventory_order_consumptions where order_id=$1',[nextOrder]);
  check(consumed.length===1&&consumed[0].recipe_item_id===replacement.items[0].id,'reconcile ignores inactive historic ingredient');
  const physicalBeforeRecipeEdit=Number((await one('select current_quantity from public.food_inventory_items where id=$1',[item])).current_quantity);
  const revised=(await recipe([{inventory_item_id:item,stage:'Base',quantity:120,unit:'g',sort_order:0}])).result;
  check(revised.items[0].id!==replacement.items[0].id,'consumed recipe revision stays immutable when quantity changes');
  await db.exec('reset role');
  await q('select public.food_reconcile_order_recipe_consumption($1,true)',[nextOrder]);
  await session(owner);
  const priorConsumption=await q('select recipe_item_id,target_quantity,consumed_quantity from public.food_inventory_order_consumptions where order_id=$1',[nextOrder]);
  check(priorConsumption.length===1&&priorConsumption[0].recipe_item_id===replacement.items[0].id&&Number(priorConsumption[0].consumed_quantity)===110&&Number((await one('select current_quantity from public.food_inventory_items where id=$1',[item])).current_quantity)===physicalBeforeRecipeEdit,'recipe edit does not retroactively return or consume stock for an old order');
  const readded=(await recipe([{inventory_item_id:item,stage:'Base',quantity:110,unit:'g',sort_order:0},{inventory_item_id:otherItem,stage:'Finalização',quantity:200,unit:'ml',sort_order:1}])).result;
  check(readded.items.find(x=>x.inventory_item_id===otherItem).id!==archivedId,'re-added ingredient gets new ID rather than reactivating historic line');
  await recipe([{inventory_item_id:item,stage:'Base',quantity:110,unit:'g',sort_order:0}]);
  await q('update public.food_inventory_items set active=false where id=$1',[otherItem]);
  check((await one('select active from public.food_inventory_items where id=$1',[otherItem])).active===false,'archived recipe line no longer blocks ingredient archive');
  await rejects(()=>recipe([{inventory_item_id:item,stage:'Base',quantity:999,unit:'g'},{inventory_item_id:foreignItem,stage:'Outro',quantity:1,unit:'kg'}]),'cross-tenant ingredient rejects recipe save after valid line');
  check(Number((await one('select quantity from public.food_product_recipe_items where id=$1',[replacement.items[0].id])).quantity)===110,'failed recipe save rolled back line changes');
  await rejects(()=>recipe([{inventory_item_id:item,stage:'Base',quantity:1,unit:'g'}],foreignProduct),'foreign tenant product rejects recipe save');
  await rejects(()=>recipe([{inventory_item_id:item,stage:'Base',quantity:1,unit:'g'},{inventory_item_id:item,stage:'base',quantity:1,unit:'g'}]),'duplicate ingredient stage rejected');
  const key=randomUUID();
  const stock=(mode,amount,reason,k=key)=>one('select public.food_adjust_product_stock_v1($1,$2,$3,$4,$5,$6) result',[storeA,product,mode,amount,reason,k]);
  check((await stock('set',17,'Contagem')).result.stock_quantity===17,'stock set 0 to 17');
  check((await stock('set',17,'Contagem')).result.stock_quantity===17,'same stock intent replay idempotent');
  await db.exec('reset role');
  await q('update public.food_products set stock_reserved_quantity=5 where id=$1',[product]);
  await session(owner);
  await rejects(()=>stock('set',4,'Contagem nova',randomUUID()),'reserved balance rejects physical stock below commitment');
  await rejects(()=>one('select public.food_adjust_product_stock_v1($1,$2,$3,$4,$5,$6)',[storeA,foreignProduct,'set',8,'Outro',randomUUID()]),'foreign tenant product stock denied');
  await rejects(()=>stock('set',18,'Contagem'),'same key different quantity rejected');
  await rejects(()=>stock('set',17,'Motivo distinto'),'same key different reason rejected');
  check((await one('select count(*) n from public.food_product_stock_movements where idempotency_key=$1',[key])).n===1,'one movement for stock retry');
  for(let i=0;i<105;i++) await q("insert into public.food_orders(store_id,status,payment_status,payment_received_at,total,created_at) values ($1,'delivered','paid',now()-interval '1 day',10,now()-interval '1 day')",[storeA]);
  await q("insert into public.food_orders(store_id,status,payment_status,payment_received_at,total,created_at) values ($1,'delivered','paid',now(),20,now()-interval '2 days'),($1,'cancelled','paid',now(),999,now()),($1,'received','pending',null,30,now())",[storeA]);
  const metrics=(await one('select public.food_dashboard_metrics_v1($1) result',[storeA])).result;
  check(Number(metrics.ordersTotal)===110&&Number(metrics.cancelledOrders)===1,'dashboard scans all orders including >100 and cancellations');
  check(Number(metrics.totalReceived)===1090&&Number(metrics.receivedToday)===20&&Number(metrics.receivedTodayCount)===1,'paid date and cancellation yield truthful totals');
  check(Number(metrics.pendingAmount)===40&&Number(metrics.pendingPayments)===2,'pending amount excludes paid and cancelled');
  await session(outsider);
  await rejects(()=>one('select public.food_dashboard_metrics_v1($1)',[storeA]),'cross-tenant dashboard denied');
  await session(owner);
  await q('update public.food_order_items set quantity=2 where id=$1',[nextOrderItem]);
  await db.exec('reset role');
  await q('select public.food_reconcile_order_recipe_consumption($1,true)',[nextOrder]);
  await session(owner);
  check(Number((await one('select consumed_quantity from public.food_inventory_order_consumptions where order_id=$1',[nextOrder])).consumed_quantity)===220,'old recipe revision scales with an explicit order quantity change');
  await q("update public.food_orders set status='cancelled' where id=$1",[nextOrder]);
  await db.exec('reset role');
  await q('select public.food_reconcile_order_recipe_consumption($1,true)',[nextOrder]);
  await session(owner);
  const afterCancellation=Number((await one('select current_quantity from public.food_inventory_items where id=$1',[item])).current_quantity);
  check(Number((await one('select consumed_quantity from public.food_inventory_order_consumptions where order_id=$1',[nextOrder])).consumed_quantity)===0,'cancelled order releases historical recipe consumption');
  await db.exec('reset role');
  await q('select public.food_reconcile_order_recipe_consumption($1,true)',[nextOrder]);
  await session(owner);
  check(Number((await one('select current_quantity from public.food_inventory_items where id=$1',[item])).current_quantity)===afterCancellation,'repeated cancellation does not return stock twice');
  await session(null,'anon');
  await rejects(()=>one('select public.food_update_inventory_item_v1($1,$2,$3)',[storeA,item,{name:'Oops'}]),'anonymous inventory update denied');
  await db.exec('reset role');
  console.log(`Inventory transactional DB test: ${checks} checks passed.`);
} finally { await db.close(); }
