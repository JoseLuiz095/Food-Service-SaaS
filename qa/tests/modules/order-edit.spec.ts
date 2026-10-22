import { expect, test } from '@playwright/test';
import { mockBackend, ORDER, PRODUCT, STORE } from './fixtures';

test('editar pedido envia quantidade à RPC correta e atualiza preço sem nova venda', async ({ page }) => {
  await mockBackend(page, { auth: true });
  const itemId = '30000000-0000-4000-8000-000000000001';
  const row = { id: ORDER, order_number: 321, store_id: STORE, customer_name: 'Cliente teste', customer_phone: '11999999999',
    delivery_type: 'pickup', payment_method: 'pix', payment_status: 'pending', status: 'received',
    subtotal: 10, total: 10, delivery_fee: 0, inventory_status: 'reserved', created_at: new Date().toISOString() };
  const item = { id: itemId, order_id: ORDER, product_id: PRODUCT, product_name: 'Produto teste', quantity: 1,
    unit_price: 10, item_total: 10, variant_price_delta: 0, addons: [], created_at: row.created_at };
  const calls: unknown[] = [];
  await page.route(/\/rest\/v1\/food_orders(?:\?|$)/, async route => {
    if (route.request().method() === 'PATCH') Object.assign(row, route.request().postDataJSON());
    await route.fulfill({ json: [row] });
  });
  await page.route(/\/rest\/v1\/food_order_items(?:\?|$)/, route => route.fulfill({ json: [item] }));
  await page.route('**/rest/v1/rpc/food_update_order_items_v1', async route => {
    const body = route.request().postDataJSON(); calls.push(body);
    item.quantity = body.p_items[0].quantity; item.item_total = item.unit_price * item.quantity;
    row.subtotal = item.item_total; row.total = item.item_total;
    await route.fulfill({ json: [{ subtotal: row.subtotal, total: row.total }] });
  });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/admin/pedidos');
  await page.getByRole('button', { name: 'Detalhes / editar', exact: true }).first().click();
  const modal = page.getByRole('dialog');
  await modal.getByRole('button', { name: 'Editar pedido', exact: true }).click();
  await modal.getByRole('button', { name: 'Aumentar Produto teste', exact: true }).click();
  await modal.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(modal.getByText('2x Produto teste', { exact: true })).toBeVisible();
  await expect(modal.locator('.order-details-modal__summary .is-total')).toContainText('20,00');
  expect(calls).toEqual([{ p_order_id: ORDER, p_items: [{ item_id: itemId, quantity: 2 }] }]);
});
