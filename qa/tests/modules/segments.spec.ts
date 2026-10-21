import { test, expect, type Page } from '@playwright/test';
import { mockBackend, snapshot, store, STORE, USER } from './fixtures';

const profiles = [
  { id: 'retail', label: /Produtos e varejo/, catalog: 'Catálogo', search: /Buscar produtos/, hero: /Encontre o que combina/, admin: /Loja e catálogo/ },
  { id: 'printing3d', label: /Impressão 3D e personalizados/, catalog: 'Peças e personalizados', search: /Buscar peças e brindes/, hero: /Do seu projeto/, admin: /Produção e projetos/ },
  { id: 'rentals', label: /Aluguel e eventos/, catalog: 'Catálogo para eventos', search: /Buscar itens para seu evento/, hero: /Tudo começa/, admin: /Agenda e locações/ },
] as const;

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2)).toBe(true);
}

async function mockLanding(page: Page) {
  await page.route('**/rest/v1/rpc/food_get_public_landing_v1', route => route.fulfill({ json: {
    stores: [], plans: [], demo_enabled: true, demo_duration_days: 14, demo_store_slug: 'vitrine-teste', contact_protected: true,
  } }));
}

async function mockSegmentStore(page: Page, segment: string, custom = false, master = false) {
  const backend = await mockBackend(page, { auth: true, master });
  let themedStore = {
    ...store, slug: 'vitrine-teste', name: 'Vitrine de teste', owner_name: 'Lojista de teste', owner_email: 'lojista.teste@gmail.com',
    visual_theme: { preset: custom ? 'custom' : 'foodweb', businessSegment: segment,
      primaryColor: '#123456', accentColor: '#654321', highlightColor: '#BC8618', backgroundColor: '#FAF9F6',
      surfaceColor: '#FFFFFF', textColor: '#18231D', mutedColor: '#6F746F', borderColor: '#E8E3DC', radius: 18 },
  };
  const settingsWrites: Record<string, any>[] = [];
  await page.route('**/rest/v1/rpc/food_get_public_storefront_v1', route => route.fulfill({ json: { ...snapshot, store: themedStore } }));
  await page.route('**/rest/v1/rpc/food_resolve_storefront_status', route => route.fulfill({ json: { found: true, id: STORE, name: themedStore.name, status: 'online' } }));
  await page.route(/\/rest\/v1\/food_stores(?:\?|$)/, async route => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      settingsWrites.push(body);
      themedStore = { ...themedStore, ...body };
    }
    await route.fulfill({ json: [themedStore] });
  });
  return { ...backend, settingsWrites };
}

