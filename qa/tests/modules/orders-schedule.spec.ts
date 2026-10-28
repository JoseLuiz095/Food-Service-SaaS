import AxeBuilder from '@axe-core/playwright';
import{test,expect}from '@playwright/test';import{mockBackend,STORE,ORDER,PRODUCT}from './fixtures';import{orderSchedulePresentation}from '../../../src/utils/orderSchedulePresentation';
const now=Date.parse('2026-10-28T15:00:00Z');
test('classifica dia no fuso da loja, prazo vencido e estados finais',()=>{
 expect(orderSchedulePresentation({status:'received',scheduledFor:'2026-10-29T01:00:00Z'},now,'America/Sao_Paulo')?.future).toBe(false);
 expect(orderSchedulePresentation({status:'received',scheduledFor:'2026-10-29T04:00:00Z'},now,'America/Sao_Paulo')?.future).toBe(true);
 expect(orderSchedulePresentation({status:'preparing',scheduledFor:'2026-10-28T10:00:00Z'},now)?.overdue).toBe(true);
 for(const status of ['delivered','picked_up','cancelled']as const)expect(orderSchedulePresentation({status,scheduledFor:'2026-11-01T15:00:00Z'},now)).toBe(null);
 expect(orderSchedulePresentation({status:'received',scheduledFor:'inválida'},now)).toBe(null);
 expect(orderSchedulePresentation({status:'received',scheduledFor:'2026-11-01T15:00:00Z'},now,'Inválido')?.timezone).toBe('America/Sao_Paulo');
 expect(orderSchedulePresentation({status:'received',scheduledFor:'2026-10-29T04:00:00Z'},Date.parse('2026-10-29T15:00:00Z'))?.future).toBe(false);
});
for(const width of [320,390,768,1366])test(`futuros ficam separados da fila atual e busca abre o grupo ${width}px`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.clock.install({time:now});await mockBackend(page,{auth:true});let mutations=0;
 const base={store_id:STORE,customer_phone:'',delivery_type:'pickup',payment_method:'pix',payment_status:'paid',status:'received',subtotal:12.5,total:12.5,created_at:'2026-10-20T15:00:00Z'};
 const orders=[{...base,id:'b0000000-0000-4000-8000-000000000004',order_number:45,customer_name:'Futuro a receber sintético',payment_status:'pending',scheduled_for:'2026-11-05T16:00:00Z'},{...base,id:ORDER,order_number:42,customer_name:'Futuro sintético',scheduled_for:'2026-11-04T16:00:00Z'},{...base,id:'b0000000-0000-4000-8000-000000000002',order_number:43,customer_name:'Hoje sintético',scheduled_for:'2026-10-28T19:00:00Z'},{...base,id:'b0000000-0000-4000-8000-000000000003',order_number:44,customer_name:'Atrasado sintético',scheduled_for:'2026-10-27T19:00:00Z'}];
 await page.route(/\/rest\/v1\/food_orders(?:\?|$)/,r=>{if(r.request().method()!=='GET')mutations++;return r.fulfill({json:orders})});await page.route(/\/rest\/v1\/food_order_items(?:\?|$)/,r=>r.fulfill({json:orders.map(o=>({id:o.id,order_id:o.id,product_id:PRODUCT,product_name:'Produto sintético',quantity:1,unit_price:12.5,item_total:12.5}))}));
 await page.goto('/admin/pedidos');const future=page.locator('.orders-future-panel');await expect(future).toBeVisible();await expect(future).not.toHaveAttribute('open','');await expect(page.locator('.orders-collection-section--processing')).not.toContainText('Futuro sintético');await expect(page.locator('.orders-collection-section--processing')).toContainText('Hoje sintético');await expect(page.locator('.orders-overdue-banner')).not.toContainText('Futuro sintético');await future.locator('summary').click();await expect(future).toContainText('04/11/2026');await expect(future).toContainText('Horário da loja');
 await expect(page.locator('.orders-payment-inbox__list .order-payment-future')).toContainText('Agendado · próximos dias');const axe=await new AxeBuilder({page}).include('.orders-future-panel').withTags(['wcag2a','wcag2aa']).analyze();expect(axe.violations).toEqual([]);await page.getByPlaceholder('Buscar pedido, cliente ou telefone...').fill('Futuro sintético');await expect(future).toHaveAttribute('open','');expect(mutations).toBe(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);if(width===390)await page.screenshot({path:info.outputPath('agendados-mobile.png'),fullPage:true});
});
