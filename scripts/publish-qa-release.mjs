import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';
import process from 'node:process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const options = new Set(process.argv.slice(2));
const dryRun = options.has('--dry-run');
const autoConfirm = options.has('--yes');
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = String(packageJson.version || '').trim();
if (!version) throw new Error('package.json sem uma versao valida.');

const run = (command, commandArgs, cwd, inherit = false) => {
  const result = spawnSync(command, commandArgs, {
    cwd, encoding: 'utf8', windowsHide: true,
    stdio: inherit ? 'inherit' : ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${commandArgs.join(' ')} falhou${details ? `:\n${details}` : '.'}`);
  }
  return result.stdout?.trim() || '';
};
const remoteRefExists = (repo, kind, ref) => spawnSync('git', ['ls-remote', '--exit-code', repo, `${kind}/${ref}`], { cwd: root, stdio: 'ignore', windowsHide: true }).status === 0;
const repoUrl = run('git', ['config', '--get', 'remote.origin.url'], root);
const projectSlug = /food/i.test(packageJson.name) || /food/i.test(repoUrl) ? 'foodweb' : 'floriweb';
const branch = `release/${projectSlug}-v${version}`;
const tag = `v${version}`;
const tempParent = await fs.mkdtemp(path.join(os.tmpdir(), `${projectSlug}_qa_release_`));
const tempRoot = path.join(tempParent, 'repo');
let usesWorktree = false;

const allowedRootFiles = new Set([
  '.env.example', '.gitignore', '.nvmrc', 'AGENTS.md', 'CHANGELOG.md', 'DESIGN.md', 'PRODUCT.md',
  'README.md', 'ROTEIRO_DE_TESTES.md', 'CONFIGURAR_SUPABASE.md',
  'CONFIGURAR_TURNSTILE_COMPARTILHADO.txt', 'index.html', 'package.json', 'package-lock.json',
  'tsconfig.json', 'tsconfig.app.json', 'vite.config.ts', 'wrangler.jsonc',
]);
const allowedRootDirectories = new Set(['.github', 'docs', 'public', 'qa', 'scripts', 'src', 'supabase', 'tools']);
const shouldCopy = (source) => {
  const relative = path.relative(root, source);
  if (!relative) return true;
  const parts = relative.split(path.sep);
  const first = parts[0];
  const normalized = parts.join('/').toLowerCase();
  if (first === '.git' || first === 'node_modules' || first === 'dist') return false;
  if (parts.some((part) => /^_?backup/i.test(part) || part === '_HISTORICO_AUXILIARES' || part === 'ARQUIVOS_FINAIS')) return false;
  if (parts.some((part) => ['.wrangler', '.automation', 'test-results', 'payload', 'payload_rc616', 'payload_rc618', 'payload_rc619', 'payload_rc620'].includes(part.toLowerCase()))) return false;
  if (/^qa\/(node_modules|\.auth|test-results|playwright-report|blob-report)(\/|$)/i.test(normalized)) return false;
  if (/\.zip$/i.test(first) || /\.log$/i.test(first) || /^styles_.*_append\.css$/i.test(first)) return false;
  return parts.length === 1 ? allowedRootFiles.has(first) || allowedRootDirectories.has(first) : true;
};
const clearClone = async () => {
  for (const entry of await fs.readdir(tempRoot)) {
    if (entry !== '.git') await fs.rm(path.join(tempRoot, entry), { recursive: true, force: true });
  }
};
const cleanup = async () => {
  if (usesWorktree) run('git', ['worktree', 'remove', '--force', tempRoot], root);
  else await fs.rm(tempRoot, { recursive: true, force: true });
  await fs.rm(tempParent, { recursive: true, force: true });
};
const hasLocalMain = spawnSync('git', ['show-ref', '--verify', '--quiet', 'refs/remotes/origin/main'], { cwd: root, windowsHide: true }).status === 0;

console.log(`Projeto ${projectSlug} ${version} - publicacao QA limpa`);
console.log(`Branch: ${branch}`);
console.log(`Tag:    ${tag}`);
if (remoteRefExists(repoUrl, 'refs/heads', branch)) throw new Error(`A branch remota ja existe: ${branch}. Nenhuma branch/tag foi apagada.`);
if (remoteRefExists(repoUrl, 'refs/tags', tag)) throw new Error(`A tag remota ja existe: ${tag}. Nenhuma branch/tag foi apagada.`);

try {
  if (hasLocalMain) {
    run('git', ['worktree', 'add', '--detach', tempRoot, 'origin/main'], root, true);
    usesWorktree = true;
  } else {
    run('git', ['clone', '--depth', '1', '--branch', 'main', repoUrl, tempRoot], root, true);
  }
  await clearClone();
  await fs.cp(root, tempRoot, { recursive: true, filter: shouldCopy });
  const status = run('git', ['status', '--short'], tempRoot);
  console.log(`Arquivos preparados: ${status ? status.split(/\r?\n/).length : 0}`);
  if (dryRun) {
    console.log('Dry-run concluido. A copia temporaria foi removida; nenhum push foi feito.');
    await cleanup();
    process.exit(0);
  }
  run('git', ['checkout', '-b', branch], tempRoot, true);
  run(npmCommand, ['ci', '--no-audit', '--fund=false'], tempRoot, true);
  run(npmCommand, ['run', 'validate'], tempRoot, true);
  run('git', ['add', '-A'], tempRoot);
  run('git', ['commit', '--allow-empty', '-m', `release: ${projectSlug} v${version}`], tempRoot, true);
  run('git', ['tag', '-a', tag, '-m', `${projectSlug} v${version}`], tempRoot, true);
  if (!autoConfirm) {
    const input = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await input.question(`Validacao concluida. Publicar ${branch} e ${tag} no GitHub? [S/N] `);
    input.close();
    if (!/^s(im)?$/i.test(answer.trim())) {
      console.log('Cancelado. Nenhuma alteracao remota foi feita.');
      await cleanup();
      process.exit(0);
    }
  }
  run('git', ['push', '--set-upstream', 'origin', branch], tempRoot, true);
  run('git', ['push', 'origin', tag], tempRoot, true);
  await cleanup();
  console.log(`SUCESSO. Preview publicado em ${branch}. A main nao foi alterada.`);
} catch (error) {
  console.error(`FALHA: ${error.message}`);
  console.error(`A copia de diagnostico foi preservada em: ${tempRoot}`);
  process.exitCode = 1;
}
