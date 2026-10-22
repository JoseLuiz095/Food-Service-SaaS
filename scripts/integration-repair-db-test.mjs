import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

// Banco descartável: tipos e políticas reais de insumos; funções legadas de
// reserva e trigger INSERT carregadas dos SQLs existentes. Nunca usa produção.
const read = name => readFileSync(`supabase/${name}`, 'utf8');
const functionSql = (sql, name) => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, name);
  const end = sql.indexOf('$$;', start);
  assert.ok(end > start, name);
  return sql.slice(start, end + 3);
};
let checks = 0;
for (const priorMigrations of [false, true]) {
  const db = new PGlite();
  const q = async (sql, args = []) => (await db.query(sql, args)).rows;
  const one = async (sql, args = []) => (await q(sql, args))[0];
  const check = (ok, label) => { assert.ok(ok, label); checks++; };
  const rejects = async (fn, label) => { await assert.rejects(fn); checks++; };
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
      create table food_stores(id uuid primary key, opening_hours jsonb default '{}');
      create table food_store_users(store_id uuid,user_id uuid);
      create function food_is_store_admin(uuid) returns boolean language sql stable security definer as $$select exists(select 1 from food_store_users where store_id=$1 and user_id=auth.uid())$$;
      create function food_is_store_member(uuid) returns boolean language sql stable security definer as $$select food_is_store_admin($1)$$;
      create function food_is_platform_admin() returns boolean language sql stable as $$select false$$;
      create table food_products(id uuid primary key default gen_random_uuid(),store_id uuid,name text,active boolean default true,
        availability_status text default 'available',stock_status text default 'available',price numeric default 10,promotional_price numeric,
        track_stock boolean default true,stock_quantity integer default 10,stock_reserved_quantity integer default 0,updated_at timestamptz default now(),unique(id,store_id));
      create table food_orders(id uuid primary key default gen_random_uuid(),store_id uuid,payment_status text default 'pending',status text default 'received',
        inventory_status text default 'not_tracked',scheduled_for timestamptz,desired_date date,delivery_fee numeric default 3,
        payment_method text default 'pix',needs_change boolean default false,change_for numeric,change_amount numeric,
        subtotal numeric default 10,total numeric default 13,updated_at timestamptz default now());
      create table food_order_items(id uuid primary key default gen_random_uuid(),order_id uuid references food_orders(id),product_id uuid,product_name text,
        quantity integer not null,unit_price numeric,variant_name text,variant_price_delta numeric,addons jsonb,item_total numeric,
        inventory_reserved_quantity integer default 0,created_at timestamptz default now());
      create table food_order_item_options(id uuid default gen_random_uuid(),order_item_id uuid,group_name text,option_name text,price_delta numeric);
      create table food_option_groups(id uuid,store_id uuid,active boolean,min_choices integer);
      create table food_product_option_groups(product_id uuid,option_group_id uuid,store_id uuid);
      create function food_commit_order_inventory(uuid) returns void language plpgsql as $$begin raise exception 'Não deve receber pagamento nesta edição'; end$$;
      grant usage on schema auth to authenticated,anon;
      grant select on food_store_users to authenticated;
    `);
    await db.exec(read('migrations/202610091500_foodweb_inventory_foundation.sql'));
    const stockPatch = read('patches/20261008_foodweb_inventory.sql');
    await db.exec(functionSql(stockPatch, 'food_reserve_product_inventory'));
    await db.exec(functionSql(stockPatch, 'food_release_order_inventory'));
    await db.exec(functionSql(read('migrations/20261009131818_foodweb_release_integrity_fix.sql'), 'food_reserve_inventory_on_item_insert'));
    await db.exec(`create trigger food_order_items_inventory_reserve_trg after insert on food_order_items for each row execute function food_reserve_inventory_on_item_insert();
      create table food_inventory_order_consumptions(id uuid primary key default gen_random_uuid(),store_id uuid,inventory_item_id uuid,order_id uuid,target_quantity numeric,consumed_quantity numeric);
      create table test_reconciles(order_id uuid);
      create function food_reconcile_order_recipe_consumption(uuid,boolean) returns void language sql as $$insert into test_reconciles values($1)$$;`);
    await db.exec(read('migrations/202610131500_foodweb_inventory_recipe_guard_fix.sql'));
    await db.exec('create trigger food_inventory_recipe_reconcile_trg after update on food_inventory_items for each row execute function food_reconcile_recipe_orders_on_inventory_update()');
    if (priorMigrations) {
      for (const name of ['202610201300_foodweb_pending_order_item_edit.sql', '20261021003621_foodweb_inventory_count_and_order_indexes.sql', '20261021011000_foodweb_inventory_unit_conversion.sql']) await db.exec(read(`migrations/${name}`));
    }
    const repair = read('migrations/20261022175933_food_operational_rpc_repair.sql');
    await db.exec(repair);
    await db.exec(repair); // Idempotente sobre o próprio reparo.
    await db.exec(`grant select on all tables in schema public to authenticated;
      alter table food_products enable row level security;
      create policy product_read on food_products for select to authenticated using(food_is_store_admin(store_id));
      alter table food_orders enable row level security;
      create policy order_read on food_orders for select to authenticated using(food_is_store_admin(store_id));
      grant update on food_inventory_items to authenticated;`);
    const userA = randomUUID(), userB = randomUUID(), a = randomUUID(), b = randomUUID(), pa = randomUUID(), pb = randomUUID(), pc = randomUUID(), order = randomUUID();
    await db.query('insert into auth.users values($1),($2)', [userA, userB]);
    await db.query('insert into food_stores(id) values($1),($2)', [a, b]);
    await db.query('insert into food_store_users values($1,$2),($3,$4)', [a,userA,b,userB]);
    for (const [id, store] of [[pa,a],[pb,b],[pc,a]]) await db.query('insert into food_products(id,store_id,name) values($1,$2,$3)', [id,store,'Produto genérico']);
    await db.query('insert into food_orders(id,store_id) values($1,$2)', [order,a]);
    const item = (await one("insert into food_order_items(order_id,product_id,product_name,quantity,unit_price,item_total,variant_name,addons) values($1,$2,'Snapshot',1,8,10,'Variante antiga','[{\"name\":\"Extra antigo\"}]') returning id", [order,pa])).id;
    await db.query("insert into food_order_item_options(order_item_id,group_name,option_name,price_delta) values($1,'Grupo snapshot','Opção antiga',2)", [item]);
    const session = async user => { await db.exec('reset role'); await db.query("select set_config('test.user',$1,false)", [user || '']); await db.exec(`set role ${user ? 'authenticated' : 'anon'}`); };
    const edit = items => db.query('select * from food_update_order_items_v1($1,$2)', [order,JSON.stringify(items)]);
    await session(userA);
    await edit([{item_id:item,quantity:2}]);
    check(Number((await one('select stock_reserved_quantity from food_products where id=$1',[pa])).stock_reserved_quantity)===2,'aumenta reserva somente pelo delta');
    const snapshot = await one('select * from food_order_items where id=$1',[item]);
    check(snapshot.product_name==='Snapshot' && snapshot.variant_name==='Variante antiga' && Number(snapshot.unit_price)===8 && Number(snapshot.item_total)===20 && snapshot.addons[0].name==='Extra antigo','mantém snapshots/desconto/opções no aumento');
    check((await one('select count(*) n from food_order_item_options where order_item_id=$1',[item])).n===1,'opção snapshot preservada');
    await edit([{item_id:item,quantity:2},{product_id:pc,quantity:3}]);
    check((await one('select stock_reserved_quantity from food_products where id=$1',[pc])).stock_reserved_quantity===3,'item novo passa pelo trigger mas reserva uma única vez');
    await edit([{item_id:item,quantity:1}]);
    check((await one('select stock_reserved_quantity from food_products where id=$1',[pc])).stock_reserved_quantity===0,'remover libera reserva do item novo');
    check(Number((await one('select total from food_orders where id=$1',[order])).total)===13,'diminuição recalcula com frete preservado');
    await db.exec('reset role');
    await db.query("update food_orders set payment_method='cash',needs_change=true,change_for=30,change_amount=17 where id=$1",[order]);
    await session(userA);
    await edit([{item_id:item,quantity:2}]);
    check(Number((await one('select change_amount from food_orders where id=$1',[order])).change_amount)===7,'aumentar total recalcula troco');
    await rejects(()=>edit([{item_id:item,quantity:3}]),'total maior que dinheiro para troco rejeita edição integral');
    check(Number((await one('select change_amount from food_orders where id=$1',[order])).change_amount)===7,'rejeição mantém troco e reserva anteriores');
    await edit([{item_id:item,quantity:1}]);
    const before = await one('select row_to_json(o) v from food_orders o where id=$1',[order]);
    await rejects(()=>edit([{item_id:item,quantity:99}]),'estoque insuficiente rejeitado');
    check(JSON.stringify((await one('select row_to_json(o) v from food_orders o where id=$1',[order])).v)===JSON.stringify(before.v),'falha reverte pedido e estado temporário');
    check((await one('select stock_reserved_quantity from food_products where id=$1',[pa])).stock_reserved_quantity===1,'falha mantém reserva anterior');
    await rejects(()=>edit([{product_id:pb,quantity:1}]),'não adiciona produto de outro tenant');
    await rejects(()=>db.query('select * from food_update_order_items_v1($1,null)',[order]),'NULL não apaga pedido');
    await rejects(()=>edit([{item_id:item}]),'quantidade ausente rejeitada');
    await session(userB);
    await rejects(()=>edit([{item_id:item,quantity:2}]),'outro tenant não edita pedido');
    await session(null);
    await rejects(()=>edit([{item_id:item,quantity:2}]),'anônimo não edita pedido');
    await db.exec('reset role');
    for (const [column, value] of [['payment_status','paid'],['status','cancelled'],['inventory_status','committed']]) {
      await db.query(`update food_orders set ${column}=$1 where id=$2`,[value,order]); await session(userA);
      await rejects(()=>edit([{item_id:item,quantity:2}]),`${value} não permite edição`);
      await db.exec('reset role'); await db.query(`update food_orders set ${column}=$1 where id=$2`,[column==='status'?'received':column==='inventory_status'?'reserved':'pending',order]);
    }
    const ia=randomUUID(), ib=randomUUID();
    await db.query("insert into food_inventory_items(id,store_id,name,unit,current_quantity,average_unit_cost,reorder_point) values($1,$2,'Insumo A','kg',2,10,1),($3,$4,'Insumo B','kg',7,5,1)",[ia,a,ib,b]);
    const recipe=(await one('insert into food_product_recipes(store_id,product_id) values($1,$2) returning id',[a,pa])).id;
    await db.query("insert into food_product_recipe_items(store_id,recipe_id,inventory_item_id,quantity,unit) values($1,$2,$3,0.5,'kg')",[a,recipe,ia]);
    const purchase=(await one('insert into food_inventory_purchases(store_id,created_by) values($1,$2) returning id',[a,userA])).id;
    await db.query('insert into food_inventory_purchase_items(purchase_id,store_id,inventory_item_id,quantity,unit_cost) values($1,$2,$3,1,10)',[purchase,a,ia]);
    await db.query('insert into food_inventory_order_consumptions(store_id,inventory_item_id,order_id,target_quantity,consumed_quantity) values($1,$2,$3,3,1)',[a,ia,order]);
    await db.query("update food_orders set payment_status='paid' where id=$1",[order]);
    await session(userA);
    const count = async items => (await one('select food_commit_inventory_count($1,$2,null) result',[a,JSON.stringify(items)])).result;
    await count([{inventory_item_id:ia,counted_quantity:2.5}]);
    check((await one('select count(*) n from food_inventory_counts')).n===1,'contagem cria documento auditável');
    check((await one('select count(*) n from test_reconciles')).n===1,'contagem real permite reconciliação de pedidos pendentes');
    const convert = (store,id,unit) => db.query('select food_convert_inventory_unit($1,$2,$3)',[store,id,unit]);
    await db.exec('begin');
    await convert(a,ia,'g');
    check((await one("select current_setting('foodweb.inventory_mutation',true) m,current_setting('foodweb.recipe_reconcile',true) r")).m!=='on','flag mutação restaurada dentro da mesma transação');
    await rejects(()=>db.query('update food_inventory_items set current_quantity=9999 where id=$1',[ia]),'conversão não libera atualização direta seguinte');
    await db.exec('rollback');
    await convert(a,ia,'g');
    check(Number((await one('select current_quantity from food_inventory_items where id=$1',[ia])).current_quantity)===2500,'conversão preserva saldo físico');
    check((await one('select count(*) n from test_reconciles')).n===1,'conversão não aciona consumo de pedidos como se fosse reposição');
    const scaled = await one('select quantity,unit from food_product_recipe_items where inventory_item_id=$1',[ia]);
    check(Number(scaled.quantity)===500 && scaled.unit==='g','ficha técnica convertida');
    check(Number((await one('select target_quantity from food_inventory_order_consumptions where inventory_item_id=$1',[ia])).target_quantity)===3000,'consumo pendente convertido');
    check(Number((await one('select counted_quantity from food_inventory_count_items where inventory_item_id=$1',[ia])).counted_quantity)===2500,'histórico da contagem convertido');
    const historicalPurchase=await one('select quantity,unit_cost,total_cost from food_inventory_purchase_items where inventory_item_id=$1',[ia]);
    check(Number(historicalPurchase.quantity)===1000 && Number(historicalPurchase.unit_cost)===0.01 && Number(historicalPurchase.total_cost)===10,'compra mantém valor total e escala física');
    const movement=await one('select quantity_delta,unit_cost,total_cost from food_inventory_movements where inventory_item_id=$1',[ia]);
    check(Number(movement.quantity_delta)===500 && Number(movement.unit_cost)===0.01 && Number(movement.total_cost)===5,'movimentação mantém valor e escala física');
    await rejects(()=>convert(b,ib,'g'),'conversão de outro tenant negada');
    await rejects(()=>convert(a,ia,'un'),'conversão sem equivalência rejeitada');
    await rejects(()=>count([{inventory_item_id:ia,counted_quantity:2},{inventory_item_id:ib,counted_quantity:4}]),'contagem com outro tenant faz rollback integral');
    check(Number((await one('select current_quantity from food_inventory_items where id=$1',[ia])).current_quantity)===2500,'falha no lote mantém saldo anterior');
    check((await one('select count(*) n from food_inventory_counts')).n===1,'falha no lote não deixa documento parcial');
    await rejects(()=>count([{inventory_item_id:ia,counted_quantity:2},{inventory_item_id:ia,counted_quantity:3}]),'contagem duplicada rejeitada');
    await db.exec('begin');
    await count([{inventory_item_id:ia,counted_quantity:2501}]);
    const flags = await one("select current_setting('foodweb.inventory_mutation',true) m,current_setting('foodweb.recipe_reconcile',true) r");
    check(flags.m!=='on' && flags.r!=='on','contagem não vaza flag para operação seguinte');
    await db.exec('rollback');
    await db.exec('reset role');
    await db.query('update food_product_recipe_items set quantity=0.1 where inventory_item_id=$1',[ia]);
    await session(userA);
    await rejects(()=>convert(a,ia,'kg'),'precisão insuficiente na ficha técnica rejeita conversão inteira');
    check((await one('select unit,current_quantity from food_inventory_items where id=$1',[ia])).unit==='g','rejeição não muda unidade nem saldo');
    check(Number((await one('select counted_quantity from food_inventory_count_items where inventory_item_id=$1',[ia])).counted_quantity)===2500,'rejeição preserva histórico');
    await db.exec('reset role');
    await db.query('update food_product_recipe_items set quantity=500 where inventory_item_id=$1',[ia]);
    const preciseCost=randomUUID();
    await db.query("insert into food_inventory_items(id,store_id,name,unit,current_quantity,average_unit_cost) values($1,$2,'Custo pequeno','kg',1,0.0001)",[preciseCost,a]);
    await session(userA);
    await rejects(()=>convert(a,preciseCost,'g'),'não transforma custo não zero em zero por arredondamento');
    await db.exec('reset role');
    await db.exec(`create function test_reject_unit_change() returns trigger language plpgsql as $$begin if new.unit<>old.unit then raise exception 'Conflito simulado durante gravação'; end if; return new; end$$;
      create trigger test_conflict before update on food_inventory_items for each row execute function test_reject_unit_change();`);
    await session(userA);
    await rejects(()=>convert(a,ia,'kg'),'erro depois de ativar flags reverte conversão');
    const failedFlags=await one("select current_setting('foodweb.inventory_mutation',true) m,current_setting('foodweb.recipe_reconcile',true) r");
    check(failedFlags.m!=='on' && failedFlags.r!=='on','erro não vaza flags de conversão');
    await db.exec('reset role; drop trigger test_conflict on food_inventory_items');
    await session(userA);
    await count([{inventory_item_id:ia,counted_quantity:2500}]);
    const repeated=await one('select expected_quantity,counted_quantity,quantity_delta from food_inventory_count_items where count_id=(select id from food_inventory_counts order by created_at desc limit 1)');
    check(Number(repeated.expected_quantity)===2500 && Number(repeated.quantity_delta)===0,'contagem seguinte lê saldo atual sob lock e não aplica delta antigo');
    await session(userB);
    check((await q('select * from food_inventory_counts')).length===0,'RLS oculta contagem de outro tenant');
    check(Number((await one('select current_quantity from food_inventory_items where id=$1',[ib])).current_quantity)===7,'outra loja permanece intacta');
    console.log(`OK reparo PostgreSQL: ${priorMigrations?'instalação com migrations antigas':'estado de produção sem RPCs'}; aplicação idempotente.`);
  } finally { await db.close(); }
}
console.log(`${checks} verificações de reparo operacional aprovadas.`);
