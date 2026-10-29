import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const compiled=await build({entryPoints:['worker/seo-home.js'],bundle:true,platform:'node',format:'esm',write:false});
const {default:worker}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const env={ASSETS:{fetch:async()=>new Response('asset')}};
const manifest=async(search,host='www.vendeweb.com.br')=>worker.fetch(new Request(`https://${host}/_pwa/manifest.webmanifest?${search}`),env);

test('customer, store admin and master have distinct install identities and entry routes',async()=>{
  const customer=await (await manifest('kind=customer&slug=doce-lua&name=Doce+Lua')).json();
  const admin=await (await manifest('kind=admin&slug=doce-lua&store=00000000-0000-4000-8000-000000000030&name=Doce+Lua')).json();
  const master=await (await manifest('kind=master')).json();
  assert.equal(customer.id,'/_pwa/customer/doce-lua');
  assert.equal(customer.start_url,'/doce-lua');
  assert.equal(admin.start_url,'/admin?store=00000000-0000-4000-8000-000000000030');
  assert.equal(master.start_url,'/admin-master');
  assert.notEqual(customer.id,admin.id);
  assert.notEqual(admin.id,master.id);
  assert.equal(master.icons[0].src,'/assets/vendeweb-icon-192.png');
});

test('custom domain starts customer PWA at root with the same shop identity',async()=>{
  const customer=await (await manifest('kind=customer&slug=doce-lua&root=1','doce-lua.example.com')).json();
  assert.equal(customer.start_url,'/');
  assert.equal(customer.scope,'/');
  assert.equal(customer.id,'/_pwa/customer/doce-lua');
});

test('a public store logo becomes the shop icon through the constrained image route',async()=>{
  const logo='https://elttryavkeartoxgdgse.supabase.co/storage/v1/object/public/food-store-assets/stores/00000000-0000-4000-8000-000000000030/logo/00000000-0000-4000-8000-000000000040.webp';
  const customer=await (await manifest(`kind=customer&slug=doce-lua&icon=${encodeURIComponent(logo)}`)).json();
  assert.match(customer.icons[0].src,/^\/_pwa\/icon\?/);
  const previous=globalThis.fetch;
  try{
    globalThis.fetch=async(input,options)=>{
      assert.equal(input,logo);
      assert.equal(options.cf.image.format,'png');
      return new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}});
    };
    const icon=await worker.fetch(new Request(`https://www.vendeweb.com.br${customer.icons[0].src}`),env);
    assert.equal(icon.status,200);
    assert.equal(icon.headers.get('content-type'),'image/png');
  }finally{globalThis.fetch=previous}
});

test('invalid slugs and non-public remote icons cannot become an install resource',async()=>{
  assert.equal((await manifest('kind=customer&slug=..')).status,400);
  const remote=await (await manifest('kind=customer&slug=doce-lua&icon=https%3A%2F%2Fevil.example%2Ficon.png')).json();
  assert.equal(remote.icons[0].src,'/assets/vendeweb-icon-192.png');
  const invalid=await worker.fetch(new Request('https://www.vendeweb.com.br/_pwa/icon?src=https%3A%2F%2Fevil.example%2Ficon.png&size=192'),env);
  assert.equal(invalid.status,400);
});
