import { expect, test } from '@playwright/test';
import { mockBackend, PRODUCT, snapshot, STORE } from './fixtures';

const cartKey = `foodservice_cart_v1:${STORE}`;
const seedItem = (quantity: number) => ({ id: `${PRODUCT}|base`, productId: PRODUCT, productName: 'Brigadeiro teste', imageUrl: '', unitPrice: 10, quantity, options: [] });

for (const auth of [false, true]) {
  test(`carrinho adiciona, aumenta, diminui, recarrega e remove; autenticado=${auth}`, async ({ page }) => {
    const { writes } = await mockBackend(page, { auth });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/doce-lua/produto/brigadeiro-teste');
    await page.getByRole('button', { name: 'Adicionar ao carrinho', exact: true }).click();
    const line = page.locator('.cart-item').first();
    await line.getByRole('button', { name: 'Aumentar quantidade', exact: true }).click();
    await expect(line.locator('.quantity-control>span')).toHaveText('2');
    await expect(line.locator('.cart-item__total')).toContainText('20,00');
    await page.reload();
    await expect(line.locator('.quantity-control>span')).toHaveText('2');
    await line.getByRole('button', { name: 'Diminuir quantidade', exact: true }).click();
    await expect(line.locator('.quantity-control>span')).toHaveText('1');
    await expect(line.getByRole('button', { name: 'Diminuir quantidade', exact: true })).toBeDisabled();
    await line.getByRole('button', { name: 'Remover Brigadeiro teste', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Seu carrinho está vazio' })).toBeVisible();
    expect(writes.filter(call => call.url.includes('food-public-checkout') || call.url.includes('food_update_order_items'))).toHaveLength(0);
    expect(errors).toEqual([]);
  });
}

test('nova adição não permite ultrapassar o limite de 99 da RPC', async ({ page }) => {
  await mockBackend(page);
  await page.addInitScript(({ key, item }) => localStorage.setItem(key, JSON.stringify([item])), { key: cartKey, item: seedItem(99) });
  await page.goto('/doce-lua/produto/brigadeiro-teste');
  await page.getByRole('button', { name: 'Adicionar ao carrinho', exact: true }).click();
  await expect(page.getByText(/limite de 99/)).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]')[0].quantity, cartKey)).toBe(99);
});

test('produtos sem saldo continuam compráveis por agendamento, sem consumir estoque no carrinho', async ({ page }) => {
  const { writes } = await mockBackend(page);
  await page.route('**/rest/v1/rpc/food_get_public_storefront_v1', route => route.fulfill({ json: {
    ...snapshot, products: [{ ...snapshot.products[0], stock_quantity: 0, stock_reserved_quantity: 0 }],
  } }));
  await page.goto('/doce-lua/produto/brigadeiro-teste');
  await expect(page.getByText('Sem disponibilidade para hoje', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar para agendar', exact: true }).click();
  await page.goto('/doce-lua/finalizar');
  await expect(page.getByText('Agendamento necessário para este pedido', { exact: true })).toBeVisible();
  expect(writes.some(call => call.url.includes('food-public-checkout'))).toBe(false);
});

test('múltiplos produtos e carrinhos de duas lojas permanecem separados', async ({ page }) => {
  await mockBackend(page);
  const secondId = '20000000-0000-4000-8000-000000000002';
  const otherStoreId = '00000000-0000-4000-8000-000000000002';
  await page.route('**/rest/v1/rpc/food_get_public_storefront_v1', route => {
    const other = route.request().postDataJSON()?.p_slug === 'outra-loja';
    return route.fulfill({ json: { ...snapshot,
      store: { ...snapshot.store, ...(other ? { id: otherStoreId, slug: 'outra-loja', name: 'Outra loja teste' } : {}) },
      products: other ? [] : [...snapshot.products, { ...snapshot.products[0], id: secondId, name: 'Segundo produto', slug: 'segundo-produto', price: 15 }],
    } });
  });
  await page.goto('/doce-lua/produto/brigadeiro-teste');
  await page.getByRole('button', { name: 'Adicionar ao carrinho', exact: true }).click();
  await page.goto('/doce-lua/produto/segundo-produto');
  await page.getByRole('button', { name: 'Adicionar ao carrinho', exact: true }).click();
  await expect(page.locator('.cart-item')).toHaveCount(2);
  await expect(page.locator('.summary-total')).toContainText('25,00');
  await page.goto('/outra-loja/carrinho');
  await expect(page.getByRole('heading', { name: 'Seu carrinho está vazio' })).toBeVisible();
  await page.goto('/doce-lua/carrinho');
  await expect(page.locator('.cart-item')).toHaveCount(2);
});
