import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

// Exercise the real delivery implementation with browser/transport boundaries stubbed.
const source = readFileSync(new URL('../src/services/pwaNotifications.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const moduleSource = `const appConfig = { vapidPublicKey: '' }; const isSupabaseConfigured = false; const restFetch = () => { throw Error('unexpected network'); };\n${compiled}`;
const { showPwaNotification } = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);

test('notification delivery reports rejection, retries and coalesces concurrent signals', async () => {
  let count = 0;
  const delivered = [];
  class BrowserNotification {
    static permission = 'denied';
    constructor(title, options) { count++; delivered.push({ title, options }); }
  }
  const originalWindow = globalThis.window;
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalNotification = globalThis.Notification;
  globalThis.window = { location: { origin: 'https://test.example' }, setTimeout, clearTimeout, Notification: BrowserNotification };
  globalThis.Notification = BrowserNotification;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  try {
    assert.equal(await showPwaNotification('Denied', '', { tag: 'denied' }), false);
    assert.equal(count, 0);
    BrowserNotification.permission = 'granted';
    assert.equal(await showPwaNotification('Allowed', '', { tag: 'allowed', url: 'https://evil.example' }), true);
    assert.equal(delivered[0].options.data.url, 'https://test.example/admin/pedidos');
    assert.equal(await showPwaNotification('Allowed', '', { tag: 'allowed' }), true);
    assert.equal(count, 1);

    let attempts = 0;
    let release;
    navigator.serviceWorker = { ready: Promise.resolve({ showNotification: async () => {
      attempts++;
      if (attempts === 1) throw new Error('OS rejected');
      await new Promise(resolve => { release = resolve; });
    } }) };
    assert.equal(await showPwaNotification('Retry', '', { tag: 'retry' }), false);
    const first = showPwaNotification('Retry', '', { tag: 'retry' });
    const simultaneous = showPwaNotification('Retry', '', { tag: 'retry' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(attempts, 2);
    release();
    assert.deepEqual(await Promise.all([first, simultaneous]), [true, true]);
    assert.equal(await showPwaNotification('Retry', '', { tag: 'retry' }), true);
    assert.equal(attempts, 2);
  } finally {
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    if (originalNotification === undefined) delete globalThis.Notification; else globalThis.Notification = originalNotification;
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator); else delete globalThis.navigator;
  }
});
