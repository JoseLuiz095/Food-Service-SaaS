import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, type TestInfo } from '@playwright/test';

export type QaConfig = {
  projectName: string;
  baseURL: string;
  storeSlug: string;
  checkoutPath?: string;
  publicRoutes: string[];
  adminStart: string;
  masterStart: string;
  maxDiscoveredRoutes: number;
  ignoredConsolePatterns: string[];
  maskSelectors: string[];
};

const qaRoot = path.resolve(process.cwd());
export const qaConfig: QaConfig = JSON.parse(fs.readFileSync(path.join(qaRoot, 'qa.config.json'), 'utf8'));
export const authDir = path.join(qaRoot, '.auth');
export const adminAuth = path.join(authDir, 'admin.json');
export const masterAuth = path.join(authDir, 'master.json');
export const hasAdminAuth = fs.existsSync(adminAuth);
export const hasMasterAuth = fs.existsSync(masterAuth);

export function publicRoutes() {
  const routes = new Set(qaConfig.publicRoutes || ['/']);
  if (qaConfig.storeSlug) {
    routes.add(`/${qaConfig.storeSlug}`);
    routes.add(`/${qaConfig.storeSlug}/carrinho`);
    routes.add(`/${qaConfig.storeSlug}/${qaConfig.checkoutPath || 'checkout'}`);
  }
  return [...routes];
}

export function safeName(route: string) {
  const value = route.replace(/^\//, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return value || 'home';
}

export async function waitForStablePage(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(250);
  await page.evaluate(async () => { try { await document.fonts?.ready; } catch {} });
}

export async function assertNoDocumentOverflow(page: Page, route: string) {
  const result = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body?.scrollWidth || 0
  }));
  expect.soft(result.document, `Overflow horizontal em ${route}: documento ${result.document}px / viewport ${result.viewport}px`).toBeLessThanOrEqual(result.viewport + 3);
  expect.soft(result.body, `Overflow horizontal do body em ${route}: body ${result.body}px / viewport ${result.viewport}px`).toBeLessThanOrEqual(result.viewport + 3);
}

export async function assertImagesLoaded(page: Page, route: string) {
  const broken = await page.locator('img').evaluateAll((imgs) => imgs
    .filter((img: HTMLImageElement) => img.complete && img.naturalWidth === 0)
    .map((img: HTMLImageElement) => img.currentSrc || img.src || img.alt || '(imagem sem identificacao)'));
  expect.soft(broken, `Imagens quebradas em ${route}`).toEqual([]);
}

export function runtimeGuard(page: Page, testInfo: TestInfo) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];
  const imageErrors: string[] = [];
  const ignored = (qaConfig.ignoredConsolePatterns || []).map((value) => new RegExp(value, 'i'));
  const ignore = (message: string) => ignored.some((pattern) => pattern.test(message));

  page.on('console', (msg) => {
    if (msg.type() === 'error' && !ignore(msg.text())) consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => { if (!ignore(error.message)) pageErrors.push(error.message); });
  page.on('response', (response) => {
    const status = response.status();
    const url = response.url();
    if (status >= 500) serverErrors.push(`${status} ${url}`);
    if (response.request().resourceType() === 'image' && status >= 400) imageErrors.push(`${status} ${url}`);
  });

  return async () => {
    if (consoleErrors.length) await testInfo.attach('console-errors.txt', { body: consoleErrors.join('\n'), contentType: 'text/plain' });
    if (pageErrors.length) await testInfo.attach('page-errors.txt', { body: pageErrors.join('\n'), contentType: 'text/plain' });
    if (serverErrors.length) await testInfo.attach('server-errors.txt', { body: serverErrors.join('\n'), contentType: 'text/plain' });
    if (imageErrors.length) await testInfo.attach('broken-image-responses.txt', { body: imageErrors.join('\n'), contentType: 'text/plain' });
    expect.soft(pageErrors, 'Erros JavaScript não tratados').toEqual([]);
    expect.soft(serverErrors, 'Respostas HTTP 5xx').toEqual([]);
    expect.soft(imageErrors, 'Imagens com resposta HTTP 4xx/5xx').toEqual([]);
    expect.soft(consoleErrors, 'Erros relevantes no console').toEqual([]);
  };
}

export async function discoverInternalRoutes(page: Page, start: string, prefix: string) {
  const max = Math.max(1, qaConfig.maxDiscoveredRoutes || 30);
  const origin = new URL(page.url()).origin;
  const queue = [start];
  const visited = new Set<string>();

  while (queue.length && visited.size < max) {
    const route = queue.shift()!;
    if (visited.has(route)) continue;
    visited.add(route);
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(120);
    const links = await page.locator('a[href]').evaluateAll((anchors) => anchors.map((a: HTMLAnchorElement) => a.href));
    for (const href of links) {
      try {
        const url = new URL(href);
        if (url.origin !== origin) continue;
        const candidate = `${url.pathname}${url.search}`;
        if (!candidate.startsWith(prefix)) continue;
        if (/logout|sair|excluir|delete/i.test(candidate)) continue;
        if (!visited.has(candidate) && !queue.includes(candidate)) queue.push(candidate);
      } catch {}
    }
  }
  return [...visited];
}

export function masksFor(page: Page) {
  return (qaConfig.maskSelectors || []).map((selector) => page.locator(selector));
}
