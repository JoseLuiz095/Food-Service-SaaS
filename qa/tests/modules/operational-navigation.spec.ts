import { test, expect } from '@playwright/test';
import { mockBackend, STORE, store } from './fixtures';

for (const width of [390, 1366]) {
  test(`Master mantém plano à mão e credenciais sob demanda em ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await mockBackend(page, { auth: true, master: true });
    await page.goto('/admin-master/lojas?q=Doce%20Lua');
    await expect(page.getByLabel('Buscar lojas')).toHaveValue('Doce Lua');
    await page.getByRole('button', { name: 'Gerenciar', exact: true }).click();
    const modal = page.getByRole('dialog', { name: store.name });
    await expect(modal.getByLabel('Plano', { exact: true })).toBeInViewport();
    await expect(modal.getByPlaceholder('Deixe vazio para manter a atual')).toBeHidden();
    const disclosure = modal.locator('summary', { hasText: 'Alterar e-mail ou senha do lojista' });
    await disclosure.focus();
    await page.keyboard.press('Enter');
    await expect(modal.getByPlaceholder('Deixe vazio para manter a atual')).toBeVisible();
    await disclosure.click();
    await modal.evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: testInfo.outputPath(`master-configuracao-depois-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.getByLabel('Buscar lojas')).toHaveValue('Doce Lua');
  });
}

test('Master prioriza pendências e abre a loja indicada pelo dashboard', async ({ page }, testInfo) => {
  await mockBackend(page, { auth: true, master: true });
  await page.route('**/rest/v1/food_products?**', route => route.fulfill({ json: [] }));
  const directoryRequests: string[] = [];
  page.on('request', request => { if(request.url().includes('food_stores?select=*&order=name.asc'))directoryRequests.push(request.url()); });
  await page.goto('/admin-master');
  await expect(page.getByRole('heading', { name: 'O que precisa de atenção agora' })).toBeVisible();
  // React StrictMode invokes mount effects twice in the Vite test environment.
  expect(directoryRequests).toHaveLength(2);
  await expect(page.getByText('MRR estimado', { exact: true })).toBeHidden();
  await page.locator('summary', { hasText: 'Indicadores e relatórios comerciais' }).click();
  await expect(page.getByText('MRR estimado', { exact: true })).toBeVisible();
  await page.locator('summary', { hasText: 'Indicadores e relatórios comerciais' }).click();
  await page.screenshot({ path: testInfo.outputPath('master-dashboard-depois.png'), fullPage: true });
  await page.locator('.master-action-list').getByRole('link', { name: /Doce Lua/ }).first().click();
  await expect(page).toHaveURL(/q=Doce/);
  await expect(page.getByLabel('Buscar lojas')).toHaveValue(store.name);
});

test('atualização rápida confirma no backend e preserva a lista durante a atualização', async ({ page }) => {
  await mockBackend(page, { auth: true, master: true });
  const plan = { id: '60000000-0000-4000-8000-000000000001', name: 'Essencial', code: 'ESSENTIAL', active: true, monthly_price: 30 };
  await page.route('**/rest/v1/food_plans?**', route => route.fulfill({ json: [plan] }));
  await page.route('**/rest/v1/food_store_subscriptions?**', route => route.fulfill({ json: [{ id: 'subscription', store_id: STORE, plan_id: plan.id, status: 'active', billing_amount: 30 }] }));
  let updated = false;
  let releaseRefresh!: () => void;
  const refreshed = new Promise<void>(resolve => { releaseRefresh = resolve; });
  await page.route('**/rest/v1/food_stores?**', async route => {
    if (route.request().method() === 'PATCH') {
      updated = true;
      return route.fulfill({ json: [] });
    }
    if (updated) await refreshed;
    return route.fulfill({ json: [{ ...store, access_status: updated ? 'suspended' : 'online' }] });
  });
  await page.goto('/admin-master/lojas');
  page.on('dialog', dialog => dialog.accept());
  await page.getByLabel(`Status de ${store.name}`).selectOption('suspended');
  await expect.poll(() => updated).toBe(true);
  await expect(page.getByRole('region', { name: 'Lojas e uso' })).toBeVisible();
  await expect(page.getByLabel(`Status de ${store.name}`)).toBeDisabled();
  await expect(page.getByText('Carregando lojas e assinaturas…', { exact: true })).toHaveCount(0);
  releaseRefresh();
  await expect(page.getByLabel(`Status de ${store.name}`)).toHaveValue('suspended');
  await expect(page.getByLabel(`Status de ${store.name}`)).toBeEnabled();
});

test('menu do lojista preserva ferramentas e revela a seção ativa', async ({ page }) => {
  await mockBackend(page, { auth: true });
  await page.goto('/admin/produtos');
  const navigation = page.getByRole('navigation', { name: 'Navegação do negócio' });
  await expect(navigation.getByRole('link', { name: 'Meu plano', exact: true })).toBeHidden();
  await navigation.locator('summary', { hasText: 'Mais ferramentas' }).focus();
  await page.keyboard.press('Enter');
  await expect(navigation.getByRole('link', { name: 'Meu plano', exact: true })).toBeVisible();
  await navigation.getByRole('link', { name: 'Meu plano', exact: true }).click();
  await page.reload();
  await expect(navigation.getByRole('link', { name: 'Meu plano', exact: true })).toBeVisible();
});


test('preferência de menu recolhido no desktop preserva rótulos no celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockBackend(page, { auth: true, master: true });
  await page.addInitScript(() => localStorage.setItem('vendeweb_admin_master_sidebar_collapsed','1'));
  await page.goto('/admin-master');
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await expect(page.locator('.master-nav-text').getByText('Lojas', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
});


test('Master diferencia fontes indisponíveis de zero pendências e permite recuperar', async ({ page }) => {
  await mockBackend(page, { auth: true, master: true });
  const unavailable = '**/rest/v1/rpc/food_platform_get_billing_dashboard_v1';
  const events = '**/rest/v1/rpc/food_platform_list_event_log_v1';
  await page.route(unavailable, route => route.fulfill({ status:503, json:{message:'Pagamento indisponível para teste'} }));
  await page.route(events, route => route.fulfill({ status:503, json:{message:'Histórico indisponível para teste'} }));
  await page.goto('/admin-master');
  const warning = page.getByRole('alert');
  await expect(warning).toContainText('Não foi possível carregar pagamentos.');
  await expect(warning).toContainText('Não foi possível carregar o histórico de falhas.');
  const center = page.locator('.master-pending-grid-r69');
  await expect(center.getByRole('link',{name:/Indisponível pagamento/})).toBeVisible();
  await expect(center.getByRole('link',{name:/Indisponível falha/})).toBeVisible();
  await page.unroute(unavailable);
  await page.unroute(events);
  await warning.getByRole('button',{name:'Tentar novamente'}).click();
  await expect(warning).toHaveCount(0);
  await expect(center.getByRole('link',{name:/^0 pagamento/})).toBeVisible();
});
