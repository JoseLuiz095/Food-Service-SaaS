import { test, expect } from '@playwright/test';
import { mockBackend } from './fixtures';
import { mockSegmentPlatform, testBusinesses, createPlatformMockState } from './segment-platform-fixtures';

for (const business of testBusinesses) {
  test(`${business.segment}: painel e permissões do tenant fictício em mobile`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await mockSegmentPlatform(page, { initial: business.segment });
    await page.goto('/admin/negocio');
    await expect(page.getByRole('heading', { name: 'Segmento e módulos', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: business.label, exact: true, level: 2 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Atualizar segmento', exact: true })).toHaveCount(0);
    if (['personal', 'nutrition', 'creator', 'rentals'].includes(business.segment)) {
      await page.goto('/admin/operacao');
      await expect(page.getByRole('heading', { name: business.heading, exact: true })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Operação por módulo' })).toBeVisible();
      if (business.segment === 'creator') {
        await expect(page.getByRole('button', { name: 'Campanhas', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Agenda', exact: true })).toHaveCount(0);
      }
    }
    await expect(page.locator('#foodweb-splash-screen')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 3)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`painel-${business.segment}-390.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}

for (const { segment } of testBusinesses) {
  test(`${segment}: vitrine fictícia respeita marca e catálogo do negócio`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { initialBusiness } = await mockSegmentPlatform(page, { initial: segment });
    await page.goto(`/${initialBusiness.slug}`);
    await expect(page.getByText(`Oferta fictícia · ${initialBusiness.name}`, { exact: true }).first()).toBeVisible();
    await expect(page.locator('#foodweb-splash-screen')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 3)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`vitrine-${segment}-390.png`), fullPage: true });
  });
}

test('personal salva aluno, serviço e agendamento; dados vêm do backend ao recarregar', async ({ page }, testInfo) => {
  const { state, initialBusiness } = await mockSegmentPlatform(page, { initial: 'personal' });
  await page.goto('/admin/operacao');
  const form = page.locator('#business-record-form');
  await form.getByLabel('Nome', { exact: true }).fill('Aluno inteiramente fictício');
  await form.getByLabel('E-mail', { exact: true }).fill('aluno.qa@example.invalid');
  await form.getByRole('button', { name: 'Salvar registro', exact: true }).click();
  await expect(page.locator('.business-record-list')).toContainText('Aluno inteiramente fictício');
  await page.getByRole('button', { name: 'Serviços e pacotes', exact: true }).click();
  await form.getByLabel('Nome do serviço ou pacote').fill('Consultoria fictícia');
  await form.getByLabel('Valor (R$)', { exact: true }).fill('125.50');
  await form.getByLabel('Duração da sessão (minutos)').fill('60');
  await form.getByRole('combobox', { name: /^Tipo/ }).selectOption('training');
  await form.getByRole('button', { name: 'Salvar registro', exact: true }).click();
  await expect(page.locator('.business-record-list')).toContainText('Consultoria fictícia');
  await page.getByRole('button', { name: 'Agenda', exact: true }).click();
  await form.getByRole('combobox', { name: /^Aluno/ }).selectOption({ label: 'Aluno inteiramente fictício' });
  await form.getByRole('combobox', { name: /^Serviço/ }).selectOption({ label: 'Consultoria fictícia' });
  await form.getByLabel('Início', { exact: true }).fill('2026-11-12T10:00');
  await form.getByLabel('Término', { exact: true }).fill('2026-11-12T11:00');
  await form.getByRole('button', { name: 'Salvar registro', exact: true }).click();
  await expect(page.locator('.business-record-list')).toContainText('scheduled');
  expect(state.writes.find(item => item.action === 'services.save')?.data.price_cents).toBe(12550);
  expect(state.stores.get(initialBusiness.id)?.lists.appointments).toHaveLength(1);
  await page.reload();
  await page.getByRole('button', { name: 'Agenda', exact: true }).click();
  await expect(page.locator('.business-record-list')).toContainText('Consultoria fictícia');
  await page.screenshot({ path: testInfo.outputPath('personal-agenda-persistida.png'), fullPage: true });
  await page.goto(`/${initialBusiness.slug}`);
  await expect(page.getByRole('heading', { name: 'Consultoria fictícia', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Serviços e links do negócio' })).toContainText('125,50');
  await page.getByText('Como funciona a contratação', { exact: true }).click();
  await expect(page.getByText('Esta página não reserva um horário', { exact: false })).toBeVisible();
});

test('creator salva campanha e link; referência de outro tenant é negada pelo mock', async ({ page }) => {
  const { state, initialBusiness } = await mockSegmentPlatform(page, { initial: 'creator' });
  await page.goto('/admin/operacao');
  const form = page.locator('#business-record-form');
  await form.getByLabel('Nome da campanha').fill('Campanha inteiramente fictícia');
  await form.getByLabel('Início da campanha').fill('2020-01-01T10:00');
  await form.getByLabel('Prazo final').fill('2099-12-31T18:00');
  await form.getByRole('combobox', { name: /^Situação/ }).selectOption('active');
  await form.getByRole('button', { name: 'Salvar registro', exact: true }).click();
  await expect(page.locator('.business-record-list')).toContainText('Campanha inteiramente fictícia');
  await page.getByRole('button', { name: 'Links comerciais', exact: true }).click();
  await form.getByLabel('Título do link').fill('Portfólio fictício');
  await form.getByLabel('Endereço HTTPS').fill('https://portfolio.example.invalid');
  await form.getByRole('combobox', { name: /^Campanha/ }).selectOption({ label: 'Campanha inteiramente fictícia' });
  await form.getByRole('button', { name: 'Salvar registro', exact: true }).click();
  await expect(page.locator('.business-record-list')).toContainText('Portfólio fictício');
  const count = state.stores.get(initialBusiness.id)?.lists.links.length;
  const result = await page.evaluate(async ({ store }) => {
    const response = await fetch('https://elttryavkeartoxgdgse.supabase.co/rest/v1/rpc/food_business_operate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p_store: store, p_action: 'links.save', p_data: { label: 'Não deve gravar', url: 'https://example.invalid', campaign_id: 'outro-tenant-campaign' } }) });
    return response.status;
  }, { store: initialBusiness.id });
  expect(result).toBe(403);
  expect(state.stores.get(initialBusiness.id)?.lists.links.length).toBe(count);
  state.stores.get(initialBusiness.id)!.lists.links.push({ id: 'unsafe-fixture', label: 'URL insegura fictícia', url: 'javascript:alert(1)', active: true });
  await page.goto(`/${initialBusiness.slug}`);
  await expect(page.getByRole('link', { name: 'Portfólio fictício ↗', exact: true })).toHaveAttribute('href', 'https://portfolio.example.invalid/');
  await expect(page.getByRole('link', { name: 'URL insegura fictícia', exact: false })).toHaveCount(0);
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
});

test('Master autoriza agenda da floricultura e o painel do proprietário reflete após reload', async ({ page, browser }, testInfo) => {
  const state = createPlatformMockState();
  await mockSegmentPlatform(page, { master: true, initial: 'florist', state });
  const florist = testBusinesses.find(item => item.segment === 'florist')!;
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/admin-master/segmentos');
  await page.getByRole('combobox', { name: /^Negócio/ }).selectOption(florist.id);
  await expect(page.getByRole('heading', { name: 'Floricultura', exact: true, level: 2 })).toBeVisible();
  await page.getByLabel('Motivo da autorização').fill('Oficinas fictícias autorizadas');
  await page.getByRole('combobox', { name: /^Módulo/ }).selectOption('clients');
  await page.getByRole('button', { name: 'Autorizar para este negócio' }).click();
  await expect(page.getByRole('status')).toContainText('Configuração salva');
  await page.getByRole('combobox', { name: /^Módulo/ }).selectOption('appointments');
  await page.getByRole('button', { name: 'Autorizar para este negócio' }).click();
  await expect(page.locator('.business-history')).toContainText('Módulo autorizado · Agenda e serviços');
  await page.screenshot({ path: testInfo.outputPath('master-floricultura-agenda-1366.png'), fullPage: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  try {
    const owner = await context.newPage();
    await mockSegmentPlatform(owner, { initial: 'florist', state });
    await owner.goto('/admin/negocio');
    await expect(owner.getByRole('heading', { name: 'Floricultura', exact: true, level: 2 })).toBeVisible();
    await owner.reload();
    const agendaCard = owner.locator('.business-capabilities article').filter({ has: owner.getByRole('heading', { name: 'Agenda e serviços', exact: true }) });
    await expect(agendaCard).toContainText('Disponível');
    await owner.getByRole('link', { name: 'Abrir minha operação', exact: true }).click();
    await expect(owner.getByRole('button', { name: 'Agenda', exact: true })).toBeVisible();
    await owner.screenshot({ path: testInfo.outputPath('floricultura-modulo-complementar-390.png'), fullPage: true });
  } finally { await context.close(); }
});

test('falha na RPC de regras mostra erro recuperável sem simular módulo disponível', async ({ page }) => {
  await mockSegmentPlatform(page);
  const target = '**/rest/v1/rpc/food_business_status';
  await page.route(target, route => route.fulfill({ status: 503, json: { message: 'Falha simulada' } }));
  await page.goto('/admin/negocio');
  await expect(page.getByRole('alert')).toContainText('Não foi possível concluir');
  await expect(page.getByRole('heading', { name: 'Ferramentas deste negócio', exact: true })).toHaveCount(0);
  await page.unroute(target);
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ferramentas deste negócio', exact: true })).toBeVisible();
});

test('Master ignora resposta antiga ao trocar de negócio durante carregamento', async ({ page }) => {
  const { status } = await mockSegmentPlatform(page, { master: true, initial: 'florist' });
  const personal = testBusinesses.find(item => item.segment === 'personal')!;
  const food = testBusinesses.find(item => item.segment === 'food')!;
  await page.goto('/admin-master/segmentos');
  await expect(page.getByRole('heading', { name: 'Alimentação', exact: true, level: 2 })).toBeVisible();
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  let received!: () => void;
  const requested = new Promise<void>(resolve => { received = resolve; });
  await page.route('**/rest/v1/rpc/food_business_status', async route => {
    if (route.request().postDataJSON().p_store !== personal.id) return route.fallback();
    received(); await released;
    return route.fulfill({ json: status(personal.id) });
  });
  await page.getByRole('combobox', { name: /^Negócio/ }).selectOption(personal.id);
  await requested;
  await page.getByRole('combobox', { name: /^Negócio/ }).selectOption(food.id);
  await expect(page.getByRole('heading', { name: 'Alimentação', exact: true, level: 2 })).toBeVisible();
  const oldResponse = page.waitForResponse(response => response.url().endsWith('/food_business_status') && response.request().postDataJSON().p_store === personal.id);
  release();
  await oldResponse;
  await expect(page.getByRole('combobox', { name: /^Negócio/ })).toHaveValue(food.id);
  await expect(page.getByRole('heading', { name: 'Personal trainer', exact: true, level: 2 })).toHaveCount(0);
});

for (const width of [390, 1366]) {
  test(`cadastro por segmento: evidência sem credenciais em ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const { writes } = await mockBackend(page);
    await page.route('**/rest/v1/rpc/food_get_public_landing_v1', route => route.fulfill({ json: { stores: [], plans: [], demo_enabled: true, demo_duration_days: 14, demo_store_slug: 'vitrine-teste', contact_protected: true } }));
    await page.goto('/cadastro?segment=nutrition');
    const picker = page.getByRole('group', { name: /Qual é o ramo/ });
    await expect(picker.getByRole('radio', { name: /Nutricionista/ })).toBeChecked();
    await expect(picker.locator('[aria-live]')).toContainText('Clientes e consultas');
    await expect(page.getByRole('button', { name: /Criar conta e continuar/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 3)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`cadastro-nutrition-${width}.png`), fullPage: true });
    expect(writes.filter(call => /food-public-self-signup|food_business_initialize/.test(call.url))).toHaveLength(0);
  });
}
