import { test, expect } from '@playwright/test';
import { mockBackend } from './fixtures';

const report = { storefrontSessions: 1000, productViews: 800, productViewSessions: 700,
  addToCartSessions: 500, checkoutSessions: 400, orderSessions: 317, orders: 330,
  conversionRate: 31.7, cartAbandonmentRate: 36.6, checkoutAbandonmentRate: 20.75,
  whatsappClicks: 200, whatsappRate: 60.6, revenue: 3300, averageTicket: 10,
  topProducts: [], viewedNotSold: [] };

for (const width of [320, 390, 768, 1366]) test(`admin enxuto e ajuda acessível ${width}px`, async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width, height: 900 });
  await mockBackend(page, { auth: true });
  await page.route('**/rest/v1/rpc/food_get_store_analytics_v1', r => r.fulfill({ json: report }));
  await page.goto('/admin/analytics');
  await expect(page.getByText('317 de 1000 sessões geraram pedido')).toBeVisible();
  const conversion = page.locator('.analytics-commercial-kpi').filter({ hasText: 'Conversão vitrine' });
  await expect(conversion).toContainText('31.7%');
  await page.getByRole('button', { name: 'Como a conversão é calculada', exact: true }).focus();
  await page.keyboard.press('Enter');
  const note = page.locator('.info-hint__content').filter({ hasText: 'Sessões que geraram pedido ÷' });
  await expect(note).toBeVisible();
  const box = await note.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= width).toBeTruthy();
  await page.keyboard.press('Escape');
  await expect(note).toBeHidden();
  await expect(page.locator('.analytics-operational-details')).not.toHaveAttribute('open');
  await page.locator('.analytics-operational-details > summary').click({ position: { x: 20, y: 20 } });
  await expect(page.getByRole('heading', { name: 'Pedidos por dia da semana', exact: true })).toHaveCount(1);
  await page.locator('.analytics-operational-details > summary').click({ position: { x: 20, y: 20 } });
  await page.getByRole('heading', { name: 'Desempenho comercial', exact: true }).click();
  await page.screenshot({ path: info.outputPath(`analytics-${width}.png`), fullPage: true });
  for (const [route] of [['categorias', 'Categorias'], ['entregas', 'Áreas de entrega'], ['produtos', 'Catálogo'], ['configuracoes', 'Configurações'], ['financeiro', 'Financeiro'], ['plano', 'Meu plano']]) {
    await page.goto(`/admin/${route}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).not.toContainText('Carregando');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route).toBe(true);
    await page.screenshot({ path: info.outputPath(`${route}-${width}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('ausência de telemetria e módulo ausente não fingem conversão zero', async ({ page }) => {
  await mockBackend(page, { auth: true });
  let missing = false;
  await page.route('**/rest/v1/rpc/food_get_store_analytics_v1', r => r.fulfill(missing
    ? { status: 404, json: { code: 'PGRST202', message: 'Could not find food_get_store_analytics_v1 in schema cache' } }
    : { json: { ...report, storefrontSessions: 0, orderSessions: 0, conversionRate: 0 } }));
  await page.goto('/admin/analytics');
  await expect(page.getByText('Sem sessões registradas no período')).toBeVisible();
  await expect(page.locator('.analytics-commercial-kpi').filter({ hasText: 'Conversão vitrine' }).locator('strong')).toHaveText('—');
  missing = true;
  await page.getByLabel('Período dos indicadores').selectOption('7');
  await expect(page.getByText('O módulo de Analytics de conversão ainda não está ativo no banco desta instalação.')).toBeVisible();
  await expect(page.locator('.analytics-commercial-kpi')).toHaveCount(0);
});

test('editar categoria preserva detalhes recolhidos no envio', async ({ page }) => {
  const { writes } = await mockBackend(page, { auth: true });
  await page.goto('/admin/categorias');
  await page.locator('.category-modern-list button[title="Editar"]').first().click();
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Doces');
  await expect(page.locator('.category-form details')).not.toHaveAttribute('open');
  await page.getByLabel('Nome', { exact: true }).fill('Doces da loja');
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect.poll(() => writes.filter(w => w.url.endsWith('/food_categories')).length).toBeGreaterThan(0);
  const saved = writes.filter(w => w.url.endsWith('/food_categories')).at(-1)!.body;
  const row = Array.isArray(saved) ? saved[0] : saved;
  expect(row.name).toBe('Doces da loja');
  expect(row.slug).toBe('doces');
  expect(row.sort_order).toBe(1);
  expect(row.active).toBe(true);
});
