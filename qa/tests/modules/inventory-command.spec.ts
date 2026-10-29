import { expect, test } from '@playwright/test';
import { mockBackend, product, PRODUCT, STORE } from './fixtures';

const SECOND='20000000-0000-4000-8000-000000000002';
const ready={...product,name:'Pipoca teste',stock_quantity:0,stock_reserved_quantity:0};
const reserved={...product,id:SECOND,name:'Pipoca reservada',stock_quantity:24,stock_reserved_quantity:2};

async function openStock(page:import('@playwright/test').Page, mode=false){
  await mockBackend(page,{auth:true});
  const amounts=new Map([[PRODUCT,ready.stock_quantity],[SECOND,reserved.stock_quantity]]);
  const writes:Array<Record<string,unknown>>=[];
  await page.route('**/rest/v1/food_products?**',route=>route.fulfill({json:[{...ready,stock_quantity:amounts.get(PRODUCT)},{...reserved,stock_quantity:amounts.get(SECOND)}]}));
  await page.route('**/rest/v1/rpc/food_stock_mode_v1',route=>route.fulfill({json:{multi_location_enabled:mode}}));
  await page.route('**/rest/v1/rpc/food_adjust_product_stock_v1',async route=>{
    const body=route.request().postDataJSON() as Record<string,unknown>;
    writes.push(body);
    const id=String(body.p_product_id), physical=amounts.get(id) ?? 0, quantity=Number(body.p_quantity);
    const next=body.p_mode==='set'?quantity:body.p_mode==='add'?physical+quantity:physical-quantity;
    amounts.set(id,next);
    await route.fulfill({json:{stock_quantity:next,stock_reserved_quantity:id===SECOND?2:0,stock_status:next<=3?'low_stock':'available',availability_status:next===0?'sold_out':'available'}});
  });
  await page.goto('/admin/estoque?visao=produtos');
  await expect(page.getByRole('region',{name:'Estoque de produtos'})).toBeVisible();
  return {writes,amounts};
}

test('painel filtra problemas e ajusta físico sem recarregar a página',async({page})=>{
  const {writes}=await openStock(page);
  const panel=page.getByRole('region',{name:'Estoque de produtos'});
  await expect(panel.getByText('Doce Lua')).toBeVisible();
  await panel.getByRole('button',{name:'Sem estoque'}).click();
  await expect(panel.locator('.inventory-command-row')).toHaveCount(1);
  await panel.getByRole('button',{name:'Conferir estoque'}).click();
  const first=panel.locator(`#stock-row-${PRODUCT}`);
  await expect(first.getByLabel('Definir estoque físico de Pipoca teste')).toBeVisible();
  await first.getByLabel('Definir estoque físico de Pipoca teste').fill('17');
  await first.getByRole('button',{name:'Definir'}).click();
  await expect(first.locator('.inventory-command-row__availability')).toContainText('17');
  await first.getByLabel('Quantidade para ajuste rápido de Pipoca teste').fill('10');
  await first.getByRole('button',{name:'Adicionar 10 unidade(s) de Pipoca teste'}).click();
  await expect(first.locator('.inventory-command-row__availability')).toContainText('27');
  await first.getByLabel('Quantidade para ajuste rápido de Pipoca teste').fill('5');
  await first.getByRole('button',{name:'Remover 5 unidade(s) de Pipoca teste'}).click();
  await expect(first.locator('.inventory-command-row__availability')).toContainText('22');
  expect(writes.map(write=>[write.p_mode,write.p_quantity])).toEqual([['set',17],['add',10],['remove',5]]);
  expect(writes.every(write=>write.p_store_id===STORE&&write.p_idempotency_key)).toBe(true);
  await panel.getByRole('button',{name:'Alterados agora'}).click();
  await expect(panel.locator('.inventory-command-row')).toHaveCount(1);
  await page.reload();
  await expect(page.locator(`#stock-row-${PRODUCT} .inventory-command-row__availability`)).toContainText('22');
});

test('modo multilocal indica total da loja e exige ajuste por local',async({page})=>{
  const {writes}=await openStock(page,true);
  const panel=page.getByRole('region',{name:'Estoque de produtos'});
  await expect(panel.getByText('Locais separados · consulte o local ativo')).toBeVisible();
  await expect(panel.getByRole('link',{name:'Conferir por local'})).toHaveAttribute('href','/admin/estoque?visao=locais');
  await panel.locator(`#stock-row-${PRODUCT}`).getByRole('button',{name:'Ajustar'}).click();
  await expect(panel.locator(`#stock-row-${PRODUCT}`).getByRole('link',{name:'Estoque por local'})).toBeVisible();
  expect(writes).toHaveLength(0);
});

for(const width of [390,768,1024,1440]){
  test(`painel de estoque acessível em ${width}px`,async({page},testInfo)=>{
    await page.setViewportSize({width,height:844});
    await openStock(page);
    const panel=page.getByRole('region',{name:'Estoque de produtos'});
    await expect(panel.getByRole('searchbox',{name:'Buscar produto no estoque'})).toBeVisible();
    await panel.getByRole('searchbox',{name:'Buscar produto no estoque'}).fill('reservada');
    await expect(panel.locator('.inventory-command-row')).toHaveCount(1);
    await panel.locator('.inventory-command-row__action').click();
    await expect(panel.getByLabel('Definir estoque físico de Pipoca reservada')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`estoque-${width}.png`),fullPage:true});
  });
}
