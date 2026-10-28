import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/modules', outputDir: './test-results/modules', timeout: 45000, workers: 1,
  reporter: [['list'],['html',{ outputFolder: 'playwright-report/modules', open: 'never' }]],
  use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome', baseURL: 'http://127.0.0.1:5174', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm --prefix .. run dev -- --configLoader runner --host 127.0.0.1 --port 5174', url: 'http://127.0.0.1:5174', reuseExistingServer: true, timeout: 90000,
    env: { VITE_TURNSTILE_SITE_KEY: 'local-test-sitekey', VITE_PIX_PAYMENT_LINK_ENABLED: 'true' } },
});
