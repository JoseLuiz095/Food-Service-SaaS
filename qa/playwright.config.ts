import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const qaRoot = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(qaRoot, 'qa.config.json');
const localConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const externalBaseUrl = process.env.QA_BASE_URL?.trim();
const baseURL = externalBaseUrl || localConfig.baseURL || 'http://127.0.0.1:5173';
const base = new URL(baseURL);
const localHost = ['127.0.0.1', 'localhost'].includes(base.hostname) ? '127.0.0.1' : '0.0.0.0';
const localPort = base.port || '5173';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 1,
  timeout: 45_000,
  expect: { timeout: 8_000, toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.015 } },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 25_000,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    reducedMotion: 'reduce'
  },
  webServer: externalBaseUrl ? undefined : {
    command: `npm --prefix .. run dev -- --configLoader runner --host ${localHost} --port ${localPort}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } }
  ],
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}'
});
