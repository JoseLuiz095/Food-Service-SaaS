import { test, expect } from '@playwright/test';
import { mockBackend, STORE, ORDER, PRODUCT } from './fixtures';
import { buildStaticPixCopyPaste } from '../../../src/utils/pix';
const payload=buildStaticPixCopyPaste({key:'test@example.invalid',receiver:'Loja Teste',city:'Linhares',amount:12.5,txid:'PED42'});
const pending=()=>({status:'pending',storeName:'Loja Teste',orderNumber:42,total:12.5,receiver:'Loja Teste',pixPayload:payload,expiresAt:new Date(Date.now()+3600000).toISOString()});
const token='encrypted.capability';
for(const width of [320,390,768]) test(`payment link opens in fresh browser, copies Pix and shows QR at ${width}px`,async({page,context},info)=>{
 await page.setViewportSize({width,height:844});
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 const requests:string[]=[];
 page.on('request',r=>requests.push(r.url()));
 await page.route('**/functions/v1/food-order-payment',r=>{expect(r.request().postDataJSON()).toEqual({action:'resolve',token});return r.fulfill({json:pending()});});
 await page.goto(`/pagamento/pix#${token}`);
 await expect(page.getByRole('heading',{name:'Loja Teste'})).toBeVisible();
 await expect(page.getByText('Pedido #00042')).toBeVisible();
 await expect(page.getByText('R$ 12,50',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Copiar código Pix'}).click();
 await expect(page.getByRole('status').filter({hasText:'Código Pix copiado'})).toBeVisible();
 expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(payload);
 await page.getByText('Mostrar QR Code').click();
 await expect(page.getByRole('img',{name:/QR Code Pix/})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 const button=await page.getByRole('button',{name:'Copiar código Pix'}).boundingBox();expect(button!.height).toBeGreaterThanOrEqual(44);
 expect(requests.filter(url=>url.includes('/rest/v1/'))).toEqual([]);
 expect(requests.filter(url=>url.includes(token))).toEqual([]);
 if(width===390)await page.screenshot({path:info.outputPath('payment-mobile.png'),fullPage:true});
 await page.reload();await expect(page.getByRole('heading',{name:'Loja Teste'})).toBeVisible();
});
test('denied clipboard has explicit manual selection and no false success',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new DOMException('denied','NotAllowedError')}}});document.execCommand=()=>false;});
 await page.route('**/functions/v1/food-order-payment',r=>r.fulfill({json:pending()}));
 await page.goto(`/pagamento/pix#${token}`);await page.getByRole('button',{name:'Copiar código Pix'}).click();
 await expect(page.getByRole('status').filter({hasText:'A cópia automática foi bloqueada'})).toBeVisible();
 const field=page.getByLabel('Código Pix',{exact:true});await expect(field).toBeFocused();
 expect(await field.evaluate((el:HTMLTextAreaElement)=>el.selectionEnd-el.selectionStart)).toBe(payload.length);
 await expect(page.getByText('Código Pix copiado.',{exact:true})).toHaveCount(0);
});
for(const status of ['paid','cancelled'])test(`${status} hides payment controls and bank code`,async({page})=>{
 await page.route('**/functions/v1/food-order-payment',r=>r.fulfill({json:{status,storeName:'Loja Teste',orderNumber:42}}));
 await page.goto(`/pagamento/pix#${token}`);
 await expect(page.locator('.order-payment-card').getByRole('status')).toContainText(status==='paid'?'Não pague novamente':'Não efetue o pagamento');
 await expect(page.getByRole('button',{name:'Copiar código Pix'})).toHaveCount(0);
});
test('expired link and network failure offer retry, never a stale payable code',async({page})=>{
 let failed=true;
 await page.route('**/functions/v1/food-order-payment',r=>r.fulfill(failed?{status:410,json:{error:'Link expirado. Solicite outro à loja.'}}:{json:pending()}));
 await page.goto(`/pagamento/pix#${token}`);await expect(page.getByRole('alert')).toContainText('Link expirado');
 await expect(page.getByLabel('Código Pix',{exact:true})).toHaveCount(0);
 failed=false;await page.getByRole('button',{name:'Tentar novamente'}).click();await expect(page.getByLabel('Código Pix',{exact:true})).toHaveValue(payload);
 failed=true;await page.getByRole('button',{name:'Já paguei · verificar status'}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByLabel('Código Pix',{exact:true})).toHaveCount(0);
});
test('admin shares safe URL without raw Pix or customer data, keeps code selectable',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await mockBackend(page,{auth:true});
 await page.addInitScript(()=>{(window as any).shared=[];Object.defineProperty(navigator,'share',{value:async data=>(window as any).shared.push(data)});});
 const row={id:ORDER,store_id:STORE,order_number:42,customer_name:'Cliente Privado',customer_phone:'11999999999',delivery_type:'pickup',payment_method:'pix',payment_status:'pending',status:'received',subtotal:12.5,total:12.5,delivery_fee:0,created_at:new Date().toISOString()};
 await page.route(/\/rest\/v1\/food_orders(?:\?|$)/,r=>r.fulfill({json:[row]}));
 await page.route(/\/rest\/v1\/food_order_items(?:\?|$)/,r=>r.fulfill({json:[{id:PRODUCT,order_id:ORDER,product_id:PRODUCT,product_name:'Produto',quantity:1,unit_price:12.5,item_total:12.5,addons:[]}]}));
 const issued:any[]=[];
 await page.route('**/functions/v1/food-order-payment',r=>{issued.push(r.request().postDataJSON());return r.fulfill({json:{token,expiresAt:pending().expiresAt}});});
 await page.goto('/admin/pedidos');
 await page.getByRole('button',{name:'Mostrar QR Code',exact:true}).click();
 await page.getByRole('button',{name:'Compartilhar link de pagamento'}).click();
 await expect(page.getByLabel('Link de pagamento',{exact:true})).toHaveValue(new RegExp(`/pagamento/pix#${token}`));
 expect(issued).toEqual([{action:'issue',storeId:STORE,orderId:ORDER}]);
 const shared=await page.evaluate(()=>(window as any).shared);expect(shared).toHaveLength(1);
 expect(JSON.stringify(shared)).not.toContain('Cliente Privado');expect(JSON.stringify(shared)).not.toContain('11999999999');expect(JSON.stringify(shared)).not.toContain('000201');
 await expect(page.getByRole('button',{name:'Copiar código Pix'})).toBeVisible();
});

test('returning from bank rechecks paid status and removes previous instructions',async({page})=>{
 let paid=false;
 await page.route('**/functions/v1/food-order-payment',r=>r.fulfill({json:paid?{status:'paid',storeName:'Loja Teste',orderNumber:42}:pending()}));
 await page.goto(`/pagamento/pix#${token}`);
 await expect(page.getByLabel('Código Pix',{exact:true})).toHaveValue(payload);
 paid=true;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await expect(page.locator('.order-payment-card').getByRole('status')).toContainText('Não pague novamente');
 await expect(page.getByLabel('Código Pix',{exact:true})).toHaveCount(0);
});
