import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/modules', testMatch: ['inventory-workspace.spec.ts', 'inventory-command.spec.ts', 'stock-transfer-flow.spec.ts'],
  outputDir: './test-results/inventory-workspace', timeout: 45000, workers: 1, reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5201', channel: '', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
    serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm --prefix .. run dev -- --configLoader runner --host 127.0.0.1 --port 5201 --strictPort',
    url: 'http://127.0.0.1:5201', reuseExistingServer: false, timeout: 90000,
    env: { VITE_SUPABASE_URL: 'https://localqa.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_publishable_local_only_synthetic_qa',
      VITE_APP_ENV: 'test', VITE_ANALYTICS_ENABLED: 'false', VITE_TURNSTILE_SITE_KEY: 'local-test-sitekey' } },
});
