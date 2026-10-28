import { expect, test, type Page } from '@playwright/test';
import { mockBackend, product, PRODUCT, STORE } from './fixtures';

const GROUP = '31000000-0000-4000-8000-000000000001';
const OPTION = '32000000-0000-4000-8000-000000000001';
const FIRST_IMAGE = '33000000-0000-4000-8000-000000000001';
const SECOND_IMAGE = '33000000-0000-4000-8000-000000000002';

async function catalogBackend(page: Page) {
  await mockBackend(page, { auth: true });
  const rows: Record<string, any[]> = {
    food_products: [{ ...product, internal_code: 'ORIGINAL-1', stock_quantity: 50, stock_reserved_quantity: 7 }],
    food_option_groups: [{ id: GROUP, store_id: STORE, name: 'Tamanho', kind: 'variant', min_choices: 1, max_choices: 1, active: true, sort_order: 10 }],
    food_option_items: [{ id: OPTION, group_id: GROUP, store_id: STORE, name: 'Padrão', price_delta: 0, active: true, sort_order: 10 }],
    food_product_option_groups: [{ store_id: STORE, product_id: PRODUCT, option_group_id: GROUP, sort_order: 10 }],
    food_product_images: [
      { id: FIRST_IMAGE, product_id: PRODUCT, url: '/assets/placeholder-food.svg', is_primary: true, sort_order: 0 },
      { id: SECOND_IMAGE, product_id: PRODUCT, url: '/assets/food-hero.svg', is_primary: false, sort_order: 1 },
    ],
  };
  const writes: { table: string; method: string; body: any; query: string }[] = [];
  let reads = 0;
  for (const table of Object.keys(rows)) {
    await page.route(`**/rest/v1/${table}?**`, async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === 'GET') {
        if (table === 'food_products') reads += 1;
        let result = rows[table];
        if (table === 'food_product_images' && url.searchParams.get('product_id')) {
          const filter = url.searchParams.get('product_id') || '';
          const ids = filter.startsWith('in.(') ? filter.slice(4, -1).split(',') : [filter.replace(/^eq\./, '')];
          result = result.filter(row => ids.includes(row.product_id));
          result = result.slice(0, Number(url.searchParams.get('limit')) || result.length);
        }
        await route.fulfill({ json: result });
        return;
      }
      const body = request.postData() ? request.postDataJSON() : null;
      writes.push({ table, method: request.method(), body, query: url.search });
      const matches = (row: Record<string, unknown>) => ['id', 'product_id', 'group_id'].every(field => !url.searchParams.has(field) || url.searchParams.get(field) === `eq.${row[field]}`);
      if (request.method() === 'DELETE') rows[table] = rows[table].filter(row => !matches(row));
      if (request.method() === 'PATCH') rows[table] = rows[table].map(row => matches(row) ? { ...row, ...body } : row);
      if (request.method() === 'POST') {
        for (const row of Array.isArray(body) ? body : [body]) {
          const index = rows[table].findIndex(item => row.id && row.id === item.id);
          if (index >= 0) rows[table][index] = { ...rows[table][index], ...row };
          else rows[table].push(row);
        }
      }
      await route.fulfill({ json: request.method() === 'PATCH' ? rows[table].filter(matches) : body == null ? null : Array.isArray(body) ? body : [body] });
    });
    // Some writes omit a query string (new group items and product links).
    await page.route(`**/rest/v1/${table}`, async route => {
      const body = route.request().postDataJSON();
      writes.push({ table, method: route.request().method(), body, query: '' });
      rows[table].push(...(Array.isArray(body) ? body : [body]));
      await route.fulfill({ json: body });
    });
  }
  return { rows, writes, get reads() { return reads; } };
}

