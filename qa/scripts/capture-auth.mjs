import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const kind = process.argv[2] === 'master' ? 'master' : 'admin';
const qaRoot = process.cwd();
const projectRoot = path.resolve(qaRoot, '..');
const config = JSON.parse(fs.readFileSync(path.resolve('qa.config.json'), 'utf8'));
const baseURL = (process.env.QA_BASE_URL || config.baseURL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const loginPath = kind === 'master' ? '/admin-master/login' : '/admin/login';
const targetPath = kind === 'master' ? config.masterStart : config.adminStart;
const authDir = path.resolve('.auth');
fs.mkdirSync(authDir, { recursive: true });

const waitServer = async (url, timeoutMs = 45000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (r.status < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
};

let dev = null;
const url = new URL(baseURL);
const isLocal = ['127.0.0.1', 'localhost'].includes(url.hostname);
if (!(await waitServer(baseURL, 2500))) {
  if (!isLocal) {
    console.error(`ERRO: ambiente ${baseURL} nao respondeu.`);
    process.exit(1);
  }
  console.log('[QA] Vite nao esta aberto. Iniciando servidor local temporario...');
  if (process.platform === 'win32') {
    dev = spawn('cmd.exe', ['/d', '/s', '/c', 'npm run dev -- --host 127.0.0.1'], { cwd: projectRoot, stdio: 'ignore', windowsHide: true });
  } else {
    dev = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1'], { cwd: projectRoot, stdio: 'ignore' });
  }
  if (!(await waitServer(baseURL))) {
    console.error('ERRO: nao foi possivel iniciar o servidor local para capturar a sessao.');
    if (dev?.pid && process.platform === 'win32') spawnSync('taskkill', ['/PID', String(dev.pid), '/T', '/F'], { stdio: 'ignore' });
    else dev?.kill('SIGTERM');
    process.exit(1);
  }
}

const closeDev = () => {
  if (!dev?.pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(dev.pid), '/T', '/F'], { stdio: 'ignore' });
  else dev.kill('SIGTERM');
};

let browser;
try {
  browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const page = await context.newPage();
  await page.goto(`${baseURL}${loginPath}`);
  console.log(`\nFaca o login ${kind === 'master' ? 'Admin Master' : 'do lojista'} normalmente no navegador aberto.`);
  console.log('Conclua Turnstile/MFA se existir. Nao informe senha neste terminal.');
  const rl = readline.createInterface({ input, output });
  await rl.question('Quando o painel estiver totalmente aberto, pressione ENTER aqui... ');
  await page.goto(`${baseURL}${targetPath}`).catch(() => {});
  await page.waitForTimeout(800);
  await context.storageState({ path: path.join(authDir, `${kind}.json`) });
  await rl.close();
  console.log(`Sessao salva em qa/.auth/${kind}.json.`);
} finally {
  await browser?.close().catch(() => {});
  closeDev();
}
