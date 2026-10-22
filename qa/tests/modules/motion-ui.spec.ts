import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockBackend } from './fixtures';

for (const width of [390, 1366]) {
  test(`vitrine: movimento discreto, teclado e redução de movimento em ${width}px`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    const { writes } = await mockBackend(page);
    await page.goto('/doce-lua');
    const categories = page.getByRole('navigation', { name: 'Categorias', exact: true });
    const category = categories.getByRole('button', { name: 'Doces', exact: true });
    await category.focus();
    await page.keyboard.press('Enter');
    await expect(category).toBeFocused();
    await expect(category).toHaveAttribute('aria-pressed', 'true');
    await expect(categories.getByRole('button', { name: 'Início', exact: true })).toHaveAttribute('aria-pressed', 'false');
    const heading = page.locator('.storefront-filter-heading');
    await expect(heading).toHaveCSS('animation-name', 'storefront-filter-change');
    const search = page.getByRole('textbox', { name: 'Buscar no cardápio', exact: true });
    await search.fill('Brigadeiro');
    await expect(search).toBeFocused();
    await expect(page.locator('.product-card')).toHaveCount(1);
    await expect(page.locator('.product-card')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`vitrine-motion-${width}.png`) });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(heading).toHaveCSS('animation-name', 'none');
    await expect(page.locator('.store-route-view')).toHaveCSS('animation-name', 'none');
    const card = page.locator('.product-card');
    await card.hover();
    await expect(card).toHaveCSS('transform', 'none');
    expect((await new AxeBuilder({ page }).include('.category-strip').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(writes.some(call => call.url.endsWith('/food-public-checkout'))).toBe(false);
    expect(errors).toEqual([]);
  });
}

test('prévia comercial mantém conteúdo e foco sem movimento espacial obrigatório', async ({ page }) => {
  await mockBackend(page);
  await page.route('**/rest/v1/rpc/food_get_public_landing_v1', route => route.fulfill({ json: { stores: [], plans: [], demo_enabled: true, demo_duration_days: 14, contact_protected: true } }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const operation = page.locator('.commercial-experience').getByRole('button', { name: 'Operação', exact: true });
  await operation.focus();
  await page.keyboard.press('Enter');
  await expect(operation).toBeFocused();
  await expect(page.locator('.business-journey__operation')).toBeVisible();
  await expect(page.locator('.business-journey__scene')).toHaveCSS('animation-name', 'none');
});
