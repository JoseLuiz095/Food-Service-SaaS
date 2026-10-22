import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockBackend } from './fixtures';
import { assertNoDocumentOverflow } from '../helpers/project';

for (const width of [320, 768, 1024, 1440]) {
  test(`comercial, cadastro e checkout refinados em ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 960 });
    const { writes } = await mockBackend(page);
    await page.route('**/rest/v1/rpc/food_get_public_landing_v1', route => route.fulfill({ json: {
      stores: [], plans: [], demo_enabled: true, demo_duration_days: 14,
      demo_store_slug: 'doce-lua', contact_protected: true,
    } }));
    await page.goto('/');
    await expect(page.locator('.commercial-experience')).toBeVisible();
    const steps = page.locator('.commercial-experience .business-journey__steps');
    await steps.getByRole('button', { name: 'Pedido', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.business-journey__order')).toBeVisible();
    await steps.getByRole('button', { name: 'Operação', exact: true }).click();
    await expect(page.locator('.business-journey__operation')).toBeVisible();
    await assertNoDocumentOverflow(page, `Comercial ${width}`);
    const axe = await new AxeBuilder({ page }).include('.commercial-experience').analyze();
    expect(axe.violations).toEqual([]);
    if (width === 320 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`comercial-${width}.png`) });

    await page.goto('/cadastro?segment=printing3d');
    await page.getByLabel('Nome do estabelecimento', { exact: true }).fill('Ateliê de projetos personalizados e presentes');
    await expect(page.locator('.signup-live-preview .business-journey__identity')).toContainText('Ateliê de projetos personalizados e presentes');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.signup-live-preview .business-journey__scene')).toHaveCSS('animation-name', 'none');
    await assertNoDocumentOverflow(page, `Cadastro ${width}`);
    const storefrontCalls = writes.filter(call => call.url.endsWith('/food_get_public_storefront_v1'));
    expect(storefrontCalls).toHaveLength(0);
    if (width === 320 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`cadastro-${width}.png`) });

    await page.goto('/doce-lua/produto/brigadeiro-teste');
    await page.getByRole('button', { name: 'Adicionar ao carrinho', exact: true }).click();
    await page.goto('/doce-lua/finalizar');
    await page.getByRole('button', { name: /Retirada Buscar/ }).click();
    const pix = page.getByRole('button', { name: /^PIX/ });
    await pix.click();
    await expect(pix).toHaveAttribute('aria-pressed', 'true');
    const summary = page.locator('.checkout-items-mini>div').first();
    const nameBox = await summary.locator(':scope>span').boundingBox();
    const priceBox = await summary.locator(':scope>strong').boundingBox();
    expect(nameBox).not.toBeNull(); expect(priceBox).not.toBeNull();
    expect(priceBox!.x - nameBox!.x - nameBox!.width).toBeGreaterThanOrEqual(10);
    await assertNoDocumentOverflow(page, `Checkout ${width}`);
    if (width === 320 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`checkout-${width}.png`), fullPage: true });
    expect(writes.filter(call => call.url.endsWith('/food-public-checkout'))).toHaveLength(0);
    expect(errors).toEqual([]);
  });
}
