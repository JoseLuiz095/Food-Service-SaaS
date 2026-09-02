import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const checks = [];
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const ok = (name, condition, detail = '') => {
  checks.push({ name, condition, detail });
  if (!condition) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
};

const pkg = JSON.parse(read('package.json'));
const app = read('src/App.tsx');
const types = read('src/types/index.ts');
const storeApi = read('src/services/storeApi.ts');
const platformApi = read('src/services/platformApi.ts');
const auth = read('src/contexts/AuthContext.tsx');
const cart = read('src/contexts/CartContext.tsx');
const productForm = read('src/pages/admin/ProductForm.tsx');
const productDetail = read('src/pages/store/ProductDetail.tsx');
const checkout = read('src/pages/store/Checkout.tsx');
const orders = read('src/pages/admin/Orders.tsx');
const storeHours = read('src/utils/storeHours.ts');
const edge = read('supabase/functions/food-public-checkout/index.ts');
const createStoreEdge = read('supabase/functions/food-platform-create-store/index.ts');
const migration = read('supabase/migrations/202608280400_foodservice_shared_database.sql');
const seed = read('supabase/seed/seed_demo.sql');
const config = read('supabase/config.toml');
const adminLayout = read('src/layouts/AdminLayout.tsx');
const masterLayout = read('src/layouts/MasterLayout.tsx');
const css = read('src/styles.css');

const commercialMigration = read('supabase/migrations/202608310900_foodservice_commercial_finance_v030.sql');
const billingApi = read('src/services/billingApi.ts');
const financeApi = read('src/services/financeApi.ts');
const financePage = read('src/pages/admin/Finance.tsx');
const planPage = read('src/pages/admin/Plan.tsx');
const masterPayments = read('src/pages/master/Payments.tsx');
const masterPlans = read('src/pages/master/Plans.tsx');
const billingEdge = read('supabase/functions/food-billing-create-pix/index.ts');
const billingWebhook = read('supabase/functions/food-billing-asaas-webhook/index.ts');
const financeExtract = read('supabase/functions/food-finance-document-extract/index.ts');
const homePage = read('src/pages/store/Home.tsx');
const productCard = read('src/components/ProductCard.tsx');

ok('Pacote Food Service', pkg.name === 'foodservice-saas');
ok('Rotas públicas essenciais', ['/produto/:slug', '/carrinho', '/finalizar', '/pedido/:orderId'].every((fragment) => app.includes(fragment)));
ok('Admin Master preservado', app.includes('/admin-master') && app.includes('MasterLayout'));
ok('Papéis multempresa preparados', ['owner','admin','manager','attendant','kitchen','finance'].every((role) => types.includes(`'${role}'`)));
ok('Modelo de opções flexível', types.includes("'variant' | 'choice' | 'addon' | 'removal'") && types.includes('minChoices') && types.includes('maxChoices'));
ok('Cadastro usa grupos de opções', productForm.includes('optionGroups') && productForm.includes('minChoices') && productForm.includes('maxChoices'));
ok('Detalhe valida mínimo/máximo', productDetail.includes('group.minChoices') && productDetail.includes('group.maxChoices'));
ok('Carrinho diferencia personalizações', cart.includes('normalizedOptionKey') && cart.includes('item.options'));
ok('Checkout envia IDs, não total confiável', storeApi.includes('group_id:option.groupId') && storeApi.includes('item_id:option.itemId') && !storeApi.includes('client_total'));
ok('Pedido é persistido antes do WhatsApp', checkout.indexOf('await registerOrder(') >= 0 && checkout.indexOf('buildWhatsAppMessage(') > checkout.indexOf('await registerOrder('));
ok('Troco implementado', checkout.includes('needsChange') && checkout.includes('changeFor') && migration.includes('change_amount'));
ok('Agendamento validado server-side', checkout.includes('allowScheduledOrders') && migration.includes('food_store_is_accepting_orders') && migration.includes('scheduled_for'));
ok('Horário atravessando meia-noite', storeHours.includes('previous') || storeHours.includes('prev'));
ok('Fluxo operacional de pedido', ['received','confirmed','preparing','ready','out_for_delivery','delivered','picked_up','cancelled'].every((status) => orders.includes(status)));

