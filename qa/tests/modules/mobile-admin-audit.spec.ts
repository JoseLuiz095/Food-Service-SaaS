import { expect, test } from '@playwright/test';
import { mockBackend, product, store, STORE, ORDER, PRODUCT } from './fixtures';

test.use({ channel: '', reducedMotion: 'reduce' });

const HOME = '30000000-0000-4000-8000-000000000001';
const POINT = '30000000-0000-4000-8000-000000000002';
const stage = process.env.MOBILE_AUDIT_STAGE || 'after';
const screenshotDir = process.env.MOBILE_AUDIT_DIR || '/tmp/doce-lua-mobile-evidence';

for (const width of [360, 390, 1366]) {
  test(`admin mobile audit ${width}px (synthetic, local only)`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: width > 1000 ? 900 : 844 });
    // Every Supabase request is intercepted. No real session or production data is used.
    const { writes } = await mockBackend(page, { auth: true });
    await page.route('**/rest/v1/food_stores?**', route => route.fulfill({ json: [{ ...store, name: 'Loja local · dados sintéticos' }] }));
    await page.route('**/rest/v1/rpc/food_stock_mode_v1', route => route.fulfill({ json: { multi_location_enabled: true } }));
    await page.route('**/rest/v1/food_stock_locations?**', route => route.fulfill({ json: [
      { id: HOME, store_id: STORE, name: 'Depósito de teste', location_type: 'warehouse', active: true, is_default: true },
      { id: POINT, store_id: STORE, name: 'Ponto de teste · Centro', location_type: 'pickup', active: true, is_default: false },
    ] }));
    await page.route('**/rest/v1/food_pickup_locations?**', route => route.fulfill({ json: [
      { id: '40000000-0000-4000-8000-000000000001', name: 'Retirada de teste', short_code: 'TESTE', stock_location_id: POINT },
    ] }));
    await page.route('**/rest/v1/food_products?**', route => route.fulfill({ json: [
      { ...product, name: 'Produto de teste com nome comprido para conferir a leitura no celular', stock_quantity: 20, stock_reserved_quantity: 3 },
      { ...product, id: '20000000-0000-4000-8000-000000000002', name: 'Outro produto de teste', stock_quantity: 4 },
    ] }));
    await page.route('**/rest/v1/food_product_location_stock?**', route => route.fulfill({ json: [
      { store_id: STORE, product_id: PRODUCT, location_id: HOME, stock_quantity: 12, stock_reserved_quantity: 2 },
      { store_id: STORE, product_id: PRODUCT, location_id: POINT, stock_quantity: 8, stock_reserved_quantity: 1 },
    ] }));
    await page.route(/\/rest\/v1\/food_orders(?:\?|$)/, route => route.fulfill({ json: [{
      id: ORDER, order_number: 123, store_id: STORE, customer_name: 'Cliente sintético', customer_phone: '',
      delivery_type: 'pickup', pickup_location_id: '40000000-0000-4000-8000-000000000001', stock_location_id: POINT,
      payment_method: 'pix', payment_status: 'pending', status: 'received', subtotal: 20, total: 20, delivery_fee: 0,
      inventory_status: 'reserved', created_at: new Date().toISOString(),
    }] }));
    await page.route(/\/rest\/v1\/food_order_items(?:\?|$)/, route => route.fulfill({ json: [{
      id: '60000000-0000-4000-8000-000000000001', order_id: ORDER, product_id: PRODUCT,
      product_name: 'Produto de teste com nome comprido para conferir a leitura no celular', quantity: 2,
      unit_price: 10, item_total: 20, variant_name: 'Variação sintética', addons: [], inventory_reserved_quantity: 2,
    }] }));
    for (const [name, route] of [
      ['locais', '/admin/estoque-locais'], ['pedidos', '/admin/pedidos'], ['produtos', '/admin/produtos'],
      ['estoque', '/admin/estoque'], ['configuracoes', '/admin/configuracoes'],
    ]) {
      await page.goto(route);
      await expect(page.locator('.admin-content')).toBeVisible();
      await expect(page.locator('h1').first()).toBeVisible();
      await expect(page.locator('#foodweb-splash-screen')).toHaveCount(0);
      await expect(page.getByText('Carregando locais de estoque...', { exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} @ ${width}`).toBe(true);
      await page.screenshot({ path: `${screenshotDir}/${stage}-${name}-${width}.png`, fullPage: name === 'locais' });
      if (name === 'produtos' && stage === 'after' && width < 760) {
        for (const control of await page.locator('.products-mobile-card__actions').first().locator('a,button').all()) {
          const box = await control.boundingBox();
          expect(box, 'Ação do produto acessível ao toque').not.toBeNull();
          expect(box!.width).toBeGreaterThanOrEqual(44);
          expect(box!.height).toBeGreaterThanOrEqual(44);
        }
      }
      if (name === 'pedidos') {
        await page.getByRole('button', { name: 'Detalhes / editar', exact: true }).first().click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.getByRole('dialog').getByRole('button', { name: 'Editar pedido', exact: true }).click();
        await page.locator('.order-details-modal__edit-item').first().scrollIntoViewIfNeeded();
        if (stage === 'after' && width < 760) for (const control of await page.locator('.order-details-modal__edit-item').first().locator('button').all()) {
          const box = await control.boundingBox();
          expect(box, 'Controle de quantidade acessível ao toque').not.toBeNull();
          expect(box!.width).toBeGreaterThanOrEqual(44);
          expect(box!.height).toBeGreaterThanOrEqual(44);
        }
        await page.screenshot({ path: `${screenshotDir}/${stage}-pedido-detalhe-${width}.png` });
      }
      if (name === 'locais' && stage === 'after') {
        const workspace = page.getByRole('region', { name: 'Visão dos locais' });
        await workspace.getByRole('combobox', { name: 'Local', exact: true }).selectOption(POINT);
        await expect(workspace).toContainText('Ponto de teste · Centro');
        await expect(workspace).toContainText('7');
        // Expand product operations; checking the confirmation never sends a real write.
        await workspace.getByText('Detalhes e ações').first().click();
        await page.screenshot({ path: `${screenshotDir}/${stage}-locais-ponto-${width}.png`, fullPage: true });
        await workspace.getByRole('button', { name: 'Definir', exact: true }).first().click();
        await page.getByLabel('Quantidade', { exact: true }).fill('6');
        const messages: string[] = [];
        page.once('dialog', async (dialog) => { messages.push(dialog.message()); await dialog.dismiss(); });
        await page.getByRole('button', { name: 'Salvar no local selecionado' }).click();
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain('Ponto de teste · Centro');
        expect(messages[0]).toContain('6');
      }
    }
    expect(writes.filter((write) => /food_(change_location_stock|transfer_location_stock|adjust_location_stock)/.test(write.url))).toHaveLength(0);
    expect(errors).toEqual([]);
  });
}

for (const width of [360, 390, 1366]) {
  test(`clientes e agenda ${width}px (synthetic, local only)`, async ({ page }) => {
    const { mockSegmentPlatform } = await import('./segment-platform-fixtures');
    const { state, initialBusiness } = await mockSegmentPlatform(page, { initial: 'nutrition' });
    const records = state.stores.get(initialBusiness.id)!.lists;
    records.clients.push({ id: 'client-local', store_id: initialBusiness.id, name: 'Cliente sintético com nome longo para testar leitura', active: true });
    records.services.push({ id: 'service-local', store_id: initialBusiness.id, name: 'Atendimento sintético de teste', kind: 'general', duration_minutes: 60, price_cents: 12000, active: true });
    records.appointments.push({ id: 'appointment-local', store_id: initialBusiness.id, client_id: 'client-local', service_id: 'service-local', starts_at: '2027-02-02T13:00:00Z', ends_at: '2027-02-02T14:00:00Z', status: 'scheduled' });
    await page.setViewportSize({ width, height: 844 });
    for (const tab of ['clients', 'appointments']) {
      await page.goto(`/admin/operacao?tab=${tab}`);
      await expect(page.locator('.business-record-list')).toBeVisible();
      if (tab === 'appointments' && stage === 'after') {
        await page.getByRole('searchbox', { name: 'Buscar registros' }).fill('Agendado');
        await expect(page.locator('.business-record-list')).toBeVisible();
        await expect(page.locator('.business-record-list')).toContainText('Agendado');
      }
      await expect(page.locator('#foodweb-splash-screen')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: `${screenshotDir}/${stage}-${tab}-${width}.png`, fullPage: true });
    }
    expect(state.writes).toHaveLength(0);
  });
}
