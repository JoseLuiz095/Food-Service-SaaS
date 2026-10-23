import { expect, test } from '@playwright/test';
import { mockBackend, ORDER, STORE } from './fixtures';

for (const source of ['counter', 'site']) {
  test(`onboarding distingue pedido ${source} de evidência do checkout público`, async ({ page }) => {
    await mockBackend(page, { auth: true });
    await page.route('**/rest/v1/food_orders?**', route => route.fulfill({ json: [{
      id: ORDER, store_id: STORE, order_number: 123, customer_name: 'Cliente fictício', delivery_type: 'pickup',
      payment_method: 'cash', payment_status: 'pending', status: 'received', subtotal: 10, total: 10,
      delivery_fee: 0, source, created_at: new Date().toISOString(),
    }] }));
    await page.goto('/admin/primeiros-passos');
    await expect(page.getByRole('heading', { name: 'Configuração essencial concluída' })).toBeVisible();
    if (source === 'site') {
      await expect(page.getByText('Já existem pedidos registrados', { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Fazer pedido de teste', exact: true })).toHaveCount(0);
    } else {
      await expect(page.getByText('Já existem pedidos registrados', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Fazer pedido de teste', exact: true })).toBeVisible();
    }
  });
}
