import { defineConfig } from '@playwright/test';

// Ambiente exclusivamente sintético: sem ref produtivo, sessão persistida ou .env.
// O servidor é próprio desta execução; nenhum servidor pré-existente é reutilizado.
export default defineConfig({
  testDir: './tests/modules', testMatch: ['order-edit.spec.ts', 'reservation-baseline-audit.spec.ts', 'diagnostico-mobile.spec.ts'],
  outputDir: './test-results/reserva-local', timeout: 45000, workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/reserva-local-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:5188', channel: '', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
    screenshot: 'only-on-failure', trace: 'retain-on-failure', serviceWorkers: 'block' },
  webServer: { command: 'npm --prefix .. run dev -- --configLoader runner --host 127.0.0.1 --port 5188 --strictPort',
    url: 'http://127.0.0.1:5188', reuseExistingServer: false, timeout: 90000,
    env: { VITE_SUPABASE_URL: 'https://localqa.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_publishable_local_only_synthetic_qa',
      VITE_APP_ENV: 'test', VITE_ANALYTICS_ENABLED: 'false', VITE_TURNSTILE_SITE_KEY: 'local-test-sitekey', VITE_PIX_PAYMENT_LINK_ENABLED: 'true' } },
});
