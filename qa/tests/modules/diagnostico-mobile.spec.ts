import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { buildStaticPixCopyPaste } from '../../../src/utils/pix';
import { STORE_VISUAL_THEME_PRESETS } from '../../../src/utils/storeVisualTheme';
import { mockBackend, snapshot, product, store, STORE, ORDER } from './fixtures';

const routes=['/admin','/admin/pedidos','/admin/produtos','/admin/produtos/novo',`/admin/produtos/${product.id}`,
  '/admin/categorias','/admin/entregas','/admin/analytics','/admin/plano','/admin/primeiros-passos','/admin/modulos','/admin/estoque','/admin/estoque-locais','/admin/financeiro','/admin/configuracoes','/admin/negocio','/admin/operacao',
  '/admin-master','/admin-master/lojas','/admin-master/solicitacoes','/doce-lua','/doce-lua/produto/brigadeiro-teste',
  '/doce-lua/carrinho','/doce-lua/finalizar',`/doce-lua/pedido/${ORDER}`,'/pagamento/pix#'+'A'.repeat(43)];

for (const width of [320,360,390,768,1366]) test(`coleta mobile atual ${width}px (evidência, sem aprovação WCAG)`,async({page},info)=>{
  test.setTimeout(180000);
  const escaped:string[]=[];
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin==='http://127.0.0.1:5191'||url.protocol==='data:')return route.continue();
    escaped.push(url.origin);return route.abort('blockedbyclient');
  });
  await mockBackend(page,{auth:true,master:true});
  await page.route('**/rest/v1/food_stores?**',r=>r.fulfill({json:[{...store,visual_theme:STORE_VISUAL_THEME_PRESETS.doce_lua}]}));
  await page.route('**/rest/v1/rpc/food_get_public_storefront_v1',r=>r.fulfill({json:{...snapshot,store:{...store,visual_theme:STORE_VISUAL_THEME_PRESETS.doce_lua}}}));
  await page.addInitScript(({STORE,product,ORDER,pixPayload})=>{
    localStorage.setItem(`foodservice_cart_v1:${STORE}`,JSON.stringify([{id:`${product.id}|base`,productId:product.id,productName:product.name,unitPrice:10,quantity:1,options:[]}]));
    sessionStorage.setItem(`foodservice_order_confirmation_v1_${ORDER}`,JSON.stringify({orderId:ORDER,orderNumber:1,total:10,paymentMethod:'pix',customerName:'Pessoa sintética',fulfillment:'pickup',storeName:'Doce Lua',pickupPointName:'Ponto sintético',storeWhatsapp:'5511999999999',pixEnabled:true,pixReceiptMode:'copy_paste',pixKeyType:'aleatoria',pixKey:'test@example.invalid',pixCopyPaste:pixPayload,pixPayload,pixReceiver:'Loja sintetica',orderMessage:'Pedido sintético',createdAt:new Date().toISOString()}));
  },{STORE,product,ORDER,pixPayload:buildStaticPixCopyPaste({key:'test@example.invalid',receiver:'Loja sintetica',city:'Teste',amount:10,txid:'TESTE'})});
  await page.route('**/rest/v1/rpc/food_dashboard_metrics_v1',route=>route.fulfill({json:{timezone:'America/Sao_Paulo',asOf:new Date().toISOString(),ordersTotal:1,cancelledOrders:0,ordersToday:1,pendingPayments:1,pendingAmount:10,processingOrders:1,scheduledToday:0,paidOrders:0,totalReceived:0,receivedToday:0,receivedTodayCount:0}}));
  await page.route(/\/rest\/v1\/food_orders(?:\?|$)/,route=>route.fulfill({json:[{id:ORDER,store_id:STORE,order_number:1,customer_name:'Cliente sintético',customer_phone:'',delivery_type:'pickup',payment_method:'pix',payment_status:'pending',status:'received',subtotal:10,total:10,delivery_fee:0,inventory_status:'reserved',created_at:new Date().toISOString()}]}));
  await page.route('**/functions/v1/food-order-payment',route=>route.fulfill({json:{status:'pending',storeName:'Loja sintética',orderNumber:1,total:10,pixPayload:buildStaticPixCopyPaste({key:'test@example.invalid',receiver:'Loja sintetica',city:'Teste',amount:10,txid:'TESTE'}),expiresAt:new Date(Date.now()+600000).toISOString()}}));
  const records:unknown[]=[];
  let errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width,height:900});
  for(const route of routes){
    errors=[];
    await page.goto(route);
    await page.locator('#foodweb-splash-screen').waitFor({state:'detached',timeout:10000});
    await page.getByRole('heading').first().waitFor({state:'visible',timeout:10000}).catch(()=>{});
    await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    records.push({route,url:new URL(page.url()).pathname,width,
      headings:await page.getByRole('heading').allTextContents(),errors:[...errors],
      mainCount:await page.getByRole('main').count(),
      overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),
      axe:result.violations.map(v=>({id:v.id,impact:v.impact,count:v.nodes.length,targets:v.nodes.map(n=>({target:n.target,contrast:n.any.filter(c=>c.id==='color-contrast').map(c=>c.data)}))}))});
  }
  await info.attach(`rotas-${width}.json`,{body:JSON.stringify(records,null,2),contentType:'application/json'});
  expect(escaped,'egress precisa ficar bloqueado').toEqual([]);
});

// Estados adversos observáveis no catálogo, sem reenviar comando operacional.
for(const state of ['empty','error','slow'] as const)test(`estado público ${state} em 390px`,async({page},info)=>{
  const escaped:string[]=[];
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin==='http://127.0.0.1:5191'||url.protocol==='data:')return route.continue();
    escaped.push(url.origin);return route.abort('blockedbyclient');
  });
  await mockBackend(page);
  if(state==='error') await page.route('**/rest/v1/**',route=>route.fulfill({status:503,json:{message:'Falha sintética em todas as leituras'}}));
  let release:()=>void=()=>{};
  const pending=new Promise<void>(resolve=>release=resolve);
  await page.route('**/rest/v1/rpc/food_get_public_storefront_v1',async route=>{
    if(state==='slow')await pending;
    if(state==='error')return route.fulfill({status:503,json:{message:'Falha sintética de rede'}});
    await route.fulfill({json:state==='empty'?{...snapshot,products:[],categories:[]}:snapshot});
  });
  await page.setViewportSize({width:390,height:844});
  await page.goto('/doce-lua');
  if(state==='slow'){
    await page.getByText(/Carregando/).first().waitFor({state:'visible',timeout:5000}).catch(()=>{});
    await info.attach('loading.json',{body:JSON.stringify({statusRegions:await page.getByRole('status').count()}),contentType:'application/json'});
    release();
  }
  await page.getByRole('heading').first().waitFor({state:'visible',timeout:10000}).catch(()=>{});
  await info.attach(`estado-${state}.json`,{body:JSON.stringify({bodyText:(await page.locator('body').innerText()).slice(0,800),headings:await page.getByRole('heading').allTextContents(),statusRegions:await page.getByRole('status').count(),alerts:await page.getByRole('alert').allTextContents(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)}),contentType:'application/json'});
  expect(escaped).toEqual([]);
});