for (const width of [390, 768, 1366]) {
  test(`cadastro herda ramo e permite alterá-lo sem ativar módulos em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const { writes } = await mockBackend(page);
    await mockLanding(page);
    await page.goto('/cadastro?segment=printing3d');
    const picker = page.getByRole('group', { name: /Qual é o ramo/ });
    await expect(picker.getByRole('radio', { name: /Impressão 3D/ })).toBeChecked();
    await expect(picker.locator('[aria-live]')).toContainText(/peças e personalizados/i);
    await picker.getByText('Aluguel e eventos', { exact: true }).click();
    await expect(picker.getByRole('radio', { name: /Aluguel e eventos/ })).toBeChecked();
    await expect(picker.locator('[aria-live]')).toContainText(/Agenda e locações/);
    await picker.getByText('Produtos e varejo', { exact: true }).click();
    await expect(picker.getByRole('radio', { name: /Produtos e varejo/ })).toBeChecked();
    await expect(picker.locator('[aria-live]')).toContainText(/Loja e catálogo/);
    await expect(picker.getByText(/começam desativados/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Criar conta e continuar/ })).toBeVisible();
    await expectNoOverflow(page);
    expect(writes.filter(call => /food_modules_command|food-modules-public|food-public-self-signup/.test(call.url))).toHaveLength(0);
  });

  test(`página comercial seleciona ramo e encaminha ao cadastro em ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await mockBackend(page);
    await mockLanding(page);
    await page.goto('/');
    const choices = page.getByRole('group', { name: /apresentação por ramo/ });
    await choices.getByRole('button', { name: 'Impressão 3D', exact: true }).click();
    await expect(choices.getByRole('button', { name: 'Impressão 3D', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('link', { name: /Começar com impressão 3d/i })).toHaveAttribute('href', /\/cadastro\?plan=DEMO&segment=printing3d$/);
    await expect(page.getByRole('link', { name: /Criar conta e testar/ })).toHaveAttribute('href', /segment=printing3d$/);
    await expect(page.locator('.commercial-preview')).toHaveAttribute('aria-label', /Impressão 3D/);
    await choices.getByRole('button', { name: 'Aluguel', exact: true }).click();
    const signup = page.getByRole('link', { name: /Começar com aluguel/ });
    await expect(signup).toHaveAttribute('href', /segment=rentals$/);
    await expectNoOverflow(page);
    if (width === 1366) await page.screenshot({ path: testInfo.outputPath('comercial-ramos-desktop.png'), fullPage: true });
    await signup.click();
    await expect(page).toHaveURL(/\/cadastro\?plan=DEMO&segment=rentals$/);
    await expect(page.getByRole('radio', { name: /Aluguel e eventos/ })).toBeChecked();
  });

  for (const profile of profiles) {
    test(`${profile.id}: vitrine e painel acompanham ramo com módulos desativados em ${width}px`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height: 844 });
      const { state, writes, settingsWrites } = await mockSegmentStore(page, profile.id);
      await page.goto('/vitrine-teste');
      const storefront = page.locator('main.store-layout');
      await expect(storefront).toHaveAttribute('data-business-segment', profile.id);
      await expect(storefront).toHaveAttribute('data-visual-preset', 'foodweb');
      await expect(page.getByRole('heading', { name: profile.hero })).toBeVisible();
      await expect(page.getByRole('textbox', { name: profile.search })).toBeVisible();
      await expect(page.locator('a.product-card')).toHaveCount(1);
      await expect(page.locator('a[href*="/modulos/eventos/"]')).toHaveCount(0);
      await expectNoOverflow(page);
      if (width === 390 && profile.id === 'printing3d') await page.screenshot({ path: testInfo.outputPath('vitrine-3d-mobile.png'), fullPage: true });

      await page.goto('/admin/produtos');
      const admin = page.locator('.admin-shell');
      await expect(admin).toHaveAttribute('data-business-segment', profile.id);
      await expect(admin).toHaveAttribute('data-visual-preset', 'foodweb');
      await expect(page.getByRole('heading', { name: profile.catalog, exact: true })).toBeVisible();
      await expect(page.locator('.admin-brand')).toContainText(profile.admin);
      await expectNoOverflow(page);
      expect(state.events_enabled || state.combos_enabled || state.custom_enabled || state.rentals_enabled).toBe(false);
      expect(settingsWrites).toHaveLength(0);
      expect(writes.filter(call => /food_modules_command|food-modules-public/.test(call.url))).toHaveLength(0);
      expect(errors).toEqual([]);
    });
  }
}

