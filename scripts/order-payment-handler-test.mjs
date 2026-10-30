import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOrderPaymentHandler } from '../supabase/functions/food-order-payment/handler.ts';
const sid='10000000-0000-4000-8000-000000000001', oid='20000000-0000-4000-8000-000000000001';
const origin='https://staging.example.invalid';
function fixture() {
  const order={id:oid,store_id:sid,order_number:42,total:12.50,payment_method:'pix',payment_status:'pending',status:'received'};
  const store={id:sid,name:'Loja teste',active:true,access_status:'online',pix_enabled:true,pix_receipt_mode:'key',pix_key:'test@example.invalid',pix_holder_name:'Recebedor Teste',city:'Linhares'};
  const env={ORDER_PAYMENT_LINK_ENABLED:'true',ORDER_PAYMENT_LINK_SECRET:'test-only-secret-at-least-32-characters',ORDER_PAYMENT_ALLOWED_ORIGINS:origin};
  let now=Date.now(), reads=0;
  const handler=createOrderPaymentHandler({env:k=>env[k],now:()=>now,
    authorizedOrder:async(jwt,storeId,orderId)=>jwt==='valid'&&storeId===sid&&orderId===oid?order:null,
    order:async(storeId,orderId)=>{reads++;assert.equal(storeId,sid);assert.equal(orderId,oid);return order}, store:async()=>store });
  const call=async(body,headers={},method='POST')=>{
    const r=await handler(new Request('https://api.example.invalid',{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}));
    return {status:r.status,body:r.status===204?null:await r.json(),headers:r.headers};
  };
  const issue=()=>call({action:'issue',storeId:sid,orderId:oid,total:0.01},{Authorization:'Bearer valid'});
  const resolve=token=>call({action:'resolve',token});
  return {order,store,env,call,issue,resolve,advance:ms=>{now+=ms},reads:()=>reads};
}
test('authorized issue returns opaque encrypted capability; resolve uses authoritative total and no customer data',async()=>{
 const f=fixture(), a=await f.issue(), b=await f.issue(); assert.equal(a.status,200);assert.notEqual(a.body.token,b.body.token);
 assert.equal(a.body.token.includes(oid),false);assert.equal(a.body.token.includes(sid),false);
 const r=await f.resolve(a.body.token);assert.equal(r.status,200);assert.equal(r.body.total,12.5);assert.equal(r.body.status,'pending');assert.match(r.body.pixPayload,/540512.50/);
 assert.deepEqual(Object.keys(r.body).sort(),['status','storeName','orderNumber','total','receiver','pixPayload','expiresAt','fulfillmentStatus'].sort());
 assert.equal(r.body.fulfillmentStatus,'received');
 assert.match(r.headers.get('cache-control'),/no-store/); assert.equal(r.headers.get('referrer-policy'),'no-referrer');
});
test('issue rejects anonymous, wrong tenant and unverified JWT; no public lookup by order ID',async()=>{
 const f=fixture(); const body={action:'issue',storeId:sid,orderId:oid};
 assert.equal((await f.call(body)).status,401); assert.equal((await f.call(body,{Authorization:'Bearer forged'})).status,403);
 assert.equal((await f.call({...body,storeId:oid},{Authorization:'Bearer valid'})).status,403);
 assert.equal((await f.call({action:'resolve',orderId:oid})).status,404);assert.equal(f.reads(),0);
});
test('tamper, expiry, secret rotation and oversized payload fail closed before reading an order',async()=>{
 const f=fixture(), a=await f.issue();
 const [iv,cipher]=a.body.token.split('.');const token=iv+'.'+(cipher[0]==='A'?'B':'A')+cipher.slice(1);
 assert.equal((await f.resolve(token)).status,404);assert.equal(f.reads(),0);
 f.advance(86400001);assert.equal((await f.resolve(a.body.token)).status,410);assert.equal(f.reads(),0);
 const g=fixture(), b=await g.issue();g.env.ORDER_PAYMENT_LINK_SECRET='rotated-secret-with-at-least-32-characters';assert.equal((await g.resolve(b.body.token)).status,404);
 assert.equal((await f.call('x'.repeat(4097))).status,413);
});
for(const field of ['total','pix_key','pix_enabled','active','access_status','payment_method']) test(`rechecks ${field} before exposing a payable code`,async()=>{
 const f=fixture(), a=await f.issue();
 if(field==='total')f.order.total=99;
 if(field==='pix_key')f.store.pix_key='changed@example.invalid';
 if(field==='pix_enabled')f.store.pix_enabled=false;
 if(field==='active')f.store.active=false;
 if(field==='access_status')f.store.access_status='suspended';
 if(field==='payment_method')f.order.payment_method='cash';
 const r=await f.resolve(a.body.token);assert.equal(r.status,410);assert.equal(r.body.pixPayload,undefined);
});
for(const status of ['paid','cancelled'])test(`${status} hides code and refuses new links`,async()=>{
 const f=fixture(),a=await f.issue();if(status==='paid')f.order.payment_status='paid';else f.order.status='cancelled';
 const r=await f.resolve(a.body.token);assert.equal(r.body.status,status);assert.equal(r.body.pixPayload,undefined);assert.equal((await f.issue()).status,409);
});
test('disabled configuration, invalid origin/method/JSON and invalid Pix do not leak details',async()=>{
 const f=fixture();assert.equal((await f.call({}, {Origin:'https://evil.invalid'})).status,403);
 assert.equal((await f.call({}, {}, 'GET')).status,405);assert.equal((await f.call({}, {}, 'OPTIONS')).status,204);
 assert.equal((await f.call('{bad')).status,400);f.store.pix_key='';assert.equal((await f.issue()).status,409);
 f.env.ORDER_PAYMENT_LINK_ENABLED='false';assert.equal((await f.issue()).status,503);
});

test('comprovante usa loja/ponto do pedido no servidor; ignora destino forjado e não altera pagamento',async()=>{
 const f=fixture();f.env.ORDER_RECEIPT_CONTACTS_ENABLED='true';const order={...f.order,pickup_location_id:'30000000-0000-4000-8000-000000000001'};
 const destinations={mode:'point',contacts:[{slot:2,name:'Contato sintético',phone:'5511000000002'}]};let lookups=0;
 const handler=createOrderPaymentHandler({env:k=>f.env[k],authorizedOrder:async()=>order,order:async()=>order,store:async()=>f.store,
  receiptDestinations:async(storeId,pointId)=>{assert.equal(storeId,sid);assert.equal(pointId,order.pickup_location_id);lookups++;return destinations}});
 const call=async(body)=>{const r=await handler(new Request('https://api.example.invalid',{method:'POST',headers:{Origin:origin,Authorization:'Bearer valid'},body:JSON.stringify(body)}));return r.json()};
 const grant=await call({action:'issue',storeId:sid,orderId:oid});assert.equal(lookups,0);
 const result=await call({action:'resolve',token:grant.token,storeId:oid,pickupLocationId:oid,phone:'5511000000099'});
 assert.deepEqual(result.receiptDestinations,destinations);assert.equal(lookups,1);assert.equal(order.payment_status,'pending');assert.equal(order.status,'received');
});
