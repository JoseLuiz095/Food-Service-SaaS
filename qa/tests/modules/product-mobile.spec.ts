import { test, expect } from '@playwright/test';
import { mockBackend } from './fixtures';

test('produto mantém navegação e compra acessíveis em 320px', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await mockBackend(page);
  await page.goto('/doce-lua/produto/brigadeiro-teste');
  await expect(page.getByRole('button', { name: 'Adicionar ao carrinho', exact: true })).toBeVisible();
  await expect(page.locator('#foodweb-splash-screen')).toHaveCount(0);
  const metrics = await page.evaluate(() => ({
    width: innerWidth,
    body: document.body.scrollWidth,
    overflow: [...document.querySelectorAll('body *')].filter(element => {
      const box = element.getBoundingClientRect();
      return box.width && (box.right > innerWidth + 3 || box.left < -3 || element.scrollWidth > element.clientWidth + 3);
    }).map(element => ({ tag: element.tagName, className: element.className, scroll: element.scrollWidth, client: element.clientWidth, text: element.textContent?.slice(0, 90) })),
  }));
  await testInfo.attach('overflow', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
  expect(metrics.body, JSON.stringify(metrics.overflow)).toBeLessThanOrEqual(metrics.width + 3);
  await page.screenshot({ path: testInfo.outputPath('produto-320.png'), fullPage: true });
  await page.getByRole('button', { name: 'Adicionar ao carrinho', exact: true }).click();
  await expect(page.locator('.cart-item')).toHaveCount(1);
});
