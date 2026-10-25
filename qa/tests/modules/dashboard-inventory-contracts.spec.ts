import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { mockBackend, product, PRODUCT, STORE } from './fixtures';

const ITEM='a0000000-0000-4000-8000-000000000099';
const now='2026-10-25T12:00:00.000Z';
const inventoryItem=(overrides:Record<string,unknown>={})=>({
  id:ITEM,store_id:STORE,product_id:null,name:'Farinha teste',sku:null,item_type:'ingredient',unit:'kg',
  current_quantity:2,average_unit_cost:10,last_unit_cost:10,reorder_point:1,low_stock_alert_enabled:true,
  active:true,notes:null,created_at:now,updated_at:now,...overrides,
});

async function openInventory(page:Page, initial=inventoryItem()){
  await mockBackend(page,{auth:true});
  let stored=initial;
  let directPatches=0;
  let legacyConversions=0;
  await page.route('**/rest/v1/food_inventory_items?**',route=>{
    if(route.request().method()==='PATCH')directPatches++;
    return route.fulfill({json:[stored]});
  });
  await page.route('**/rest/v1/rpc/food_convert_inventory_unit',route=>{
    legacyConversions++;
    return route.fulfill({status:500,json:{message:'Conversão legada não deve ser chamada'}});
  });
  await page.goto('/admin/estoque');
  await page.getByRole('button',{name:'Abrir ferramentas avançadas'}).click();
  await page.getByRole('button',{name:'Editar Farinha teste'}).click();
  return {
    detail:page.getByRole('region',{name:'Detalhes de Farinha teste'}),
    update:(value:ReturnType<typeof inventoryItem>)=>{stored=value},
    getLegacyCalls:()=>legacyConversions,
    getDirectPatches:()=>directPatches,
  };
}

const metrics={timezone:'America/Sao_Paulo',asOf:now,ordersTotal:150,cancelledOrders:11,ordersToday:16,
  pendingPayments:8,pendingAmount:78.4,processingOrders:5,scheduledToday:3,paidOrders:82,
  totalReceived:9012.75,receivedToday:432.1,receivedTodayCount:7};

