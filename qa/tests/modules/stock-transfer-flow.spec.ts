import { expect, test, type Page } from '@playwright/test';
import { mockBackend, product, STORE } from './fixtures';

const HOME = '30000000-0000-4000-8000-000000000001';
const WORK = '30000000-0000-4000-8000-000000000002';
const names = ['Creme de Avelã', 'Ninho', 'Ovomaltine', 'Paçoca'];
const productIds = names.map((_, index) => `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
const products = names.map((name, index) => ({
  ...product, id: productIds[index], store_id: STORE, name, slug: `produto-${index + 1}`,
  sort_order: index + 1, stock_quantity: [14, 14, 7, 7][index], stock_reserved_quantity: 0,
}));
const locations = [
  { id: HOME, store_id: STORE, name: 'Casa', location_type: 'warehouse', active: true, is_default: true },
  { id: WORK, store_id: STORE, name: 'Trabalho', location_type: 'store', active: true, is_default: false },
];
type Balance = { product_id: string; location_id: string; stock_quantity: number; stock_reserved_quantity: number; updated_at: string };
type TransferPayload = { p_store_id: string; p_from_location_id: string; p_to_location_id: string; p_items: Array<{ product_id: string; quantity: number }>; p_idempotency_key: string };

async function openTransfer(page: Page, options: { failFirst?: boolean } = {}) {
  await mockBackend(page, { auth: true });
  await page.route('**/rest/v1/food_products?**', route => route.fulfill({ json: products }));
  await page.route('**/rest/v1/rpc/food_stock_mode_v1', route => route.fulfill({ json: { multi_location_enabled: true } }));
  await page.route('**/rest/v1/food_stock_locations?**', route => route.fulfill({ json: locations }));
  await page.route('**/rest/v1/food_pickup_locations?**', route => route.fulfill({ json: [] }));
  const balances: Balance[] = products.flatMap((item, index) => [
    { product_id: item.id, location_id: HOME, stock_quantity: [12, 12, 5, 7][index], stock_reserved_quantity: index === 0 ? 1 : 0, updated_at: '2026-10-26T12:00:00Z' },
    { product_id: item.id, location_id: WORK, stock_quantity: [2, 2, 2, 0][index], stock_reserved_quantity: 0, updated_at: '2026-10-26T12:00:00Z' },
  ]);
  await page.route('**/rest/v1/food_product_location_stock?**', route => route.fulfill({ json: balances }));
  const calls: TransferPayload[] = [];
  let failFirst = options.failFirst ?? false;
  await page.route('**/rest/v1/rpc/food_transfer_location_stock_batch_v1', route => {
    const payload = route.request().postDataJSON() as TransferPayload;
    calls.push(payload);
    if (failFirst) {
      failFirst = false;
      return route.fulfill({ status: 503, json: { message: 'Serviço temporariamente indisponível' } });
    }
    const result = payload.p_items.map(item => {
      const from = balances.find(balance => balance.product_id === item.product_id && balance.location_id === payload.p_from_location_id)!;
      const to = balances.find(balance => balance.product_id === item.product_id && balance.location_id === payload.p_to_location_id)!;
      from.stock_quantity -= item.quantity;
      to.stock_quantity += item.quantity;
      return { product_id: item.product_id, from_stock: from.stock_quantity, to_stock: to.stock_quantity };
    });
    return route.fulfill({ json: { items: result, replayed: false } });
  });
  let oldTransferCalls = 0;
  await page.route('**/rest/v1/rpc/food_transfer_location_stock_v1', route => {
    oldTransferCalls += 1;
    return route.fulfill({ status: 500, json: { message: 'Fluxo individual não deve ser usado' } });
  });
  await page.goto('/admin/estoque-locais');
  const transfer = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Transferir estoque' }) }).last();
  await expect(transfer).toBeVisible();
  return { transfer, calls, balances, getOldTransferCalls: () => oldTransferCalls };
}

async function fillQuantities(page: Page, amounts: number[]) {
  for (let index = 0; index < amounts.length; index++) {
    await page.getByRole('spinbutton', { name: new RegExp(`Quantidade de ${names[index]}`) }).fill(String(amounts[index]));
  }
}

test('quatro produtos usam uma chamada atômica e atualizam os saldos locais', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const apiFailures: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('response', response => {
    if (response.url().includes('.supabase.co/') && response.status() >= 400) apiFailures.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  const screen = await openTransfer(page);
  await fillQuantities(page, [4, 5, 3, 1]);
  await expect(screen.transfer).toContainText('4 produtos');
  await expect(screen.transfer).toContainText('13 unidades');
  await screen.transfer.getByRole('button', { name: /Transferir 13 unidades/ }).click();
  await expect.poll(() => screen.calls.length).toBe(1);
  expect(screen.calls[0]).toMatchObject({ p_store_id: STORE, p_from_location_id: HOME, p_to_location_id: WORK,
    p_items: productIds.map((product_id, index) => ({ product_id, quantity: [4, 5, 3, 1][index] })) });
  expect(screen.calls[0].p_idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
  expect(screen.getOldTransferCalls()).toBe(0);
  await expect(screen.transfer.getByText('Transferência concluída', { exact: true })).toBeVisible();
  expect(screen.balances.filter(row => row.location_id === HOME).map(row => row.stock_quantity)).toEqual([8, 7, 2, 6]);
  await page.reload();
  await expect(page.getByRole('spinbutton', { name: /Quantidade de Creme de Avelã/ })).toHaveAttribute('max', '7');
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(apiFailures).toEqual([]);
});

test('um produto segue a mesma operação e quantidades zero não entram no payload', async ({ page }) => {
  const screen = await openTransfer(page);
  await page.getByRole('spinbutton', { name: /Quantidade de Ninho/ }).fill('2');
  await screen.transfer.getByRole('button', { name: /Transferir 2 unidades/ }).click();
  await expect.poll(() => screen.calls.length).toBe(1);
  expect(screen.calls[0].p_items).toEqual([{ product_id: productIds[1], quantity: 2 }]);
  expect(screen.getOldTransferCalls()).toBe(0);
});

test('busca preserva quantidades, inversão revalida saldo e bloqueia excesso', async ({ page }) => {
  const screen = await openTransfer(page);
  await page.getByRole('spinbutton', { name: /Quantidade de Creme de Avelã/ }).fill('4');
  await screen.transfer.getByRole('searchbox').fill('Ninho');
  await expect(page.getByRole('spinbutton', { name: /Quantidade de Creme de Avelã/ })).toHaveCount(0);
  await screen.transfer.getByRole('searchbox').clear();
  await expect(page.getByRole('spinbutton', { name: /Quantidade de Creme de Avelã/ })).toHaveValue('4');
  await screen.transfer.getByRole('button', { name: /Inverter/ }).click();
  await expect(page.getByRole('spinbutton', { name: /Quantidade de Creme de Avelã/ })).toHaveAttribute('max', '2');
  await expect(screen.transfer.getByRole('button', { name: /Transferir/ })).toBeDisabled();
  expect(screen.calls).toHaveLength(0);
});

test('reserva reduz o máximo e saldo insuficiente não envia transferência parcial', async ({ page }) => {
  const screen = await openTransfer(page);
  const quantity = page.getByRole('spinbutton', { name: /Quantidade de Creme de Avelã/ });
  await expect(quantity).toHaveAttribute('max', '11'); // 12 físicas menos 1 reservada na Casa.
  await quantity.fill('12');
  await expect(screen.transfer).toContainText(/disponível.*11|11.*disponível/i);
  await expect(screen.transfer.getByRole('button', { name: /Transferir/ })).toBeDisabled();
  expect(screen.calls).toHaveLength(0);
  await quantity.fill('11');
  await expect(screen.transfer.getByRole('button', { name: /Transferir 11 unidades/ })).toBeEnabled();
});

test('falha preserva seleção e repete com a mesma chave de idempotência', async ({ page }) => {
  const screen = await openTransfer(page, { failFirst: true });
  await page.getByRole('spinbutton', { name: /Quantidade de Ninho/ }).fill('2');
  await screen.transfer.getByRole('button', { name: /Transferir 2 unidades/ }).click();
  await expect.poll(() => screen.calls.length).toBe(1);
  await expect(page.getByRole('spinbutton', { name: /Quantidade de Ninho/ })).toHaveValue('2');
  await screen.transfer.getByRole('button', { name: /Transferir 2 unidades/ }).click();
  await expect.poll(() => screen.calls.length).toBe(2);
  expect(screen.calls[1].p_idempotency_key).toBe(screen.calls[0].p_idempotency_key);
  await expect(screen.transfer.getByText('Transferência concluída', { exact: true })).toBeVisible();
});

for (const width of [320, 390, 430, 768, 1280]) {
  test(`transferência utilizável em ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 780 });
    const screen = await openTransfer(page);
    const quantity = page.getByRole('spinbutton', { name: /Quantidade de Ninho/ });
    await quantity.fill('2');
    await expect(quantity).toHaveAttribute('inputmode', 'numeric');
    await expect(screen.transfer.getByRole('button', { name: /Transferir 2 unidades/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await screen.transfer.screenshot({ path: testInfo.outputPath(`transferencia-fluxo-${width}.png`) });
  });
}
