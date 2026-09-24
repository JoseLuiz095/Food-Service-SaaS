import fs from 'node:fs';
import path from 'node:path';

const qaRoot = process.cwd();
const source = path.join(qaRoot, 'tests', '__screenshots__');
const releaseRoot = path.resolve(qaRoot, '..', '.release_v065');
const target = path.join(releaseRoot, 'payload', 'qa', 'tests', '__screenshots__');

if (!fs.existsSync(source)) {
  console.error('ERRO: nenhuma baseline foi gerada em qa/tests/__screenshots__.');
  process.exit(1);
}

if (!fs.existsSync(releaseRoot)) {
  console.log('[Baseline] Imagens atualizadas no projeto. Payload cumulativo nao encontrado para sincronizar.');
  process.exit(0);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(source, target, { recursive: true });
console.log('[Baseline] Imagens aprovadas sincronizadas com .release_v065/payload.');
