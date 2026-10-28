import { expect, test } from '@playwright/test';
import { mockBackend, PRODUCT, STORE, snapshot, ORDER } from './fixtures';
const point={id:'60000000-0000-4000-8000-000000000001',name:'Trabalho',short_code:'trabalho'};
async function pickup(page:any,available=3){
 await page.route('**/rest/v1/rpc/food_get_public_pickup_locations_v1', (r:any)=>r.fulfill({json:[point]}));
 await page.route('**/rest/v1/rpc/food_get_public_location_availability_v1', (r:any)=>r.fulfill({json:[{product_id:PRODUCT,available}]}));
}
for(const width of [390,768,1366]){
 test(`compra visitante em um toque, limite por ponto e checkout editável ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:844});
  const {writes}=await mockBackend(page);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await pickup(page);
  await page.goto('/doce-lua?ponto=trabalho');
  await expect(page.getByText('Ponto escolhido: Trabalho')).toBeVisible();
  const card=page.locator('.product-card-shell').first();
  if(width===390){ const bounds=await card.boundingBox(); expect(bounds!.y).toBeLessThan(700); }
  await card.getByRole('button',{name:'Adicionar Brigadeiro teste',exact:true}).click();
  await expect(page).toHaveURL(/doce-lua\?ponto=trabalho$/);
  await expect(card.getByText('1 no carrinho')).toBeVisible();
  await card.getByRole('button',{name:'Adicionar Brigadeiro teste',exact:true}).click();
  await card.getByRole('button',{name:'Adicionar Brigadeiro teste',exact:true}).click();
  await expect(card.getByRole('button',{name:'Adicionar Brigadeiro teste',exact:true})).toBeDisabled();
  await expect(card.getByText('3 no carrinho')).toBeVisible();
  if(width===390)await expect(page.locator('#foodweb-splash-screen')).toHaveCount(0);
  if(width===390)await page.screenshot({path:info.outputPath('vitrine-depois.png'),fullPage:true});
  await page.reload();
  await expect(card.getByText('3 no carrinho')).toBeVisible();
  await page.goto('/doce-lua/finalizar');
  await expect(page.getByRole('button',{name:/Retirada Buscar/})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByLabel('Rua',{exact:true})).toHaveCount(0);
  await expect(page.locator('input[required]:visible')).toHaveCount(2);
  await page.getByText('Editar quantidades',{exact:true}).click();
  const quantities=page.locator('.checkout-quantity-line').first();
  await expect(quantities.getByRole('button',{name:'Aumentar quantidade'})).toBeDisabled();
  await quantities.getByRole('button',{name:'Diminuir quantidade'}).click();
  await expect(page.locator('.summary-total')).toContainText('20,00');
  await page.getByLabel('Nome',{exact:true}).fill('Cliente visitante');
  await page.getByLabel(/WhatsApp \/ telefone/).fill('11999999999');
  if(width===390)await expect(page.locator('#foodweb-splash-screen')).toHaveCount(0);
  if(width===390)await page.screenshot({path:info.outputPath('checkout-depois.png'),fullPage:true});
  await page.getByRole('button',{name:/Registrar pedido|^Finalizar$/}).filter({visible:true}).first().click();
  await expect(page).toHaveURL(new RegExp(ORDER));
  await expect(page.getByLabel('Código Pix',{exact:true})).toHaveValue(/^000201/);
  const order=writes.find(w=>w.url.endsWith('/food-public-checkout'));
  expect(order?.body.payload).toMatchObject({store_id:STORE,delivery_type:'pickup',pickup_location_id:point.id});
  expect(order?.body.payload.items[0].quantity).toBe(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect(errors).toEqual([]);
 });
}

test('opções obrigatórias continuam exigindo personalização',async({page})=>{
 await mockBackend(page);
 await page.route('**/rest/v1/rpc/food_get_public_storefront_v1',r=>r.fulfill({json:{...snapshot,
 option_groups:[{id:'30000000-0000-4000-8000-000000000001',store_id:STORE,name:'Tamanho',kind:'variant',min_choices:1,max_choices:1,active:true}],
 option_items:[{id:'40000000-0000-4000-8000-000000000001',group_id:'30000000-0000-4000-8000-000000000001',store_id:STORE,name:'Pequeno',price_delta:0,active:true}],
 product_option_groups:[{store_id:STORE,product_id:PRODUCT,option_group_id:'30000000-0000-4000-8000-000000000001',sort_order:0}]
 } }));
 await page.goto('/doce-lua');
 const card=page.locator('.product-card-shell').first();
 await expect(card.getByRole('button',{name:'Adicionar Brigadeiro teste'})).toHaveCount(0);
 await card.getByRole('link',{name:'Escolher opções'}).click();
 await expect(page.getByRole('heading',{name:'Tamanho *',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Adicionar ao carrinho',exact:true}).click();
 await expect(page.locator('.cart-option-summary')).toContainText('Pequeno');
});

test('disponibilidade desconhecida bloqueia adição rápida; saldo de outro ponto não é usado',async({page})=>{
 await mockBackend(page);
 await page.route('**/rest/v1/rpc/food_get_public_pickup_locations_v1',r=>r.fulfill({json:[point]}));
 let release!:()=>void;
 const wait=new Promise<void>(resolve=>{release=resolve});
 await page.route('**/rest/v1/rpc/food_get_public_location_availability_v1',async r=>{await wait;await r.fulfill({json:[{product_id:PRODUCT,available:0,available_elsewhere:true}]});});
 await page.goto('/doce-lua?ponto=trabalho');
 const card=page.locator('.product-card-shell').first();
 await expect(card.getByText('Consultando disponibilidade…')).toBeVisible();
 await expect(card.getByRole('button',{name:'Adicionar Brigadeiro teste'})).toHaveCount(0);
 release();
 await expect(card.getByRole('link',{name:'Ver disponibilidade'})).toBeVisible();
 await expect(card.getByRole('button',{name:'Adicionar Brigadeiro teste'})).toHaveCount(0);
});

test('aumentar no carrinho respeita saldo do ponto',async({page})=>{
 await mockBackend(page); await pickup(page,3);
 await page.addInitScript(({STORE,PRODUCT,point})=>{
 localStorage.setItem(`foodservice_pickup_point_v1:${STORE}`,point.id);
 localStorage.setItem(`foodservice_cart_v1:${STORE}`,JSON.stringify([
 {id:`${PRODUCT}|base`,productId:PRODUCT,productName:'Brigadeiro teste',quantity:3,options:[],unitPrice:10},
 ]));
 },{STORE,PRODUCT,point});
 await page.goto('/doce-lua/carrinho');
 await expect(page.locator('.cart-item').getByRole('button',{name:'Aumentar quantidade'})).toBeDisabled();
 await expect(page.locator('.cart-item').getByRole('button',{name:'Diminuir quantidade'})).toBeEnabled();
});

test('falha no backend mantém carrinho e dados sem confirmar pedido',async({page})=>{
 await mockBackend(page); await pickup(page,3);
 await page.goto('/doce-lua?ponto=trabalho');
 await page.getByRole('button',{name:'Adicionar Brigadeiro teste',exact:true}).click();
 await page.goto('/doce-lua/finalizar');
 await page.getByLabel('Nome',{exact:true}).fill('Cliente visitante');
 await page.getByLabel(/WhatsApp \/ telefone/).fill('11999999999');
 await page.route('**/functions/v1/food-public-checkout',r=>r.fulfill({status:409,json:{error:'Estoque alterado. Revise o pedido.'}}));
 await page.getByRole('button',{name:/Registrar pedido|^Finalizar$/}).filter({visible:true}).first().click();
 await expect(page.locator('.checkout-inline-error')).toBeVisible();
 await expect(page).toHaveURL(/finalizar/);
 await expect(page.getByLabel('Nome',{exact:true})).toHaveValue('Cliente visitante');
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'[]').length,`foodservice_cart_v1:${STORE}`)).toBe(1);
});


test('rascunho de contato fica na sessão; perfil duradouro requer consentimento',async({page})=>{
 await mockBackend(page); await pickup(page);
 await page.goto('/doce-lua?ponto=trabalho');
 await page.getByRole('button',{name:'Adicionar Brigadeiro teste',exact:true}).click();
 await page.goto('/doce-lua/finalizar');
 await page.getByLabel('Nome',{exact:true}).fill('Cliente privado');
 const key=`foodweb_checkout_draft_v1:${STORE}`;
 await expect.poll(()=>page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)||'{}').customerName,key)).toBe('Cliente privado');
 expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();
 await page.reload();
 await expect(page.getByLabel('Nome',{exact:true})).toHaveValue('Cliente privado');
});
