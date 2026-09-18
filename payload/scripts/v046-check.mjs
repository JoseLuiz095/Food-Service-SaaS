import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const fail = (message) => { console.error(`ERRO ${message}`); process.exitCode = 1; };
const ok = (message, condition) => condition ? console.log(`OK   ${message}`) : fail(message);

const pkg = JSON.parse(read('package.json'));
const stores = read('src/pages/master/Stores.tsx');
const payments = read('src/pages/master/Payments.tsx');
const adminPlan = read('src/pages/admin/Plan.tsx');
const adminLayout = read('src/layouts/AdminLayout.tsx');
const billingApi = read('src/services/billingApi.ts');
const platformApi = read('src/services/platformApi.ts');
const migration = read('supabase/migrations/202609032230_foodweb_v046_billing_access.sql');
const validation = read('supabase/VALIDAR_V046.sql');
const edge = read('supabase/functions/food-platform-manage-store-user/index.ts');
const html = read('index.html');
const css = read('src/styles.css');
const reader = fs.existsSync('src/utils/localFinancialDocumentReader.ts') ? read('src/utils/localFinancialDocumentReader.ts') : '';

ok('FoodWeb v0.4.6 aplicado', pkg.version === '0.4.6');
ok('Admin Master altera e-mail/senha do lojista', stores.includes('Atualizar e-mail / senha') && platformApi.includes('food-platform-manage-store-user'));
ok('Edge de credenciais usa Admin API e MFA AAL2', edge.includes('auth.admin.updateUserById') && edge.includes('MFA_AAL2_REQUIRED') && edge.includes('food_platform_admins'));
ok('Tabela de lojas mostra vencimento', stores.includes('<th>Vencimento</th>') && stores.includes('master-due-cell-v046'));
ok('Master pode registrar nao renovacao', payments.includes('Não confirmar renovação') && platformApi.includes('food_platform_reject_subscription_payment_v1'));
ok('Barra superior mostra mensalidade em dia/atrasada', adminLayout.includes('Mensalidade em dia') && adminLayout.includes('Mensalidade atrasada'));
ok('Lojista possui pagina com ultimo pagamento', adminPlan.includes('ÚLTIMO PAGAMENTO') && adminPlan.includes('Vencimento da referência'));
ok('API de cobranca expoe visao consolidada', billingApi.includes('food_get_store_billing_overview_v1') && billingApi.includes('StoreBillingOverview'));
ok('Banco ancora vencimento no due_day', migration.includes('food_subscription_reference_due_v1') && migration.includes('v_reference_due') && migration.includes('next_due_date=v_next_due'));
ok('Negacao nao avanca vencimento', migration.includes("status='rejected'") && migration.includes('Nao altera next_due_date'));
ok('Validacao SQL confere dia configurado', validation.includes('respeita_dia_configurado') && validation.includes('food_platform_reject_subscription_payment_v1'));
ok('favicon v0.4.6 referenciado', html.includes('/favicon-foodweb-v046.svg') && fs.existsSync('public/favicon-foodweb-v046.svg'));
ok('CSS v0.4.6 aplicado', css.includes('FoodWeb v0.4.6: mensalidade, vencimento e gestao de acesso'));
if (reader) ok('Hotfix PDF.js preservado', reader.includes('firstPage.render({ canvas, canvasContext: context, viewport })'));

const hasEnv = ['.env','.env.local','.env.production'].some((file) => fs.existsSync(file));
ok('.env existente preservado', hasEnv);

if (!process.exitCode) console.log('\nv0.4.6 conferido.');
