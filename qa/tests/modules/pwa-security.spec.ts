import { test, expect } from '@playwright/test';

test('PWA instala shell público, preserva escopo e ignora conteúdo privado', async ({ page }) => {
  await page.goto('/admin/login');
  const result = await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    const registration = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
    }
    await fetch('/assets/vendeweb-mark.svg?authenticated-test', { headers: { Authorization: 'Bearer test-not-a-token' } });
    await fetch('/api/private.json?token=test');
    await fetch('/assets/missing-bundle.js');
    const keys = await caches.keys();
    const entries = (await Promise.all(keys.map(async key => (await (await caches.open(key)).keys()).map(req => req.url)))).flat();
    const manifest = await (await fetch('/manifest.webmanifest')).json();
    return { scope: registration.scope, entries, manifest };
  });
  expect(result.scope).toBe('http://127.0.0.1:5174/');
  expect(result.entries).toContain('http://127.0.0.1:5174/index.html');
  expect(result.entries.some(url => /authenticated-test|private\.json|missing-bundle/.test(url))).toBe(false);
  expect(result.manifest.id).toBe('/admin');
  expect(result.manifest.icons.some((icon: { sizes: string; purpose: string }) => icon.sizes === '512x512' && icon.purpose === 'maskable')).toBe(true);
});