ok('Namespace de tabelas Food separado', ['food_stores','food_products','food_orders','food_store_users','food_plans'].every((name) => migration.includes(`public.${name}`)));
ok('Frontend não consulta stores do FloriWeb', !storeApi.includes('`stores?') && !platformApi.includes("'stores?") && !auth.includes('`store_users?'));
ok('Frontend usa tabelas Food', storeApi.includes('food_stores?') && storeApi.includes('food_products?') && storeApi.includes('food_orders?'));
ok('Planos Food separados', platformApi.includes('food_plans?') && migration.includes('create table if not exists public.food_plans'));
ok('Demo Food separada', platformApi.includes('food_platform_settings?') && migration.includes('public.food_platform_settings'));
ok('Auth é compartilhado, permissões Master são Food', createStoreEdge.includes("from('food_platform_admins')") && createStoreEdge.includes("from('food_store_users')") && migration.includes('references auth.users(id)'));
ok('Edge Functions possuem namespace Food', config.includes('[functions.food-public-checkout]') && exists('supabase/functions/food-platform-create-store/index.ts'));
ok('Checkout chama RPC Food exclusiva', edge.includes('/rest/v1/rpc/food_create_public_order'));
ok('RPC Food bloqueada no navegador', migration.includes('grant execute on function public.food_create_public_order(jsonb) to service_role') && !migration.includes('grant execute on function public.food_create_public_order(jsonb) to anon'));
ok('Turnstile no servidor', edge.includes('validateTurnstile') && edge.includes('TURNSTILE_REQUIRED'));
ok('Rate limit Food isolado', migration.includes('private.food_public_order_rate_limits') && edge.includes('x-foodservice-security-fingerprint'));
ok('Idempotência Food isolada', migration.includes('unique(store_id,public_request_id)') && edge.includes('public_request_id: requestId'));
ok('Preços recalculados no banco', migration.includes('coalesce(v_product.promotional_price,v_product.price)') && migration.includes('v_total:=round(v_subtotal+v_delivery_fee,2)'));
ok('RLS Food independente', migration.includes('food_products_admin_all') && migration.includes('food_orders_admin_all') && migration.includes('food_store_users_self_select'));
ok('Buckets Food separados', migration.includes("'food-product-images'") && migration.includes("'food-store-assets'") && storeApi.includes("'food-product-images'"));
ok('Seed não grava em tabelas FloriWeb', !/public\.(stores|products|categories|orders|plans|store_subscriptions)\b/.test(seed));
ok('Seed comercial Food Service', seed.includes("'Central Food'") && seed.includes("'X-Bacon Artesanal'") && seed.includes("'Açaí Tradicional'"));
ok('Namespace local Food Service', auth.includes('foodservice_demo_auth_v1') && cart.includes('foodservice_cart_v1'));
ok('Branding principal alterado', adminLayout.includes('Food Service SaaS') && masterLayout.includes('Food Service SaaS'));
ok('Assets Food Service presentes', ['public/assets/food-logo.svg','public/assets/food-hero.svg','public/assets/food-burger.svg','public/assets/food-acai.svg'].every(exists));

