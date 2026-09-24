import { test } from '@playwright/test';
import { assertNoDocumentOverflow, publicRoutes, runtimeGuard, waitForStablePage } from '../helpers/project';

const viewports = [
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'notebook-1366', width: 1366, height: 768 },
  { name: 'desktop-1920', width: 1920, height: 1080 }
];

for (const route of publicRoutes()) {
  for (const viewport of viewports) {
    test(`responsivo ${viewport.name} ${route}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const finishGuard = runtimeGuard(page, testInfo);
      await page.goto(route);
      await waitForStablePage(page);
      await assertNoDocumentOverflow(page, route);
      await finishGuard();
    });
  }
}
