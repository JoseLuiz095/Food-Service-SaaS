import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Handler Edge verdadeiro executado localmente; Auth, banco e rede permanecem stubs.
const source=readFileSync('supabase/functions/food-provision-demo/index.ts','utf8');
const injected=source.replace(/^import .*;\s*$/m,'const createClient = globalThis.__demo_client;');
const compiled=ts.transpileModule(injected,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
let handler;let config;let fixtures;
globalThis.Deno={env:{get:key=>config[key]},serve:fn=>{handler=fn}};
let mfa='aal2';
const result=(data,error=null)=>({data,error});
const mockClient=(url,key,options)=>{
 const admin=key==='private';const caller=options?.global?.headers?.Authorization;
 const user={id:'admin-id',email:'master@example.invalid'};const fixtureOwner={id:'owner-id',email:'vendeweb.qa.sabor-da-vila@example.invalid',app_metadata:{vendeweb_test_fixture:'vendeweb-test-v1',fixture_slug:'test-vendeweb-sabor-da-vila'}};
 const auth={getUser:async()=>result(caller?{user}:{}),mfa:{getAuthenticatorAssuranceLevel:async()=>result({currentLevel:mfa})},admin:{
  listUsers:async()=>result({users:fixtures.created?[fixtureOwner]:[]}),
  createUser:async()=>{fixtures.created=true;return result({user:fixtureOwner})},
  generateLink:async()=>result({user:fixtureOwner,properties:{hashed_token:'opaque-hash',action_link:'https://aaaaaaaaaaaaaaaaaaaa.supabase.co/auth/v1/verify?token=opaque'}}),
 },verifyOtp:async()=>result({user:fixtureOwner,session:{access_token:'opaque'}}),signOut:async()=>result({})};
 const from=table=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>result(table==='food_platform_admins'?{id:'master-id'}:{store_id:'store-id',role:'owner',active:true})})})})});
 const rpc=async(name,payload)=>{
  if(name==='food_test_provisioning_status')return result({enabled:true,environment:'staging',schema_version:1});
  if(name==='food_provision_test_business'){fixtures.createCalls++;return result({store_id:'store-id',existing:fixtures.createCalls>1})}
  if(name==='food_business_status')return result({profile:{primary_segment:'food'},modules:[]});
  if(name==='food_get_public_storefront_v1')return result({found:true,store:{id:'store-id'},products:[{name:'Prato da casa',store_id:'store-id'}]});
  throw new Error('Unexpected RPC '+name);
 };
 return {auth,from,rpc};
};
globalThis.__demo_client=mockClient;
await import(`data:text/javascript,${encodeURIComponent(compiled)}`);
const allowed={DEMO_PROVISIONING_ENABLED:'true',DEMO_ENVIRONMENT:'staging',DEMO_PROJECT_REF:'aaaaaaaaaaaaaaaaaaaa',SUPABASE_URL:'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',DEMO_APP_ORIGIN:'https://homologacao.example.invalid',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'private'};
const call=async(body,origin='https://homologacao.example.invalid')=>{
 const res=await handler(new Request('https://aaaaaaaaaaaaaaaaaaaa.supabase.co/functions/v1/food-provision-demo',{method:'POST',headers:{Origin:origin,Authorization:'Bearer opaque', 'Content-Type':'application/json'},body:JSON.stringify(body)}));
 return {status:res.status,payload:await res.json()};
};
test('bloqueia alvo de produção conhecido mesmo com flags habilitadas',async()=>{config={...allowed,DEMO_PROJECT_REF:'elttryavkeartoxgdgse',SUPABASE_URL:'https://elttryavkeartoxgdgse.supabase.co'};fixtures={created:false,createCalls:0};assert.equal((await call({action:'preview',segments:['food'],count:1})).status,403)});
test('bloqueia origem não autorizada',async()=>{config={...allowed};assert.equal((await call({action:'preview',segments:['food'],count:1},'https://outsider.example.invalid')).status,403)});
test('bloqueia acesso sem MFA AAL2',async()=>{config={...allowed};mfa='aal1';assert.equal((await call({action:'preview',segments:['food'],count:1})).status,403);mfa='aal2'});
test('prévia controlada valida contagem e todos os segmentos',async()=>{config={...allowed};const res=await call({action:'preview',segments:['food','creator'],count:2});assert.equal(res.status,200);assert.equal(res.payload.items.length,4);assert.equal((await call({action:'preview',segments:['food'],count:4})).status,400)});
test('cria apenas fixture autorizada e valida login, vínculo e vitrine; retry sem redefinir senha',async()=>{config={...allowed};fixtures={created:false,createCalls:0};const first=await call({action:'create',segment:'food',slot:1});assert.equal(first.status,200);assert.equal(first.payload.status,'PERSISTED_LOGIN_VALIDATED');const again=await call({action:'create',segment:'food',slot:1});assert.equal(again.status,200);assert.equal(again.payload.existing,true);assert.equal(fixtures.createCalls,2)});
