import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockBackend, ORDER, PRODUCT, STORE } from './fixtures';

// Evidência da interface atual. Violações encontradas são anexadas como baseline,
// sem declarar aprovação WCAG ou comportamento real do PostgreSQL a partir de mocks.
for (const width of [320, 360, 390, 768, 1366]) {
  test(`baseline pedidos/local ${width}px, teclado e axe (sintético)`, async ({ page }, info) => {
    const escaped: string[] = [];
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === 'http://127.0.0.1:5188' || url.protocol === 'data:') return route.continue();
      escaped.push(url.origin); return route.abort('blockedbyclient');
    });
    await mockBackend(page, { auth: true });
    const itemId='30000000-0000-4000-8000-000000000001';
    const localId='40000000-0000-4000-8000-000000000001';
    const row={ id:ORDER, store_id:STORE, order_number:321, customer_name:'Cliente sintético', customer_phone:'',
      delivery_type:'pickup', payment_method:'pix', payment_status:'pending', status:'received', stock_location_id:localId,
      subtotal:10,total:10,delivery_fee:0,inventory_status:'reserved',created_at:new Date().toISOString() };
    const item={ id:itemId,order_id:ORDER,product_id:PRODUCT,product_name:'Produto sintético',quantity:1,
      unit_price:10,item_total:10,variant_price_delta:0,addons:[],inventory_reserved_quantity:1,created_at:row.created_at };
    const calls: unknown[]=[];
    await page.route(/\/rest\/v1\/food_orders(?:\?|$)/, route=>route.fulfill({json:[row]}));
    await page.route(/\/rest\/v1\/food_order_items(?:\?|$)/, route=>route.fulfill({json:[item]}));
    await page.route('**/rest/v1/food_stock_locations?**',route=>route.fulfill({json:[{id:localId,store_id:STORE,name:'Ponto sintético',active:true,is_default:true}]}));
    await page.route('**/rest/v1/rpc/food_update_order_items_v1', async route=>{
      const body=route.request().postDataJSON();calls.push(body);
      item.quantity=body.p_items[0].quantity;item.item_total=item.quantity*10;row.total=item.item_total;row.subtotal=item.item_total;
      await route.fulfill({json:[{subtotal:row.subtotal,total:row.total}]});
    });
    await page.setViewportSize({width,height:900});
    await page.goto('/admin/pedidos');
    await page.getByRole('button',{name:'Detalhes / editar',exact:true}).first().click();
    const dialog=page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button',{name:'Editar pedido',exact:true}).click();
    const increase=dialog.getByRole('button',{name:'Aumentar Produto sintético',exact:true});
    await increase.focus();await page.keyboard.press('Enter');
    await dialog.getByRole('button',{name:'Salvar alterações',exact:true}).click();
    await expect(dialog.getByText('2x Produto sintético',{exact:true})).toBeVisible();
    expect(calls).toEqual([{p_order_id:ORDER,p_items:[{item_id:itemId,quantity:2}]}]);
    const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
    await info.attach(`baseline-${width}.json`,{body:JSON.stringify({width,overflow,violations:axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}))},null,2),contentType:'application/json'});
    expect(escaped,'nenhuma requisição pode escapar das fixtures').toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
