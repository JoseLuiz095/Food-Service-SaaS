import { test, expect, type Page } from '@playwright/test';
import { mockBackend, STORE, ORDER, PRODUCT, store } from './fixtures';
import { buildStaticPixCopyPaste } from '../../../src/utils/pix';
test('fila nova mantém declarações a conferir e não volta a limitar doze pedidos',async({page})=>{
 await isolated(page,true);
 const base={store_id:STORE,delivery_type:'pickup',payment_method:'pix',subtotal:12.5,total:12.5,created_at:new Date().toISOString()};
 const row=(number:number,status:string,payment:string,reported=false)=>({...base,id:`b0000000-0000-4000-8000-${String(number).padStart(12,'0')}`,order_number:number,customer_name:`Pessoa fictícia ${number}`,status,payment_status:payment,payment_reported_by_customer:reported});
 const rows=[...Array.from({length:14},(_,n)=>row(n+1,'received','pending')),row(15,'delivered','paid',true),row(16,'delivered','pending'),row(17,'cancelled','paid',true)];
 await page.route(/\/rest\/v1\/food_orders(?:\?|$)/,r=>r.fulfill({json:rows}));
 await page.goto('/admin/pedidos');
 const inbox=page.getByRole('region',{name:'Recebimentos a conferir'});
 await expect(inbox.locator('.orders-payment-inbox__list > article')).toHaveCount(15);
 await expect(inbox).toContainText('Pessoa fictícia 15');
 await expect(inbox).not.toContainText('Pessoa fictícia 16');
 await expect(inbox).not.toContainText('Pessoa fictícia 17');
 await expect(page.getByRole('button',{name:/Conferir pagamento/})).toContainText('15');
 await page.getByRole('button',{name:/Conferir pagamento/}).click();
 await expect(page.locator('#orders-payment')).toBeVisible();
});
const contacts=[{slot:1,name:'Contato fictício',phone:'5511000000001'}];
const pix=buildStaticPixCopyPaste({key:'test@example.invalid',receiver:'Loja Teste',city:'Teste',amount:12.5,txid:'PED42'});
async function isolated(page:Page,auth=false){
 await page.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:5193'?r.continue():r.abort('blockedbyclient'));
 await mockBackend(page,{auth});
}
for(const width of [320,390,768,1366])for(const failFirst of [false,true])test(`WhatsApp só registra envio após confirmação do cliente ${width}px${failFirst?' com retry':''}`,async({page,context})=>{
 await isolated(page);await page.setViewportSize({width,height:900});
 const reports:unknown[]=[];let fails=failFirst;
 await context.route('https://wa.me/**',r=>r.fulfill({contentType:'text/plain',body:'Conversa de teste. Nenhuma mensagem enviada.'}));
 await page.route('**/functions/v1/food-order-payment',r=>{
  const b=r.request().postDataJSON();
  if(b.action==='report_receipt'){reports.push(b);if(fails){fails=false;return r.fulfill({status:409,json:{error:'O pedido foi alterado ou revisado pela loja.'}})}return r.fulfill({json:{ok:true,status:'paid',paymentReportedByCustomer:true,autoPickedUp:false}})}
  expect(b).toEqual({action:'resolve',token:'read.capability'});
  return r.fulfill({json:{status:'pending',storeName:'Loja fictícia',orderNumber:42,total:12.5,receiver:'Teste',pixPayload:pix,expiresAt:new Date(Date.now()+3600000).toISOString(),receiptToken:'receipt.capability',receiptDestinations:{mode:'point',contacts}}});
 });
 await page.goto('/pagamento/pix#read.capability');
 const section=page.getByRole('region',{name:'Enviar comprovante'});
 const popups:import('@playwright/test').Page[]=[];page.on('popup',p=>popups.push(p));
 await section.getByRole('link',{name:'Abrir WhatsApp e enviar comprovante',exact:true}).click();
 await expect(section.getByRole('button',{name:'Já enviei o comprovante'})).toBeVisible();expect(reports).toHaveLength(0);await expect(page.getByText('Aguardando confirmação do pagamento pela loja.')).toBeVisible();
 await section.getByRole('button',{name:'Já enviei o comprovante'}).click();
 if(failFirst){await expect(section.getByRole('alert')).toContainText('alterado');await expect(section.getByRole('link',{name:'Abrir o WhatsApp novamente'})).toHaveAttribute('href',/^https:\/\/wa.me\/5511000000001/);await expect(page.getByText('Aguardando confirmação do pagamento pela loja.')).toBeVisible();await section.getByRole('button',{name:'Já enviei o comprovante'}).click();}
 await expect(section.getByRole('status')).toContainText('Comprovante informado');
 await expect(page.getByText('Pago informado pelo cliente. A loja pode conferir o recebimento.',{exact:true})).toBeVisible();
 expect(reports).toEqual(Array(failFirst?2:1).fill({action:'report_receipt',token:'receipt.capability'}));
 await expect.poll(()=>popups.some(p=>p.url().startsWith('https://wa.me/5511000000001'))).toBe(true);
 for(const p of popups)if(!p.isClosed())await p.close();
});
for(const width of [320,390,768,1366])test(`confirmação explícita do comprovante conclui retirada configurada ${width}px`,async({page,context})=>{
 await isolated(page);await page.setViewportSize({width,height:900});
 let reports=0;
 await context.route('https://wa.me/**',r=>r.fulfill({contentType:'text/plain',body:'Conversa sintética.'}));
 await page.route('**/functions/v1/food-order-payment',r=>{const b=r.request().postDataJSON();if(b.action==='report_receipt'){reports++;return r.fulfill({json:{ok:true,status:'paid',paymentReportedByCustomer:true,autoPickedUp:true}})}return r.fulfill({json:{status:'pending',storeName:'Loja fictícia',orderNumber:42,total:12.5,receiver:'Teste',pixPayload:pix,expiresAt:new Date(Date.now()+3600000).toISOString(),receiptToken:'receipt.capability',receiptDestinations:{mode:'point',contacts}}})});
 await page.goto('/pagamento/pix#read.capability');const section=page.getByRole('region',{name:'Enviar comprovante'});
 await section.getByRole('link',{name:'Abrir WhatsApp e enviar comprovante',exact:true}).click();expect(reports).toBe(0);
 await section.getByRole('button',{name:'Já enviei o comprovante'}).click();
 await expect(page.getByText('Pago informado pelo cliente · retirada registrada. A loja pode conferir o recebimento.')).toBeVisible();
 await expect(section.getByRole('status')).toContainText('retirada e baixou o estoque');expect(reports).toBe(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
for(const accept of [false,true])test(`admin ${accept?'confere declaração':'retorna declaração a receber'} sem PATCH operacional`,async({page})=>{
 await isolated(page,true);await page.setViewportSize({width:390,height:900});let reported=true,paid=true,patches=0;const reviews:unknown[]=[];
 await page.route(/\/rest\/v1\/food_orders(?:\?|$)/,r=>{if(r.request().method()==='PATCH')patches++;return r.fulfill({json:[{id:ORDER,store_id:STORE,order_number:42,customer_name:'Pessoa fictícia',delivery_type:'pickup',payment_method:'pix',payment_status:paid?'paid':'pending',payment_reported_by_customer:reported,status:'received',subtotal:12.5,total:12.5,created_at:new Date().toISOString()}]})});
 await page.route(/\/rest\/v1\/food_order_items(?:\?|$)/,r=>r.fulfill({json:[{id:PRODUCT,order_id:ORDER,product_id:PRODUCT,product_name:'Produto fictício',quantity:1,unit_price:12.5,item_total:12.5}]}));
 await page.route('**/rest/v1/rpc/food_review_receipt_report_v1',r=>{reviews.push(r.request().postDataJSON());reported=false;paid=accept;return r.fulfill({json:{ok:true}})});
 await page.goto('/admin/pedidos');const inbox=page.getByRole('region',{name:'Recebimentos a conferir'});
 await expect(inbox).toContainText('Pago informado pelo cliente · conferir');
 page.once('dialog',async d=>{expect(d.message()).toContain(accept?'status operacional permanece igual':'estoque não serão alterados');await d.accept()});
 await inbox.getByRole('button',{name:accept?'Confirmar recebimento':'Voltar para A receber',exact:true}).click();
 await expect.poll(()=>reviews.length).toBe(1);expect(reviews).toEqual([{p_order_id:ORDER,p_accept:accept}]);
 await expect(inbox.getByText('Pago informado pelo cliente · conferir')).toHaveCount(0);expect(patches).toBe(0);
 if(!accept)await expect(inbox.getByRole('button',{name:'Confirmar recebimento',exact:true})).toBeVisible();
});
test('política é opt-in e salva com os contatos confirmados numa única RPC',async({page})=>{
 await isolated(page,true);let saved:unknown;
 await page.route('**/rest/v1/food_stores?**',r=>r.fulfill({json:[{...store,receipt_click_marks_paid:false}]}));
 await page.route('**/rest/v1/food_receipt_contacts?**',r=>r.fulfill({json:contacts}));
 await page.route('**/rest/v1/food_pickup_receipt_contacts?**',r=>r.fulfill({json:[]}));
 await page.route('**/rest/v1/food_pickup_locations?**',r=>r.fulfill({json:[]}));
 await page.route('**/functions/v1/food-order-payment',r=>r.fulfill({json:{autoPaidConfigured:true}}));
 await page.route('**/rest/v1/rpc/food_save_receipt_policy_v2',r=>{saved=r.request().postDataJSON();return r.fulfill({json:null})});
 await page.goto('/admin/configuracoes');const card=page.getByRole('region',{name:'Contatos gerais para comprovantes'});
 const policy=card.getByRole('checkbox',{name:/Permitir que o cliente informe o pagamento/});await expect(policy).not.toBeChecked();await policy.check();
 await card.getByRole('button',{name:'Salvar contatos de comprovantes'}).click();await expect(card.getByRole('alert')).toContainText('Confira os números');expect(saved).toBeUndefined();
 await card.getByRole('checkbox',{name:'Conferi os números e o contato que receberá o comprovante de cada ponto.'}).check();
 await card.getByRole('button',{name:'Salvar contatos de comprovantes'}).click();await expect(card.getByRole('status')).toContainText('salvos');
 expect(saved).toEqual({p_store_id:STORE,p_contacts:contacts,p_points:[],p_auto_paid:true,p_auto_pickup_points:[]});
});

test('retirada automática fica opt-in por ponto e exige aviso de pagamento habilitado',async({page})=>{
 await isolated(page,true);let saved:unknown;
 await page.route('**/rest/v1/food_stores?**',r=>r.fulfill({json:[{...store,receipt_click_marks_paid:true}]}));
 await page.route('**/rest/v1/food_receipt_contacts?**',r=>r.fulfill({json:contacts}));
 await page.route('**/rest/v1/food_pickup_receipt_contacts?**',r=>r.fulfill({json:[]}));
 await page.route('**/rest/v1/food_pickup_locations?**',r=>r.fulfill({json:[{id:'60000000-0000-4000-8000-000000000001',name:'Ponto da loja amiga',auto_pickup_on_receipt:false}]}));
 await page.route('**/functions/v1/food-order-payment',r=>r.fulfill({json:{autoPaidConfigured:true}}));
 await page.route('**/rest/v1/rpc/food_save_receipt_policy_v2',r=>{saved=r.request().postDataJSON();return r.fulfill({json:null})});
 await page.goto('/admin/configuracoes');const card=page.getByRole('region',{name:'Contatos gerais para comprovantes'});
 const pickup=card.getByRole('checkbox',{name:/Concluir e baixar a retirada imediata/});await expect(pickup).not.toBeChecked();await pickup.check();
 await card.getByRole('checkbox',{name:/Conferi os números/}).check();await card.getByRole('button',{name:'Salvar contatos de comprovantes'}).click();
 await expect(card.getByRole('status')).toContainText('salvos');expect(saved).toMatchObject({p_auto_pickup_points:['60000000-0000-4000-8000-000000000001']});
});

test('loja que só vende por pontos ativa comprovante sem duplicar contato geral',async({page})=>{
 await isolated(page,true);let saved:unknown;
 await page.route('**/rest/v1/food_stores?**',r=>r.fulfill({json:[{...store,receipt_click_marks_paid:false}]}));
 await page.route('**/rest/v1/food_receipt_contacts?**',r=>r.fulfill({json:[]}));
 await page.route('**/rest/v1/food_pickup_receipt_contacts?**',r=>r.fulfill({json:[]}));
 await page.route('**/rest/v1/food_pickup_locations?**',r=>r.fulfill({json:[{id:'60000000-0000-4000-8000-000000000001',name:'Ponto com WhatsApp próprio',auto_pickup_on_receipt:false}]}));
 await page.route('**/functions/v1/food-order-payment',r=>r.fulfill({json:{autoPaidConfigured:true}}));
 await page.route('**/rest/v1/rpc/food_save_receipt_policy_v2',r=>{saved=r.request().postDataJSON();return r.fulfill({json:null})});
 await page.goto('/admin/configuracoes');const card=page.getByRole('region',{name:'Contatos gerais para comprovantes'});
 await card.getByRole('checkbox',{name:/Permitir que o cliente informe o pagamento/}).check();
 await card.getByRole('checkbox',{name:/Concluir e baixar a retirada imediata/}).check();
 await card.getByRole('button',{name:'Salvar contatos de comprovantes'}).click();
 await expect(card.getByRole('alert')).toContainText('Confira os números');expect(saved).toBeUndefined();
 await card.getByRole('checkbox',{name:/Conferi os números/}).check();
 await card.getByRole('button',{name:'Salvar contatos de comprovantes'}).click();
 await expect(card.getByRole('status')).toContainText('salvos');
 expect(saved).toEqual({p_store_id:STORE,p_contacts:[],p_points:[],p_auto_paid:true,p_auto_pickup_points:['60000000-0000-4000-8000-000000000001']});
});
