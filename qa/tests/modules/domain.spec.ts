import { expect, test, type Page } from '@playwright/test';
import { mockBackend, STORE } from './fixtures';

const canonical = 'https://www.vendeweb.com.br';
const legacy = 'https://foodweb.joseluizacama.workers.dev';

// Serve o bundle local sob os hostnames reais sem modificar DNS nem produção.
async function servePlatformHosts(page: Page, interceptDestination = false) {
  await mockBackend(page);
  await page.route('**/rest/v1/rpc/food_get_public_landing_v1', route => route.fulfill({ json: {
    stores: [], plans: [], demo_enabled: true, demo_duration_days: 14, demo_store_slug: 'doce-lua', contact_protected: true,
  } }));
  await page.route(/^https:\/\/(?:www\.)?vendeweb\.com\.br\/|^https:\/\/foodweb\.joseluizacama\.workers\.dev\//, async route => {
    const url = new URL(route.request().url());
    if (interceptDestination && url.origin === canonical && route.request().isNavigationRequest()) {
      await route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><main>Destino canônico</main>' });
      return;
    }
    const response = await route.fetch({ url: `http://127.0.0.1:5174${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
}

test('domínio www mostra a página comercial e apex converge para ele', async ({ page }) => {
  await servePlatformHosts(page);
  await page.goto('https://vendeweb.com.br/');
  await expect(page).toHaveURL(`${canonical}/`);
  await expect(page.locator('.food-sales-page')).toBeVisible();
  await expect(page.getByText('Loja não encontrada ou sem permissão.', { exact: true })).toHaveCount(0);
});

test('link antigo conserva caminho da loja, parâmetros e fragmento', async ({ page }) => {
  await servePlatformHosts(page);
  await page.goto(`${legacy}/doce-lua?utm_source=whatsapp&ref=loja#cardapio`);
  await expect(page).toHaveURL(`${canonical}/doce-lua?utm_source=whatsapp&ref=loja#cardapio`);
  await expect(page.getByText('Brigadeiro teste', { exact: true }).first()).toBeVisible();
});

test('callback Auth preserva query/hash antes de montar providers na origem antiga', async ({ page }) => {
  await servePlatformHosts(page, true);
  const oldOriginRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('.supabase.co') && request.headers().referer?.startsWith(legacy)) oldOriginRequests.push(request.url());
  });
  const suffix = '/admin/redefinir-senha?code=example-code#access_token=example-token&type=recovery';
  await page.goto(`${legacy}${suffix}`);
  await expect(page).toHaveURL(`${canonical}${suffix}`);
  await expect(page.getByText('Destino canônico')).toBeVisible();
  expect(oldOriginRequests).toEqual([]);
});

test('carrinho e rascunho existentes mantêm a jornada na origem antiga', async ({ page }) => {
  await page.addInitScript(storeId => {
    localStorage.setItem(`foodservice_cart_v1:${storeId}`, JSON.stringify([{ id: 'item', productId: 'product', quantity: 1, options: [] }]));
    localStorage.setItem(`foodweb_checkout_draft_v1:${storeId}`, JSON.stringify({ notes: 'Rascunho local' }));
  }, STORE);
  await servePlatformHosts(page);
  await page.goto(`${legacy}/doce-lua`);
  await expect(page.getByText('Brigadeiro teste', { exact: true }).first()).toBeVisible();
  await expect(page).toHaveURL(`${legacy}/doce-lua`);
  expect(await page.evaluate(storeId => JSON.parse(localStorage.getItem(`foodweb_checkout_draft_v1:${storeId}`) || '{}').notes, STORE)).toBe('Rascunho local');
});

test('confirmação de pedido permanece na origem que guarda a sessão', async ({ page }) => {
  await servePlatformHosts(page);
  await page.goto(`${legacy}/doce-lua/pedido/local-confirmation`);
  await expect(page.getByRole('heading', { name: 'Pedido não disponível nesta sessão' })).toBeVisible();
  await expect(page).toHaveURL(`${legacy}/doce-lua/pedido/local-confirmation`);
});