for (const width of [390, 1366]) {
  test(`duplicação cria rascunho independente e oculto em ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const backend = await catalogBackend(page);
    await page.goto('/admin/produtos');
    await page.getByRole('link', { name: 'Duplicar Brigadeiro teste', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Duplicar produto', exact: true })).toBeVisible();
    await expect(page.getByLabel('Nome do produto', { exact: true })).toHaveValue('Brigadeiro teste (cópia)');
    await expect(page.getByLabel('Estoque físico inicial', { exact: true })).toHaveValue('0');
    await page.locator('.catalog-disclosure summary').click();
    await expect(page.getByLabel('Código interno', { exact: true })).toHaveValue('');
    await expect(page.getByRole('checkbox', { name: /Produto ativo/ })).not.toBeChecked();
    await expect(page.locator('.image-admin-grid')).toHaveCount(0);
    expect(backend.writes).toEqual([]);
    await page.getByLabel('Nome do produto', { exact: true }).fill('Brigadeiro novo sabor');
    await page.getByRole('button', { name: 'Salvar produto', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/produtos$/);

    const copy = backend.rows.food_products.find(row => row.name === 'Brigadeiro novo sabor');
    expect(copy).toBeTruthy();
    expect(copy.id).not.toBe(PRODUCT);
    expect(copy.store_id).toBe(STORE);
    expect(copy.active).toBe(false);
    expect(copy.featured).toBe(false);
    expect(copy.stock_quantity).toBe(0);
    expect(copy).not.toHaveProperty('stock_reserved_quantity');
    expect(copy.internal_code).toBeNull();
    const link = backend.rows.food_product_option_groups.find(row => row.product_id === copy.id);
    expect(link.option_group_id).not.toBe(GROUP);
    expect(backend.rows.food_option_items.find(row => row.group_id === link.option_group_id).id).not.toBe(OPTION);
    expect(backend.rows.food_products.find(row => row.id === PRODUCT)).toMatchObject({ stock_quantity: 50, stock_reserved_quantity: 7, internal_code: 'ORIGINAL-1' });
    expect(backend.writes.filter(write => write.table === 'food_product_images')).toEqual([]);
    expect(backend.writes.filter(write => write.method === 'DELETE').some(write => write.query.includes(GROUP))).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`catalogo-copia-${width}.png`), fullPage: true });
  });
}

test('atualização de outra aba preserva os campos em edição', async ({ page }) => {
  const backend = await catalogBackend(page);
  await page.goto(`/admin/produtos/${PRODUCT}`);
  const name = page.getByLabel('Nome do produto', { exact: true });
  await expect(name).toHaveValue('Brigadeiro teste');
  await name.fill('Rascunho ainda não salvo');
  await page.getByLabel('Preço', { exact: true }).fill('18.50');
  const readsBefore = backend.reads;
  await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'foodservice_store_sync_v1', newValue: String(Date.now()) })));
  await expect.poll(() => backend.reads).toBeGreaterThan(readsBefore);
  await expect(name).toHaveValue('Rascunho ainda não salvo');
  await expect(page.getByLabel('Preço', { exact: true })).toHaveValue('18.5');
  expect(backend.writes).toEqual([]);
});

test('alterar e remover imagem principal mantém a galeria correta sem apagar rascunho', async ({ page }) => {
  const backend = await catalogBackend(page);
  await page.goto(`/admin/produtos/${PRODUCT}`);
  const name = page.getByLabel('Nome do produto', { exact: true });
  await expect(name).toHaveValue('Brigadeiro teste');
  await name.fill('Nome em revisão');
  await page.getByLabel('Preço', { exact: true }).fill('18.50');
  const gallery = page.locator('.image-admin-grid');
  await gallery.getByRole('button', { name: 'Tornar principal', exact: true }).click();
  await expect(page.getByText('Imagem principal atualizada.', { exact: true })).toBeVisible();
  await expect(gallery.locator('article.is-primary img')).toHaveAttribute('src', '/assets/food-hero.svg');
  await expect(name).toHaveValue('Nome em revisão');
  await expect(page.getByLabel('Preço', { exact: true })).toHaveValue('18.5');
  page.once('dialog', dialog => dialog.accept());
  await gallery.locator('article.is-primary').getByTitle('Excluir imagem', { exact: true }).click();
  await expect(page.getByText('Imagem removida.', { exact: true })).toBeVisible();
  await expect(gallery.locator('article')).toHaveCount(1);
  await expect(gallery.locator('article.is-primary img')).toHaveAttribute('src', '/assets/placeholder-food.svg');
  await expect(name).toHaveValue('Nome em revisão');
  await expect(page.getByLabel('Preço', { exact: true })).toHaveValue('18.5');
  expect(backend.rows.food_product_images).toHaveLength(1);
  expect(backend.rows.food_product_images[0].is_primary).toBe(true);
  expect(backend.writes.filter(write => write.table === 'food_products')).toEqual([]);
});

test('origem de cópia ausente não abre cadastro vazio nem grava dados', async ({ page }) => {
  const backend = await catalogBackend(page);
  await page.goto('/admin/produtos/novo?duplicar=outro-tenant');
  await expect(page.getByRole('heading', { name: 'Produto para duplicar não encontrado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar produto' })).toHaveCount(0);
  expect(backend.writes).toEqual([]);
});

for (const width of [390, 1366]) {
  test(`ajuste rápido altera só campos comerciais e preserva estoque e opções em ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const backend = await catalogBackend(page);
    await page.goto('/admin/produtos');
    await page.getByRole('button', { name: 'Editar preço e disponibilidade de Brigadeiro teste' }).click();
    const editor = page.getByRole('form', { name: 'Ajuste rápido de Brigadeiro teste' });
    await editor.getByLabel('Preço', { exact: true }).fill('18.50');
    await editor.getByLabel('Preço promocional (opcional)', { exact: true }).fill('17');
    await editor.getByRole('combobox', { name: 'Disponibilidade', exact: true }).selectOption('unavailable');
    const readsBefore=backend.reads;
    await editor.getByRole('button', { name: 'Salvar ajuste' }).click();
    await expect(page.getByText('Preço e disponibilidade atualizados.', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/produtos$/);
    expect(backend.reads).toBe(readsBefore);
    expect(backend.writes).toHaveLength(1);
    expect(backend.writes[0]).toMatchObject({ table: 'food_products', method: 'PATCH', body: { price: 18.5, promotional_price: 17, availability_status: 'unavailable' } });
    const scope = new URLSearchParams(backend.writes[0].query);
    expect(scope.get('id')).toBe(`eq.${PRODUCT}`);
    expect(scope.get('store_id')).toBe(`eq.${STORE}`);
    expect(backend.rows.food_products[0]).toMatchObject({ price: 18.5, promotional_price: 17, stock_quantity: 50, stock_reserved_quantity: 7, internal_code: 'ORIGINAL-1' });
    expect(backend.rows.food_option_items[0].id).toBe(OPTION);
    await page.reload();
    await expect(page.locator(width <= 760 ? '.products-mobile-list' : '.products-desktop-table').getByText('R$ 17,00', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`catalogo-ajuste-${width}.png`), fullPage: true });
  });
}

