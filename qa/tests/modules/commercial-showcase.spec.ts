import { test, expect } from '@playwright/test';
import { mockBackend } from './fixtures';

const examples = [
  { id: 'food', label: 'Alimentação', company: 'Sabor da Vila', item: 'Prato da casa', mode: 'cart' },
  { id: 'florist', label: 'Floricultura', company: 'Jardim Encantado', item: 'Buquê Afeto', mode: 'cart' },
  { id: 'retail', label: 'Comércio geral', company: 'Loja Horizonte', item: 'Caderno Horizonte', mode: 'cart' },
  { id: 'rentals', label: 'Serviços e locações', company: 'Festa Nuvem', item: 'Pula-pula para festa', mode: 'booking' },
  { id: 'personal', label: 'Personal trainer', company: 'Movimento Ativo', item: 'Consultoria individual', mode: 'booking' },
  { id: 'nutrition', label: 'Nutricionista', company: 'Equilíbrio Nutri', item: 'Consulta inicial', mode: 'booking' },
  { id: 'creator', label: 'Influenciador digital', company: 'Studio Prisma', item: 'Guia de conteúdo criativo', mode: 'cart' },
] as const;

for (const width of [390, 1366]) {
  for (const example of examples) {
    test(`demonstração ${example.id} completa fluxo local em ${width}px`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      const { writes } = await mockBackend(page);
      await page.route('**/rest/v1/rpc/food_get_public_landing_v1', route => route.fulfill({ json: {
        stores: [], plans: [], demo_enabled: true, demo_duration_days: 14, demo_store_slug: 'vitrine-teste', contact_protected: true,
      } }));
      await page.goto('/');
      await expect(page.locator('#foodweb-splash-screen')).toHaveCount(0);
      const selectors = page.getByRole('group', { name: 'Escolha o segmento da demonstração' });
      await selectors.getByRole('button', { name: example.label, exact: true }).click();
      const workbench = page.locator(`.segment-workbench--${example.id}`);
      await expect(workbench.getByText(example.company, { exact: true })).toBeVisible();
      if (width < 500) await workbench.getByRole('button', { name: 'Visualizar mobile', exact: true }).click();
      await expect(workbench.locator('.lab-device')).toHaveClass(new RegExp(width < 500 ? 'lab-device--mobile' : 'lab-device--desktop'));
      await expect(workbench.getByRole('link', { name: 'Começar com este segmento' })).toHaveAttribute('href', `/cadastro?plan=DEMO&segment=${example.id}`);
      await workbench.screenshot({ path: testInfo.outputPath(`${example.id}-${width}-vitrine.png`) });
      if (example.id === 'food') await page.screenshot({ path: testInfo.outputPath(`comercial-${width}.png`), fullPage: true });

      if (example.mode === 'cart') {
        if (example.id === 'creator') {
          await workbench.getByRole('button', { name: /Conhecer meu portfólio/ }).click();
          await expect(workbench.getByRole('status')).toContainText('Acesso fictício');
        }
        await workbench.getByRole('button', { name: `Adicionar ${example.item} ao exemplo`, exact: true }).click();
        if (example.id === 'food') await workbench.getByRole('checkbox', { name: /Adicionar queijo extra/ }).check();
        if (example.id === 'florist') {
          await workbench.getByLabel('Mensagem do cartão', { exact: true }).fill('Um presente fictício para você');
          await workbench.getByLabel('Entrega desejada', { exact: true }).selectOption('Próxima semana');
        }
        await workbench.getByRole('button', { name: 'Simular pedido', exact: true }).click();
        await expect(workbench.locator('.lab-order')).toContainText(example.item);
        if (example.id === 'food') await expect(workbench.locator('.lab-order')).toContainText('36,00');
        if (example.id === 'florist') await expect(workbench.locator('.lab-order')).toContainText('Próxima semana · Cartão: Um presente fictício');
        if (example.id === 'creator') {
          await expect(workbench.locator('.lab-admin-metrics')).toContainText('01');
          await workbench.getByLabel('Nome da campanha', { exact: true }).fill('Lançamento fictício');
          await workbench.getByRole('button', { name: 'Criar', exact: true }).click();
          const campaign = workbench.locator('.lab-campaign-list>div').filter({ hasText: 'Lançamento fictício' });
          await campaign.getByRole('button', { name: 'Concluir', exact: true }).click();
          await expect(campaign).toContainText('Tarefa concluída');
        }
      } else {
        await workbench.getByRole('button', { name: 'Reservar horário de exemplo', exact: true }).click();
        await expect(workbench.locator('.lab-order')).toContainText(example.item);
        await expect(workbench.locator('.lab-order')).toContainText('A confirmar');
        if (example.id === 'personal' || example.id === 'nutrition') {
          await workbench.getByLabel('Nome fictício', { exact: true }).fill('Lia Exemplo');
          await workbench.getByRole('button', { name: 'Adicionar', exact: true }).click();
          await expect(workbench.locator('.lab-contact-list')).toContainText('Lia Exemplo');
          if (example.id === 'personal') {
            await workbench.getByRole('button', { name: 'Salvar rotina de exemplo', exact: true }).click();
            await expect(workbench.locator('.lab-contact-list')).toContainText('Rotina de exemplo salva');
          }
          if (example.id === 'nutrition') await expect(workbench.getByText(/Nenhum prontuário ou dado clínico/)).toBeVisible();
        }
      }
      await workbench.screenshot({ path: testInfo.outputPath(`${example.id}-${width}-painel.png`) });
      if (example.mode === 'booking') {
        await workbench.getByRole('group', { name: 'Visão da demonstração' }).getByRole('button', { name: 'Vitrine', exact: true }).click();
        await expect(workbench.getByRole('button', { name: /09:00.*Reservado/ })).toBeDisabled();
        await workbench.getByRole('button', { name: '11:00', exact: true }).click();
        await expect(workbench.getByRole('button', { name: 'Reservar horário de exemplo', exact: true })).toBeEnabled();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
      expect(writes.filter(write => /food-public-checkout|food_business_command|food-modules-public|food_modules_command/.test(write.url))).toHaveLength(0);
      expect(errors).toEqual([]);
    });
  }
}

test('trocar segmento zera dados locais e a prévia funciona em 320px com movimento reduzido', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockBackend(page);
  await page.route('**/rest/v1/rpc/food_get_public_landing_v1', route => route.fulfill({ json: { stores: [], plans: [], demo_enabled: true, demo_duration_days: 14 } }));
  await page.goto('/');
  const selectors = page.getByRole('group', { name: 'Escolha o segmento da demonstração' });
  await selectors.getByRole('button', { name: 'Alimentação', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar Prato da casa ao exemplo', exact: true }).click();
  await expect(page.locator('.lab-cart')).toBeVisible();
  await selectors.getByRole('button', { name: 'Floricultura', exact: true }).click();
  await expect(page.locator('.lab-cart')).toHaveCount(0);
  await selectors.getByRole('button', { name: 'Alimentação', exact: true }).click();
  await expect(page.locator('.lab-cart')).toHaveCount(0);
  await expect(page.locator('.lab-screen')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.commercial-modules-v2__heading h2')).toHaveCSS('color', 'rgb(42, 66, 45)');
  const moduleDetails = page.locator('.commercial-modules-v2__grid details').first();
  await moduleDetails.locator('summary').click();
  await expect(moduleDetails).toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Visualizar mobile', exact: true }).click();
  await expect(page.locator('.lab-device')).toHaveClass(/lab-device--mobile/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('comercial-320-reduced-motion.png'), fullPage: true });
});
