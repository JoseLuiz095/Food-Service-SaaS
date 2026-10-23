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
  const businessWrites: { action: string; body: any }[] = [];
  let serverSegment = segment;
  await page.route(/\/rest\/v1\/rpc\/food_business_(?:status|initialize|master)$/, async route => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1)!;
    const body = route.request().postDataJSON();
    if (action === 'food_business_initialize') {
      businessWrites.push({ action, body });
      await route.fulfill({ status: 403, json: { code: '42501', message: 'O segmento já foi configurado. Somente o Master pode alterá-lo.' } });
      return;
    }
    if (action === 'food_business_master') {
      businessWrites.push({ action, body });
      if (!master || body.p_action !== 'set_segment' || body.p_store !== STORE) {
        await route.fulfill({ status: 403, json: { code: '42501', message: 'Master com MFA obrigatório.' } });
        return;
      }
      serverSegment = body.p_data.segment;
      themedStore = { ...themedStore, visual_theme: { ...themedStore.visual_theme, businessSegment: serverSegment } };
    }
    await route.fulfill({ json: { profile: { store_id: STORE, primary_segment: serverSegment }, legacy: false, can_initialize: false, modules: [], audit: [] } });
  });
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
  return { ...backend, settingsWrites, businessWrites };
}

for (const width of [390, 768, 1366]) {
  test(`cadastro herda ramo legado e permite escolher outro antes de gravar regras em ${width}px`, async ({ page }) => {
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
    await expect(picker.getByText(/Recursos complementares precisam de autorização do Admin Master/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Criar conta e continuar/ })).toBeVisible();
    await expectNoOverflow(page);
    expect(writes.filter(call => /food_modules_command|food-modules-public|food-public-self-signup|food_business_initialize|food_business_master/.test(call.url))).toHaveLength(0);
  });

  test(`página comercial seleciona ramo e encaminha ao cadastro em ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await mockBackend(page);
    await mockLanding(page);
    await page.goto('/');
    const choices = page.getByRole('group', { name: 'Escolha o segmento da demonstração', exact: true });
    await expect(choices.getByRole('button')).toHaveCount(7);
    for (const label of ['Alimentação', 'Floricultura', 'Comércio geral', 'Serviços e locações', 'Personal trainer', 'Nutricionista', 'Influenciador digital']) {
      await expect(choices.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    await choices.getByRole('button', { name: 'Personal trainer', exact: true }).click();
    await expect(choices.getByRole('button', { name: 'Personal trainer', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('link', { name: 'Começar com este segmento', exact: true })).toHaveAttribute('href', /\/cadastro\?plan=DEMO&segment=personal$/);
    await expect(page.getByText(/Nenhuma conta, reserva, compra, cobrança ou publicação real é criada/)).toBeVisible();
    await expect(page.locator('.segment-workbench--personal')).toBeVisible();
    await choices.getByRole('button', { name: 'Influenciador digital', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Começar com este segmento', exact: true })).toHaveAttribute('href', /segment=creator$/);
    await expect(page.locator('.segment-workbench--creator')).toBeVisible();
    await choices.getByRole('button', { name: 'Serviços e locações', exact: true }).click();
    const signup = page.getByRole('link', { name: 'Começar com este segmento', exact: true });
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

test('configurações preservam segmento protegido, cores próprias, Pix e modalidades', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { state, writes, settingsWrites, businessWrites } = await mockSegmentStore(page, 'retail', true);
  await page.goto('/admin/configuracoes');
  await expect(page.getByRole('heading', { name: 'Configurações', exact: true })).toBeVisible();
  await expect(page.getByLabel('Cor principal', { exact: true })).toHaveValue('#123456');
  await expect(page.getByLabel('Cor de apoio', { exact: true })).toHaveValue('#654321');
  await expect(page.getByText('Segmento: Produtos e varejo', { exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: /Qual é o ramo/ })).toHaveCount(0);
  await expect(page.locator('#settings-form').getByRole('link', { name: 'Segmento e permissões', exact: true })).toHaveAttribute('href', '/admin/negocio');
  await expect(page.getByText('A troca do segmento principal exige o Admin Master.', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Cor principal', { exact: true })).toHaveValue('#123456');
  await expect(page.getByLabel('Cor de apoio', { exact: true })).toHaveValue('#654321');
  await page.getByLabel('Frase da loja', { exact: true }).fill('Seleção própria da vitrine de teste');
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('configuracao-ramo-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Salvar configurações', exact: true }).click();
  await expect.poll(() => settingsWrites.length).toBe(1);
  expect(settingsWrites[0].visual_theme).toMatchObject({ preset: 'custom', businessSegment: 'retail', primaryColor: '#123456', accentColor: '#654321' });
  expect(settingsWrites[0]).toMatchObject({ pix_enabled: true, pix_key: store.pix_key, delivery_enabled: true, pickup_enabled: true });
  expect(settingsWrites[0].description).toBe('Seleção própria da vitrine de teste');
  await expect(page.locator('.admin-shell')).toHaveAttribute('data-business-segment', 'retail');
  expect(businessWrites).toHaveLength(0);
  expect(state.events_enabled || state.combos_enabled || state.custom_enabled || state.rentals_enabled).toBe(false);
  expect(writes.filter(call => call.url.endsWith('/food_modules_command'))).toHaveLength(0);
  await page.reload();
  await expect(page.getByText('Segmento: Produtos e varejo', { exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: /Qual é o ramo/ })).toHaveCount(0);
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
  let serverSegment: string | null = existing ? 'retail' : null;
  let savedStore = { ...store, visual_theme: { preset: 'custom', primaryColor: '#123456', accentColor: '#654321', businessSegment: 'retail' } };
  const requests: { method: string; url: string; body?: any }[] = [];
  const completion = { ok: true, existing, storeId: STORE, slug: store.slug, requestStatus: 'pending' };
  await page.route(/\/rest\/v1\/rpc\/food_business_(?:status|initialize)$/, async route => {
    const body = route.request().postDataJSON();
    requests.push({ method: route.request().method(), url: route.request().url(), body });
    if (route.request().url().endsWith('/food_business_initialize')) {
      if (!signedIn || existing || body.p_store !== STORE || failPresentation) {
        await route.fulfill({ status: 403, json: { code: '42501', message: 'Falha simulada ao configurar regras do negócio.' } });
        return;
      }
      serverSegment = body.p_segment;
      savedStore = { ...savedStore, visual_theme: { ...savedStore.visual_theme, businessSegment: serverSegment! } };
    }
    await route.fulfill({ json: { profile: serverSegment ? { store_id: STORE, primary_segment: serverSegment } : null, legacy: !serverSegment, can_initialize: !serverSegment, modules: [], audit: [] } });
  });
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

test('onboarding RPC: novo cadastro 3D inicializa regras da loja criada após autenticação', async ({ page }) => {
  const { requests, state } = await mockSignupPersistence(page, false);
  await page.goto('/cadastro?segment=printing3d');
  await fillSignup(page);
  const submit = page.getByRole('button', { name: 'Criar conta e continuar', exact: true });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect.poll(() => requests.filter(request => request.url.endsWith('/food_business_initialize')).length).toBe(1);
  const initialized = requests.find(request => request.url.endsWith('/food_business_initialize'))!;
  expect(initialized.body).toEqual({ p_store: STORE, p_segment: 'printing3d' });
  await expect.poll(() => requests.filter(request => request.url.endsWith('/food_business_status')).length).toBeGreaterThan(0);
  expect(requests.findIndex(request => request.url.includes('/auth/v1/token'))).toBeLessThan(requests.indexOf(initialized));
  expect(requests.filter(request => request.method === 'PATCH')).toHaveLength(0);
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
  expect(requests.filter(request => /food_business_initialize|food_business_master/.test(request.url))).toHaveLength(0);
});

async function mockMasterStore(page: Page) {
  const backend = await mockSegmentStore(page, 'retail', true, true);
  const credentials: any[] = [];
  const restWrites: { path: string; body: any }[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    // These RPCs use POST for reads/telemetry; all other writes remain forbidden.
    const readOrTelemetry = path.endsWith('/food_log_platform_event_v1') || path.endsWith('/food_get_admin_support_contact_v1') || path.endsWith('/food_business_status') || path.endsWith('/food_business_public');
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

test('persistência RPC: Master salva segmento ao confirmar sem alterar preço ou cobrança', async ({ page }) => {
  const { settingsWrites, credentials, modal, restWrites, businessWrites } = await mockMasterStore(page);
  await modal.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(settingsWrites).toHaveLength(0);
  expect(businessWrites).toEqual([{ action: 'food_business_master', body: { p_action: 'set_segment', p_store: STORE, p_data: { segment: 'printing3d' } } }]);
  expect(restWrites).toHaveLength(1);
  expect(restWrites[0].path).toBe('/rest/v1/rpc/food_business_master');
  expect(restWrites[0].body).not.toHaveProperty('plan_id');
  expect(restWrites[0].body.p_data).not.toHaveProperty('billing_amount');
  expect(credentials).toHaveLength(0);
});

test('persistência REST: salvar credenciais no Master não publica o ramo ainda não salvo', async ({ page }) => {
  const { settingsWrites, credentials, modal, businessWrites } = await mockMasterStore(page);
  await modal.getByRole('textbox', { name: /^E-mail de acesso/ }).fill('lojista.atualizado@gmail.com');
  await modal.getByRole('button', { name: 'Salvar e-mail / senha', exact: true }).click();
  await expect(page.getByText('E-mail de acesso atualizado.', { exact: true })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Salvar e-mail / senha', exact: true })).toBeEnabled();
  expect(credentials).toHaveLength(1);
  expect(credentials[0]).toMatchObject({ storeId: STORE, email: 'lojista.atualizado@gmail.com' });
  expect(credentials[0]).not.toHaveProperty('businessSegment');
  expect(settingsWrites).toHaveLength(0);
  expect(businessWrites).toHaveLength(0);
  await expect(modal.getByRole('radio', { name: /Impressão 3D e personalizados/ })).toBeChecked();
});

test('falha RPC no onboarding mantém conta criada e oferece concluir segmento sem duplicar cadastro', async ({ page }) => {
  const { requests } = await mockSignupPersistence(page, false, true);
  await page.goto('/cadastro?segment=printing3d');
  await fillSignup(page);
  await page.clock.install();
  await page.getByRole('button', { name: 'Criar conta e continuar', exact: true }).click();
  await expect(page.locator('.self-signup-success')).toContainText(/Conta criada/);
  await expect(page.locator('.self-signup-success')).toContainText(/segmento ainda não foi configurado no servidor/);
  const review = page.getByRole('link', { name: 'Concluir segmento e permissões', exact: true });
  await expect(review).toBeVisible();
  await expect(review).toHaveAttribute('href', '/admin/negocio');
  await page.clock.runFor(2000);
  await expect(page).toHaveURL(/\/cadastro\?segment=printing3d$/);
  await expect(review).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar conta e continuar', exact: true })).toHaveCount(0);
  expect(requests.filter(request => request.url.includes('/food-public-self-signup'))).toHaveLength(1);
  expect(requests.filter(request => request.url.includes('/auth/v1/token'))).toHaveLength(1);
  expect(requests.filter(request => request.method === 'PATCH')).toHaveLength(0);
  expect(requests.filter(request => request.url.endsWith('/food_business_initialize'))).toHaveLength(1);
});
