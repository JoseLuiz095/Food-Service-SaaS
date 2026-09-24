import { test, expect } from '@playwright/test';
import { qaConfig, runtimeGuard, waitForStablePage } from '../helpers/project';

test('landing abre e possui navegação principal', async ({ page }, testInfo) => {
  const finishGuard = runtimeGuard(page, testInfo);
  await page.goto('/');
  await waitForStablePage(page);
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('a[href]').first()).toBeVisible();
  await finishGuard();
});

test('vitrine QA abre produto sem executar compra', async ({ page }, testInfo) => {
  test.skip(!qaConfig.storeSlug, 'Defina storeSlug em qa.config.json para validar a vitrine.');
  const finishGuard = runtimeGuard(page, testInfo);
  await page.goto(`/${qaConfig.storeSlug}`);
  await waitForStablePage(page);
  const productLink = page.locator('a[href*="/produto/"]').first();
  test.skip((await productLink.count()) === 0, 'A loja QA não possui produto público clicável.');
  await productLink.click();
  await waitForStablePage(page);
  await expect(page.locator('body')).toBeVisible();
  expect(page.url()).toContain('/produto/');
  await finishGuard();
});
