import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source=readFileSync(new URL('../supabase/functions/food-professional-assistant/index.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;

async function run({prompt='Crie ideias para apresentar o novo serviço da loja.',output='Ideia 1: destaque o serviço e quem atende.',mode='post_ideas'}={}){
  let handler,fetchCalls=0,requestBody,storeReads=[];
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async(_url,init)=>{fetchCalls++;requestBody=JSON.parse(init.body);return new Response(JSON.stringify({output_text:output}),{status:200,headers:{'Content-Type':'application/json'}});};
  const deno={serve:value=>{handler=value;},env:{get:key=>({SUPABASE_URL:'https://test.supabase.invalid',SUPABASE_ANON_KEY:'test-anon',SUPABASE_SECRET_KEY:'test-service',OPENAI_API_KEY:'test-openai',OPENAI_MODEL:'test-model'})[key]}};
  const createClient=(_url,key)=>key==='test-anon'
    ?{auth:{getUser:async token=>token==='professional-token'?{data:{user:{id:'professional-1'}},error:null}:{data:{user:null},error:new Error('invalid')}}}
    :{from:table=>{storeReads.push(table);const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:table==='food_store_users'?{user_id:'professional-1'}:{store_id:'store-1',user_id:'professional-1',kind:'nutrition',council:'CRN',active:true,name:'Nutricionista de teste',registration:'000001/ES'},error:null})};return query;}};
  new Function('Deno','createClient',compiled)(deno,createClient);
  try{
    const response=await handler(new Request('https://edge.example.invalid',{method:'POST',headers:{Authorization:'Bearer professional-token','Content-Type':'application/json'},body:JSON.stringify({store_id:'10000000-0000-4000-8000-000000000001',mode,prompt})}));
    return{response,body:await response.json(),fetchCalls,requestBody,storeReads};
  }finally{globalThis.fetch=previousFetch;}
}

test('assistant blocks clinical instructions and identifying student data before calling AI',async()=>{
  const clinical=await run({prompt:'Escreva uma prescrição individual.'});
  assert.equal(clinical.response.status,422);
  assert.equal(clinical.fetchCalls,0);
  const identifying=await run({prompt:'Prepare algo para aluno@example.com.'});
  assert.equal(identifying.response.status,400);
  assert.equal(identifying.fetchCalls,0);
});

test('assistant returns a non-publishing draft and stores no conversation',async()=>{
  const result=await run();
  assert.equal(result.response.status,200);
  assert.equal(result.body.review_required,true);
  assert.match(result.body.text,/Ideia 1/);
  assert.deepEqual(result.storeReads,['food_store_users','food_service_professionals']);
  assert.equal(result.requestBody.store,false);
  assert.equal(result.requestBody.model,'test-model');
  assert.equal(result.requestBody.input[1].content[0].text,'Crie ideias para apresentar o novo serviço da loja.');
});

test('assistant refuses a generated clinical output',async()=>{
  const result=await run({output:'Prescrição individual: 2 litros de água por dia.'});
  assert.equal(result.response.status,422);
  assert.equal(result.body.error,'A sugestão pediu conteúdo clínico. Revise e escreva esse conteúdo diretamente como profissional competente.');
});