ok('Escadinha comercial com 3 planos', ['ESSENTIAL','STARTER','PROFESSIONAL'].every((code)=>commercialMigration.includes(`'${code}'`)) && commercialMigration.includes("demo_duration_days=14"));
ok('Demo libera recursos do Profissional', commercialMigration.includes("p.code in ('DEMO','STARTER','PROFESSIONAL')") && commercialMigration.includes("p.code in ('DEMO','PROFESSIONAL')"));
ok('Essencial limita uma foto', commercialMigration.includes("('ESSENTIAL','Essencial',40,1"));
ok('Feature gates de Analytics e Financeiro', adminLayout.includes("requiresFeature:'analytics'") && adminLayout.includes("requiresFeature:'finance'") && financePage.includes("planHasFeature(planUsage.plan,'finance')"));
ok('Cobrança SaaS separada dos pedidos', commercialMigration.includes('food_subscription_payments') && billingApi.includes('food_create_manual_subscription_payment'));
ok('Comprovante manual obrigatório suportado', commercialMigration.includes('proof_required') && commercialMigration.includes('proof_sent_at') && planPage.includes('Abrir WhatsApp e anexar comprovante') && planPage.includes('Já enviei o comprovante'));
ok('PIX automático opcional usa Asaas server-side', billingEdge.includes("Deno.env.get('ASAAS_API_KEY')") && billingEdge.includes("billingType:'PIX'") && !billingApi.includes('ASAAS_API_KEY'));
ok('Webhook PIX idempotente e renova somente no recebimento', billingWebhook.includes('food_billing_webhook_events') && billingWebhook.includes("eventType==='PAYMENT_RECEIVED'") && billingWebhook.includes('food_confirm_subscription_payment'));
ok('Webhook Asaas protegido por token próprio', billingWebhook.includes("asaas-access-token") && billingWebhook.includes("ASAAS_WEBHOOK_TOKEN"));
ok('Financeiro gerencial Food isolado', ['food_financial_categories','food_financial_entries','food_financial_documents'].every((name)=>commercialMigration.includes(`public.${name}`)));
ok('Receita de pedido só nasce na conclusão', commercialMigration.includes("new.status in ('delivered','picked_up')") && commercialMigration.includes("'income','order'"));
ok('Documento financeiro exige confirmação humana', financeExtract.includes('extracted_json') && !financeExtract.includes("from('food_financial_entries').insert") && financePage.includes('Revise os campos abaixo'));
ok('Leitura de documento usa Cloudflare server-side', financeExtract.includes('/ai/tomarkdown') && financeExtract.includes('/ai/v1/chat/completions') && financeExtract.includes("Deno.env.get('CLOUDFLARE_AI_TOKEN')"));
ok('Buckets financeiros são privados', commercialMigration.includes("'food-finance-documents','food-finance-documents',false"));
ok('Master possui revisão de pagamentos', masterPayments.includes('Confirmar pagamento') && masterPlans.includes('Cobrança da assinatura'));
ok('Visual marketplace alimentar ativo', homePage.includes('food-marketplace-body') && productCard.includes('product-card--food') && css.includes('FoodWeb v0.3 - marketplace alimentar'));
ok('Limite de fotos também é imposto no banco', commercialMigration.includes('food_product_images_plan_limit_trg') && commercialMigration.includes('food_current_plan_image_limit'));
ok('Banner personalizado também é imposto no banco', commercialMigration.includes('food_stores_custom_banner_plan_trg') && commercialMigration.includes("food_store_has_feature(new.id,'custom_banner')"));
ok('Downgrade respeita foto e banner na vitrine', commercialMigration.includes("'cover_url',case when v_custom_banner") && commercialMigration.includes('img.rn<=v_image_limit'));
ok('Mensalidade vencida suspende após carência', commercialMigration.includes('food_suspend_overdue_paid_subscriptions') && commercialMigration.includes("suspension_reason='Mensalidade vencida'"));
ok('Analytics é protegido e calculado no servidor', commercialMigration.includes("food_store_has_feature(p_store_id,'analytics')") && commercialMigration.includes("'conversionRate'") && commercialMigration.includes("'topProducts'"));
ok('PIX manual exige configuração completa no servidor', commercialMigration.includes('Admin Master precisa configurar uma chave PIX') && commercialMigration.includes('WhatsApp de cobranca para receber comprovantes'));

const sourceFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) sourceFiles.push(full);
  }
};
walk(path.join(root, 'src'));
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const target = path.resolve(path.dirname(file), match[1]);
    const candidates = [target, `${target}.ts`, `${target}.tsx`, `${target}.js`, path.join(target, 'index.ts'), path.join(target, 'index.tsx')];
    if (!candidates.some(fs.existsSync)) failures.push(`Import relativo inexistente em ${path.relative(root, file)}: ${match[1]}`);
  }
}

ok('CSS com chaves balanceadas', (css.match(/\{/g) || []).length === (css.match(/\}/g) || []).length);

for (const item of checks) console.log(`${item.condition ? 'OK  ' : 'FAIL'} ${item.name}${item.detail ? ` - ${item.detail}` : ''}`);
if (failures.length) {
  console.error(`\n${failures.length} falha(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`\nSmoke compartilhado concluído: ${checks.length} verificações + ${sourceFiles.length} arquivos TS/TSX.`);
