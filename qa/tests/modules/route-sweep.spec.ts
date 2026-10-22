import { test, expect, type Page } from '@playwright/test';
import { assertNoDocumentOverflow, waitForStablePage } from '../helpers/project';
import { mockBackend } from './fixtures';

test.setTimeout(180_000);

const publicRoutes = [
  '/', '/cadastro?plan=DEMO', '/cadastro/confirmar', '/admin/login',
  '/admin/esqueci-senha', '/admin/redefinir-senha', '/admin-master/login',
  '/doce-lua', '/doce-lua/produto/brigadeiro-teste', '/doce-lua/carrinho', '/doce-lua/finalizar',
];
const adminRoutes = [
  '/admin', '/admin/primeiros-passos', '/admin/analytics', '/admin/financeiro', '/admin/produtos',
  '/admin/estoque', '/admin/produtos/novo', '/admin/categorias', '/admin/pedidos', '/admin/entregas',
  '/admin/configuracoes', '/admin/plano', '/admin/modulos',
];
const masterRoutes = [
  '/admin-master', '/admin-master/lojas', '/admin-master/solicitacoes', '/admin-master/planos',
  '/admin-master/pagamentos', '/admin-master/diagnostico', '/admin-master/modulos',
];
const viewports = [
  { name: 'mobile', width: 320, height: 700 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1366, height: 768 },
];

async function verifyRoutes(page: Page, routes: string[], label: string) {
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const route of routes) {
      await page.goto(route);
      await waitForStablePage(page);
      await expect(page.locator('body')).not.toBeEmpty();
      await assertNoDocumentOverflow(page, `${label} ${route} @ ${viewport.width}px`);
    }
  }
}

test('telas públicas não apresentam overflow nos formatos principais', async ({ page }) => {
  await mockBackend(page);
  await verifyRoutes(page, publicRoutes, 'Público');
});

test('telas da loja não apresentam overflow nos formatos principais', async ({ page }) => {
  await mockBackend(page, { auth: true });
  await verifyRoutes(page, adminRoutes, 'Admin');
});

test('telas do Admin Master não apresentam overflow nos formatos principais', async ({ page }) => {
  await mockBackend(page, { auth: true, master: true });
  await verifyRoutes(page, masterRoutes, 'Master');
});