test('configurações salvam o ramo preservando cores próprias, Pix e modalidades', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { state, writes, settingsWrites } = await mockSegmentStore(page, 'retail', true);
  await page.goto('/admin/configuracoes');
  await expect(page.getByRole('heading', { name: 'Configurações', exact: true })).toBeVisible();
  await expect(page.getByLabel('Cor principal', { exact: true })).toHaveValue('#123456');
  await expect(page.getByLabel('Cor de apoio', { exact: true })).toHaveValue('#654321');
  await page.getByText('Impressão 3D e personalizados', { exact: true }).click();
  await expect(page.getByRole('radio', { name: /Impressão 3D e personalizados/ })).toBeChecked();
  await expect(page.getByLabel('Cor principal', { exact: true })).toHaveValue('#123456');
  await expect(page.getByLabel('Cor de apoio', { exact: true })).toHaveValue('#654321');
  await expect(page.locator('.business-picker__preview')).toContainText(/Produção e projetos/);
  await expect(page.locator('.business-picker__note')).toContainText(/começam desativados/);
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('configuracao-ramo-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Salvar configurações', exact: true }).click();
  await expect.poll(() => settingsWrites.length).toBe(1);
  expect(settingsWrites[0].visual_theme).toMatchObject({ preset: 'custom', businessSegment: 'printing3d', primaryColor: '#123456', accentColor: '#654321' });
  expect(settingsWrites[0]).toMatchObject({ pix_enabled: true, pix_key: store.pix_key, delivery_enabled: true, pickup_enabled: true });
  await expect(page.locator('.admin-shell')).toHaveAttribute('data-business-segment', 'printing3d');
  expect(state.events_enabled || state.combos_enabled || state.custom_enabled || state.rentals_enabled).toBe(false);
  expect(writes.filter(call => call.url.endsWith('/food_modules_command'))).toHaveLength(0);
  await page.reload();
  await expect(page.getByRole('radio', { name: /Impressão 3D e personalizados/ })).toBeChecked();
  await expect(page.getByLabel('Cor principal', { exact: true })).toHaveValue('#123456');
});

async function fillSignup(page: Page) {
  await page.getByLabel('Nome do estabelecimento', { exact: true }).fill('Ateliê de teste');
  await page.getByLabel('Responsável', { exact: true }).fill('Pessoa de teste');
  await page.getByLabel('E-mail', { exact: true }).fill('lojista.teste@gmail.com');
  await page.getByLabel('WhatsApp comercial', { exact: true }).fill('11999999999');
  await page.locator('input[autocomplete="new-password"], input[autocomplete="current-password"]').fill('TesteSeguro123');
}

