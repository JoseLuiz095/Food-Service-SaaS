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

const ask = async (question) => {
  const rl = readline.createInterface({ input, output });
  try { return await rl.question(question); } finally { await rl.close(); }
};

const askHidden = (question) => new Promise((resolve, reject) => {
  const stdin = process.stdin;
  const wasRaw = Boolean(stdin.isRaw);
  let value = '';
  const cleanup = () => {
    stdin.off('data', onData);
    if (stdin.isTTY) stdin.setRawMode(wasRaw);
    stdin.pause();
  };
  const onData = (chunk) => {
    for (const char of String(chunk)) {
      if (char === '\u0003') { cleanup(); reject(new Error('Entrada cancelada.')); return; }
      if (char === '\r' || char === '\n') { process.stdout.write('\n'); cleanup(); resolve(value); return; }
      if (char === '\u0008' || char === '\u007f') {
        if (value) { value = value.slice(0, -1); process.stdout.write('\b \b'); }
        continue;
      }
      value += char;
      process.stdout.write('*');
    }
  };
  process.stdout.write(question);
  stdin.resume();
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.on('data', onData);
});

const credentials = async () => {
  const label = kind === 'master' ? 'Admin Master' : 'Admin da loja';
  const email = (await ask(`[QA] E-mail do ${label}: `)).trim();
  if (!email) throw new Error('E-mail não informado.');
  const password = await askHidden(`[QA] Senha do ${label}: `);
  if (!password) throw new Error('Senha não informada.');
  return { email, password };
};

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
const isLocal = ['127.0.0.1', 'localhost', '172.26.224.1'].includes(url.hostname);
const devHost = ['127.0.0.1', 'localhost'].includes(url.hostname) ? '127.0.0.1' : '0.0.0.0';
const devPort = url.port || '5173';
const loginCredentials = await credentials();
if (!(await waitServer(baseURL, 2500))) {
  if (!isLocal) {
    console.error(`ERRO: ambiente ${baseURL} nao respondeu.`);
    process.exit(1);
  }
  console.log('[QA] Vite nao esta aberto. Iniciando servidor local temporario...');
  if (process.platform === 'win32') {
    dev = spawn('cmd.exe', ['/d', '/s', '/c', `npm run dev -- --configLoader runner --host ${devHost} --port ${devPort}`], { cwd: projectRoot, stdio: 'ignore', windowsHide: true });
  } else {
    dev = spawn('npm', ['run', 'dev', '--', '--host', devHost, '--port', devPort], { cwd: projectRoot, stdio: 'ignore' });
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
  await page.locator('input[type="email"]').first().fill(loginCredentials.email);
  await page.locator('input[type="password"]').first().fill(loginCredentials.password);
  console.log(`\n[QA] Credenciais preenchidas em ${loginPath}.`);
  console.log('[QA] Conclua o Turnstile no navegador e pressione ENTER aqui para enviar o login.');
  await ask('ENTER depois da verificação... ');
  const submit = page.locator('button[type="submit"]').first();
  await page.waitForFunction(() => {
    const button = document.querySelector('button[type="submit"]');
    return button && !(button instanceof HTMLButtonElement && button.disabled);
  }, undefined, { timeout: 10 * 60_000 });
  await submit.click();
  await page.waitForTimeout(1200);

  if (kind === 'master' && new URL(page.url()).pathname === '/admin-master/mfa') {
    const codeInput = page.locator('input[autocomplete="one-time-code"]').first();
    if (await codeInput.count() === 0) throw new Error('O Admin Master pediu MFA, mas não exibiu o campo do código TOTP. Configure o autenticador antes de continuar.');
    const code = (await askHidden('[QA] Código atual do Authenticator: ')).replace(/\D/g, '');
    if (code.length < 6) throw new Error('O código TOTP precisa ter pelo menos 6 dígitos.');
    await codeInput.fill(code);
    await page.getByRole('button', { name: /validar e continuar/i }).click();
    await page.waitForTimeout(1200);
  }

  const currentPath = new URL(page.url()).pathname;
  if (currentPath === loginPath || currentPath === '/admin-master/mfa') {
    const error = await page.locator('.form-error').first().textContent().catch(() => '');
    throw new Error(`Login não concluído${error ? `: ${error.trim()}` : '.'}`);
  }
  await page.goto(`${baseURL}${targetPath}`).catch(() => {});
  await page.waitForTimeout(800);
  await context.storageState({ path: path.join(authDir, `${kind}.json`) });
  console.log(`Sessao salva em qa/.auth/${kind}.json.`);
} finally {
  await browser?.close().catch(() => {});
  closeDev();
}