test('ajuste negado por RLS mantém os valores e informa que não foi confirmado', async ({ page }) => {
  await catalogBackend(page);
  await page.route('**/rest/v1/food_products?**', async route => {
    if (route.request().method() === 'PATCH') return route.fulfill({ json: [] });
    return route.fallback();
  });
  await page.goto('/admin/produtos');
  await page.getByRole('button', { name: 'Editar preço e disponibilidade de Brigadeiro teste' }).click();
  const editor = page.getByRole('form', { name: 'Ajuste rápido de Brigadeiro teste' });
  await editor.getByLabel('Preço', { exact: true }).fill('19');
  await editor.getByRole('button', { name: 'Salvar ajuste' }).click();
  await expect(editor.getByRole('alert')).toContainText('A alteração não foi confirmada');
  await expect(editor.getByLabel('Preço', { exact: true })).toHaveValue('19');
  await expect(page.getByText('Preço e disponibilidade atualizados.', { exact: true })).toHaveCount(0);
});

test('novo produto simples não exige descrição nem opções avançadas', async ({ page }, testInfo) => {
  const backend = await catalogBackend(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/produtos/novo');
  const details = page.locator('.catalog-disclosure');
  await expect(details).not.toHaveAttribute('open');
  await expect(page.getByLabel('Descrição (opcional)', { exact: true })).not.toBeVisible();
  await page.getByLabel('Nome do produto', { exact: true }).fill('Produto simples');
  await page.getByRole('combobox', { name: 'Categoria', exact: true }).selectOption(product.category_id);
  await page.getByLabel('Preço', { exact: true }).fill('12');
  await page.getByLabel('Estoque físico inicial', { exact: true }).fill('5');
  await page.screenshot({ path: testInfo.outputPath('produto-basico-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Salvar produto', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/produtos$/);
  expect(backend.rows.food_products.find(row => row.name === 'Produto simples')).toMatchObject({ description: '', price: 12, stock_quantity: 5, store_id: STORE });
});
