import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const failures = [];
const check = (name, condition) => { checks.push([name, condition]); if (!condition) failures.push(name); };

const checkout = read('src/pages/store/Checkout.tsx');
const product = read('src/pages/store/ProductDetail.tsx');
const cart = read('src/contexts/CartContext.tsx');
const storeApi = read('src/services/storeApi.ts');
const platformApi = read('src/services/platformApi.ts');
const success = read('src/pages/store/OrderSuccess.tsx');
const orders = read('src/pages/admin/Orders.tsx');
const edge = read('supabase/functions/food-public-checkout/index.ts');
const migration = read('supabase/migrations/202608280400_foodservice_shared_database.sql');
const config = read('supabase/config.toml');

const commercialMigration = read('supabase/migrations/202608310900_foodservice_commercial_finance_v030.sql');
const billingEdge = read('supabase/functions/food-billing-create-pix/index.ts');
const billingWebhook = read('supabase/functions/food-billing-asaas-webhook/index.ts');
const financeExtract = read('supabase/functions/food-finance-document-extract/index.ts');
const financePage = read('src/pages/admin/Finance.tsx');

const registered = checkout.indexOf('await registerOrder(');
const whatsappMessage = checkout.indexOf('buildWhatsAppMessage(');
const confirmation = checkout.indexOf('saveOrderConfirmation(confirmation)');
const clearCart = checkout.indexOf('clear();');
const navigate = checkout.indexOf('navigate(storefrontPath');

check('Pedido é registrado antes de montar WhatsApp', registered >= 0 && whatsappMessage > registered);
check('Confirmação local ocorre depois do banco', confirmation > registered);
check('Carrinho só é limpo depois da confirmação', clearCart > confirmation);
check('Navegação ocorre após limpar carrinho', navigate > clearCart);
check('Checkout usa requestId idempotente', checkout.includes('requestId') && storeApi.includes('requestId:security.requestId'));
check('Unique key Food de idempotência existe', migration.includes('unique(store_id,public_request_id)'));
check('Edge injeta requestId no payload do banco', edge.includes('public_request_id: requestId'));
check('Edge recupera replay em food_orders', edge.includes('idempotentReplay') && edge.includes("from('food_orders')"));
check('RPC Food só é executável pelo service_role', migration.includes('grant execute on function public.food_create_public_order(jsonb) to service_role'));
check('Função pública Food é exceção sem JWT', config.includes('[functions.food-public-checkout]') && config.includes('verify_jwt = false'));
check('Turnstile é verificado', edge.includes('validateTurnstile(token, remoteIp, origin)'));
check('Banco recalcula preço', migration.includes('coalesce(v_product.promotional_price,v_product.price)'));
check('Banco valida opção no produto/loja Food', migration.includes('public.food_product_option_groups') && migration.includes('pog.product_id=v_product.id') && migration.includes('pog.store_id=v_store.id'));
check('Banco valida mínimo/máximo', migration.includes('v_choice_count<v_group.min_choices') && migration.includes('v_choice_count>v_group.max_choices'));
check('Banco recalcula taxa', migration.includes('v_delivery_fee := v_zone.fee'));
check('Banco rejeita loja fechada', migration.includes('food_store_is_accepting_orders(v_store.id,now())'));
check('Banco valida agendamento', migration.includes('food_store_is_accepting_orders(v_store.id,v_scheduled_for)'));
check('Frontend valida grupos obrigatórios', product.includes('group.minChoices') && product.includes('group.maxChoices'));
check('Carrinho usa assinatura das personalizações', cart.includes('normalizedOptionKey'));
check('WhatsApp só é aberto após pedido existente', success.includes('markOrderWhatsAppClicked(confirmation.orderId)') && success.includes('pedido continua salvo'));
check('Status operacional não depende do WhatsApp', orders.includes('Em preparação') && orders.includes('Pronto') && orders.includes('Saiu para entrega'));
check('Food Master lê apenas food_*', platformApi.includes('food_stores?') && platformApi.includes('food_plans?') && !platformApi.includes("'stores?"));
check('Food Admin lê apenas food_*', storeApi.includes('food_products?') && storeApi.includes('food_orders?') && !storeApi.includes('`products?'));
check('Edge Checkout não consulta tabelas FloriWeb', !edge.includes("from('orders')") && !edge.includes("from('store_domains')"));

check('Plano financeiro é bloqueado pelo banco', commercialMigration.includes("food_store_has_feature(p_store_id,'finance')"));
check('Pagamento manual exige comprovante antes da confirmação', commercialMigration.includes("v_payment.provider='manual' and v_payment.proof_required and v_payment.proof_sent_at is null"));
check('Confirmação de mensalidade é idempotente', commercialMigration.includes("if v_payment.status='paid' then return v_payment"));
check('Confirmação de mensalidade renova um mês e reativa loja', commercialMigration.includes("interval '1 month'") && commercialMigration.includes("access_status='online'"));
check('Asaas não expõe API key no navegador', billingEdge.includes("Deno.env.get('ASAAS_API_KEY')") && !read('src/services/billingApi.ts').includes('ASAAS_API_KEY'));
check('Webhook rejeita chamada sem token Asaas', billingWebhook.includes("req.headers.get('asaas-access-token')!==expected"));
check('Webhook processa PAYMENT_RECEIVED e evita replay', billingWebhook.includes("PAYMENT_RECEIVED") && billingWebhook.includes('processed_at') && billingWebhook.includes('replayed:true'));
check('OCR/IA não grava financeiro automaticamente', !financeExtract.includes("from('food_financial_entries').insert") && financePage.includes('Salvar lançamento'));
check('Financeiro de pedido evita duplicidade', commercialMigration.includes('food_financial_entries_order_uidx') && commercialMigration.includes('on conflict(store_id,order_id)'));
check('Storage financeiro valida loja no caminho', commercialMigration.includes("split_part(name,'/',2)") && financeExtract.includes("storagePath.startsWith(`stores/${storeId}/`)"));
check('Plano Essencial não burla limite de foto por API', commercialMigration.includes('food_enforce_product_image_plan_limit') && commercialMigration.includes("raise exception 'Seu plano permite no maximo"));
check('Plano sem banner não burla capa personalizada por API', commercialMigration.includes('food_enforce_custom_banner_plan') && commercialMigration.includes("not public.food_store_has_feature(new.id,'custom_banner')"));
check('Downgrade não mantém vantagens públicas do plano anterior', commercialMigration.includes('v_custom_banner:=public.food_store_has_feature') && commercialMigration.includes('v_image_limit:=public.food_current_plan_image_limit'));
check('Acesso pago vence automaticamente depois da carência', commercialMigration.includes('foodservice-paid-expiration-hourly') && commercialMigration.includes('food_suspend_overdue_paid_subscriptions'));
check('Analytics não pode ser consultado por plano sem recurso', commercialMigration.includes("raise exception 'Analytics nao esta incluido no plano atual.'"));
check('Renovação antecipada preserva período já pago', commercialMigration.includes('Pagamento antecipado preserva os dias ja pagos') && commercialMigration.includes('greatest(coalesce(v_sub.next_due_date'));

for (const [name, condition] of checks) console.log(`${condition ? 'OK  ' : 'FAIL'} ${name}`);
if (failures.length) {
  console.error(`\n${failures.length} falha(s) críticas:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`\nFluxo crítico compartilhado concluído: ${checks.length} verificações.`);
