import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const pw = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');

if (!fs.existsSync(pw)) {
  console.error('ERRO: Playwright ainda nao esta instalado em qa/. Execute novamente a opcao desejada no painel.');
  process.exit(1);
}

const run = (args) => {
  const result = spawnSync(process.execPath, [pw, ...args], { cwd: root, stdio: 'inherit', shell: false });
  if (result.error) console.error(`ERRO ao iniciar Playwright: ${result.error.message}`);
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
};

console.log('\n[QA Lite] 1/2 - Publico, navegacao segura, responsividade e acessibilidade...');
run(['test', 'tests/smoke', 'tests/e2e', 'tests/responsive/public-responsive.spec.ts', 'tests/a11y', '--project=chromium']);

const screenshots = path.join(root, 'tests', '__screenshots__');
const hasPng = (dir) => fs.existsSync(dir) && fs.readdirSync(dir, { withFileTypes: true }).some((e) => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? hasPng(p) : /\.png$/i.test(e.name);
});

if (!hasPng(screenshots)) {
  console.log('\n[QA Lite] 2/2 - Visual regression ignorado: ainda nao existe baseline aprovada.');
  console.log('Use a opcao BASELINE do painel depois de revisar visualmente o sistema.');
  process.exit(0);
}

console.log('\n[QA Lite] 2/2 - Visual regression publico...');
run(['test', 'tests/visual/public-visual.spec.ts', '--project=chromium']);
