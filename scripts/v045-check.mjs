import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const problems=[];
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const exists=(file)=>fs.existsSync(path.join(root,file));
const need=(condition,message)=>{if(!condition)problems.push(message)};

need(exists('package.json'),'package.json nao encontrado. Execute na raiz do FoodWeb.');
need(exists('src/pages/admin/Finance.tsx'),'Finance.tsx nao encontrado.');
need(exists('src/utils/localFinancialDocumentReader.ts'),'Leitor local nao foi aplicado.');
need(exists('public/favicon-foodweb-v045.svg'),'Favicon versionado v0.4.5 nao foi aplicado.');

if(!problems.length){
  const pkg=JSON.parse(read('package.json'));
  const finance=read('src/pages/admin/Finance.tsx');
  const reader=read('src/utils/localFinancialDocumentReader.ts');
  const adminLayout=read('src/layouts/AdminLayout.tsx');
  const landing=read('src/pages/store/Landing.tsx');
  const index=read('index.html');
  const deploy=read('DEPLOY_SUPABASE_FUNCTIONS.bat');
  const headers=read('public/_headers');

  need(pkg.version==='0.4.5','package.json ainda nao esta na v0.4.5.');
  need(pkg.dependencies?.['tesseract.js']==='7.0.0','Dependencia tesseract.js 7.0.0 ausente.');
  need(pkg.dependencies?.['pdfjs-dist']==='6.3.289','Dependencia pdfjs-dist 6.3.289 ausente.');
  need(finance.includes('readLocalFinancialDocument'),'Financeiro nao esta usando OCR local.');
  need(!finance.includes('financeApi.extractDocument')&&!finance.includes('financeApi.uploadDocument'),'Financeiro ainda referencia OCR/upload remoto antigo.');
  need(reader.includes("import('tesseract.js')")&&reader.includes("import('pdfjs-dist')"),'Leitor local incompleto.');
  need(!adminLayout.includes('Admin Master'),'Atalho Admin Master ainda aparece no menu do lojista.');
  need(landing.includes('sales-ops-preview-v45')&&!landing.includes('storefront-products.webp'),'Preview operacional da landing FoodWeb nao foi aplicado.');
  need(index.includes('/favicon-foodweb-v045.svg'),'index.html nao aponta para o favicon versionado.');
  need(headers.includes("'wasm-unsafe-eval'") && headers.includes("worker-src 'self' blob:") && headers.includes('camera=(self)'),
    'public/_headers nao libera WebAssembly/Worker/camera necessarios ao OCR local.');
  need(!exists('supabase/functions/food-finance-document-extract/index.ts'),'Edge Function antiga de OCR/IA ainda existe no projeto.');
  need(!deploy.includes('functions deploy food-finance-document-extract'),'DEPLOY_SUPABASE_FUNCTIONS ainda tenta publicar OCR remoto.');

  if(exists('public/favicon.svg')){
    need(read('public/favicon.svg')===read('public/favicon-foodweb-v045.svg'),'favicon.svg e favicon v0.4.5 nao sao o mesmo arquivo local.');
  }
}

const envFiles=['.env','.env.local','.env.production','.env.production.local'];
let turnstile='';
for(const file of envFiles){
  if(!exists(file))continue;
  for(const raw of read(file).split(/\r?\n/)){
    const line=raw.trim();
    if(!line||line.startsWith('#'))continue;
    const index=line.indexOf('=');
    if(index<1)continue;
    const key=line.slice(0,index).trim();
    let value=line.slice(index+1).trim().replace(/^['"]|['"]$/g,'');
    if(key==='VITE_TURNSTILE_SITE_KEY'&&value)turnstile=value;
  }
}
need(Boolean(turnstile),'VITE_TURNSTILE_SITE_KEY nao encontrada nos arquivos .env existentes. O patch nao cria nem substitui .env.');

if(problems.length){
  console.error('\nFALHA FOODWEB v0.4.5:\n');
  for(const problem of problems)console.error(`- ${problem}`);
  process.exit(1);
}

console.log('OK   FoodWeb v0.4.5 aplicado na raiz correta');
console.log('OK   OCR local ativo para foto/PDF, sem IA');
console.log('OK   Admin Master removido do menu do lojista');
console.log('OK   landing usa preview operacional');
console.log('OK   favicon versionado e forcado no build');
console.log('OK   .env existente preservado e Turnstile localizado');
