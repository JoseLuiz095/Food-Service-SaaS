import { expect, test } from '@playwright/test';
import { mockBackend } from './fixtures';

test('produto simples entra no carrinho pela vitrine e pode ser ajustado no checkout', async ({ page }) => {
  const { writes } = await mockBackend(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/doce-lua');

  const add = page.getByRole('button', { name: 'Adicionar Brigadeiro teste ao carrinho', exact: true });
  await expect(add).toBeVisible();
  await add.click();
  await expect(page.getByRole('button', { name: 'Adicionar Brigadeiro teste ao carrinho, 1 no carrinho' })).toBeVisible();
  await expect(page.locator('.mobile-cart-dock')).toContainText('10,00');

  await page.locator('.mobile-cart-dock').click();
  await expect(page).toHaveURL(/\/finalizar$/);
  const summary = page.locator('.checkout-items-mini>div').first();
  await summary.getByRole('button', { name: 'Aumentar quantidade' }).click();
  await expect(summary).toContainText('2x Brigadeiro teste');
  await expect(page.locator('.checkout-summary .summary-total')).toContainText('20,00');
  await summary.getByRole('button', { name: 'Diminuir quantidade' }).click();
  await expect(summary).toContainText('1x Brigadeiro teste');
  expect(writes.some((call) => call.url.includes('food-public-checkout'))).toBe(false);
});
