import { expect, test, type Page } from '@playwright/test';
import QRCode from 'qrcode';
import AxeBuilder from '@axe-core/playwright';
import { mockBackend, STORE, product, snapshot, store } from './fixtures';
import { STORE_VISUAL_THEME_PRESETS } from '../../../src/utils/storeVisualTheme';
const points=[{id:'10000000-0000-4000-8000-000000000010',name:'Ponto sintético Centro',short_code:'CENTRO'},{id:'10000000-0000-4000-8000-000000000020',name:'Ponto sintético Bairro com nome longo',short_code:'BAIRRO'}];
async function setup(page:Page,auth=false){
 const external:string[]=[];
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin==='http://127.0.0.1:5191'||u.protocol==='data:')return r.continue();external.push(u.origin);return r.abort('blockedbyclient');});
 await mockBackend(page,{auth});
 const themed={...store,visual_theme:STORE_VISUAL_THEME_PRESETS.doce_lua};
 const longProduct={...product,name:'Produto sintético com nome longo para conferir a leitura no celular — embalagem de 100 g'};
 await page.route('**/rest/v1/food_products?**',r=>r.fulfill({json:[longProduct]}));
 await page.route('**/rest/v1/food_stores?**',r=>r.fulfill({json:[themed]}));
 await page.route('**/rest/v1/rpc/food_get_public_storefront_v1',r=>r.fulfill({json:{...snapshot,store:themed,products:[longProduct]}}));
 await page.route('**/rest/v1/rpc/food_get_public_pickup_locations_v1',r=>{expect(r.request().postDataJSON()).toEqual({p_store_id:STORE});return r.fulfill({json:points});});
 await page.route('**/rest/v1/rpc/food_get_public_location_availability_v1',r=>r.fulfill({json:[{product_id:product.id,available:5,available_elsewhere:true}]}));
 return external;
}
for(const width of [320,360,390,768,1366]){
 test(`compartilhar loja e pontos, admin e vitrine ${width}px`,async({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  const external=await setup(page,true);await page.setViewportSize({width,height:900});
  for(const route of ['/admin/produtos','/doce-lua']){
   await page.goto(route);
   if(route==='/doce-lua'){await page.getByText('Entrega e contato da loja',{exact:true}).click();await page.getByRole('button',{name:/^Compartilhar loja/}).click();}
   else await page.getByRole('button',{name:'Compartilhar loja com QR Code e link'}).click();
   const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
   const choice=dialog.getByLabel('Página para compartilhar');await expect(choice).toBeEnabled();
   expect(await choice.locator('option').count()).toBe(3);
   for(const point of points){
    await choice.selectOption(point.id);
    const link=dialog.getByLabel('Link para compartilhar');const value=await link.inputValue();
    expect(new URL(value).pathname).toBe('/doce-lua');expect(new URL(value).searchParams.get('ponto')).toBe(point.short_code);
    const image=dialog.getByRole('img',{name:`QR Code de Doce Lua · ${point.name}`});await expect(image).toBeVisible();
    await expect(image).toHaveJSProperty('complete',true);
    const matrix=QRCode.create(value,{errorCorrectionLevel:'M'}).modules;
    const pixels=await image.evaluate((node:HTMLImageElement,size:number)=>{
      const canvas=document.createElement('canvas');canvas.width=node.naturalWidth;canvas.height=node.naturalHeight;
      const ctx=canvas.getContext('2d')!;ctx.drawImage(node,0,0);const scale=canvas.width/(size+4);const result:number[]=[];
      for(let y=0;y<size;y++)for(let x=0;x<size;x++){const p=ctx.getImageData(Math.floor((x+2.5)*scale),Math.floor((y+2.5)*scale),1,1).data;result.push(p[0]<128?1:0);}return result;
    },matrix.size);
    expect(pixels.filter((bit,index)=>bit!==matrix.data[index]).length,'QR deve codificar o mesmo link do ponto selecionado').toBe(0);
    await dialog.getByRole('button',{name:'Copiar link',exact:true}).click();expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(value);
   }
   await choice.selectOption('');expect(new URL(await dialog.getByLabel('Link para compartilhar').inputValue()).search).toBe('');
   // Percurso de teclado não pode escapar para controles cobertos pelo modal.
   for(let i=0;i<12;i++){await page.keyboard.press('Tab');expect(await dialog.evaluate(e=>e.contains(document.activeElement))).toBe(true);}
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  }
  expect(external).toEqual([]);
 });
 test(`ações de compra não se sobrepõem ${width}px`,async({page},info)=>{
  await setup(page);await page.setViewportSize({width,height:900});
  await page.goto('/doce-lua/produto/brigadeiro-teste?compra=rapida&ponto=CENTRO');
  const box=page.locator('.buy-box');await expect(box).toBeVisible();
  const add=box.getByRole('button',{name:'Adicionar ao carrinho',exact:true});const quick=box.getByRole('button',{name:'Comprar agora',exact:true});
  await expect(add).toBeEnabled();await expect(quick).toBeVisible();
  const note=box.locator(':scope>small');await expect(note).toBeVisible();
  const a=await add.boundingBox(),b=await quick.boundingBox(),c=await note.boundingBox();
  expect(a!.y+a!.height).toBeLessThanOrEqual(b!.y);expect(b!.y+b!.height).toBeLessThanOrEqual(c!.y);
  expect(b!.width).toBeGreaterThanOrEqual(a!.width-1);expect(b!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  if(width===390)await page.screenshot({path:info.outputPath('produto-mobile.png'),fullPage:true});
 });
}
test('pontos indisponíveis têm erro recuperável e mantêm link geral da loja',async({page})=>{
 await setup(page,true);let fail=true;
 await page.route('**/rest/v1/rpc/food_get_public_pickup_locations_v1',r=>r.fulfill(fail?{status:503,json:{message:'Falha sintética'}}:{json:points}));
 await page.goto('/admin/produtos');await page.getByRole('button',{name:'Compartilhar loja com QR Code e link'}).click();
 const dialog=page.getByRole('dialog');await expect(dialog.getByRole('alert')).toContainText('Não foi possível carregar os pontos');
 expect(new URL(await dialog.getByLabel('Link para compartilhar').inputValue()).search).toBe('');
 fail=false;await dialog.getByRole('button',{name:'Tentar carregar pontos'}).click();await expect(dialog.getByLabel('Página para compartilhar').locator('option')).toHaveCount(3);
});
test('modal avulso tem foco contido, Escape e retorno ao acionador',async({page})=>{
 await setup(page,true);await page.goto('/admin/pedidos');
 const launch=page.getByRole('button',{name:'Lançar pedido avulso'});await launch.click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 for(let i=0;i<25;i++){await page.keyboard.press('Tab');expect(await dialog.evaluate(e=>e.contains(document.activeElement))).toBe(true);}
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(launch).toBeFocused();
 const result=await new AxeBuilder({page}).withRules(['aria-required-children','aria-required-parent','label']).analyze();expect(result.violations).toEqual([]);
});
for(const width of [320,360,390,768,1366])test(`horários e notificações aparecem acima do fundo e fecham fora ${width}px`,async({page},info)=>{
 await setup(page,true);await page.setViewportSize({width,height:844});await page.goto('/doce-lua');
 const hours=page.getByRole('button',{name:/Hoje/});await hours.click();
 const dialog=page.getByRole('dialog',{name:'Horários da semana'});await expect(dialog).toBeVisible();
 const rect=await dialog.boundingBox();expect(rect!.x).toBeGreaterThanOrEqual(0);expect(rect!.y).toBeGreaterThanOrEqual(0);expect(rect!.x+rect!.width).toBeLessThanOrEqual(width);expect(rect!.y+rect!.height).toBeLessThanOrEqual(844);
 expect(await dialog.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
 for(let n=0;n<5;n++){await page.keyboard.press('Tab');expect(await dialog.evaluate(e=>e.contains(document.activeElement))).toBe(true);}
 if(width===390)await page.screenshot({path:info.outputPath('horarios-visiveis-mobile.png')});
 await page.mouse.click(4,4);await expect(dialog).toHaveCount(0);await expect(hours).toBeFocused();expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
 await hours.click();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 await page.goto('/admin');const bell=page.getByRole('button',{name:'Abrir diagnóstico de notificações',exact:true});await bell.click();
 const notice=page.getByRole('dialog',{name:'Diagnóstico de notificações'});await expect(notice).toBeVisible();await notice.getByText('Notificações do painel',{exact:true}).click();await expect(notice).toBeVisible();
 await page.mouse.click(4,4);await expect(notice).toHaveCount(0);await expect(bell).toBeFocused();expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
});
test.describe('toque',()=>{test.use({hasTouch:true});test('toque fora fecha horários e notificações e libera rolagem',async({page})=>{
 await setup(page,true);await page.setViewportSize({width:390,height:844});await page.goto('/doce-lua');await page.getByRole('button',{name:/Hoje/}).tap();await expect(page.getByRole('dialog',{name:'Horários da semana'})).toBeVisible();await page.touchscreen.tap(4,4);await expect(page.getByRole('dialog')).toHaveCount(0);expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
 await page.goto('/admin');await page.getByRole('button',{name:'Abrir diagnóstico de notificações',exact:true}).tap();await expect(page.getByRole('dialog')).toBeVisible();await page.touchscreen.tap(4,4);await expect(page.getByRole('dialog')).toHaveCount(0);expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
});});
