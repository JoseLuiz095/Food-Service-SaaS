import { test, expect } from '@playwright/test';
import { adminAuth, discoverInternalRoutes, hasAdminAuth, hasMasterAuth, masterAuth, masksFor, qaConfig, safeName, waitForStablePage } from '../helpers/project';

if (hasAdminAuth) {
  test.describe('visual Admin autenticado', () => {
    test.use({ storageState: adminAuth });
    test('crawler visual do Admin', async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.goto(qaConfig.adminStart);
      const routes = await discoverInternalRoutes(page, qaConfig.adminStart, '/admin');
      for (const route of routes) {
        await page.goto(route);
        await waitForStablePage(page);
        await expect.soft(page).toHaveScreenshot(`admin-${safeName(route)}.png`, { fullPage: true, mask: masksFor(page) });
      }
    });
  });
} else {
  test('visual Admin autenticado', async () => { test.skip(true, 'Capture qa/.auth/admin.json com npm run qa:auth:admin'); });
}

if (hasMasterAuth) {
  test.describe('visual Master autenticado', () => {
    test.use({ storageState: masterAuth });
    test('crawler visual do Master', async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.goto(qaConfig.masterStart);
      const routes = await discoverInternalRoutes(page, qaConfig.masterStart, '/admin-master');
      for (const route of routes) {
        await page.goto(route);
        await waitForStablePage(page);
        await expect.soft(page).toHaveScreenshot(`master-${safeName(route)}.png`, { fullPage: true, mask: masksFor(page) });
      }
    });
  });
} else {
  test('visual Master autenticado', async () => { test.skip(true, 'Capture qa/.auth/master.json com npm run qa:auth:master'); });
}
