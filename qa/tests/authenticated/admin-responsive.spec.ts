import { test } from '@playwright/test';
import { adminAuth, assertNoDocumentOverflow, discoverInternalRoutes, hasAdminAuth, qaConfig, waitForStablePage } from '../helpers/project';

if (hasAdminAuth) {
  test.describe('responsividade Admin autenticado', () => {
    test.use({ storageState: adminAuth });
    test('rotas Admin não causam overflow do documento', async ({ page }) => {
      await page.goto(qaConfig.adminStart);
      const routes = await discoverInternalRoutes(page, qaConfig.adminStart, '/admin');
      for (const viewport of [{width:390,height:844},{width:768,height:1024},{width:1024,height:768},{width:1366,height:768}]) {
        await page.setViewportSize(viewport);
        for (const route of routes) {
          await page.goto(route);
          await waitForStablePage(page);
          await assertNoDocumentOverflow(page, `${route} @ ${viewport.width}`);
        }
      }
    });
  });
} else {
  test('responsividade Admin autenticado', async () => { test.skip(true, 'Capture a sessão Admin antes deste teste.'); });
}
