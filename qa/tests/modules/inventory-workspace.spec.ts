import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockBackend, product, STORE, PRODUCT } from './fixtures';

const HOME = '30000000-0000-4000-8000-000000000001';
const OTHER = '30000000-0000-4000-8000-000000000002';
async function setup(page: Page, multiple = true) {
  await mockBackend(page, { auth: true });
  await page.route('**/rest/v1/rpc/food_stock_mode_v1', route => route.fulfill({ json: { multi_location_enabled: multiple } }));
  await page.route('**/rest/v1/food_stock_locations?**', route => route.fulfill({ json: [
    { id: HOME, store_id: STORE, name: 'Depósito de teste', location_type: 'warehouse', active: true, is_default: true },
    { id: OTHER, store_id: STORE, name: 'Ponto fictício', location_type: 'store', active: true, is_default: false },
  ] }));
  await page.route('**/rest/v1/food_product_location_stock?**', route => route.fulfill({ json: [
    { product_id: PRODUCT, location_id: HOME, stock_quantity: 4, stock_reserved_quantity: 1 },
    { product_id: PRODUCT, location_id: OTHER, stock_quantity: 0, stock_reserved_quantity: 2 },
  ] }));
}

for (const width of [320, 390, 768, 1366]) test(`uma área preserva busca e local sem recarga em ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await setup(page);
  let documentLoads = 0;
  page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentLoads++; });
  await page.goto('/admin/estoque');
  const nav = page.getByRole('navigation', { name: 'Visões do estoque' });
  await expect(nav.getByRole('link', { name: 'Saldos por local' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Estoque e locais', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Local de estoque', exact: true }).selectOption(OTHER);
  await page.getByRole('searchbox', { name: 'Buscar no local' }).fill(product.name);
  await expect(page.getByText('Repor 2 unidade(s) para atender às reservas.')).toBeVisible();
  await nav.getByRole('link', { name: 'Produtos e insumos' }).click();
  await expect(page.getByRole('region', { name: 'Estoque de produtos' })).toBeVisible();
  await nav.getByRole('link', { name: 'Saldos por local' }).click();
  await expect(page.getByRole('combobox', { name: 'Local de estoque', exact: true })).toHaveValue(OTHER);
  await expect(page.getByRole('searchbox', { name: 'Buscar no local' })).toHaveValue(product.name);
  expect(documentLoads).toBe(1);
  await nav.getByRole('link', { name: 'Produtos e insumos' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/visao=produtos/);
  await page.goBack();
  await expect(nav.getByRole('link', { name: 'Saldos por local' })).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).include('.inventory-workspace__navigation').analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath(`estoque-unificado-${width}.png`), fullPage: true });
});

test('estoque simples continua direto e o endereço antigo abre os locais', async ({ page }) => {
  await setup(page, false);
  await page.goto('/admin/estoque');
  await expect(page.getByRole('region', { name: 'Estoque de produtos' })).toBeVisible();
  await page.goto('/admin/estoque-locais?origem=antigo');
  await expect(page).toHaveURL('/admin/estoque?origem=antigo&visao=locais');
  await expect(page.getByRole('button', { name: 'Ativar múltiplos locais' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Visões do estoque' }).getByRole('link', { name: 'Produtos e insumos' }).click();
  await expect(page.getByRole('region', { name: 'Estoque de produtos' })).toBeVisible();
});

test('falha dos locais mantém acesso aos produtos e recuperação', async ({ page }) => {
  await setup(page);
  await page.route('**/rest/v1/food_stock_locations?**', route => route.fulfill({ status: 503, json: { message: 'Indisponível no teste' } }));
  await page.goto('/admin/estoque');
  await expect(page.getByRole('button', { name: /Tentar novamente/ })).toBeVisible();
  await page.getByRole('navigation', { name: 'Visões do estoque' }).getByRole('link', { name: 'Produtos e insumos' }).click();
  await expect(page.getByRole('region', { name: 'Estoque de produtos' })).toBeVisible();
});
