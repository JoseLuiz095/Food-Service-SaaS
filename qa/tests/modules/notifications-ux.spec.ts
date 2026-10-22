import { test, expect } from '@playwright/test';
import { mockBackend, STORE, USER, store } from './fixtures';

for (const width of [390, 1366]) {
  test(`central de avisos informa bloqueio e fecha por teclado em ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await mockBackend(page, { auth: true });
    await page.addInitScript(() => {
      Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'denied' } });
    });
    await page.goto('/admin/pedidos');
    const trigger = page.getByRole('button', { name: 'Abrir diagnóstico de notificações', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Diagnóstico de notificações' });
    await expect(dialog.getByRole('button', { name: 'Fechar diagnóstico' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Enviar notificação de teste' }).click();
    await expect(dialog.getByRole('alert')).toContainText('bloqueadas');
    await expect(dialog.getByText(/Último sinal/)).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`avisos-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}

test('central não confirma entrega quando o navegador rejeita a notificação', async ({ page }) => {
  await mockBackend(page, { auth: true });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Notification', { configurable: true, value: class {
      static permission = 'granted';
      constructor() { throw new Error('Falha do dispositivo'); }
    } });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined });
  });
  await page.goto('/admin/pedidos');
  await page.getByRole('button', { name: 'Abrir diagnóstico de notificações', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Diagnóstico de notificações' });
  await dialog.getByRole('button', { name: 'Enviar notificação de teste' }).click();
  await expect(dialog.getByRole('alert')).toContainText('não confirmou');
  await expect(dialog.getByText(/Último sinal/)).toHaveCount(0);
});

test('troca entre comércio e serviços limpa o diagnóstico da loja anterior', async ({ page }) => {
  await mockBackend(page, { auth: true });
  const otherStoreId = '00000000-0000-4000-8000-000000000002';
  const stores = [
    { ...store, name: 'Comércio teste', visual_theme: { businessSegment: 'retail' } },
    { ...store, id: otherStoreId, slug: 'servicos-teste', name: 'Serviços teste', visual_theme: { businessSegment: 'services' } },
  ];
  await page.route(/\/rest\/v1\/food_store_users(?:\?|$)/, route => route.fulfill({ json: stores.map((item, i) => ({
    id: `${USER.slice(0, -1)}${i + 1}`, user_id: USER, store_id: item.id, role: 'owner', active: true,
  })) }));
  await page.route(/\/rest\/v1\/food_stores(?:\?|$)/, route => {
    const filter = new URL(route.request().url()).searchParams.get('id');
    return route.fulfill({ json: filter?.startsWith('eq.') ? stores.filter(item => filter === `eq.${item.id}`) : stores });
  });
  await page.addInitScript(() => Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'denied' } }));
  await page.goto('/admin/pedidos');
  await expect(page.getByLabel('Loja ativa')).toHaveValue(STORE);
  await page.getByRole('button', { name: 'Abrir diagnóstico de notificações', exact: true }).click();
  await page.getByRole('button', { name: 'Enviar notificação de teste' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByLabel('Loja ativa').selectOption(otherStoreId);
  await expect(page.getByLabel('Loja ativa')).toHaveValue(otherStoreId);
  await page.getByRole('button', { name: 'Abrir diagnóstico de notificações', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Diagnóstico de notificações' });
  await expect(dialog.getByRole('button', { name: 'Enviar notificação de teste' })).toBeEnabled();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByText(/Último sinal/)).toHaveCount(0);
});
