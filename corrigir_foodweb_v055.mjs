import fs from 'node:fs';
import path from 'node:path';

const VERSION = '0.5.5';
const root = process.cwd();

const fail = (message) => {
  console.error(`ERRO: ${message}`);
  process.exit(1);
};

const readJson = (file) => {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) fail(`${file} nao encontrado. Execute na raiz do FoodWeb.`);
  return JSON.parse(fs.readFileSync(full, 'utf8'));
};

const writeJson = (file, data) => {
  fs.writeFileSync(path.join(root, file), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

const pkg = readJson('package.json');
pkg.version = VERSION;
writeJson('package.json', pkg);
console.log(`OK package.json = ${VERSION}`);

const lockPath = path.join(root, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = VERSION;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = VERSION;
  }
  writeJson('package-lock.json', lock);
  console.log(`OK package-lock.json = ${VERSION}`);
} else {
  console.log('AVISO package-lock.json nao encontrado.');
}

const smokePath = path.join(root, 'scripts', 'smoke.mjs');
if (!fs.existsSync(smokePath)) fail('scripts/smoke.mjs nao encontrado.');

let smoke = fs.readFileSync(smokePath, 'utf8');

const oldLabel = 'Pacote FoodWeb v0.5.4';
const newLabel = 'Pacote FoodWeb v0.5.5';

let labelPos = smoke.indexOf(newLabel);
if (labelPos < 0) {
  labelPos = smoke.indexOf(oldLabel);
  if (labelPos < 0) {
    fail('Nao encontrei o check "Pacote FoodWeb v0.5.4" nem "v0.5.5" em scripts/smoke.mjs.');
  }
  smoke = smoke.slice(0, labelPos) + newLabel + smoke.slice(labelPos + oldLabel.length);
  labelPos = smoke.indexOf(newLabel);
  console.log('OK rotulo principal do smoke atualizado para v0.5.5');
} else {
  console.log('OK rotulo principal do smoke ja esta em v0.5.5');
}

const windowEnd = Math.min(smoke.length, labelPos + 1000);
let windowText = smoke.slice(labelPos, windowEnd);

const oldVersionRegex = /pkg\.version\s*===\s*(['"])0\.5\.4\1/;
const newVersionRegex = /pkg\.version\s*===\s*(['"])0\.5\.5\1/;

if (newVersionRegex.test(windowText)) {
  console.log('OK comparacao pkg.version ja esta em 0.5.5');
} else if (oldVersionRegex.test(windowText)) {
  windowText = windowText.replace(oldVersionRegex, "pkg.version === '0.5.5'");
  smoke = smoke.slice(0, labelPos) + windowText + smoke.slice(windowEnd);
  console.log('OK comparacao pkg.version atualizada para 0.5.5');
} else {
  fail('Encontrei o rotulo do pacote, mas nao encontrei a comparacao pkg.version 0.5.4/0.5.5 perto dele.');
}

// Atualiza somente textos de resumo do proprio smoke; nao altera checks historicos v0.5.4.
smoke = smoke.replace(/Smoke FoodWeb v0\.5\.\d+\s+conclu[ií]do/g, 'Smoke FoodWeb v0.5.5 concluído');

fs.writeFileSync(smokePath, smoke, 'utf8');

const verify = fs.readFileSync(smokePath, 'utf8');
const verifyPos = verify.indexOf(newLabel);
if (verifyPos < 0) fail('Falha ao confirmar o rotulo v0.5.5 no smoke.');

const verifyWindow = verify.slice(verifyPos, Math.min(verify.length, verifyPos + 1000));
if (!newVersionRegex.test(verifyWindow)) {
  fail('Falha ao confirmar pkg.version === 0.5.5 no check principal.');
}

console.log('');
console.log('CORRECAO V0.5.5 CONCLUIDA.');
console.log('Os checks historicos das versoes anteriores foram preservados.');
