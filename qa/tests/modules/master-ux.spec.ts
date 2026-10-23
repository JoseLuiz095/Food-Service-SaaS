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
    const tableRegion=page.getByRole('region',{name:'Tabela de lojas; use as setas para navegar pelas colunas'});
    await expect(tableRegion).toBeVisible();
    await expect(tableRegion).toHaveAttribute('tabindex','0');
    if(width<=600) await expect(page.getByText('Em telas menores, deslize a tabela na horizontal para ver todas as informações e ações.')).toBeVisible();
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

test('sidebar do Master permanece acessível no desktop e pode ser recolhida',async({page})=>{
  await page.setViewportSize({width:1366,height:768});
  await mockBackend(page,{auth:true,master:true});
  await page.goto('/admin-master/lojas');
  const sidebar=page.locator('#master-sidebar');
  await expect(sidebar).toBeVisible();
  expect(await sidebar.evaluate(element=>getComputedStyle(element).position)).toBe('sticky');
  expect(await sidebar.evaluate(element=>getComputedStyle(element).overflowY)).toBe('auto');
  const navigation=page.getByRole('navigation',{name:'Navegação do Admin Master'});
  await expect(navigation.getByRole('link',{name:'Negócios: Lojas'})).toBeVisible();
  await expect(navigation.getByText('Configuração',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Recolher menu'}).click();
  await expect(page.locator('.master-shell')).toHaveClass(/is-sidebar-collapsed/);
  await expect(navigation.getByRole('link',{name:'Negócios: Lojas'})).toBeVisible();
  await page.getByRole('button',{name:'Expandir menu'}).click();
  await expect(page.locator('.master-shell')).not.toHaveClass(/is-sidebar-collapsed/);
});

test('gaveta móvel do Master bloqueia o fundo e mantém o foco acessível',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await mockBackend(page,{auth:true,master:true});
  await page.goto('/admin-master');
  const trigger=page.getByRole('button',{name:'Abrir menu'});
  const drawer=page.getByRole('dialog',{name:'Menu do Admin Master'});
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded','true');
  await expect(drawer).toBeVisible();
  await expect(page.getByRole('button',{name:'Fechar'})).toBeFocused();
  expect(await page.evaluate(()=>document.body.style.overflow)).toBe('hidden');
  await page.keyboard.press('Shift+Tab');
  await expect(drawer.getByRole('button',{name:'Sair'})).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button',{name:'Fechar'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toHaveAttribute('aria-expanded','false');
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(()=>document.body.style.overflow)).toBe('');
});

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
