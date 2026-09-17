import fs from 'node:fs';

const file = 'src/utils/localFinancialDocumentReader.ts';
if (!fs.existsSync(file)) process.exit(0);
let source = fs.readFileSync(file, 'utf8');
const oldRender = 'firstPage.render({ canvasContext: context, viewport }).promise';
const newRender = 'firstPage.render({ canvas, canvasContext: context, viewport }).promise';
if (source.includes(oldRender)) {
  source = source.replace(oldRender, newRender);
  fs.writeFileSync(file, source, 'utf8');
  console.log('OK   Hotfix PDF.js v0.4.5 aplicado automaticamente.');
} else if (source.includes(newRender)) {
  console.log('OK   Hotfix PDF.js v0.4.5 ja estava aplicado.');
} else {
  console.log('INFO Leitor financeiro usa outra implementacao; nenhuma substituicao automatica foi feita.');
}
