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
    const tableRegion=page.getByRole('region',{name:'Lojas e uso'});
    await expect(tableRegion).toBeVisible();
    await expect(tableRegion).toHaveAttribute('tabindex','0');
    if(width<=600) {
      await expect(tableRegion.locator('tbody tr').first()).toHaveCSS('display','grid');
      expect(await tableRegion.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
      await expect(page.getByText('Em telas menores, abra os detalhes de uma loja para ver plano, cobrança e endereço.')).toBeVisible();
    }
    await page.getByRole('button',{name:'Gerenciar',exact:true}).first().click();
    const dialog=page.getByRole('dialog',{name:store.name});
    await expect(dialog.getByText('Administrando esta loja')).toBeVisible();
    await expect(dialog.getByRole('link',{name:`/${store.slug}`,exact:true})).toBeVisible();
    const accessOptions=dialog.locator('details.master-access-options');
    expect(await accessOptions.evaluate(element=>element.hasAttribute('open'))).toBe(false);
    await accessOptions.locator('summary').click();
    await expect(dialog.getByLabel('E-mail de acesso')).toBeVisible();
    await page.screenshot({path:testInfo.outputPath(`master-edicao-${width}.png`),fullPage:true});
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Gerenciar',exact:true}).first()).toBeFocused();
    await page.getByRole('button',{name:'Nova loja',exact:true}).click();
    await expect(page.getByRole('dialog').getByLabel('Cidade',{exact:true})).toHaveValue('');
    const advanced=page.getByRole('dialog').locator('details.master-advanced-options');
    expect(await advanced.evaluate(element=>element.hasAttribute('open'))).toBe(false);
    await advanced.locator('summary').click();
    await expect(advanced.getByRole('combobox',{name:'Status',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('Master mostra limites do plano sob demanda',async({page})=>{
  await mockBackend(page,{auth:true,master:true});
  await page.route('**/rest/v1/food_plans?**',route=>route.fulfill({json:[{
    id:'plan-essencial',code:'ESSENTIAL',name:'Essencial',product_limit:40,image_limit_per_product:1,
    custom_domain:false,reports:false,priority_support:false,monthly_price:49.9,setup_price:0,
    category_limit:12,addon_limit:40,admin_user_limit:1,sort_order:1,active:true,marketing_benefits:[]
  }]}));
  await page.goto('/admin-master/planos');
  const options=page.locator('details.master-plan-advanced').first();
  await expect(options.locator('summary')).toBeVisible();
  expect(await options.evaluate(element=>element.hasAttribute('open'))).toBe(false);
  await options.locator('summary').click();
  await expect(options.getByText('Produtos ativos')).toBeVisible();
});

for(const width of [390,768,1024,1440]) {
  test(`tabela do Master mantém Uso e ações acessíveis em ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});
    await mockBackend(page,{auth:true,master:true});
    await page.goto('/admin-master/lojas');
    const create=page.getByRole('button',{name:'Nova loja',exact:true});
    await expect(create).toBeVisible();
    expect(await create.evaluate(element=>getComputedStyle(element).whiteSpace)).toBe('nowrap');
    const region=page.getByRole('region',{name:'Lojas e uso'});
    if(width<=900){
      const firstRow=region.locator('tbody tr').first();
      if(width<=600) await expect(firstRow).toHaveCSS('display','grid');
      await expect(firstRow.locator('td').nth(3)).toBeVisible();
      await expect(firstRow.locator('td').nth(3)).toContainText(/\d+ ativos/);
      expect(await region.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
      const details=firstRow.getByRole('button',{name:`Detalhes de ${store.name}`});
      await expect(details).toHaveAttribute('aria-expanded','false');
      await details.click();
      await expect(details).toHaveAttribute('aria-expanded','true');
      await expect(firstRow.locator('td').nth(1)).toBeVisible();
      await expect(firstRow.locator('td').nth(6)).toBeVisible();
      await details.click();
      await expect(firstRow.locator('td').nth(1)).toBeHidden();
    }else{
      const usage=region.locator('thead th').filter({hasText:'Uso'});
      await usage.scrollIntoViewIfNeeded();
      const bounds=await usage.boundingBox(), container=await region.boundingBox();
      expect(bounds).not.toBeNull();expect(container).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(container!.x-2);
      expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(container!.x+container!.width+2);
      expect(bounds!.width).toBeGreaterThanOrEqual(210);
      if(width<=1024) expect(await region.evaluate(element=>element.scrollWidth>element.clientWidth)).toBe(true);
    }
    const action=region.getByRole('button',{name:'Gerenciar',exact:true}).first();
    await action.scrollIntoViewIfNeeded();
    await action.click();
    await expect(page.getByRole('dialog',{name:store.name})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
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

for(const width of [390,1366]) {
  test(`Master pagina negócios e combina busca por responsável com segmento em ${width}px`,async({page},testInfo)=>{
    await page.setViewportSize({width,height:900});
    await mockBackend(page,{auth:true,master:true});
    const stores=Array.from({length:45},(_,index)=>({
      ...store,
      id:`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,
      name:`Loja ${String(index+1).padStart(2,'0')}`,
      slug:`loja-${index+1}`,
      city:'Vitória',
      owner_name:index===22?'João das Flores':`Responsável ${index+1}`,
      owner_email:`owner${index+1}@example.invalid`,
      visual_theme:{businessSegment:index===22?'florist':'food'},
    }));
    await page.route('**/rest/v1/food_stores?**',route=>route.fulfill({json:stores}));
    await page.goto('/admin-master/lojas');
    const table=page.getByRole('region',{name:'Lojas e uso'});
    const pagination=page.getByRole('navigation',{name:'Paginação de lojas'});
    await expect(table.locator('tbody tr')).toHaveCount(20);
    await expect(pagination.getByText('Página 1 de 3')).toBeVisible();
    await expect(pagination.getByRole('button',{name:'Anterior',exact:true})).toBeDisabled();
    await pagination.getByRole('button',{name:'Próxima',exact:true}).click();
    await expect(table.getByText('Loja 21',{exact:true})).toBeVisible();
    await table.getByRole('button',{name:'Gerenciar',exact:true}).first().click();
    await expect(page.getByRole('dialog',{name:'Loja 21',exact:true})).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(pagination.getByText('Página 2 de 3')).toBeVisible();
    await page.getByLabel('Buscar lojas').fill('joao vitoria');
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await expect(table.getByText('João das Flores',{exact:false})).toBeVisible();
    await expect(pagination.getByText('Página 1 de 1')).toBeVisible();
    await page.getByRole('combobox',{name:'Segmento principal',exact:true}).selectOption('food');
    await expect(page.getByRole('heading',{name:'Nenhuma loja corresponde aos filtros'})).toBeVisible();
    await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();
    await expect(page.getByLabel('Buscar lojas')).toHaveValue('');
    await expect(page.getByRole('combobox',{name:'Segmento principal',exact:true})).toHaveValue('all');
    await expect(table.locator('tbody tr')).toHaveCount(20);
    await page.getByRole('combobox',{name:'Segmento principal',exact:true}).selectOption('florist');
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await expect(table.getByText('Loja 23',{exact:true})).toBeVisible();
    await page.screenshot({path:testInfo.outputPath(`master-segmentos-${width}.png`),fullPage:true});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  });
}
