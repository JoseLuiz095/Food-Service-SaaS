import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const pw = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');
const authDir = path.join(root, '.auth');

if (!fs.existsSync(pw)) {
  console.error('ERRO: Playwright ainda nao esta instalado em qa/. Execute npm run qa:setup na raiz.');
  process.exit(1);
}

const run = (args) => {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', shell: false, env: process.env });
  if (result.error) console.error(`ERRO ao iniciar QA: ${result.error.message}`);
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
};

console.log('\n[QA completo] 1/3 - Fluxos públicos, responsividade e acessibilidade...');
run([pw, 'test', 'tests/smoke', 'tests/e2e', 'tests/responsive/public-responsive.spec.ts', 'tests/a11y', '--project=chromium']);

fs.mkdirSync(authDir, { recursive: true });
console.log('\n[QA completo] 2/3 - Captura das sessões Admin e Admin Master...');
run(['scripts/capture-auth.mjs', 'admin']);
run(['scripts/capture-auth.mjs', 'master']);

console.log('\n[QA completo] 3/3 - Rotas autenticadas, responsividade e visual...');
run([pw, 'test', 'tests/authenticated', 'tests/responsive/admin-responsive.spec.ts', '--project=chromium']);
