import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(process.argv[2] || process.cwd());
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'foodweb_snapshot_'));
fs.mkdirSync(path.join(temp, '.git'));
try {
  const script = path.join(root, '.automation', 'prepare-release-snapshot.mjs');
  const result = spawnSync(process.execPath, [script, root, temp], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
  const forbidden = /(^|[\\/])(node_modules|dist|test-results|playwright-report|payload[^\\/]*|ARQUIVOS_FINAIS|_HISTORICO_AUXILIARES|_backup[^\\/]*)($|[\\/])/i;
  const files = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else files.push(path.relative(temp, file));
    }
  };
  walk(temp);
  const invalid = files.filter(file => forbidden.test(file));
  if (invalid.length) {
    console.error('ERRO: o snapshot contem artefatos proibidos:', invalid.join(', '));
    process.exit(1);
  }
  console.log(`SNAPSHOT OK: ${files.length} arquivos prontos para a publicacao.`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
