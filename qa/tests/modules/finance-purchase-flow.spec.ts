import { test, expect } from '@playwright/test';
import { mockBackend, STORE } from './fixtures';

const PLAN='30000000-0000-4000-8000-000000000003';
const ITEM='40000000-0000-4000-8000-000000000004';

test('compra no financeiro registra estoque e despesa em uma única ação no celular',async({page})=>{
  const writes:{url:string;body:any}[]=[];
  await page.setViewportSize({width:390,height:844});
  await mockBackend(page,{auth:true});
  await page.route('**/rest/v1/food_store_subscriptions?**',r=>r.fulfill({json:[{plan_id:PLAN,status:'active',expires_at:null}]}));
  await page.route('**/rest/v1/food_plans?**',r=>r.fulfill({json:[{id:PLAN,code:'PROFESSIONAL',name:'Profissional',product_limit:100,monthly_price:0,setup_price:0,active:true}]}));
  await page.route('**/rest/v1/food_plan_features?**',r=>r.fulfill({json:[{plan_id:PLAN,feature_code:'finance',enabled:true,limit_value:null}]}));
  await page.route('**/rest/v1/food_financial_categories?**',r=>r.fulfill({json:[{id:'50000000-0000-4000-8000-000000000005',store_id:STORE,name:'Ingredientes',direction:'expense',active:true,sort_order:1}]}));
  await page.route('**/rest/v1/food_financial_entries?**',r=>r.fulfill({json:[]}));
  await page.route('**/rest/v1/food_inventory_items?**',r=>r.fulfill({json:[{id:ITEM,store_id:STORE,product_id:null,name:'Whey',sku:null,item_type:'ingredient',unit:'kg',current_quantity:2,average_unit_cost:50,last_unit_cost:50,reorder_point:1,low_stock_alert_enabled:true,active:true,notes:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()}]}));
  await page.route('**/rest/v1/rpc/food_record_financed_purchase_v1',async r=>{
    writes.push({url:r.request().url(),body:r.request().postDataJSON()});
    await r.fulfill({json:{purchase_id:'60000000-0000-4000-8000-000000000006',financial_entry_id:'70000000-0000-4000-8000-000000000007',total_amount:80,duplicate:false}});
  });
  await page.goto('/admin/financeiro');
  await expect(page.getByRole('heading',{name:'Financeiro'})).toBeVisible();
  await expect(page.locator('.finance-entry-disclosure')).not.toHaveAttribute('open');
  await page.getByRole('button',{name:'Compra de insumos'}).click();
  await page.getByLabel('Insumo',{exact:true}).selectOption(ITEM);
  await page.getByLabel('Quantidade recebida').fill('2');
  await page.getByLabel('Custo total (R$)').fill('80');
  await page.getByLabel('Pagamento',{exact:true}).selectOption('pending');
  await page.getByRole('button',{name:'Registrar compra e atualizar estoque'}).click();
  await expect(page.getByText('Compra registrada no estoque e no financeiro.')).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0].body.p_request).toMatchObject({store_id:STORE,items:[{inventory_item_id:ITEM,quantity:2,unit_cost:40}],payment_status:'pending'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
