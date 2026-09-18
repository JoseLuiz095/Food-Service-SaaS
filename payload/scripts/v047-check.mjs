import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const exists = (path) => fs.existsSync(path);
let failures = 0;

function ok(label, condition) {
  if (condition) console.log(`OK   ${label}`);
  else { console.log(`FAIL ${label}`); failures += 1; }
}

const pkg = JSON.parse(read('package.json'));
const layout = read('src/layouts/AdminLayout.tsx');
const plan = read('src/pages/admin/Plan.tsx');
const reader = read('src/utils/localFinancialDocumentReader.ts');
const html = read('index.html');

ok('FoodWeb v0.4.7 aplicado', pkg.version === '0.4.7');
ok('Indicador mensalidade possui 3 estados', layout.includes('admin-billing-status-v047') && layout.includes('is-current') && layout.includes('is-warning') && layout.includes('is-overdue'));
ok('Indicador abre Meu plano no vencimento', layout.includes('/admin/plano#vencimento'));
ok('Meu plano ancora vencimento', plan.includes('id="vencimento"') && plan.includes('food-billing-health-v047'));
ok('OCR local possui upscale e segunda leitura', reader.includes('MAX_UPSCALE') && reader.includes('LEITURA REFORCADA') && reader.includes('otsuThreshold'));
ok('OCR prioriza valor por contexto', reader.includes('scoreAmountContext') && reader.includes('VALOR\\s+DO\\s+DOCUMENTO') && reader.includes('VALOR\\s+COBRADO'));
ok('PDF.js recebe canvas no render', reader.includes('render({ canvas, canvasContext: context, viewport })'));
ok('Favicon v0.4.7 referenciado', html.includes('favicon-foodweb-v047.svg') && exists('public/favicon-foodweb-v047.svg'));
ok('Backend v0.4.6 preservado', exists('supabase/migrations/202609032230_foodweb_v046_billing_access.sql') && exists('supabase/functions/food-platform-manage-store-user/index.ts'));

const envPaths = ['.env', '.env.local', '.env.production'].filter(exists);
ok('Configuracao existente preservada', envPaths.length > 0);

if (failures) {
  console.error(`\n${failures} falha(s) na verificacao v0.4.7.`);
  process.exit(1);
}
console.log('\nFoodWeb v0.4.7 pronto para validar/build.');
