import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const compile=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const moduleUrl=code=>`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const themeCode=compile('src/utils/storeVisualTheme.ts');
const themeUrl=moduleUrl(themeCode);
const segmentUrl=moduleUrl(compile('src/segments/businessSegments.ts').replace('../utils/storeVisualTheme',themeUrl));
const {BUSINESS_SEGMENTS,getBusinessSegment,selectBusinessSegment,resolveBusinessTheme,isDefaultStoreImage}=await import(segmentUrl);
const {normalizeStoreVisualTheme,STORE_VISUAL_THEME_PRESETS}=await import(themeUrl);

for(const invalid of [undefined,null,{},'unknown',{businessSegment:'unknown'}]) assert.equal(getBusinessSegment(invalid).id,'food');
assert.equal(isDefaultStoreImage('/assets/marketing/app-splash-v2.png?v=20261015'),true);
assert.equal(isDefaultStoreImage('https://example.invalid/storage/app-splash-logo.png'),false);
for(const segment of BUSINESS_SEGMENTS){
  const selected=selectBusinessSegment({},segment.id);
  assert.equal(selected.businessSegment,segment.id);
  assert.equal(normalizeStoreVisualTheme(selected).businessSegment,segment.id);
  assert.equal(selected.primaryColor,segment.primaryColor);
}
for(const preset of Object.values(STORE_VISUAL_THEME_PRESETS)) assert.deepEqual(resolveBusinessTheme(preset),normalizeStoreVisualTheme(preset));
const doceLua=STORE_VISUAL_THEME_PRESETS.doce_lua;
assert.equal(selectBusinessSegment(selectBusinessSegment({},'printing3d'),'food').primaryColor,STORE_VISUAL_THEME_PRESETS.foodweb.primaryColor);
assert.equal(selectBusinessSegment(selectBusinessSegment({},'retail'),'food').accentColor,STORE_VISUAL_THEME_PRESETS.foodweb.accentColor);
assert.deepEqual(resolveBusinessTheme(doceLua),doceLua);
assert.equal(selectBusinessSegment(doceLua,'printing3d').primaryColor,doceLua.primaryColor);
const custom={...doceLua,preset:'custom',businessSegment:'retail',primaryColor:'#112233'};
assert.equal(selectBusinessSegment(custom,'rentals').primaryColor,'#112233');
assert.equal(getBusinessSegment(selectBusinessSegment(custom,'rentals')).id,'rentals');
assert.equal('events_enabled' in selectBusinessSegment({},'rentals'),false);
assert.equal('combos_enabled' in selectBusinessSegment({},'printing3d'),false);

// Exercise real server onboarding at the REST boundary, including failed grants.
globalThis.segmentTestState={profile:null,requests:[],deny:false};
const restUrl=moduleUrl(`export async function restFetch(path,options={}) {
 const state=globalThis.segmentTestState; state.requests.push({path,options});
 if(state.deny)throw new Error('RLS denied');
 if(path==='rpc/food_business_initialize') {
   if(state.profile&&state.profile.primary_segment!==options.body.p_segment)throw new Error('Master required');
   state.profile={primary_segment:options.body.p_segment};return {ok:true};
 }
 if(path==='rpc/food_business_master'){state.profile={primary_segment:options.body.p_data.segment};return {ok:true};}
 if(path==='rpc/food_business_status')return {profile:state.profile};
 throw new Error('Unexpected REST write');
}`);
const persistence=await import(moduleUrl(compile('src/services/businessPresentation.ts').replace('../lib/supabaseRest',restUrl)));
assert.equal(await persistence.saveNewStorePresentation('store-1','personal'),undefined);
assert.equal(globalThis.segmentTestState.requests[0].path,'rpc/food_business_initialize');
assert.equal(globalThis.segmentTestState.profile.primary_segment,'personal');
assert.equal(globalThis.segmentTestState.requests.some(r=>r.options.method==='PATCH'),false);
assert.match(await persistence.saveNewStorePresentation('store-1','creator'),/não foi configurado/);
globalThis.segmentTestState.profile=null;globalThis.segmentTestState.requests=[];
assert.equal(await persistence.saveNewStorePresentation('store-2','food'),undefined);
assert.equal(globalThis.segmentTestState.profile.primary_segment,'food');
assert.equal(globalThis.segmentTestState.requests.length,2);
globalThis.segmentTestState.requests=[];
assert.equal(await persistence.saveNewStorePresentation('store-2','florist',true),undefined);
assert.equal(globalThis.segmentTestState.requests[1].path,'rpc/food_business_master');
assert.equal(globalThis.segmentTestState.requests[1].options.body.p_action,'set_segment');
globalThis.segmentTestState.deny=true;globalThis.segmentTestState.requests=[];
assert.match(await persistence.saveNewStorePresentation('store-3','nutrition'),/Sua conta foi preservada/);
assert.equal(globalThis.segmentTestState.requests.length,1);
delete globalThis.segmentTestState;
console.log('OK ramos: dez perfis compatíveis, sete áreas iniciais, tema legado e onboarding no servidor sem autoconcessão.');
