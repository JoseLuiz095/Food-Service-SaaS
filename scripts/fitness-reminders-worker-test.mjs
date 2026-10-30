import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../supabase/functions/food-fitness-reminders/index.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
const compiled = ts.transpileModule(source, { compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None} }).outputText;
const secret='test-server-secret';

async function run({vapid=false,authorized=true}={}){
  let handler, sent=0; const calls=[];
  const row={delivery_id:'delivery-1',store_id:'store-1',user_id:'student-1',kind:'hydration',title:'Lembrete da sua rotina',message:'Seu lembrete de hidratação está na VendeWeb.',url:'/loja',subscriptions:[
    {id:'student-push-1',endpoint:'https://push.example.invalid/1',p256dh:'fixture',auth:'fixture'},
    {id:'student-push-2',endpoint:'https://push.example.invalid/2',p256dh:'fixture',auth:'fixture'},
  ]};
  const admin={rpc:async(name,args)=>{calls.push([name,args]);if(name==='food_fitness_reminder_enqueue_due')return{data:3,error:null};if(name==='food_fitness_reminder_claim_push')return{data:[row],error:null};if(name==='food_fitness_reminder_finish_push')return{data:{status:'sent'},error:null};throw Error(name);}};
  const deno={serve:value=>{handler=value;},env:{get:key=>({SUPABASE_URL:'https://test.supabase.invalid',SUPABASE_SECRET_KEY:secret,VAPID_PUBLIC_KEY:vapid?'public':'',VAPID_PRIVATE_KEY:vapid?'private':'',VAPID_SUBJECT:'mailto:test@example.invalid'})[key]}};
  const webpush={default:{setVapidDetails(){},sendNotification:async()=>{sent++;}}};
  new Function('Deno','createClient','webPushModule',compiled)(deno,()=>admin,webpush);
  const response=await handler(new Request('https://edge.example.invalid',{method:'POST',headers:{Authorization:authorized?`Bearer ${secret}`:'Bearer wrong','Content-Type':'application/json'},body:'{}'}));
  return{response,body:await response.json(),calls,sent};
}

test('reminders worker enqueues VendeWeb notices without requiring VAPID',async()=>{
  const result=await run();
  assert.equal(result.response.status,200);
  assert.deepEqual(result.body,{ok:true,enqueued:3,claimed:0,push_configured:false});
  assert.deepEqual(result.calls.map(call=>call[0]),['food_fitness_reminder_enqueue_due']);
  assert.equal(result.sent,0);
});

test('reminders worker sends only claimed student devices and finishes each delivery once',async()=>{
  const result=await run({vapid:true});
  assert.equal(result.response.status,200);
  assert.deepEqual(result.calls.map(call=>call[0]),['food_fitness_reminder_enqueue_due','food_fitness_reminder_claim_push','food_fitness_reminder_finish_push']);
  assert.deepEqual(result.calls[2][1],{p_delivery:'delivery-1',p_success:true});
  assert.equal(result.sent,2);
  assert.equal(result.body.sent,2);
});

test('reminders worker rejects an invalid scheduler credential before database access',async()=>{
  const result=await run({authorized:false});
  assert.equal(result.response.status,401);
  assert.deepEqual(result.calls,[]);
  assert.equal(result.sent,0);
});
