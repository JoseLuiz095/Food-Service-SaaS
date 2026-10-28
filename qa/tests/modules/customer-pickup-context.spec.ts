import { expect, test } from '@playwright/test';
import { mockBackend, ORDER, PRODUCT, STORE, snapshot as storefrontSnapshot } from './fixtures';

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


for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
]) {
  test(`saldo do ponto fica contido nos cards e mostra apenas a disponibilidade em ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockBackend(page);
    const products = Array.from({ length: 4 }, (_, index) => ({
      ...storefrontSnapshot.products[0],
      id: `70000000-0000-4000-8000-00000000000${index + 1}`,
      slug: `produto-disponivel-${index + 1}`,
      name: `Produto disponível ${index + 1}`,
      featured: false,
      stock_quantity: 0,
      stock_reserved_quantity: 0,
    }));
    await page.route('**/rest/v1/rpc/food_get_public_storefront_v1', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...storefrontSnapshot, products }) }));
    await page.route('**/rest/v1/rpc/food_get_public_pickup_locations_v1', route => route.fulfill({ json: [center, north] }));
    await page.route('**/rest/v1/rpc/food_get_public_location_availability_v1', route =>
      route.fulfill({ json: products.map(product => ({ product_id: product.id, available: 5, available_elsewhere: true })) }));

    await page.goto('/doce-lua?ponto=centro');
    await expect(page.getByText('Ponto escolhido: Loja Centro')).toBeVisible();
    const notices = page.locator('.store-point-stock');
    await expect(notices).toHaveText(Array(4).fill('5 disponíveis'));
    for (const notice of await notices.all()) await expect(notice).not.toContainText('Sujeito à confirmação');
    for (const notice of await notices.all()) await expect(notice).not.toContainText('em Loja Centro');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2)).toBe(true);

    const geometry = await page.locator('.store-point-product').evaluateAll(cards => {
      const box = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      };
      return cards.map(card => {
        const notice = card.querySelector('.store-point-stock');
        return { card: box(card), notice: notice ? box(notice) : null };
      });
    });
    expect(geometry).toHaveLength(4);
    geometry.forEach((entry, index) => {
      expect(entry.notice).not.toBeNull();
      expect(entry.notice!.top).toBeGreaterThanOrEqual(entry.card.top - 1);
      expect(entry.notice!.bottom).toBeLessThanOrEqual(entry.card.bottom + 1);
      geometry.forEach((other, otherIndex) => {
        if (index === otherIndex || !entry.notice) return;
        const overlapsHorizontally = entry.notice.left < other.card.right && entry.notice.right > other.card.left;
        const overlapsVertically = entry.notice.top < other.card.bottom && entry.notice.bottom > other.card.top;
        expect(overlapsHorizontally && overlapsVertically).toBe(false);
      });
    });
  });
}

test('vitrine oficial sinaliza sob encomenda sem exibir o saldo total e mantém o pedido disponível', async ({ page }) => {
  await mockBackend(page);
  const outOfStockProduct = { ...storefrontSnapshot.products[0], stock_quantity: 0, stock_reserved_quantity: 0 };
  await page.route('**/rest/v1/rpc/food_get_public_storefront_v1', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...storefrontSnapshot, products: [outOfStockProduct] }) }));

  await page.goto('/doce-lua');
  await expect(page.locator('.store-point-stock')).toHaveText('Sob encomenda. Agende para amanhã no checkout.');
  await page.locator('.product-card-shell > .product-card').first().click();
  await expect(page.locator('.stock-schedule-note')).toContainText('Sob encomenda');
  await expect(page.locator('.store-point-stock')).toHaveCount(0);
  await expect(page.locator('.buy-box .primary-button')).toBeEnabled();
});

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
