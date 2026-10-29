import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mockBackend,STORE,ORDER} from './fixtures';
import {buildStaticPixCopyPaste} from '../../../src/utils/pix';
const point='30000000-0000-4000-8000-000000000001';
const contacts=[{slot:1,name:'Admin sintético A',phone:'5511000000001'},{slot:2,name:'Admin sintético B',phone:'5511000000002'}];
const pix=buildStaticPixCopyPaste({key:'test@example.invalid',receiver:'Loja Teste',city:'Linhares',amount:12.5,txid:'PED42'});
async function setup(page:any,auth=false){
 const external:string[]=[],writes:string[]=[];
 await page.route('**/*',(r:any)=>{const u=new URL(r.request().url());if(u.origin==='http://127.0.0.1:5193'||u.protocol==='data:')return r.continue();external.push(u.origin);return r.abort('blockedbyclient')});
 await mockBackend(page,{auth});
 page.on('request',(r:any)=>{if(r.method()!=='GET'&&/confirm|update_order|adjust|transfer|financial/.test(r.url()))writes.push(r.url())});
 return {external,writes};
}
async function success(page:any,pointId?:string){await page.addInitScript(({storeId,orderId,pickupId,pixCode}:any)=>sessionStorage.setItem(`foodservice_order_confirmation_v1_${orderId}`,JSON.stringify({storeId,receiptPickupLocationId:pickupId,orderId,orderNumber:42,total:12.5,paymentMethod:'pix',customerName:'Pessoa sintética',fulfillment:pickupId?'pickup':'delivery',storeName:'Loja sintética',storeWhatsapp:'5511000000099',pixEnabled:true,pixReceiptMode:'copy_paste',pixKeyType:'random',pixKey:'',pixCopyPaste:pixCode,pixPayload:pixCode,pixReceiver:'Loja Teste',orderMessage:'Pedido sintético',createdAt:new Date().toISOString()})),{storeId:STORE,orderId:ORDER,pickupId:pointId,pixCode:pix});await page.goto(`/doce-lua/pedido/${ORDER}`)}
for(const width of [320,390,768,1366])test(`geral escolhe contato e ponto tem destino direto ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});const {external,writes}=await setup(page);
 await page.route('**/rest/v1/rpc/food_get_receipt_destinations_v1',(r:any)=>{const b=r.request().postDataJSON();expect(b.p_store_id).toBe(STORE);return r.fulfill({json:{mode:b.p_pickup_location_id?'point':'general',contacts:b.p_pickup_location_id?[contacts[1]]:contacts}})});
 await success(page);const section=page.getByRole('region',{name:'Enviar comprovante'});await expect(section.getByRole('combobox')).toBeVisible();await expect(section.getByRole('link')).toHaveCount(0);
 await section.getByRole('combobox').selectOption('1');await expect(section.getByRole('link')).toHaveAttribute('href',/^https:\/\/wa.me\/5511000000001\?/);
 await section.getByRole('combobox').selectOption('2');await expect(section.getByRole('link')).toHaveAttribute('href',/^https:\/\/wa.me\/5511000000002\?/);
 await success(page,point);await expect(section.getByText('Destino:',{exact:false})).toContainText('Admin sintético B');await expect(section.getByRole('combobox')).toHaveCount(0);await expect(section.getByRole('link')).toHaveAttribute('href',/^https:\/\/wa.me\/5511000000002\?/);
 expect(writes).toEqual([]);expect(external).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 const a=await new AxeBuilder({page}).include('.receipt-destination').withTags(['wcag2a','wcag2aa']).analyze();expect(a.violations).toEqual([]);
});
test('link Pix novo usa destinos do servidor sem consulta por ID ou confirmação',async({page})=>{
 const {writes,external}=await setup(page);await page.route('**/functions/v1/food-order-payment',(r:any)=>{expect(r.request().postDataJSON()).toEqual({action:'resolve',token:'encrypted.capability'});return r.fulfill({json:{status:'pending',storeName:'Loja Teste',orderNumber:42,total:12.5,receiver:'Loja Teste',pixPayload:pix,expiresAt:new Date(Date.now()+3600000).toISOString(),receiptDestinations:{mode:'point',contacts:[contacts[1]]}}})});
 await page.goto('/pagamento/pix#encrypted.capability');await expect(page.getByRole('link',{name:'Abrir WhatsApp e enviar comprovante'})).toHaveAttribute('href',/^https:\/\/wa.me\/5511000000002\?/);await expect(page.getByText('Aguardando confirmação do pagamento pela loja.')).toBeVisible();expect(writes).toEqual([]);expect(external).toEqual([]);
});
test('erro não encaminha ao contato errado; retry e ponto indisponível são explícitos',async({page})=>{
 await setup(page);let mode='error';await page.route('**/rest/v1/rpc/food_get_receipt_destinations_v1',(r:any)=>r.fulfill(mode==='error'?{status:503,json:{message:'Erro sintético'}}:{json:{mode,contacts:[]}}));
 await success(page,point);const section=page.getByRole('region',{name:'Enviar comprovante'});await expect(section.getByRole('alert')).toBeVisible();await expect(section.getByRole('link')).toHaveCount(0);mode='unavailable';await section.getByRole('button').click();await expect(section).toContainText('contato deste ponto não está disponível');await expect(section.getByRole('link')).toHaveCount(0);
});
test('configuração salva dois contatos e vínculo sem regravar configurações gerais',async({page})=>{
 const {external}=await setup(page,true);let saved:any;
 await page.route('**/rest/v1/food_receipt_contacts?**',(r:any)=>r.fulfill({json:contacts}));await page.route('**/rest/v1/food_pickup_receipt_contacts?**',(r:any)=>r.fulfill({json:[{pickup_location_id:point,contact_slot:2}]}));await page.route('**/rest/v1/food_pickup_locations?**',(r:any)=>r.fulfill({json:[{id:point,name:'Ponto sintético'}]}));await page.route('**/rest/v1/rpc/food_save_receipt_contacts_v1',(r:any)=>{saved=r.request().postDataJSON();return r.fulfill({json:null})});
 await page.goto('/admin/configuracoes');const section=page.getByRole('region',{name:'Telefones para confirmação e comprovantes'});await expect(section.getByRole('combobox')).toHaveValue('2');await section.getByRole('checkbox',{name:'Conferi os números e o contato que receberá o comprovante de cada ponto.'}).check();await section.getByRole('button',{name:'Salvar contatos de comprovantes'}).click();await expect(section.getByRole('status')).toHaveText('Contatos e destinos dos pontos salvos.');expect(saved).toEqual({p_store_id:STORE,p_contacts:contacts,p_points:[{pickup_location_id:point,contact_slot:2}]});expect(external).toEqual([]);
});
test('zero e um contato preservam compatibilidade; abrir conversa só registra clique',async({page,context})=>{
 const {writes}=await setup(page);let list:any[]=[],clicked=0;
 await page.route('**/rest/v1/rpc/food_get_receipt_destinations_v1',r=>r.fulfill({json:{mode:'general',contacts:list}}));
 await page.route('**/rest/v1/rpc/food_mark_public_order_whatsapp_clicked',r=>{expect(r.request().postDataJSON()).toEqual({p_order_id:ORDER});clicked++;return r.fulfill({json:null})});
 await context.route('https://wa.me/**',r=>r.fulfill({contentType:'text/plain',body:'Canal sintético. Nenhuma mensagem enviada.'}));
 await success(page);const section=page.getByRole('region',{name:'Enviar comprovante'});await expect(section.getByRole('link')).toHaveAttribute('href',/^https:\/\/wa.me\/5511000000099\?/);
 list=[contacts[0]];await page.reload();await expect(section.getByRole('combobox')).toHaveCount(0);await expect(section.getByRole('link')).toHaveAttribute('href',/^https:\/\/wa.me\/5511000000001\?/);
 const popup=page.waitForEvent('popup');await section.getByRole('link').click();await (await popup).close();await expect.poll(()=>clicked).toBe(1);expect(writes).toEqual([]);
});
test('falha ao carregar cadastro impede salvar configuração vazia',async({page})=>{
 await setup(page,true);let saves=0;
 await page.route('**/rest/v1/food_receipt_contacts?**',r=>r.fulfill({status:503,json:{message:'Erro sintético'}}));
 await page.route('**/rest/v1/rpc/food_save_receipt_contacts_v1',r=>{saves++;return r.fulfill({json:null})});
 await page.goto('/admin/configuracoes');const section=page.getByRole('region',{name:'Telefones para confirmação e comprovantes'});await expect(section.getByRole('alert')).toBeVisible();await expect(section.getByRole('button',{name:'Salvar contatos de comprovantes'})).toBeDisabled();expect(saves).toBe(0);
});
test('compra de entrega pelo link do ponto preserva origem sem mudar retirada/estoque',async({page})=>{
 await setup(page);let payload:any;
 await page.route('**/rest/v1/rpc/food_get_public_pickup_locations_v1',r=>r.fulfill({json:[{id:point,name:'Ponto sintético Centro',short_code:'CENTRO'}]}));
 await page.route('**/rest/v1/rpc/food_get_public_location_availability_v1',r=>r.fulfill({json:[{product_id:'20000000-0000-4000-8000-000000000001',available:20,available_elsewhere:false}]}));
 await page.route('**/functions/v1/food-public-checkout',r=>{payload=r.request().postDataJSON().payload;return r.fulfill({json:{orderId:ORDER,orderNumber:42,total:15,receiptPickupLocationId:point}})});
 await page.route('**/rest/v1/rpc/food_get_receipt_destinations_v1',r=>{expect(r.request().postDataJSON()).toEqual({p_store_id:STORE,p_pickup_location_id:point});return r.fulfill({json:{mode:'point',contacts:[contacts[1]]}})});
 await page.goto('/doce-lua/produto/brigadeiro-teste?ponto=CENTRO');await page.getByRole('button',{name:'Adicionar ao carrinho',exact:true}).click();await page.goto('/doce-lua/carrinho?ponto=CENTRO');await page.getByRole('link',{name:'Continuar',exact:true}).click();
 await page.getByRole('button',{name:'Delivery Receber no endereço'}).click();await page.getByLabel('Nome',{exact:true}).fill('Pessoa sintética');await page.getByLabel(/WhatsApp/).first().fill('11000000001');await page.getByLabel('Bairro / área').selectOption({index:1});await page.getByLabel('Rua',{exact:true}).fill('Rua sintética');await page.getByLabel('Número',{exact:true}).fill('1');await page.getByRole('button',{name:/^PIX/}).click();await page.getByRole('button',{name:/Registrar pedido|Finalizar/}).filter({visible:true}).first().click();
 await expect(page).toHaveURL(new RegExp(ORDER));expect(payload).toMatchObject({store_id:STORE,delivery_type:'delivery',pickup_location_id:null,receipt_pickup_location_id:point});await expect(page.getByRole('region',{name:'Enviar comprovante'}).getByRole('link')).toHaveAttribute('href',/^https:\/\/wa.me\/5511000000002\?/);
});
test('link geral continua oferecendo escolha mesmo quando o cliente escolhe retirada',async({page})=>{
 await setup(page);let payload:any;
 await page.route('**/rest/v1/rpc/food_get_public_pickup_locations_v1',r=>r.fulfill({json:[{id:point,name:'Ponto sintético Centro',short_code:'CENTRO'}]}));
 await page.route('**/rest/v1/rpc/food_get_public_location_availability_v1',r=>r.fulfill({json:[{product_id:'20000000-0000-4000-8000-000000000001',available:20,available_elsewhere:false}]}));
 await page.route('**/functions/v1/food-public-checkout',r=>{payload=r.request().postDataJSON().payload;return r.fulfill({json:{orderId:ORDER,orderNumber:42,total:10,receiptPickupLocationId:null}})});
 await page.route('**/rest/v1/rpc/food_get_receipt_destinations_v1',r=>{expect(r.request().postDataJSON()).toEqual({p_store_id:STORE,p_pickup_location_id:null});return r.fulfill({json:{mode:'general',contacts}})});
 await page.goto('/doce-lua/produto/brigadeiro-teste');await page.getByRole('button',{name:'Adicionar ao carrinho',exact:true}).click();await page.goto('/doce-lua/carrinho');await page.getByRole('link',{name:'Continuar',exact:true}).click();await page.getByRole('button',{name:/Retirada Buscar/}).click();await page.getByRole('combobox',{name:'Ponto de retirada',exact:true}).selectOption(point);await page.getByLabel('Nome',{exact:true}).fill('Pessoa sintética');await page.getByLabel(/WhatsApp/).first().fill('11000000001');await page.getByRole('button',{name:/^PIX/}).click();await page.getByRole('button',{name:/Registrar pedido|Finalizar/}).filter({visible:true}).first().click();
 await expect(page).toHaveURL(new RegExp(ORDER));expect(payload).toMatchObject({delivery_type:'pickup',pickup_location_id:point,receipt_pickup_location_id:null});await expect(page.getByRole('region',{name:'Enviar comprovante'}).getByRole('combobox')).toBeVisible();
});
