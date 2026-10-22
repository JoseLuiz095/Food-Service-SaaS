import { test, expect } from '@playwright/test';
import { mockBackend, store } from './fixtures';

for(const width of [390,1366]) {
  test(`Master identifica loja e recupera filtros em ${width}px`,async({page},testInfo)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setViewportSize({width,height:900});
    await mockBackend(page,{auth:true,master:true});
    await page.goto('/admin-master/lojas');
    await expect(page.getByText('Admin Master · todas as lojas')).toBeVisible();
    await page.getByLabel('Buscar lojas').fill('busca-sem-resultado');
    await expect(page.getByRole('heading',{name:'Nenhuma loja corresponde aos filtros'})).toBeVisible();
    await page.getByRole('button',{name:'Limpar filtros'}).click();
    await page.getByRole('button',{name:'Gerenciar',exact:true}).first().click();
    const dialog=page.getByRole('dialog',{name:store.name});
    await expect(dialog.getByText('Administrando esta loja')).toBeVisible();
    await expect(dialog.getByRole('link',{name:`/${store.slug}`,exact:true})).toBeVisible();
    await page.screenshot({path:testInfo.outputPath(`master-edicao-${width}.png`),fullPage:true});
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Gerenciar',exact:true}).first()).toBeFocused();
    await page.getByRole('button',{name:'Nova loja',exact:true}).click();
    await expect(page.getByRole('dialog').getByLabel('Cidade',{exact:true})).toHaveValue('');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    expect(errors).toEqual([]);
  });
}

for(const [path,target] of [
  ['/admin-master','**/rest/v1/food_plans?**'],
  ['/admin-master/lojas','**/rest/v1/food_plans?**'],
  ['/admin-master/pagamentos','**/rest/v1/rpc/food_platform_get_billing_dashboard_v1'],
  ['/admin-master/solicitacoes','**/rest/v1/rpc/food_platform_list_self_service_signups_v2'],
] as const) {
  test(`Master apresenta erro recuperável em ${path}`,async({page})=>{
    await mockBackend(page,{auth:true,master:true});
    await page.route(target,r=>r.fulfill({status:503,json:{message:'Serviço indisponível para teste'}}));
    await page.goto(path);
    await expect(page.getByRole('alert').getByText('Não foi possível carregar')).toBeVisible();
    await page.unroute(target);
    await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();
    await expect(page.getByRole('alert').getByText('Não foi possível carregar')).toHaveCount(0);
    await expect(page.getByRole('heading',{level:1})).toBeVisible();
  });
}

test('Master diferencia histórico vazio de solicitações pendentes',async({page})=>{
  await mockBackend(page,{auth:true,master:true});
  await page.goto('/admin-master/solicitacoes');
  await expect(page.getByRole('heading',{name:'Nenhuma solicitação pendente'})).toBeVisible();
  await page.getByRole('button',{name:/Histórico/}).click();
  await expect(page.getByRole('heading',{name:'Nenhuma solicitação registrada'})).toBeVisible();
  await expect(page.getByRole('button',{name:/Histórico/})).toHaveAttribute('aria-pressed','true');
});
