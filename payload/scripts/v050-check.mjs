import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const has=(p)=>fs.existsSync(path.join(root,p));
const check=(label,condition)=>{console.log(`${condition?'OK  ':'FAIL'} ${label}`);if(!condition)failures.push(label)};

const pkg=JSON.parse(read('package.json'));
const payments=read('src/pages/master/Payments.tsx');
const dashboard=read('src/pages/master/Dashboard.tsx');
const diagnostics=read('src/pages/master/Diagnostics.tsx');
const stores=read('src/pages/master/Stores.tsx');
const adminLayout=read('src/layouts/AdminLayout.tsx');
const plan=read('src/pages/admin/Plan.tsx');
const finance=read('src/pages/admin/Finance.tsx');
const orders=read('src/pages/admin/Orders.tsx');
const billingStatus=read('src/utils/billingStatus.ts');
const telemetry=read('src/services/interactionTelemetry.ts');
const platformApi=read('src/services/platformApi.ts');
const reader=read('src/utils/localFinancialDocumentReader.ts');
const migration='supabase/migrations/202609151040_foodweb_v050_stability_billing_audit.sql';
const migrationText=read(migration);
const edge=read('supabase/functions/food-platform-manage-store-user/index.ts');
const index=read('index.html');

check('FoodWeb v0.5.0 aplicado',pkg.version==='0.5.0');
check('Confirmar renovacao esta visivel',payments.includes('Confirmar renovação')&&payments.includes('Não confirmar renovação'));
check('Alteracao de plano possui decisao explicita',payments.includes('Confirmar alteração de plano')&&payments.includes('Negar alteração'));
check('Confirmacao aguardando comprovante fica visivel e desabilitada',payments.includes("payment.proofRequired&&payment.status!=='proof_sent'")&&payments.includes('A confirmação fica disponível'));
check('Centro de pendencias existe no Master',dashboard.includes('CENTRO DE PENDÊNCIAS')&&dashboard.includes('/admin-master/diagnostico'));
check('Diagnostico de interacoes existe',diagnostics.includes('Interações sem conclusão')&&diagnostics.includes('Falhas recentes')&&diagnostics.includes('Auditoria crítica'));
check('Diagnostico preserva instrucao de Edge Function',diagnostics.includes('Wrangler não publica Edge Functions do Supabase')&&diagnostics.includes('functions deploy food-public-checkout'));
check('Telemetria global instalada',telemetry.includes('unhandledrejection')&&read('src/main.tsx').includes('installGlobalInteractionTelemetry'));
check('Acoes criticas possuem acompanhamento',payments.includes('trackInteraction')&&orders.includes('trackInteraction')&&stores.includes('trackInteraction')&&plan.includes('trackInteraction'));
check('Status de mensalidade centralizado',billingStatus.includes('Mensalidade em dia')&&billingStatus.includes('Vencimento próximo')&&billingStatus.includes('Mensalidade atrasada')&&adminLayout.includes('getBillingVisualStatus')&&plan.includes('getBillingVisualStatus'));
check('Admin atualiza cobranca em foco e periodicamente',adminLayout.includes('setInterval(refresh,120000)')&&adminLayout.includes("addEventListener('focus'"));
check('Vencimento aceita dias 1 a 31 no Master',stores.includes('max="31"')&&platformApi.includes('Math.min(31'));
check('Banco preserva due_day e trata fim de mes',migrationText.includes('between 1 and 31')&&migrationText.includes('v_last_day')&&migrationText.includes('least(v_day,v_last_day)'));
check('Confirmacao e negacao possuem auditoria server-side',migrationText.includes('subscription_renewal_confirmed')&&migrationText.includes('subscription_renewal_rejected'));
check('Registro de eventos protegido por RPC',migrationText.includes('create table if not exists public.food_platform_event_log')&&migrationText.includes('revoke all on public.food_platform_event_log from anon,authenticated')&&migrationText.includes('food_platform_list_event_log_v1'));
check('Credenciais do lojista geram auditoria sem senha',edge.includes('store_credentials_updated')&&!edge.includes('metadata:{password:'));
check('Financeiro mostra origem do pedido',finance.includes('Pedido automático')&&finance.includes('finance-origin-badge-r69'));
check('OCR reaproveita worker na sessao',reader.includes('cachedOcrWorkerPromise')&&reader.includes("addEventListener('pagehide'"));
check('Campos OCR recebem destaque visual',finance.includes('is-autofilled-r69')&&read('src/styles.css').includes('.is-autofilled-r69'));
check('Migration v0.5.0 presente',has(migration));
check('Validacao v0.5.0 presente',has('supabase/VALIDAR_V050.sql'));
check('Favicon v0.5.0 forcado',index.includes('/favicon-foodweb-v050.svg')&&has('public/favicon-foodweb-v050.svg'));

if(failures.length){console.error(`\n${failures.length} falha(s). v0.5.0 nao esta pronto para publicar.`);for(const item of failures)console.error(`- ${item}`);process.exit(1)}
console.log('\nv0.5.0 pronto. Execute a migration e o VALIDAR_V050.sql no Supabase antes de publicar.');
