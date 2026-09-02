import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  '.agents/skills/impeccable/SKILL.md',
  '.agents/skills/impeccable/scripts/context.mjs',
  '.agents/skills/impeccable/scripts/hook.mjs',
  '.codex/hooks.json',
];

let failed = false;
console.log('Verificando integracao Impeccable + Codex...');
for (const rel of required) {
  const ok = fs.existsSync(path.join(root, rel));
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${rel}`);
  if (!ok) failed = true;
}

const hooksPath = path.join(root, '.codex/hooks.json');
if (fs.existsSync(hooksPath)) {
  try {
    const hooksText = fs.readFileSync(hooksPath, 'utf8');
    JSON.parse(hooksText);
    const normalized = hooksText.replaceAll('\\\\', '/').replaceAll('\\', '/');
    const targetsProjectSkill = normalized.includes('.agents/skills/impeccable/scripts/hook.mjs');
    console.log(`${targetsProjectSkill ? 'OK  ' : 'FAIL'} hook aponta para .agents/skills/impeccable/scripts/hook.mjs`);
    if (!targetsProjectSkill) failed = true;
  } catch (error) {
    console.log(`FAIL .codex/hooks.json invalido: ${error.message}`);
    failed = true;
  }
}

if (failed) {
  console.error('\nImpeccable nao esta pronto para o Codex neste projeto.');
  console.error('Execute INSTALAR_IMPECCABLE_CODEX.bat ou npm run design:setup.');
  process.exit(1);
}

console.log('\nIntegracao local OK. No Codex, aprove /hooks e use $impeccable.');
