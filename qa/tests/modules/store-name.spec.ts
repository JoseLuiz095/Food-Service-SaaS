import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mockBackend,store,STORE} from './fixtures';

async function setup(page:Page) {
  await page.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:5198'?r.continue():r.abort('blockedbyclient'));
  await mockBackend(page,{auth:true});
  let current={...store};const writes:any[]=[];
  await page.route('**/rest/v1/food_stores?*',async r=>{
    if(r.request().method()==='PATCH'){const body=r.request().postDataJSON();writes.push(body);current={...current,...body};}
    await r.fulfill({json:[current]});
  });
  await page.route('**/rest/v1/rpc/food_check_store_name_v1',r=>{
    const b=r.request().postDataJSON();expect(b.p_store_id).toBe(STORE);
    return r.fulfill({json:b.p_name!=='Nome Ocupado'});
  });
  return {writes};
}

for(const width of [320,390,1366])test(`nome ocupado bloqueia e novo nome preserva link em ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:900});const {writes}=await setup(page);
  await page.goto('/admin/configuracoes');const name=page.getByLabel('Nome da loja',{exact:true});
  await name.fill('Nome Ocupado');await expect(page.locator('#store-name-status')).toContainText('já está em uso');
  await expect(name).toHaveAttribute('aria-invalid','true');
  await page.getByRole('button',{name:'Salvar configurações',exact:true}).click();
  await expect(page.getByText('Este nome já está em uso. Escolha um nome diferente para sua loja.',{exact:true}).last()).toBeVisible();
  expect(writes).toHaveLength(0);
  await name.fill('Loja Nova Sintética');await expect(page.locator('#store-name-status')).toContainText('Nome disponível');
  await page.getByRole('button',{name:'Salvar configurações',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(page.getByText('Configurações salvas.',{exact:true})).toBeVisible();
  expect(writes).toHaveLength(1);expect(writes[0].name).toBe('Loja Nova Sintética');expect(writes[0]).not.toHaveProperty('slug');expect(writes[0]).not.toHaveProperty('id');
  await expect(name).toHaveValue('Loja Nova Sintética');await expect(page.locator('.admin-user strong')).toHaveText('Loja Nova Sintética');
  await expect(page.getByRole('link',{name:'Abrir vitrine',exact:true,includeHidden:true})).toHaveAttribute('href',/doce-lua/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const axe=await new AxeBuilder({page}).include('.store-name-field').withTags(['wcag2a','wcag2aa']).analyze();expect(axe.violations).toEqual([]);
  if(width===390)await page.screenshot({path:info.outputPath('nome-loja-salvo.png'),fullPage:true});
});

test('consulta lenta não substitui validação do nome atual e RPC ausente preserva rascunho',async({page})=>{
  const {writes}=await setup(page);let release!:()=>void;const gate=new Promise<void>(r=>release=r);
  await page.route('**/rest/v1/rpc/food_check_store_name_v1',async r=>{
    if(r.request().postDataJSON().p_name==='Nome Antigo Pendente'){await gate;return r.fulfill({json:false});}
    return r.fulfill({json:true});
  });
  await page.goto('/admin/configuracoes');const name=page.getByLabel('Nome da loja',{exact:true});
  const pending=page.waitForRequest(r=>r.url().includes('food_check_store_name_v1')&&r.postDataJSON().p_name==='Nome Antigo Pendente');
  await name.fill('Nome Antigo Pendente');await pending;await name.fill('Nome Atual Livre');
  await expect(page.locator('#store-name-status')).toContainText('Nome disponível');
  const staleResponse=page.waitForResponse(r=>r.url().includes('food_check_store_name_v1')&&r.request().postDataJSON().p_name==='Nome Antigo Pendente');
  release();await staleResponse;
  await expect(page.locator('#store-name-status')).not.toContainText('já está em uso');
  await page.route('**/rest/v1/rpc/food_check_store_name_v1',r=>r.fulfill({status:404,json:{code:'PGRST202',message:'not found'}}));
  await name.fill('Nome Preservado');await expect(page.locator('#store-name-status')).toContainText('ainda não está disponível');
  await page.getByRole('button',{name:'Salvar configurações',exact:true}).click();
  await expect(name).toHaveValue('Nome Preservado');expect(writes).toHaveLength(0);
});

test('colisão na gravação recebe mensagem legível, sem perder rascunho',async({page})=>{
  await setup(page);
  await page.route('**/rest/v1/food_stores?*',r=>r.request().method()==='PATCH'?r.fulfill({status:409,json:{code:'23505',message:'duplicate key value violates unique constraint "food_stores_name_normalized_uidx"'}}):r.fulfill({json:[store]}));
  await page.goto('/admin/configuracoes');const name=page.getByLabel('Nome da loja',{exact:true});await name.fill('Nome Disputado');
  await expect(page.locator('#store-name-status')).toContainText('Nome disponível');await page.getByRole('button',{name:'Salvar configurações',exact:true}).click();
  await expect(page.getByText('Este nome já está em uso. Escolha um nome diferente para sua loja.',{exact:true})).toBeVisible();await expect(name).toHaveValue('Nome Disputado');
});
