import { expect, test, type Page } from '@playwright/test';
import { mockBackend, product, PRODUCT, STORE } from './fixtures';

test.use({ channel: '', reducedMotion: 'reduce' });
const MAIN = '30000000-0000-4000-8000-000000000001';
const POINT = '30000000-0000-4000-8000-000000000002';

async function setup(page: Page, physical = 5) {
  await mockBackend(page, { auth: true });
  const state = { physical, reserved: 2, loseResponse: false, reads: 0, requests: [] as any[], sales: new Map<string, any>() };
  await page.route('**/rest/v1/food_products?**', r => r.fulfill({ json: [{ ...product, name: 'Pipoca de Paçoca - 100G', stock_quantity: 0 }] }));
  await page.route('**/rest/v1/food_stock_locations?**', r => r.fulfill({ json: [
    { id: MAIN, store_id: STORE, name: 'Principal', active: true, is_default: true },
    { id: POINT, store_id: STORE, name: 'Sicoob', active: true, is_default: false },
  ] }));
  await page.route('**/rest/v1/food_product_location_stock?**', r => {
    state.reads++;
    return r.fulfill({ json: [
      { product_id: PRODUCT, location_id: MAIN, stock_quantity: 0, stock_reserved_quantity: 0 },
      { product_id: PRODUCT, location_id: POINT, stock_quantity: state.physical, stock_reserved_quantity: state.reserved },
    ] });
  });
  await page.route('**/rest/v1/rpc/food_create_admin_order_v1', async r => {
    const payload = r.request().postDataJSON().payload;
    state.requests.push(payload);
    let sale = state.sales.get(payload.admin_request_id);
    if (sale && JSON.stringify(sale.payload) !== JSON.stringify(payload)) return r.fulfill({ status: 409, json: { message: 'Esta chave já foi usada para uma venda diferente.' } });
    if (!sale) {
      sale = { payload, result: [{ order_id: crypto.randomUUID(), order_number: 160 + state.sales.size, order_total: 10 * payload.items[0].quantity }] };
      state.sales.set(payload.admin_request_id, sale);
      state.physical -= payload.items[0].quantity;
    }
    if (state.loseResponse) { state.loseResponse = false; return r.abort('failed'); }
    return r.fulfill({ json: sale.result });
  });
  await page.goto('/admin/pedidos');
  return state;
}

async function draft(page: Page) {
  await page.getByRole('button', { name: 'Lançar pedido avulso' }).click();
  const dialog = page.getByRole('dialog', { name: 'Pedido avulso', exact: true });
  await dialog.getByLabel('Estoque de saída', { exact: true }).selectOption(POINT);
  await dialog.getByRole('combobox', { name: 'Pagamento', exact: true }).selectOption('cash');
  await dialog.locator('.manual-product-quick-add__product select').selectOption(PRODUCT);
  await dialog.getByRole('button', { name: 'Adicionar', exact: true }).click();
  return dialog;
}

for (const width of [320, 390, 1366]) test(`paçoca com 3 disponíveis em Sicoob e nova venda em ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  const state = await setup(page);
  let dialog = await draft(page);
  await expect(dialog.locator('.manual-item-stock')).toHaveText('Sicoob: 3 disponíveis no ponto');
  await expect(dialog.getByRole('tab', { name: /Venda rápida/ })).toHaveAttribute('aria-selected', 'true');
  const hint = dialog.getByRole('button', { name: 'Como funciona o estoque de saída' });
  await hint.click();
  await expect(dialog.locator('.info-hint__content:popover-open')).toContainText('baixa física');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(hint).toHaveAttribute('aria-expanded', 'false');
  const outside = await dialog.locator('input,select,button').evaluateAll(nodes => nodes.filter(node => {
    const box = node.getBoundingClientRect();
    return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1);
  }).map(node => node.outerHTML.slice(0, 100)));
  expect(outside).toEqual([]);
  await page.screenshot({ path: info.outputPath(`avulso-sicoob-${width}.png`), fullPage: true });
  await dialog.locator('.manual-item-stock').evaluate(node => node.scrollIntoView({ block: 'center' }));
  const stockBox = await dialog.locator('.manual-item-stock').boundingBox();
  const footerBox = await dialog.locator('.master-modal-actions').boundingBox();
  expect(stockBox!.y + stockBox!.height).toBeLessThanOrEqual(footerBox!.y);
  await page.screenshot({ path: info.outputPath(`avulso-produto-${width}.png`) });
  await dialog.getByRole('button', { name: /Registrar venda/ }).click();
  await expect(dialog).toHaveCount(0);
  dialog = await draft(page);
  await expect(dialog.locator('.manual-item-stock')).toHaveText('Sicoob: 2 disponíveis no ponto');
  await dialog.getByRole('button', { name: /Registrar venda/ }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.requests).toHaveLength(2);
  expect(state.requests[0].admin_request_id).not.toBe(state.requests[1].admin_request_id);
  expect(state.requests.every(p => p.stock_location_id === POINT && p.status === 'delivered')).toBe(true);
  expect(state.physical).toBe(3);
});

test('resposta perdida repete a mesma chave mesmo sem saldo após a primeira baixa', async ({ page }) => {
  const state = await setup(page, 3);
  state.loseResponse = true;
  const dialog = await draft(page);
  await dialog.getByRole('button', { name: /Registrar venda/ }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  expect(state.physical).toBe(2);
  await dialog.getByRole('button', { name: /Registrar venda/ }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.requests).toHaveLength(2);
  expect(state.requests[0]).toEqual(state.requests[1]);
  expect(state.sales.size).toBe(1);
  expect(state.physical).toBe(2);
});

test('consulta novamente o ponto ao salvar, explica a falta e permite reposição', async ({ page }) => {
  const state = await setup(page);
  const dialog = await draft(page);
  state.physical = 2;
  await dialog.getByRole('button', { name: /Registrar venda/ }).click();
  await expect(dialog.getByRole('alert')).toContainText('0 disponíveis em Sicoob; solicitado: 1');
  expect(state.requests).toHaveLength(0);
  state.physical = 5;
  await dialog.getByRole('button', { name: /Registrar venda/ }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.requests).toHaveLength(1);
  expect(state.physical).toBe(4);
});
