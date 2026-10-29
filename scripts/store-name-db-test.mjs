import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';

export async function runStoreNameTests({db=new PGlite(),concurrentCases}={}) {
 let count=0;
 const eq=(a,b,label)=>{assert.deepEqual(a,b,label);count++};
 const ok=(a,label)=>{assert.ok(a,label);count++};
 const no=async(fn,pattern)=>{await assert.rejects(fn,pattern);count++};
 const q=(sql,args=[])=>db.query(sql,args);
 const scalar=async(sql,args=[])=>Object.values((await q(sql,args)).rows[0])[0];
 const A=randomUUID(),B=randomUUID(),U=randomUUID(),V=randomUUID(),M=randomUUID();
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;grant usage on schema auth to authenticated,anon;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
 create table food_stores(id uuid primary key,name text not null,slug text unique not null);
 create table food_store_users(store_id uuid,user_id uuid,role text,active boolean default true);
 create function food_is_store_admin(uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.food_store_users where store_id=$1 and user_id=auth.uid() and active and role in ('owner','admin','manager'))
 or (current_setting('test.master',true)='true' and current_setting('test.aal',true)='aal2')$$;
 alter table food_stores enable row level security;
 create policy member_read on food_stores for select to authenticated using(food_is_store_admin(id));
 create policy member_update on food_stores for update to authenticated using(food_is_store_admin(id)) with check(food_is_store_admin(id));
 grant select,update on food_stores to authenticated;
 insert into food_stores values('${A}','Loja São João','sintetica-a'),('${B}','Loja B','sintetica-b');
 insert into food_store_users values('${A}','${U}','owner',true),('${B}','${V}','admin',true),('${A}','${M}','finance',true);`);
 const migration=readFileSync('supabase/migrations/20261029122536_food_store_name_unique.sql','utf8');
 // Colisão existente deve abortar integralmente; não renomear silenciosamente.
 await q("update food_stores set name='LOJA SAO JOAO' where id=$1",[B]);
 await no(()=>db.exec(migration),/Há nomes/);await db.exec('rollback');
 eq(await scalar('select name from food_stores where id=$1',[B]),'LOJA SAO JOAO','preflight preserva dados');
 eq(await scalar("select to_regprocedure('food_normalize_store_name_v1(text)')"),null,'DDL revertido no preflight');
 await q("update food_stores set name='Loja B' where id=$1",[B]);await db.exec(migration);
 for(const name of ['  LOJA  SAO JOAO  ','Loja São João','Loja São João','Ｌｏｊａ São João']) {
  eq(await scalar('select food_normalize_store_name_v1($1)',[name]),'loja sao joao','normalização uniforme');
  await no(()=>q('insert into food_stores values($1,$2,$3)',[randomUUID(),name,randomUUID()]),/food_stores_name_normalized_uidx/);
 }
 await db.exec('set role anon');await no(()=>q('select food_check_store_name_v1($1,$2)',[A,'Nova']),/permission denied/);await db.exec('reset role');
 await q("select set_config('test.user',$1,false)",[U]);await db.exec('set role authenticated');
 const check=(id,name)=>scalar('select food_check_store_name_v1($1,$2)',[id,name]);
 eq(await check(A,'LOJA SAO JOAO'),true,'mesma loja pode manter nome');
 eq(await check(A,'Loja B'),false,'detecta colisão invisível por RLS');
 eq(await check(A,'Loja Nova'),true,'nome livre');
 await no(()=>check(B,'Loja Nova'),/Sem permissão/);
 await no(()=>check(A,' '),/2 e 120/);
 await no(()=>check(A,'a'.repeat(121)),/2 e 120/);
 await no(()=>q("update food_stores set name='Loja B' where id=$1",[A]),/food_stores_name_normalized_uidx/);
 for(const name of ['','  ','a','a'.repeat(121)]) await no(()=>q('update food_stores set name=$1 where id=$2',[name,A]),/food_stores_name_valid/);
 await q("update food_stores set name='Novo Nome' where id=$1",[A]);await q("update food_stores set name='Novo Nome' where id=$1",[A]);
 eq(await scalar('select slug from food_stores where id=$1',[A]),'sintetica-a','retry não muda link');
 eq((await q("update food_stores set name='Ataque' where id=$1 returning id",[B])).rows.length,0,'RLS impede escrita no outro tenant');
 await q("select set_config('test.user',$1,false)",[M]);await no(()=>check(A,'Livre'),/Sem permissão/);
 await q("select set_config('test.user','',false)");await no(()=>check(A,'Livre'),/Sem permissão/);
 await q("select set_config('test.user',$1,false)",[V]);eq(await check(B,'Novo Nome'),false,'segundo tenant também detecta conflito');
 await q("select set_config('test.master','true',false)");await q("select set_config('test.aal','aal1',false)");await no(()=>check(A,'Livre'),/Sem permissão/);
 await q("select set_config('test.aal','aal2',false)");eq(await check(A,'Livre'),true,'Master com AAL2');
 await db.exec('reset role');
 eq(await scalar("select has_function_privilege('anon','public.food_check_store_name_v1(uuid,text)','EXECUTE')"),false,'RPC sem EXECUTE público');
 eq(await scalar("select has_schema_privilege('anon','food_store_identity_private','USAGE')"),false,'schema privado');
 if(concurrentCases) await concurrentCases({db,eq,ok});
 console.log(`Nomes de loja: ${count} verificações aprovadas${concurrentCases?' com concorrência real':''}.`);
 }finally{await db.close()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runStoreNameTests();
