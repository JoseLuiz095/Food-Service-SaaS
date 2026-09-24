import { test, expect } from '@playwright/test';
import { assertImagesLoaded, publicRoutes, runtimeGuard, waitForStablePage } from '../helpers/project';

for (const route of publicRoutes()) {
  test(`smoke público ${route}`, async ({ page }, testInfo) => {
    const finishGuard = runtimeGuard(page, testInfo);
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect.soft(response?.status() ?? 200, `HTTP de ${route}`).toBeLessThan(500);
    await waitForStablePage(page);
    await expect(page.locator('body')).toBeVisible();
    await assertImagesLoaded(page, route);
    await finishGuard();
  });
}
