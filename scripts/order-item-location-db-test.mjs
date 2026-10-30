/** Regressão PostgreSQL isolada. Sem .env, credenciais, HTTP ou dados reais.
 * Usa corpos SQL capturados do catálogo, não presume migrations implantadas.
 * FOOD_RESERVATION_CANDIDATE_SQL permite compor a migration integral do PR #100
 * em outro PGlite descartável. Não altera a regra da baseline por padrão.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pathToFileURL } from 'node:url';

export async function runOrderItemLocationTests({ db = new PGlite(), concurrentCases } = {}) {
const baseline = JSON.parse(readFileSync(new URL('./fixtures/order-location-remote-baseline.json', import.meta.url), 'utf8'));
const guardBaseline = JSON.parse(readFileSync(new URL('./fixtures/order-location-guards-baseline.json', import.meta.url), 'utf8'));
const migration = readFileSync('supabase/migrations/20261028105112_food_order_item_reservation_location.sql', 'utf8');
const candidatePath = process.env.FOOD_RESERVATION_CANDIDATE_SQL;
const q = (sql, params = []) => db.query(sql, params);
const one = async (sql, params = []) => (await q(sql, params)).rows[0];
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const rejects = async (fn, pattern) => { await assert.rejects(fn, pattern); checks++; };
const source = name => baseline.functions.find(f => f.name === name).definition;
const ids = () => ({ store: randomUUID(), owner: randomUUID(), main: randomUUID(), point: randomUUID(), product: randomUUID() });
const a = ids(), b = ids();
const asUser = user => q("select set_config('test.user',$1,false)", [user]);
const context = value => q("select set_config('food.order_stock_location',$1,false)", [value]);
const readContext = async () => (await one("select current_setting('food.order_stock_location',true) value")).value;
const stock = async tenant => (await q('select location_id,stock_quantity,stock_reserved_quantity from food_product_location_stock where product_id=$1 order by location_id', [tenant.product])).rows;
const reserved = async (tenant, loc) => Number((await one('select stock_reserved_quantity n from food_product_location_stock where product_id=$1 and location_id=$2', [tenant.product, loc])).n);
const physical = async (tenant, loc) => Number((await one('select stock_quantity n from food_product_location_stock where product_id=$1 and location_id=$2', [tenant.product, loc])).n);
const edit = (order, items) => q('select * from food_update_order_items_v1($1,$2)', [order, JSON.stringify(items)]);
const createOrder = async (tenant, location = tenant.point, quantity = 1, future = false) => {
  const order = randomUUID(), item = randomUUID();
  await q(`insert into food_orders(id,store_id,stock_location_id,scheduled_for) values($1,$2,$3,case when $4 then now()+interval '7 days' end)`, [order,tenant.store,location,future]);
  await q(`insert into food_order_items(id,order_id,product_id,product_name,quantity,unit_price,variant_name,variant_price_delta,addons,item_total)
    values($1,$2,$3,'Sintético',$4,10,'Opção de teste',2,'[{"name":"Extra sintético","price":1}]',$4*13)`, [item,order,tenant.product,quantity]);
  return { order, item };
};
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table food_stores(id uuid primary key,opening_hours jsonb default '{}',active boolean default true,archived_at timestamptz,approval_status text default 'approved');
    create table food_store_users(store_id uuid,user_id uuid,active boolean default true,role text default 'owner');
    create table food_platform_admins(user_id uuid,active boolean default true);
    create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal',coalesce(nullif(current_setting('test.aal',true),''),'aal1'))$$;
    create function food_is_store_admin(uuid) returns boolean language sql stable as $$select exists(select 1 from food_store_users where store_id=$1 and user_id=auth.uid())$$;
    create function food_is_platform_admin() returns boolean language sql stable as $$select false$$;
    create table food_products(id uuid primary key,store_id uuid,name text,active boolean default true,availability_status text default 'available',stock_status text default 'available',price numeric default 10,promotional_price numeric,track_stock boolean default true,stock_quantity integer default 20,stock_reserved_quantity integer default 0,updated_at timestamptz default now());
    create table food_orders(id uuid primary key,store_id uuid,stock_location_id uuid,pickup_location_id uuid,payment_status text default 'pending',status text default 'received',inventory_status text default 'not_tracked',scheduled_for timestamptz,desired_date date,delivery_fee numeric default 0,payment_method text default 'pix',needs_change boolean default false,change_for numeric,change_amount numeric,subtotal numeric,total numeric,updated_at timestamptz default now());
    create table food_order_items(id uuid primary key default gen_random_uuid(),order_id uuid,product_id uuid,product_name text,quantity integer,unit_price numeric,variant_name text,variant_price_delta numeric,addons jsonb,item_total numeric,inventory_reserved_quantity integer default 0,created_at timestamptz default now());
    create table food_option_groups(id uuid,store_id uuid,active boolean,min_choices integer);
    create table food_product_option_groups(product_id uuid,option_group_id uuid,store_id uuid);
    create table food_stock_locations(id uuid primary key default gen_random_uuid(),store_id uuid,name text,location_type text,is_default boolean default false,active boolean default true);
    create table food_product_location_stock(store_id uuid,product_id uuid,location_id uuid,stock_quantity integer default 0 check(stock_quantity>=0),stock_reserved_quantity integer default 0,updated_at timestamptz default now(),primary key(product_id,location_id),constraint food_product_location_stock_check check(stock_reserved_quantity>=0 and stock_reserved_quantity<=stock_quantity));
    create table food_inventory_order_consumptions(order_id uuid,target_quantity integer,consumed_quantity integer);
    create table food_order_stock_movements(store_id uuid,order_id uuid,order_item_id uuid,product_id uuid,location_id uuid,event_type text,quantity integer,unique(order_item_id,event_type));
    create table food_product_stock_movements(store_id uuid,product_id uuid,product_name text,movement_type text,quantity_before integer,quantity_after integer,quantity_delta integer,reason text,idempotency_key uuid,created_by uuid,requested_quantity integer);
    create table food_stock_location_movements(store_id uuid,product_id uuid,to_location_id uuid,movement_type text,quantity integer,request_payload jsonb,reason text,idempotency_key uuid,created_by uuid);
    create function food_reconcile_order_recipe_consumption(uuid,boolean) returns void language plpgsql as $$begin return; end;$$;
  `);
  for (const f of baseline.functions) await db.exec(f.definition);
  for (const f of guardBaseline.authorization) await db.exec(f.definition);
  await db.exec(guardBaseline.guards.find(f => f.proname === 'food_release_inventory_on_cancel').definition);
  // Recria a ACL observada da RPC; CREATE OR REPLACE não deve ampliá-la.
  await db.exec(`revoke all on function food_update_order_items_v1(uuid,jsonb) from public,anon;
    grant execute on function food_update_order_items_v1(uuid,jsonb) to authenticated,service_role;`);
  const aclBefore = (await one("select proacl::text acl from pg_proc where oid='food_update_order_items_v1(uuid,jsonb)'::regprocedure")).acl;
  await db.exec(migration);
  await db.exec(migration); // Instalação repetida aceita apenas baseline ou correção conhecida.
  eq((await one("select proacl::text acl from pg_proc where oid='food_update_order_items_v1(uuid,jsonb)'::regprocedure")).acl, aclBefore, 'ACL preservada');
  check(!(await one("select has_function_privilege('anon','food_update_order_items_v1(uuid,jsonb)','execute') allowed")).allowed,'anon sem EXECUTE');
  const fixedDefinition = (await one("select pg_get_functiondef('food_update_order_items_v1(uuid,jsonb)'::regprocedure) definition")).definition;
  // Drift real, anterior à edição: a migration deve recusar sobrescrever.
  await db.exec(fixedDefinition.replace('Quantidade inválida.', 'Quantidade divergente.'));
  await rejects(() => db.exec(migration), /Baseline.*divergente/);
  await db.exec('rollback');
  await db.exec(fixedDefinition);
  if (candidatePath) await db.exec(readFileSync(candidatePath, 'utf8'));
  await db.exec(`create trigger sync_stock after update of stock_quantity,stock_reserved_quantity on food_products for each row execute function food_sync_default_location_stock();
    create trigger reserve_item after insert on food_order_items for each row execute function food_reserve_inventory_on_item_insert();
    create trigger cancel_order after update of status on food_orders for each row execute function food_release_inventory_on_cancel();
    create trigger fulfill after update of status on food_orders for each row execute function food_commit_inventory_on_fulfillment();`);
  for (const tenant of [a,b]) {
    await q('insert into food_stores(id) values($1)',[tenant.store]);
    await q('insert into food_store_users values($1,$2)',[tenant.store,tenant.owner]);
    await q("insert into food_stock_locations(id,store_id,name,is_default) values($1,$3,'Principal sintético',true),($2,$3,'Ponto sintético',false)",[tenant.main,tenant.point,tenant.store]);
    await q("insert into food_products(id,store_id,name) values($1,$2,'Produto sintético')",[tenant.product,tenant.store]);
    await q('insert into food_product_location_stock(store_id,product_id,location_id,stock_quantity) values($1,$2,$3,10),($1,$2,$4,10)',[tenant.store,tenant.product,tenant.main,tenant.point]);
  }
  for (const tenant of [a,b]) {
    await asUser(tenant.owner);
    const {order,item} = await createOrder(tenant);
    await context(tenant === a ? b.main : a.main); // Contexto hostil não escolhe o destino.
    const callerContext = await readContext();
    await edit(order,[{item_id:item,quantity:2}]);
    eq(await reserved(tenant,tenant.point),2,'edição reserva o ponto original');
    eq(await reserved(tenant,tenant.main),0,'principal sem reserva indevida');
    eq(await readContext(),callerContext,'restaura contexto do chamador após sucesso');
    const personalized = await one('select variant_name,variant_price_delta,addons,item_total from food_order_items where id=$1',[item]);
    eq(personalized.variant_name,'Opção de teste','opção original preservada');
    eq(Number(personalized.variant_price_delta),2,'acréscimo original preservado');
    eq(personalized.addons,[{name:'Extra sintético',price:1}],'adicionais preservados');
    eq(Number(personalized.item_total),26,'quantidade mantém preço com opções');
    const beforeFailure = await stock(tenant);
    await db.exec('begin; savepoint edit_attempt');
    await rejects(() => edit(order,[{item_id:item,quantity:99}]), /Estoque insuficiente/);
    await db.exec('rollback to edit_attempt');
    eq(await stock(tenant),beforeFailure,'erro restaura físico e reserva');
    eq(await readContext(),callerContext,'erro capturado também restaura contexto');
    eq(Number((await one('select quantity from food_order_items where id=$1',[item])).quantity),2,'erro reverte quantidade');
    await db.exec('commit');
    await edit(order,[{item_id:item,quantity:2}]);
    eq(await reserved(tenant,tenant.point),2,'retry não duplica reserva');
    await q("update food_orders set status='picked_up' where id=$1",[order]);
    await q("update food_orders set status='picked_up' where id=$1",[order]);
    eq(await physical(tenant,tenant.point),8,'retirada debita ponto uma vez');
    eq(await physical(tenant,tenant.main),10,'retirada preserva principal');
    eq(await reserved(tenant,tenant.point),0,'retirada libera compromisso');
    const movements=(await q('select location_id,quantity from food_order_stock_movements where order_id=$1',[order])).rows;
    eq(movements,[{location_id:tenant.point,quantity:2}],'uma saída com local correto');
    await rejects(() => edit(order,[{item_id:item,quantity:1}]), /já recebido/);
    const cancelled = await createOrder(tenant);
    await edit(cancelled.order,[{item_id:cancelled.item,quantity:3}]);
    await q("update food_orders set status='cancelled' where id=$1",[cancelled.order]);
    await q('select food_release_order_inventory($1)',[cancelled.order]);
    eq(await reserved(tenant,tenant.point),0,'cancelamento libera ponto uma vez');
    eq(await physical(tenant,tenant.point),8,'cancelamento não fabrica físico');
    eq(Number((await one('select count(*) n from food_order_stock_movements where order_id=$1',[cancelled.order])).n),0,'cancelamento sem saída fictícia');
  }
  await asUser(b.owner);
  const delivery=await createOrder(b);
  await edit(delivery.order,[{item_id:delivery.item,quantity:2}]);
  await q("update food_orders set status='delivered' where id=$1",[delivery.order]);
  eq(await physical(b,b.point),6,'entrega também baixa o local original');
  eq(await reserved(b,b.point),0,'entrega encerra reserva do ponto');
  await asUser(a.owner);
  const pending=await createOrder(a);
  const before=await stock(a);
  await asUser(b.owner);
  await rejects(()=>edit(pending.order,[{item_id:pending.item,quantity:2}]),/Acesso negado/);
  await asUser('');
  await rejects(()=>edit(pending.order,[{item_id:pending.item,quantity:2}]),/Acesso negado/);
  eq(await stock(a),before,'tenant alheio e anônimo não alteram reserva');
  await asUser(a.owner);
  await rejects(()=>edit(pending.order,[{product_id:b.product,quantity:1}]),/não disponível/);
  eq(await stock(a),before,'produto de outro tenant reverte liberação');
  const bOrder=await createOrder(b);
  await rejects(()=>edit(pending.order,[{item_id:bOrder.item,quantity:1}]),/não encontrado/);
  eq(await stock(a),before,'item de outro pedido não altera reserva');
  await q('update food_orders set stock_location_id=$1 where id=$2',[b.point,pending.order]);
  await rejects(()=>edit(pending.order,[{item_id:pending.item,quantity:2}]),/Local de estoque indisponível/);
  eq(await stock(a),before,'local de outro tenant rejeitado antes de liberar');
  await q('update food_orders set stock_location_id=$1 where id=$2',[a.point,pending.order]);
  await q('update food_stock_locations set active=false where id=$1',[a.point]);
  await rejects(()=>edit(pending.order,[{item_id:pending.item,quantity:2}]),/Local de estoque indisponível/);
  eq(await stock(a),before,'local inativo preserva reserva');
  await q('update food_stock_locations set active=true where id=$1',[a.point]);
  const legacy=await createOrder(a,null);
  await context('');
  await edit(legacy.order,[{item_id:legacy.item,quantity:2}]);
  eq(await reserved(a,a.main),2,'pedido legado sem local usa principal da mesma loja');
  eq(await readContext(),'','contexto vazio restaurado');
  await edit(legacy.order,[{product_id:a.product,quantity:3}]);
  eq(await reserved(a,a.main),3,'substituição de linha tem reserva única');
  eq(Number((await one('select count(*) n from food_order_items where order_id=$1',[legacy.order])).n),1,'substituição remove linha anterior');
  const future=await createOrder(a,a.point,1,true);
  await edit(future.order,[{item_id:future.item,quantity:9}]);
  eq(await reserved(a,a.main),3,'encomenda futura não vaza para principal');
  const expectedPoint=candidatePath ? 10 : 8;
  eq(await reserved(a,a.point),expectedPoint,'encomenda conserva semântica da variante de banco');
  eq((await one('select inventory_status from food_orders where id=$1',[future.order])).inventory_status,'awaiting_restock','encomenda sinaliza reposição');
  await db.exec(readFileSync('supabase/migrations/20261030002410_food_fulfillment_reserve_location.sql','utf8'));
  await db.exec('begin; savepoint failed_delivery');
  await rejects(()=>q("update food_orders set status='picked_up' where id=$1",[future.order]),/Estoque insuficiente/);
  await db.exec('rollback to failed_delivery; commit');
  eq((await one('select status from food_orders where id=$1',[future.order])).status,'received','entrega sem saldo integral não muda status');
  eq(await physical(a,a.point),8,'entrega recusada não debita ponto');
  await context(a.point);
  await q('update food_products set stock_quantity=stock_quantity+9 where id=$1',[a.product]);
  eq(await physical(a,a.point),17,'reposição chega ao ponto do pedido');
  await q("update food_orders set status='picked_up' where id=$1",[future.order]);
  eq(await physical(a,a.point),8,'entrega pendente agora debita o ponto correto');
  eq(await reserved(a,a.point),1,'reserva de outro pedido permanece intacta');
  eq(Number((await one('select quantity from food_order_stock_movements where order_id=$1',[future.order])).quantity),9,'auditoria registra uma saída do pedido');
  await q("update food_orders set status='picked_up' where id=$1",[future.order]);
  eq(Number((await one('select count(*) n from food_order_stock_movements where order_id=$1',[future.order])).n),1,'retry não duplica débito');
  const serviceStore=randomUUID(), serviceProduct=randomUUID();
  await q('insert into food_stores(id) values($1)',[serviceStore]);
  await q('insert into food_store_users values($1,$2)',[serviceStore,a.owner]);
  await q("insert into food_products(id,store_id,name,track_stock) values($1,$2,'Serviço sintético',false)",[serviceProduct,serviceStore]);
  const service=await createOrder({store:serviceStore,product:serviceProduct,point:null},null);
  await edit(service.order,[{item_id:service.item,quantity:2}]);
  eq(Number((await one('select quantity from food_order_items where id=$1',[service.item])).quantity),2,'serviço sem local continua editável');
  eq((await one('select inventory_status from food_orders where id=$1',[service.order])).inventory_status,'not_tracked','serviço não recebe reserva física');
  await rejects(()=>edit(service.order,[{product_id:a.product,quantity:1}]),/não disponível/);
  eq(Number((await one('select quantity from food_order_items where id=$1',[service.item])).quantity),2,'troca de loja/produto não altera serviço');
  if (concurrentCases) await concurrentCases({ db, check, eq, rejects });
  await db.exec(readFileSync('docs/rollback/food_order_item_location.sql', 'utf8'));
  eq((await one("select regexp_replace(prosrc, '\\s+', '', 'g') body from pg_proc where oid='food_update_order_items_v1(uuid,jsonb)'::regprocedure")).body, source('food_update_order_items_v1').match(/AS \$function\$([\s\S]*?)\$function\$/)[1].replace(/\s+/g,''), 'rollback restaura exatamente o corpo observado');
  await db.exec(migration);
  // A RPC existente preserva opções; não aceita editar o catálogo de opções.
  // A alteração de opções/personalização permanece fora do contrato deste fix.
  console.log(`OK: ${checks} verificações de edição/local, opções preservadas, saída única, rollback, retry, ACL e dois tenants (${candidatePath ? 'com PR #100' : 'baseline remota'}).`);
} finally { await db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runOrderItemLocationTests();
