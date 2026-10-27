import { defineConfig, devices } from '@playwright/test';

// Isolated UI contracts: starts a local app, and test files intercept Supabase.
export default defineConfig({
 testDir:'./tests/fitness',outputDir:'./test-results/fitness',fullyParallel:false,
 workers:1,retries:0,timeout:30_000,reporter:'list',
 use:{baseURL:'http://127.0.0.1:5174',locale:'pt-BR',timezoneId:'America/Sao_Paulo',reducedMotion:'reduce',trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:{command:'npm --prefix .. run dev -- --host 127.0.0.1 --port 5174 --strictPort',url:'http://127.0.0.1:5174',reuseExistingServer:false,timeout:30_000},
 projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
});
