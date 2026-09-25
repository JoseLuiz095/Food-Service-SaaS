import fs from 'node:fs';
import path from 'node:path';

const [sourceArg, targetArg] = process.argv.slice(2);
if (!sourceArg || !targetArg) {
  console.error('Uso: node prepare-release-snapshot.mjs <origem-local> <clone-limpo>');
  process.exit(2);
}

const source = path.resolve(sourceArg);
const target = path.resolve(targetArg);
const rootFiles = new Set([
  '.env.example', '.gitignore', '.nvmrc', 'AGENTS.md', 'CHANGELOG.md',
  'CONFIGURAR_AMBIENTE.bat', 'CONFIGURAR_SUPABASE.md',
  'CONFIGURAR_TURNSTILE_COMPARTILHADO.txt', 'COLETAR_DIAGNOSTICO_SUPABASE.bat',
  'DEPLOY_SUPABASE_FUNCTIONS.bat', 'DESIGN.md', 'ESTRATEGIA_VALOR_E_CUSTO.md',
  'GERAR_BUILD.bat', 'INICIAR_PROJETO.bat', 'PRODUCT.md', 'README.md',
  'INSTALAR_IMPECCABLE_CODEX.bat', 'RODAR_IMPECCABLE_VISUAL_COMPLETO.bat',
  'PROMPT_CODEX_IMPECCABLE_COMPLETO.txt',
  'ROTEIRO_DE_TESTES.md', 'VALIDAR_PROJETO.bat', 'VERIFICAR_AMBIENTE.bat',
  'index.html', 'package.json', 'package-lock.json', 'tsconfig.app.json',
  'tsconfig.json', 'vite.config.ts', 'wrangler.jsonc', 'FOODWEB.bat'
]);
const rootDirs = new Set(['.agents', '.github', 'docs', 'public', 'qa', 'scripts', 'src', 'supabase']);
const automationFiles = new Set([
  'install-root.cmd', 'setup-qa.cmd', 'publish.cmd', 'promote.cmd',
  'prepare-release-snapshot.mjs', 'check-release-snapshot.mjs', 'stop-project-node.ps1'
]);

function isJunk(name) {
  return name === 'node_modules' || name === 'dist' || name === '.wrangler' ||
    name === 'test-results' || name === 'playwright-report' ||
    name.startsWith('_backup') || name.startsWith('_BACKUP') ||
    name.startsWith('payload') || name === 'ARQUIVOS_FINAIS' ||
    name === '_HISTORICO_AUXILIARES' || name.endsWith('.zip');
}

function copyTree(from, to, filter = () => true) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (isJunk(entry.name) || !filter(entry)) continue;
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(src, dst, filter);
    else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
  }
}

for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
  if (entry.name === '.git') continue;
  if (!rootFiles.has(entry.name) && !rootDirs.has(entry.name) && entry.name !== '.automation') {
    fs.rmSync(path.join(target, entry.name), { recursive: true, force: true });
  }
}

for (const file of rootFiles) {
  const src = path.join(source, file);
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) continue;
  const dst = path.join(target, file);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}
for (const dir of rootDirs) {
  const src = path.join(source, dir);
  const dst = path.join(target, dir);
  if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
  if (fs.existsSync(src) && fs.statSync(src).isDirectory()) copyTree(src, dst);
}

const sourceAutomation = path.join(source, '.automation');
const targetAutomation = path.join(target, '.automation');
if (fs.existsSync(targetAutomation)) fs.rmSync(targetAutomation, { recursive: true, force: true });
if (fs.existsSync(sourceAutomation)) {
  copyTree(sourceAutomation, targetAutomation, entry => automationFiles.has(entry.name));
}

console.log(`Snapshot preparado: ${source} -> ${target}`);
