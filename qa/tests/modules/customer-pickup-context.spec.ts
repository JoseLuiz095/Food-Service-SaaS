import { expect, test } from '@playwright/test';
import { mockBackend, ORDER, PRODUCT, STORE } from './fixtures';

const center = { id: '60000000-0000-4000-8000-000000000001', name: 'Loja Centro', short_code: 'centro', address: 'Rua Central, 12' };
const north = { id: '60000000-0000-4000-8000-000000000002', name: 'Loja Norte', short_code: 'norte', address: 'Rua Norte, 20' };

for (const width of [390, 768, 1024, 1440]) {
  test(`retirada identificada pelo QR preserva o ponto até a confirmação em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const { writes } = await mockBackend(page);
    await page.route('**/rest/v1/rpc/food_get_public_pickup_locations_v1', route => route.fulfill({ json: [center, north] }));
    await page.route('**/rest/v1/rpc/food_get_public_location_availability_v1', route => route.fulfill({ json: [{ product_id: PRODUCT, available: 20, available_elsewhere: false }] }));

    await page.goto('/doce-lua/produto/brigadeiro-teste');
    await page.getByRole('button', { name: 'Adicionar ao carrinho', exact: true }).click();
    await page.goto('/doce-lua/carrinho?ponto=centro');
    await expect(page.getByText('Local identificado: Loja Centro')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Ponto de retirada' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Continuar', exact: true }).click();
    await page.getByRole('button', { name: /Retirada Buscar/ }).click();
    await expect(page.getByText('Retirada em Loja Centro · validação no pedido')).toBeVisible();
    await page.getByLabel('Nome', { exact: true }).fill('Cliente de teste');
    await page.getByLabel(/WhatsApp/).first().fill('11999999999');
    await page.getByRole('button', { name: /^PIX/ }).click();
    await page.getByRole('button', { name: /Registrar pedido|Finalizar/ }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(new RegExp(ORDER));
    await expect(page.getByText('Retirada em Loja Centro · Rua Central, 12')).toBeVisible();
    const order = writes.find(write => write.url.endsWith('/food-public-checkout'));
    expect(order?.body.payload).toMatchObject({ store_id: STORE, delivery_type: 'pickup', pickup_location_id: center.id });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2)).toBe(true);
  });
}

test('QR inválido exige escolha explícita e permite trocar o ponto sem perder o carrinho', async ({ page }) => {
  await mockBackend(page);
  await page.route('**/rest/v1/rpc/food_get_public_pickup_locations_v1', route => route.fulfill({ json: [center, north] }));
  await page.route('**/rest/v1/rpc/food_get_public_location_availability_v1', route => route.fulfill({ json: [{ product_id: PRODUCT, available: 20, available_elsewhere: false }] }));
  await page.goto('/doce-lua/produto/brigadeiro-teste');
  await page.getByRole('button', { name: 'Adicionar ao carrinho', exact: true }).click();
  await page.goto('/doce-lua/carrinho?ponto=invalido');
  await expect(page.getByText('O QR Code deste ponto não está mais válido. Escolha um ponto da lista.')).toBeVisible();
  await page.getByRole('combobox', { name: 'Ponto de retirada' }).selectOption(center.id);
  await expect(page.getByText('Ponto escolhido: Loja Centro')).toBeVisible();
  await page.getByText('Trocar ponto').click();
  await page.getByRole('combobox', { name: 'Ponto de retirada' }).selectOption(north.id);
  await expect(page.getByText('Ponto escolhido: Loja Norte')).toBeVisible();
  await expect(page.getByText('Brigadeiro teste').first()).toBeVisible();
});
