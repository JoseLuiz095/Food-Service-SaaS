import { test, expect } from '@playwright/test';
import { assertImagesLoaded, assertNoDocumentOverflow, masksFor, publicRoutes, runtimeGuard, safeName, waitForStablePage } from '../helpers/project';

const visualViewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1366, height: 768 }
];

for (const route of publicRoutes()) {
  for (const viewport of visualViewports) {
    test(`visual ${viewport.name} ${route}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const finishGuard = runtimeGuard(page, testInfo);
      await page.goto(route);
      await waitForStablePage(page);
      await assertNoDocumentOverflow(page, `${route} @ ${viewport.name}`);
      await assertImagesLoaded(page, route);
      await expect(page).toHaveScreenshot(`${safeName(route)}-${viewport.name}.png`, {
        fullPage: true,
        mask: masksFor(page),
        animations: 'disabled',
        caret: 'hide'
      });
      await finishGuard();
    });
  }
}
