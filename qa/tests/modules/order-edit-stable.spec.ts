import AxeBuilder from '@axe-core/playwright';
import{test,expect}from'@playwright/test';import{mockBackend,STORE,ORDER,PRODUCT}from'./fixtures';
for(const width of [320,390,1366])test(`edição preservada em atualização e troca de ponto ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await mockBackend(page,{auth:true});let calls=0;let currentPickup:string|undefined;const writes:any[]=[];const point='30000000-0000-4000-8000-000000000002';
 const order=()=>({id:ORDER,store_id:STORE,order_number:42,customer_name:'Pessoa sintética',pickup_location_id:currentPickup,delivery_type:'pickup',payment_method:'pix',payment_status:'pending',status:'received',subtotal:10,total:10,created_at:new Date().toISOString()});
 await page.route(/\/rest\/v1\/food_orders(?:\?|$)/,r=>{calls++;return r.fulfill({json:[order()]})});
 await page.route(/\/rest\/v1\/food_order_items(?:\?|$)/,r=>r.fulfill({json:[{id:PRODUCT,order_id:ORDER,product_id:PRODUCT,product_name:'Produto sintético',quantity:1,unit_price:10,item_total:10}]}));
 await page.route('**/rest/v1/food_pickup_locations?*',r=>r.fulfill({json:[{id:point,name:'Ponto B sintético',stock_location_id:'40000000-0000-4000-8000-000000000002'}]}));
 await page.route('**/rest/v1/rpc/food_edit_order_pickup_v1',r=>{writes.push(r.request().postDataJSON());currentPickup=point;return r.fulfill({json:null})});
 await page.goto('/admin/pedidos');await page.getByRole('button',{name:'Detalhes / editar',exact:true}).first().click();const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Editar pedido',exact:true}).click();
 await dialog.getByLabel('Cliente',{exact:true}).fill('Rascunho preservado');await dialog.locator('textarea').fill('Nota sintética');
 const before=calls;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>calls).toBeGreaterThan(before);
 await expect(dialog.getByLabel('Cliente',{exact:true})).toHaveValue('Rascunho preservado');await expect(dialog.locator('textarea')).toHaveValue('Nota sintética');
 const beforeSync=calls;await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'foodservice_store_sync_v1',newValue:'synthetic-sync'})));await expect.poll(()=>calls).toBeGreaterThan(beforeSync);await expect(dialog.locator('textarea')).toHaveValue('Nota sintética');
 await dialog.getByLabel('Ponto de retirada',{exact:false}).selectOption(point);const axe=await new AxeBuilder({page}).include('.order-details-modal__edit-grid').withTags(['wcag2a','wcag2aa']).analyze();expect(axe.violations).toEqual([]);await dialog.getByRole('button',{name:'Salvar alterações'}).focus();await page.keyboard.press('Enter');
 await expect(page.getByText('Dados do pedido atualizados.',{exact:true})).toBeVisible();await expect(dialog.getByText('Ponto B sintético',{exact:true})).toBeVisible();expect(writes).toHaveLength(1);expect(writes[0].p_pickup_id).toBe(point);expect(writes[0].p_details.customerName).toBe('Rascunho preservado');
});