test('Dashboard usa totais da RPC, inclusive além dos 100 pedidos do snapshot',async({page})=>{
  await mockBackend(page,{auth:true});
  let calls=0;
  await page.route('**/rest/v1/rpc/food_dashboard_metrics_v1',route=>{
    calls++;
    expect(route.request().postDataJSON()).toEqual({p_store_id:STORE});
    return route.fulfill({json:metrics});
  });
  await page.route('**/rest/v1/food_orders?**',route=>route.fulfill({json:Array.from({length:100},(_,i)=>({
    id:`b0000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,store_id:STORE,
    created_at:now,status:'cancelled',payment_status:'pending',total:9999,
  }))}));
  await page.goto('/admin');
  await expect(page.locator('.stat-card').filter({hasText:'Pedidos registrados'})).toContainText('150');
  const today=page.locator('.dashboard-today-card');
  await expect(today.locator('.dashboard-today-metric').filter({hasText:'Recebido hoje'})).toContainText('R$ 432,10');
  await expect(today.locator('.dashboard-today-metric').filter({hasText:'A receber'})).toContainText('R$ 78,40');
  expect(calls).toBeGreaterThan(0);
});

test('falha da RPC não exibe faturamento derivado de pedidos parciais',async({page})=>{
  await mockBackend(page,{auth:true});
  await page.route('**/rest/v1/rpc/food_dashboard_metrics_v1',route=>route.fulfill({status:503,json:{message:'Métricas indisponíveis para teste'}}));
  await page.goto('/admin');
  await expect(page.getByRole('alert')).toContainText(/métricas|indisponível/i);
  const today=page.locator('.dashboard-today-card');
  await expect(today.locator('.dashboard-today-metric').filter({hasText:'Recebido hoje'})).toContainText('—');
  await expect(today.locator('.dashboard-today-metric').filter({hasText:'A receber'})).toContainText('—');
  await expect(today).not.toContainText('R$ 0,00');
});

test('troca de kg para g converte mínimo uma vez e salva tudo em uma RPC',async({page})=>{
  const screen=await openInventory(page);
  await expect(screen.detail).toContainText(/kg/);
  await screen.detail.locator('.inventory-detail-unit select').selectOption('g');
  await expect(screen.detail.getByLabel(/Estoque mínimo/)).toHaveValue('1000');
  const calls:unknown[]=[];
  await page.route('**/rest/v1/rpc/food_update_inventory_item_v1',route=>{
    const payload=route.request().postDataJSON();calls.push(payload);
    const updated=inventoryItem({unit:'g',current_quantity:2000,average_unit_cost:0.01,last_unit_cost:0.01,reorder_point:1000,name:'Farinha teste'});
    screen.update(updated);
    return route.fulfill({json:{item:updated}});
  });
  page.once('dialog',dialog=>dialog.accept());
  await screen.detail.getByRole('button',{name:'Salvar detalhes'}).click();
  await expect(screen.detail).toHaveCount(0);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({p_store_id:STORE,p_inventory_item_id:ITEM,p_data:{unit:'g',reorder_point:1000}});
  expect(screen.getLegacyCalls()).toBe(0);
  expect(screen.getDirectPatches()).toBe(0);
  await expect(page.getByText('Farinha teste').first()).toBeVisible();
});

test('cancelamento e erro da troca de unidade preservam edição sem gravação parcial',async({page})=>{
  const screen=await openInventory(page);
  await screen.detail.locator('.inventory-detail-unit select').selectOption('g');
  let calls=0;
  await page.route('**/rest/v1/rpc/food_update_inventory_item_v1',route=>{
    calls++;
    return route.fulfill({status:409,json:{message:'Insumo atualizado por outro usuário'}});
  });
  page.once('dialog',dialog=>dialog.dismiss());
  await screen.detail.getByRole('button',{name:'Salvar detalhes'}).click();
  expect(calls).toBe(0);
  await expect(screen.detail.locator('.inventory-detail-unit select')).toHaveValue('g');
  page.once('dialog',dialog=>dialog.accept());
  await screen.detail.getByRole('button',{name:'Salvar detalhes'}).click();
  await expect.poll(()=>calls).toBe(1);
  await expect(screen.detail).toBeVisible();
  expect(screen.getLegacyCalls()).toBe(0);
  expect(screen.getDirectPatches()).toBe(0);
});

test('CSV de estoque neutraliza fórmula de nome controlado pelo usuário',async({page})=>{
  await mockBackend(page,{auth:true});
  await page.route('**/rest/v1/food_inventory_items?**',route=>route.fulfill({json:[inventoryItem({name:'=1+1'})]}));
  await page.goto('/admin/estoque');
  await page.getByRole('button',{name:'Abrir ferramentas avançadas'}).click();
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Exportar CSV'}).click();
  const download=await downloadPromise;
  const csv=await readFile(await download.path(),'utf8');
  expect(csv).toContain("'=1+1");
  expect(csv).not.toMatch(/(?:^|\r\n|;)=1\+1/);
  expect(csv.charCodeAt(0)).toBe(0xfeff);
});

test('resposta atrasada de outra ficha não troca os insumos do produto selecionado',async({page})=>{
  const secondProduct='20000000-0000-4000-8000-000000000002';
  const firstRecipe='c0000000-0000-4000-8000-000000000001';
  const secondRecipe='c0000000-0000-4000-8000-000000000002';
  await mockBackend(page,{auth:true});
  await page.route('**/rest/v1/food_products?**',route=>route.fulfill({json:[product,{...product,id:secondProduct,name:'Bolo teste',slug:'bolo-teste'}]}));
  await page.route('**/rest/v1/food_inventory_items?**',route=>route.fulfill({json:[inventoryItem()]}));
  await page.route('**/rest/v1/food_product_recipes?**',route=>route.fulfill({json:[
    {id:firstRecipe,store_id:STORE,product_id:PRODUCT,name:'Receita A',yield_quantity:1,yield_unit:'un',active:true,notes:null,created_at:now,updated_at:now},
    {id:secondRecipe,store_id:STORE,product_id:secondProduct,name:'Receita B',yield_quantity:1,yield_unit:'un',active:true,notes:null,created_at:now,updated_at:now},
  ]}));
  let releaseFirst:()=>void=()=>{};
  const firstGate=new Promise<void>(resolve=>{releaseFirst=resolve});
  let firstPending=0;
  await page.route('**/rest/v1/food_product_recipe_items?**',async route=>{
    const recipeId=new URL(route.request().url()).searchParams.get('recipe_id');
    if(!recipeId)return route.fulfill({json:[]});
    if(recipeId===`eq.${firstRecipe}`){firstPending++;await firstGate;}
    return route.fulfill({json:[{
      id:recipeId===`eq.${firstRecipe}`?'d0000000-0000-4000-8000-000000000001':'d0000000-0000-4000-8000-000000000002',
      store_id:STORE,recipe_id:recipeId?.slice(3),inventory_item_id:ITEM,stage:'Base',
      quantity:recipeId===`eq.${firstRecipe}`?11:22,unit:'kg',waste_percent:0,sort_order:0,created_at:now,updated_at:now,
    }]});
  });
  await page.goto('/admin/estoque');
  await page.getByRole('button',{name:'Abrir ferramentas avançadas'}).click();
  const recipe=page.locator('.inventory-recipe-card');
  const selector=recipe.getByLabel('Produto');
  await selector.selectOption(PRODUCT);
  await expect.poll(()=>firstPending).toBe(1);
  await expect(recipe.getByRole('status')).toContainText('Carregando ficha técnica');
  await selector.selectOption(secondProduct);
  const quantity=recipe.getByPlaceholder('Quantidade');
  await expect(quantity).toHaveValue('22');
  releaseFirst();
  await expect(quantity).toHaveValue('22');
  await expect(selector).toHaveValue(secondProduct);
});
