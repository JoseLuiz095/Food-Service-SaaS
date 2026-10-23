import { expect, test, type Page } from '@playwright/test';
import { mockSegmentPlatform, testBusinesses } from './segment-platform-fixtures';
import { store } from './fixtures';

const food = testBusinesses.find(item => item.segment === 'food')!;
const retail = testBusinesses.find(item => item.segment === 'retail')!;
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
};
// Preserve the provider across route transitions, as BrowserRouter does on
// back/forward navigation. A full page.goto would hide the cache regression.
const navigate = (page: Page, path: string) => page.evaluate(path => {
  history.pushState({}, '', path);
  dispatchEvent(new PopStateEvent('popstate'));
}, path);

test('troca de negócio retira identidade e catálogo anteriores enquanto carrega', async ({ page }) => {
  await mockSegmentPlatform(page, { initial: 'food' });
  const gate = deferred();
  const requested = deferred();
  await page.route('**/rest/v1/food_products?**', async route => {
    if (new URL(route.request().url()).searchParams.get('store_id') !== `eq.${retail.id}`) return route.fallback();
    requested.resolve();
    await gate.promise;
    return route.fallback();
  });
  await page.goto('/admin/produtos');
  await expect(page.locator('.admin-store-mini strong')).toHaveText(food.name);
  await expect(page.getByText(`Oferta fictícia · ${food.name}`, { exact: true }).first()).toBeVisible();
  await page.getByLabel('Loja ativa').selectOption(retail.id);
  await requested.promise;
  await expect(page.locator('.admin-store-mini strong')).toBeEmpty();
  await expect(page.getByText(`Oferta fictícia · ${food.name}`, { exact: true })).toHaveCount(0);
  gate.resolve();
  await expect(page.locator('.admin-store-mini strong')).toHaveText(retail.name);
  await expect(page.getByText(`Oferta fictícia · ${retail.name}`, { exact: true }).first()).toBeVisible();
});

test('retornar da vitrine de outra loja restaura o catálogo administrativo correto', async ({ page }) => {
  await mockSegmentPlatform(page, { initial: 'food' });
  await page.goto('/admin/produtos');
  await expect(page.locator('.admin-store-mini strong')).toHaveText(food.name);
  await navigate(page, `/${retail.slug}`);
  await expect(page.locator('.product-card').first()).toContainText(`Oferta fictícia · ${retail.name}`);
  await navigate(page, '/admin/produtos');
  await expect(page.locator('.admin-store-mini strong')).toHaveText(food.name);
  await expect(page.getByText(`Oferta fictícia · ${food.name}`, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(`Oferta fictícia · ${retail.name}`, { exact: true })).toHaveCount(0);
});

test('resposta tardia ao salvar configurações não sobrescreve a loja selecionada', async ({ page }) => {
  await mockSegmentPlatform(page, { initial: 'food' });
  const gate = deferred();
  const requested = deferred();
  let saved: Record<string, unknown> | null = null;
  await page.route('**/rest/v1/food_stores?**', async route => {
    const request = route.request();
    const id = new URL(request.url()).searchParams.get('id');
    if (id !== `eq.${food.id}`) return route.fallback();
    if (request.method() === 'PATCH') {
      saved = { ...store, ...request.postDataJSON(), id: food.id, slug: food.slug };
      requested.resolve();
      await gate.promise;
      return route.fulfill({ json: [saved] });
    }
    return saved ? route.fulfill({ json: [saved] }) : route.fallback();
  });
  await page.goto('/admin/configuracoes');
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue(food.name);
  await page.getByLabel('Nome', { exact: true }).fill('Nome salvo no negócio anterior');
  await page.getByRole('button', { name: 'Salvar configurações', exact: true }).click();
  await requested.promise;
  await page.getByLabel('Loja ativa').selectOption(retail.id);
  await expect(page.locator('.admin-store-mini strong')).toHaveText(retail.name);
  const persisted = page.waitForResponse(response => response.request().method() === 'GET'
    && response.url().includes(`/food_stores?id=eq.${food.id}&select=*`));
  gate.resolve();
  await persisted;
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue(retail.name);
  await expect(page.locator('.admin-store-mini strong')).toHaveText(retail.name);
});
