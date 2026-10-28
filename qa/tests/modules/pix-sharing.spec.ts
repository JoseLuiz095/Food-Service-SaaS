import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockBackend, STORE, ORDER, PRODUCT } from './fixtures';
const token='synthetic.capability';
const linksEnabled=process.env.QA_PIX_LINK_ENABLED!=='false';
async function setup(page:Page){
 const escaped:string[]=[];
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin==='http://127.0.0.1:5189'||u.protocol==='data:')return route.continue();
  escaped.push(u.origin);return route.abort('blockedbyclient');
 });
 const {writes}=await mockBackend(page,{auth:true});
 const order={id:ORDER,store_id:STORE,order_number:42,customer_name:'Pessoa sintética',customer_phone:'',delivery_type:'pickup',payment_method:'pix',payment_status:'pending',status:'received',subtotal:12.5,total:12.5,delivery_fee:0,created_at:new Date().toISOString()};
 await page.route(/\/rest\/v1\/food_orders(?:\?|$)/,r=>r.fulfill({json:[order]}));
 await page.route(/\/rest\/v1\/food_order_items(?:\?|$)/,r=>r.fulfill({json:[{id:PRODUCT,order_id:ORDER,product_id:PRODUCT,product_name:'Produto sintético',quantity:1,unit_price:12.5,item_total:12.5,addons:[]}]}));
 const issued:unknown[]=[];
 await page.route('**/functions/v1/food-order-payment',r=>{
  issued.push(r.request().postDataJSON());return r.fulfill({json:{token,expiresAt:new Date(Date.now()+3600000).toISOString()}});
 });
 await page.goto('/admin/pedidos');
 await page.getByRole('button',{name:'Mostrar QR Code',exact:true}).click();
 return {escaped,writes,issued};
}
for(const width of [320,360,390,768,1366]) test(`admin mantém cópia e link sem botão redundante em ${width}px`,async({page,context})=>{
 test.skip(!linksEnabled);
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 await page.setViewportSize({width,height:900});
 await page.addInitScript(()=>{
  (window as any).shared=[];
  Object.defineProperty(navigator,'share',{value:async(data:unknown)=>{(window as any).shared.push(data)}});
 });
 const {escaped,writes,issued}=await setup(page);
 const code=await page.getByLabel('Código Pix',{exact:true}).inputValue();
 await expect(page.getByRole('button',{name:'Compartilhar só o código Pix',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Copiar código Pix',exact:true}).click();
 expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(code);
 expect(issued).toEqual([]); // Compartilhar o código não emite link ou confirma pagamento.
 await page.getByRole('button',{name:'Compartilhar link de pagamento',exact:true}).click();
 const link=await page.getByLabel('Link de pagamento',{exact:true}).inputValue();
 expect(link).toContain(`/pagamento/pix#${token}`);
 expect(link).not.toContain(code);
 expect(issued).toEqual([{action:'issue',storeId:STORE,orderId:ORDER}]);
 const copy=page.getByRole('button',{name:'Copiar link de pagamento',exact:true});
 await copy.focus();await page.keyboard.press('Enter');
 expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(link);
 await expect(page.getByRole('status').filter({hasText:'Link copiado.'})).toBeVisible();
 const bounds=await copy.boundingBox();expect(bounds!.height).toBeGreaterThanOrEqual(44);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(writes.filter(x=>/confirm.*payment|food_orders/.test(x.url))).toEqual([]);
 expect(escaped).toEqual([]);
});
test('controles de cópia têm rótulos e atributos acessíveis',async({page})=>{
 test.skip(!linksEnabled);
 await page.addInitScript(()=>Object.defineProperty(navigator,'share',{value:async()=>{}}));
 await setup(page);
 await page.getByRole('button',{name:'Compartilhar link de pagamento',exact:true}).click();
 await expect(page.getByRole('button',{name:'Copiar link de pagamento'})).toBeVisible();
 const result=await new AxeBuilder({page}).include('.pix-copy-control')
  .withRules(['label','button-name','aria-valid-attr','aria-valid-attr-value']).analyze();
 expect(result.violations).toEqual([]);
});