async function mockSignupPersistence(page: Page, existing: boolean, failPresentation = false) {
  const backend = await mockBackend(page);
  await mockLanding(page);
  let signedIn = false;
  let savedStore = { ...store, visual_theme: { preset: 'custom', primaryColor: '#123456', accentColor: '#654321', businessSegment: 'retail' } };
  const requests: { method: string; url: string; body?: any }[] = [];
  const completion = { ok: true, existing, storeId: STORE, slug: store.slug, requestStatus: 'pending' };
  await page.route('**/functions/v1/food-public-self-signup', async route => {
    requests.push({ method: route.request().method(), url: route.request().url(), body: route.request().postDataJSON() });
    await route.fulfill({ json: { ok: true, completion } });
  });
  await page.route('**/rest/v1/rpc/food_complete_self_service_signup_v2', async route => {
    requests.push({ method: route.request().method(), url: route.request().url(), body: route.request().postDataJSON() });
    await route.fulfill({ json: completion });
  });
  await page.route('**/auth/v1/token?*', async route => {
    signedIn = true;
    requests.push({ method: route.request().method(), url: route.request().url(), body: route.request().postDataJSON() });
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    await route.fulfill({ json: {
      access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: USER, role: 'authenticated', aal: 'aal1', iat: now, exp: now + 3600 })}.c2lnbmF0dXJl`,
      refresh_token: 'local-test-refresh', token_type: 'bearer', expires_in: 3600,
      user: { id: USER, email: 'lojista.teste@gmail.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} },
    } });
  });
  await page.route(/\/rest\/v1\/food_store_users(?:\?|$)/, route => route.fulfill({ json: signedIn ? [{ id: USER, user_id: USER, store_id: STORE, role: 'owner', active: true, must_change_password: false }] : [] }));
  await page.route(/\/rest\/v1\/food_stores(?:\?|$)/, async route => {
    const method = route.request().method();
    const body = method === 'PATCH' ? route.request().postDataJSON() : undefined;
    requests.push({ method, url: route.request().url(), body });
    if (body && failPresentation) {
      await route.fulfill({ status: 403, json: { code: '42501', message: 'Falha simulada ao salvar a apresentação.' } });
      return;
    }
    if (body) savedStore = { ...savedStore, ...body };
    await route.fulfill({ json: [savedStore] });
  });
  return { ...backend, requests };
}

test('persistência REST: novo cadastro 3D grava somente a apresentação da loja criada', async ({ page }) => {
  const { requests, state } = await mockSignupPersistence(page, false);
  await page.goto('/cadastro?segment=printing3d');
  await fillSignup(page);
  const submit = page.getByRole('button', { name: 'Criar conta e continuar', exact: true });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect.poll(() => requests.filter(request => request.method === 'PATCH').length).toBe(1);
  const patch = requests.find(request => request.method === 'PATCH')!;
  expect(new URL(patch.url).searchParams.get('id')).toBe(`eq.${STORE}`);
  expect(Object.keys(patch.body)).toEqual(['visual_theme']);
  expect(patch.body.visual_theme).toMatchObject({ businessSegment: 'printing3d', preset: 'custom', primaryColor: '#123456', accentColor: '#654321' });
  expect(requests.some(request => request.method === 'GET' && new URL(request.url).searchParams.get('select') === 'id,visual_theme')).toBe(true);
  expect(requests.find(request => request.url.includes('/food-public-self-signup'))?.body).toMatchObject({ businessSegment: 'printing3d', captchaToken: 'local-test-captcha' });
  expect(requests.filter(request => request.url.includes('/auth/v1/token'))).toHaveLength(1);
  expect(state.events_enabled || state.combos_enabled || state.custom_enabled || state.rentals_enabled).toBe(false);
});

test('persistência REST: conta existente mantém o ramo da loja sem qualquer PATCH', async ({ page }) => {
  const { requests } = await mockSignupPersistence(page, true);
  await page.goto('/cadastro?segment=printing3d');
  await page.getByRole('button', { name: 'Já tenho conta', exact: true }).click();
  await fillSignup(page);
  await page.getByRole('button', { name: 'Entrar e solicitar acesso', exact: true }).click();
  await expect(page.locator('.self-signup-success')).toContainText(/já possui um estabelecimento/);
  await expect(page).toHaveURL(/\/admin\/primeiros-passos$/);
  expect(requests.filter(request => request.url.includes('/food_complete_self_service_signup_v2'))).toHaveLength(1);
  expect(requests.filter(request => request.url.includes('/food-public-self-signup'))).toHaveLength(0);
  expect(requests.filter(request => request.method === 'PATCH')).toHaveLength(0);
});

async function mockMasterStore(page: Page) {
  const backend = await mockSegmentStore(page, 'retail', true, true);
  const credentials: any[] = [];
  const restWrites: { path: string; body: any }[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    // These RPCs use POST for reads/telemetry; all other writes remain forbidden.
    const readOrTelemetry = path.endsWith('/food_log_platform_event_v1') || path.endsWith('/food_get_admin_support_contact_v1');
    if (path.startsWith('/rest/v1/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !readOrTelemetry) {
      restWrites.push({ path, body: request.postDataJSON() });
    }
  });
  const plan = { id: 'plan-test', code: 'ESSENTIAL', name: 'Essencial de teste', active: true, monthly_price: 49.9, setup_price: 0, product_limit: 40, image_limit_per_product: 1, category_limit: 12, addon_limit: 40, admin_user_limit: 1, sort_order: 1, custom_domain: false, reports: false, priority_support: false };
  const subscription = { id: 'subscription-test', store_id: STORE, plan_id: plan.id, status: 'active', status_before_suspension: null, started_at: '2026-01-01', expires_at: null, billing_amount: 49.9, billing_mode: 'standard', due_day: 10, next_due_date: '2030-10-10' };
  await page.route(/\/rest\/v1\/food_plans(?:\?|$)/, route => route.fulfill({ json: [plan] }));
  await page.route(/\/rest\/v1\/food_store_subscriptions(?:\?|$)/, route => route.fulfill({ json: [subscription] }));
  await page.route(/\/functions\/v1\/food-platform-(?:create-store|manage-store-user)$/, async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { ok: true, configured: true, function: 'local-test' } });
    } else {
      const body = route.request().postDataJSON();
      credentials.push(body);
      await route.fulfill({ json: { ok: true, email: body.email, emailChanged: true, passwordChanged: false, linkedStoreCount: 1 } });
    }
  });
  await page.goto('/admin-master/lojas');
  await expect(page.getByRole('heading', { name: 'Lojas e assinaturas', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Gerenciar', exact: true }).click();
  const modal = page.locator('.master-modal');
  await modal.getByText('Impressão 3D e personalizados', { exact: true }).click();
  await expect(modal.getByRole('radio', { name: /Impressão 3D e personalizados/ })).toBeChecked();
  return { ...backend, credentials, modal, restWrites };
}

test('persistência REST: Master salva ramo ao confirmar alterações da loja', async ({ page }) => {
  const { settingsWrites, credentials, modal, restWrites } = await mockMasterStore(page);
  await modal.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(modal).toHaveCount(0);
  const presentation = settingsWrites.filter(body => Object.hasOwn(body, 'visual_theme'));
  expect(presentation).toHaveLength(1);
  expect(Object.keys(presentation[0])).toEqual(['visual_theme']);
  expect(presentation[0].visual_theme).toMatchObject({ preset: 'custom', businessSegment: 'printing3d', primaryColor: '#123456', accentColor: '#654321' });
  expect(settingsWrites).toHaveLength(1);
  expect(settingsWrites[0]).not.toHaveProperty('access_status');
  expect(settingsWrites[0]).not.toHaveProperty('active');
  expect(restWrites).toHaveLength(1);
  expect(restWrites[0].path).toBe('/rest/v1/food_stores');
  expect(Object.keys(restWrites[0].body)).toEqual(['visual_theme']);
  expect(credentials).toHaveLength(0);
});

test('persistência REST: salvar credenciais no Master não publica o ramo ainda não salvo', async ({ page }) => {
  const { settingsWrites, credentials, modal } = await mockMasterStore(page);
  await modal.getByRole('textbox', { name: /^E-mail de acesso/ }).fill('lojista.atualizado@gmail.com');
  await modal.getByRole('button', { name: 'Salvar e-mail / senha', exact: true }).click();
  await expect(page.getByText('E-mail de acesso atualizado.', { exact: true })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Salvar e-mail / senha', exact: true })).toBeEnabled();
  expect(credentials).toHaveLength(1);
  expect(credentials[0]).toMatchObject({ storeId: STORE, email: 'lojista.atualizado@gmail.com' });
  expect(credentials[0]).not.toHaveProperty('businessSegment');
  expect(settingsWrites).toHaveLength(0);
  await expect(modal.getByRole('radio', { name: /Impressão 3D e personalizados/ })).toBeChecked();
});

test('falha visual no cadastro mantém a conta criada e o aviso até abrir Configurações', async ({ page }) => {
  const { requests } = await mockSignupPersistence(page, false, true);
  await page.goto('/cadastro?segment=printing3d');
  await fillSignup(page);
  await page.clock.install();
  await page.getByRole('button', { name: 'Criar conta e continuar', exact: true }).click();
  await expect(page.locator('.self-signup-success')).toContainText(/Conta criada/);
  await expect(page.locator('.self-signup-success')).toContainText(/ramo não foi salvo/);
  const review = page.getByRole('link', { name: 'Abrir configurações da loja', exact: true });
  await expect(review).toBeVisible();
  await expect(review).toHaveAttribute('href', '/admin/configuracoes');
  await page.clock.runFor(2000);
  await expect(page).toHaveURL(/\/cadastro\?segment=printing3d$/);
  await expect(review).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar conta e continuar', exact: true })).toHaveCount(0);
  expect(requests.filter(request => request.url.includes('/food-public-self-signup'))).toHaveLength(1);
  expect(requests.filter(request => request.url.includes('/auth/v1/token'))).toHaveLength(1);
  expect(requests.filter(request => request.method === 'PATCH')).toHaveLength(1);
});
