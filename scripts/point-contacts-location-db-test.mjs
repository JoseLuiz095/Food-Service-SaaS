import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002',U='20000000-0000-4000-8000-000000000001';
const L='30000000-0000-4000-8000-000000000001',D='30000000-0000-4000-8000-000000000002',E='30000000-0000-4000-8000-000000000003',P='40000000-0000-4000-8000-000000000001',P2='40000000-0000-4000-8000-000000000002';
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const one=async(sql,args=[])=> (await q(sql,args))[0];
try{
 await db.exec(`create role authenticated;create role anon;create role service_role;
 create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
 create table food_stores(id uuid primary key,active boolean default true);
 create table food_store_users(store_id uuid,user_id uuid,active boolean default true);
 create function food_is_store_admin(uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from food_store_users where store_id=$1 and user_id=auth.uid() and active)$$;
 create function food_store_accessible(uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from food_stores where id=$1 and active)$$;
 create table food_stock_locations(id uuid primary key,store_id uuid,active boolean default true,is_default boolean default false,updated_at timestamptz,unique(id,store_id));
 create table food_pickup_locations(id uuid primary key,store_id uuid,stock_location_id uuid,name text,active boolean default true,is_public boolean default true,updated_at timestamptz,unique(id,store_id));
 create table food_receipt_contacts(store_id uuid,slot smallint,name text,phone text);
 create table food_pickup_receipt_contacts(store_id uuid,pickup_location_id uuid,contact_slot smallint);
 create function food_get_receipt_destinations_v1(uuid,uuid default null) returns jsonb language sql as $$select '{}'::jsonb$$;
 create table food_orders(id uuid,store_id uuid,stock_location_id uuid);
 create table food_product_location_stock(store_id uuid,location_id uuid,stock_quantity integer,stock_reserved_quantity integer);
 create table food_stock_location_movements(store_id uuid,from_location_id uuid,to_location_id uuid);
 create table food_order_stock_movements(store_id uuid,location_id uuid);
 insert into food_stores(id) values('${A}'),('${B}');insert into food_store_users values('${A}','${U}',true);
 insert into food_stock_locations values('${L}','${A}',true,true,now()),('${D}','${A}',true,false,now()),('${E}','${A}',true,false,now()),('${B}','${B}',true,true,now());
 insert into food_pickup_locations values('${P}','${A}','${D}','Ponto A',true,true,now()),('${P2}','${A}','${D}','Ponto B',true,true,now());`);
 await db.exec(readFileSync('supabase/migrations/20261030185746_food_point_contacts_and_location_lifecycle.sql','utf8'));
 // Simulate an existing two-contact point: retain the explicit proof destination.
 await db.exec(`insert into food_pickup_point_contacts values
 ('${A}','${P}',1,'Pessoa A','5511000000001','both'),
 ('${A}','${P}',2,'Pessoa B','5511000000002','confirmation'),
 ('${A}','${P2}',2,'Confirmação','5511000000003','confirmation');
 insert into food_receipt_contacts values('${A}',1,'Contato legado','5511000000004');
 insert into food_pickup_receipt_contacts values('${A}','${P2}',1);`);
 await db.exec(readFileSync('supabase/migrations/20261030213000_food_single_point_receipt_contact.sql','utf8'));
 assert.deepEqual((await q('select slot,name,purpose from food_pickup_point_contacts')),[{slot:1,name:'Pessoa A',purpose:'proof'}]);
 assert.deepEqual((await one('select food_get_receipt_destinations_v1($1,$2) as v',[A,P2])).v,{mode:'unassigned',contacts:[]});
 await db.exec(`set role authenticated;select set_config('test.user','${U}',false)`);
 const contacts=[{slot:1,name:'Pessoa A',phone:'5511000000001',purpose:'proof'}];
 await q('select food_save_pickup_point_contacts_v1($1,$2,$3::jsonb)',[A,P,JSON.stringify(contacts)]);
 const result=(await one('select food_get_receipt_destinations_v1($1,$2) as v',[A,P])).v;
 assert.equal(result.mode,'point');assert.equal(result.contacts.length,1);assert.equal(result.contacts[0].phone,contacts[0].phone);
 await db.exec('set role anon');
 assert.equal((await one('select food_get_receipt_destinations_v1($1,$2) as v',[A,P])).v.contacts.length,1);
 await assert.rejects(()=>q('select * from food_pickup_point_contacts'));
 await db.exec('set role authenticated');
 await assert.rejects(()=>q('select food_save_pickup_point_contacts_v1($1,$2,$3::jsonb)',[B,P,JSON.stringify(contacts)]));
 await assert.rejects(()=>q('select food_save_pickup_point_contacts_v1($1,$2,$3::jsonb)',[A,P,JSON.stringify([contacts[0],{...contacts[0],slot:2}])]));
 await assert.rejects(()=>q('select food_save_pickup_point_contacts_v1($1,$2,$3::jsonb)',[A,P,JSON.stringify([{...contacts[0],purpose:'confirmation'}])]));
 assert.equal((await q('select * from food_pickup_point_contacts')).length,1);
 await q('select food_save_pickup_point_contacts_v1($1,$2,$3::jsonb)',[A,P,JSON.stringify(contacts)]);
 assert.equal((await q('select * from food_pickup_point_contacts')).length,1);
 await q('select food_save_pickup_point_contacts_v1($1,$2,$3::jsonb)',[A,P,'[]']);
 assert.deepEqual((await one('select food_get_receipt_destinations_v1($1,$2) as v',[A,P])).v,{mode:'unassigned',contacts:[]});
 await assert.rejects(()=>q('select food_retire_stock_location_v1($1,$2)',[A,L]));
 await db.exec('set role authenticated');
 assert.equal((await one('select food_retire_stock_location_v1($1,$2) as v',[A,E])).v.action,'deleted');
 await db.exec('reset role');
 assert.equal((await one('select count(*) as n from food_stock_locations where id=$1',[E])).n,0);
 await db.exec('set role authenticated');
 await db.exec('reset role');await q('insert into food_product_location_stock values($1,$2,1,0)',[A,D]);await db.exec('set role authenticated');
 await assert.rejects(()=>q('select food_retire_stock_location_v1($1,$2)',[A,D]));
 await db.exec('reset role');await q('delete from food_product_location_stock');await db.exec('set role authenticated');
 assert.equal((await one('select food_retire_stock_location_v1($1,$2) as v',[A,D])).v.action,'archived');
 await db.exec('reset role');assert.equal((await one('select active from food_pickup_locations where id=$1',[P])).active,false);
 assert.equal((await one('select active from food_stock_locations where id=$1',[D])).active,false);
 console.log('OK: WhatsApp único do ponto, destino do comprovante, isolamento, saldo, principal e arquivamento.');
}finally{await db.close()}
