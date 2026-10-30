import {expect,test} from '@playwright/test';
import {mockBackend,PRODUCT,STORE} from './fixtures';

const location={id:'50000000-0000-4000-8000-000000000001',store_id:STORE,name:'Ponto da loja amiga',location_type:'pickup',active:true,is_default:true};
for(const width of [320,390,768,1366])test(`conferência diária do ponto e vendas cabem em ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await mockBackend(page,{auth:true});
 await page.route('**/rest/v1/rpc/food_stock_mode_v1',route=>route.fulfill({json:{multi_location_enabled:true}}));
 await page.route(/\/rest\/v1\/food_stock_locations(?:\?|$)/,route=>route.fulfill({json:[location]}));
 await page.route(/\/rest\/v1\/food_product_location_stock(?:\?|$)/,route=>route.fulfill({json:[{product_id:PRODUCT,location_id:location.id,stock_quantity:16,stock_reserved_quantity:1,updated_at:new Date().toISOString()}]}));
 await page.route(/\/rest\/v1\/food_pickup_locations(?:\?|$)/,route=>route.fulfill({json:[]}));
 await page.route('**/rest/v1/rpc/food_get_location_sales_today_v1',route=>route.fulfill({json:[{product_id:PRODUCT,net_sold:2}]}));
 await page.route(/\/rest\/v1\/food_receipt_contacts(?:\?|$)/,route=>route.fulfill({json:[]}));
 await page.route(/\/rest\/v1\/food_pickup_receipt_contacts(?:\?|$)/,route=>route.fulfill({json:[]}));
 await page.goto('/admin/estoque-locais');
 await expect(page.getByRole('heading',{name:'Estoque e locais'})).toBeVisible();
 await expect(page.getByText('Conferência do dia',{exact:true})).toBeVisible();
 const item=page.locator('.stock-location-product').filter({hasText:'Brigadeiro teste'});
 await item.getByText('Detalhes e ações',{exact:true}).click();await expect(item).toContainText('Vendido hoje: 2');
 await expect(item.getByRole('button',{name:'Definir',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
