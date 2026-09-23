import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const checks=[];
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const exists=(file)=>fs.existsSync(path.join(root,file));
const ok=(name,condition,detail='')=>{checks.push({name,condition,detail});if(!condition)failures.push(`${name}${detail?`: ${detail}`:''}`)};

const pkg=JSON.parse(read('package.json'));
const app=read('src/App.tsx');
const types=read('src/types/index.ts');
const storeApi=read('src/services/storeApi.ts');
const platformApi=read('src/services/platformApi.ts');
const billingApi=read('src/services/billingApi.ts');
const auth=read('src/contexts/AuthContext.tsx');
const cart=read('src/contexts/CartContext.tsx');
const productForm=read('src/pages/admin/ProductForm.tsx');
const productDetail=read('src/pages/store/ProductDetail.tsx');
const checkout=read('src/pages/store/Checkout.tsx');
const orders=read('src/pages/admin/Orders.tsx');
const storeHours=read('src/utils/storeHours.ts');
const edge=read('supabase/functions/food-public-checkout/index.ts');
const createStoreEdge=read('supabase/functions/food-platform-create-store/index.ts');
const localReader=read('src/utils/localFinancialDocumentReader.ts');
const migration=read('supabase/migrations/202608280400_foodservice_shared_database.sql');
const commercialMigration=read('supabase/migrations/202608310900_foodservice_commercial_finance_v030.sql');
const v040=read('supabase/migrations/202609020800_foodweb_v040_manual_pix_finance_visual.sql');
const v044=read('supabase/migrations/202609031500_foodweb_v044_security_contact.sql');
const publicContact=read('supabase/functions/food-public-contact/index.ts');
const landing=read('src/pages/store/Landing.tsx');
const adminLogin=read('src/pages/admin/Login.tsx');
const masterLogin=read('src/pages/master/Login.tsx');
const helpButton=read('src/components/PlatformHelpButton.tsx');
const seed=read('supabase/seed/seed_demo.sql');
const config=read('supabase/config.toml');
const adminLayout=read('src/layouts/AdminLayout.tsx');
const masterLayout=read('src/layouts/MasterLayout.tsx');
const css=read('src/styles.css');
const financePage=read('src/pages/admin/Finance.tsx');
const planPage=read('src/pages/admin/Plan.tsx');
const storeContext=read('src/contexts/StoreContext.tsx');
const orderPaymentMigration=read('supabase/migrations/202609041610_foodweb_v049_order_payment_finance.sql');
const masterPayments=read('src/pages/master/Payments.tsx');
const masterPlans=read('src/pages/master/Plans.tsx');
const diagnostics=read('src/pages/master/Diagnostics.tsx');
const pix=read('src/utils/pix.ts');
const favicon=read('public/favicon.svg');
const home=read('src/pages/store/Home.tsx');
const header=read('src/components/StoreHeader.tsx');
const billingStatus=read('src/utils/billingStatus.ts');

ok('Pacote FoodWeb v0.6.3',pkg.name==='foodservice-saas'&&pkg.version==='0.6.3');
const selfSignup = read('src/pages/store/SelfSignup.tsx');
const selfSignupService = read('src/services/selfServiceSignup.ts');
const signupRequests = read('src/pages/master/SignupRequests.tsx');
const m056 = read('supabase/migrations/202609171935_foodweb_v056_self_service_signup.sql');
ok('v0.5.6 auto cadastro publico existe', app.includes('path=\"/cadastro\"') && selfSignup.includes('Criar nova conta'));
ok('v0.5.6 Demo com elegibilidade cadastral', exists('supabase/migrations/202609180810_foodweb_v056_trial_eligibility_hardening.sql') && selfSignup.includes('validação cadastral do negócio') && selfSignupService.includes('complete_self_service_signup_v2'));
ok('v0.5.6 Master aprova auto cadastro', signupRequests.includes('Liberar') && selfSignupService.includes('food_platform_approve_self_service_signup_v2'));
ok('v0.5.6 workspace limitado antes da aprovacao', auth.includes('pendingWorkspace') && app.includes('preparationRouteAllowed') && adminLayout.includes('preparationNavAllowed') && adminLayout.includes('self-service-approval-banner'));
ok('Rotas públicas essenciais',['/produto/:slug','/carrinho','/finalizar','/pedido/:orderId'].every((fragment)=>app.includes(fragment)));
ok('Admin Master preservado',app.includes('/admin-master')&&app.includes('MasterLayout'));
ok('Papéis multempresa preparados',['owner','admin','manager','attendant','kitchen','finance'].every((role)=>types.includes(`'${role}'`)));
ok('Modelo de opções flexível',types.includes("'variant' | 'choice' | 'addon' | 'removal'")&&types.includes('minChoices')&&types.includes('maxChoices'));
ok('Cadastro usa grupos de opções',productForm.includes('optionGroups')&&productForm.includes('minChoices')&&productForm.includes('maxChoices'));
ok('Carrinho diferencia personalizações',cart.includes('normalizedOptionKey')&&cart.includes('item.options'));
ok('Checkout envia IDs, não total confiável',storeApi.includes('group_id:option.groupId')&&storeApi.includes('item_id:option.itemId')&&!storeApi.includes('client_total'));
ok('Pedido é persistido antes do WhatsApp',checkout.indexOf('await registerOrder(')>=0&&checkout.indexOf('buildWhatsAppMessage(')>checkout.indexOf('await registerOrder('));
ok('Troco implementado',checkout.includes('needsChange')&&checkout.includes('changeFor')&&migration.includes('change_amount'));
ok('Agendamento validado server-side',checkout.includes('allowScheduledOrders')&&migration.includes('food_store_is_accepting_orders')&&migration.includes('scheduled_for'));
ok('Horário atravessando meia-noite',storeHours.includes('previous')||storeHours.includes('prev'));
ok('Fluxo operacional de pedido',['received','confirmed','preparing','ready','out_for_delivery','delivered','picked_up','cancelled'].every((status)=>orders.includes(status)));

ok('Namespace de tabelas Food separado',['food_stores','food_products','food_orders','food_store_users','food_plans'].every((name)=>migration.includes(`public.${name}`)));
ok('Frontend não consulta stores do FloriWeb',!storeApi.includes('`stores?')&&!platformApi.includes("'stores?")&&!auth.includes('`store_users?'));
ok('Frontend usa tabelas Food',storeApi.includes('food_stores?')&&storeApi.includes('food_products?')&&storeApi.includes('food_orders?'));
ok('RLS Food independente',migration.includes('food_products_admin_all')&&migration.includes('food_orders_admin_all'));
ok('Buckets Food separados',migration.includes("'food-product-images'")&&migration.includes("'food-store-assets'")&&commercialMigration.includes("'food-finance-documents','food-finance-documents',false"));
ok('Seed comercial Food Service',seed.includes("'Central Food'")&&seed.includes("'X-Bacon Artesanal'"));
ok('Branding FoodWeb aplicado',adminLayout.includes('FoodWeb')&&masterLayout.includes('FoodWeb')&&header.includes('foodweb-wordmark'));
ok('Favicon FoodWeb substitui identidade floral',(favicon.includes('#ea1d2c')||favicon.includes('#d66539'))&&!favicon.toLowerCase().includes('flower'));
ok('Redesign marketplace aplicado',css.includes('FoodWeb v0.4.0')&&css.includes('--food-red:#ea1d2c')&&home.includes('Os queridinhos da casa')&&header.includes('Pedido direto com o estabelecimento'));

ok('Escadinha comercial com 3 planos',['ESSENTIAL','STARTER','PROFESSIONAL'].every((code)=>commercialMigration.includes(`'${code}'`))&&commercialMigration.includes('demo_duration_days=14'));
ok('Cobrança permanece somente manual',masterPlans.includes('Conferência manual')&&!masterPlans.includes('Asaas')&&!masterPayments.includes('Asaas')&&!exists('supabase/functions/food-billing-create-pix/index.ts')&&!exists('supabase/functions/food-billing-asaas-webhook/index.ts'));
ok('Admin Master cadastra PIX e WhatsApp',masterPlans.includes('billingPixKey')&&masterPlans.includes('billingPixHolderName')&&masterPlans.includes('billingPixCity')&&masterPlans.includes('billingWhatsapp'));
ok('PIX por plano usa preço do servidor',planPage.includes('charge.payment.amount')&&pix.includes('buildStaticPixCopyPaste')&&pix.includes("id: '54'"));
ok('Mudança de plano registrada no banco',v040.includes("payment_intent in ('renewal','plan_change')")&&v040.includes('previous_plan_id'));
ok('Comprovante WhatsApp obrigatório',planPage.includes('Comprovante obrigatório')&&planPage.includes('Já enviei o comprovante')&&v040.includes("'proofRequired',true"));
ok('Master confirma manualmente o pagamento',masterPayments.includes('Confirmar renovação')&&masterPayments.includes('Confirmar alteração de plano')&&masterPayments.includes('proofRequired'));
ok('Financeiro gerencial Food isolado',['food_financial_categories','food_financial_entries','food_financial_documents'].every((name)=>commercialMigration.includes(`public.${name}`)));
ok('Financeiro mostra resultado e despesas',financePage.includes('Resultado gerencial')&&financePage.includes('Principais despesas')&&financePage.includes('Entradas × saídas'));
ok('Entrada/saída permanece sob revisão humana',!financePage.includes('direction:suggestion.direction')&&financePage.includes('nunca salva automaticamente'));
ok('Leitura financeira local instalada',localReader.includes("import('tesseract.js')")&&localReader.includes("import('pdfjs-dist')")&&financePage.includes('readLocalFinancialDocument'));
ok('Boleto possui parser determinístico local',localReader.includes('amountFromBoletoDigits')&&localReader.includes('boletoDigits')&&localReader.includes('extractDueOn'));
ok('Financeiro mostra diagnóstico da leitura',financePage.includes('recognizedFields')&&financePage.includes('Ver texto reconhecido no arquivo'));
ok('OCR local não grava lançamento automaticamente',localReader.includes('parseResult')&&financePage.includes('financeApi.saveEntry')&&!localReader.includes('financial_entries'));
ok('OCR local valida MIME e tamanho no navegador',localReader.includes('MAX_IMAGE_BYTES')&&localReader.includes('MAX_PDF_BYTES')&&localReader.includes('ensureAllowedFile'));
ok('Financeiro não depende mais de Edge Function de OCR/IA',!financePage.includes('food-finance-document-extract')&&!financePage.includes('CLOUDFLARE_AI_TOKEN'));
ok('Receita de pedido nasce na confirmacao do recebimento',orderPaymentMigration.includes("new.payment_status='paid'")&&orderPaymentMigration.includes("'income','order'"));

ok('Checkout aceita origem oficial FoodWeb',edge.includes("'https://foodweb.joseluizacama.workers.dev'")&&edge.includes('originAllowed: allowedOrigin(origin)'));
ok('GET de diagnóstico não bloqueia por CORS',edge.includes('originsConfigured: origins.size > 0')&&!edge.includes("if (!allowedOrigin(origin)) {\n      return new Response"));
ok('Turnstile obrigatório suportado',edge.includes('TURNSTILE_REQUIRED')&&edge.includes('validateTurnstile'));
ok('Diagnóstico ensina deploy Supabase',diagnostics.includes('Wrangler não publica Edge Functions do Supabase')&&diagnostics.includes('food-public-checkout'));
ok('Diagnóstico lê cron real',v040.includes("from cron.job")&&v040.includes("'demoCronScheduled',v_demo_cron_exists and v_demo_cron_active"));
ok('Migration v0.4 só usa namespace Food',!/alter table public\.(stores|products|orders|plans|store_subscriptions)\b/i.test(v040));

const sourceFiles=[];
const walk=(dir)=>{
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())walk(full);
    else if(/\.(ts|tsx)$/.test(entry.name))sourceFiles.push(full);
  }
};
walk(path.join(root,'src'));
for(const file of sourceFiles){
  const text=fs.readFileSync(file,'utf8');
  for(const match of text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)){
    const target=path.resolve(path.dirname(file),match[1]);
    const candidates=[target,`${target}.ts`,`${target}.tsx`,`${target}.js`,path.join(target,'index.ts'),path.join(target,'index.tsx')];
    if(!candidates.some(fs.existsSync))failures.push(`Import relativo inexistente em ${path.relative(root,file)}: ${match[1]}`);
  }
}

ok('CSS com chaves balanceadas',(css.match(/\{/g)||[]).length===(css.match(/\}/g)||[]).length);

ok('Supabase publico possui fallback de producao', read('src/lib/config.ts').includes('FOODWEB_DEFAULT_SUPABASE_URL'));
ok('Landing comercial FoodWeb preservada',landing.includes('Seu cardápio profissional')&&landing.includes('InteractiveShowcase')&&landing.includes('ExistingValueSection'));
ok('Teste de 14 dias com CTA para criar conta', read('src/pages/store/Landing.tsx').includes('Criar conta e testar')&&read('src/pages/store/Landing.tsx').includes('{trialDays} dias')&&read('src/data/platformDefaults.ts').includes('demoDurationDays: 14'));
ok('WhatsApp comercial e suporte configuráveis', masterPlans.includes('marketingWhatsapp')&&masterPlans.includes('supportWhatsapp')&&read('src/services/platformApi.ts').includes('support_whatsapp'));
ok('Suporte flutuante restrito ao Admin',helpButton.includes('loadAdminSupportContact')&&(adminLayout.includes('<PlatformHelpButton/>')||adminLayout.includes('<PlatformHelpButton />'))&&(masterLayout.includes('<PlatformHelpButton/>')||masterLayout.includes('<PlatformHelpButton />'))&&!home.includes('PlatformHelpButton'));
ok('Previews visuais otimizados incluídos', exists('public/assets/marketing/storefront-preview.webp')&&exists('public/assets/marketing/storefront-products.webp')&&exists('public/assets/marketing/storefront-hero.webp'));
ok('Migration v0.4.3 adiciona WhatsApp sem tocar FloriWeb', read('supabase/migrations/202609021600_foodweb_v043_storefront_sales_whatsapp.sql').includes('support_whatsapp')&&!/alter table public\.(stores|products|orders|plans)\b/i.test(read('supabase/migrations/202609021600_foodweb_v043_storefront_sales_whatsapp.sql')));
ok('Landing lista lojas e planos via RPC', read('src/services/landingApi.ts').includes('food_get_public_landing_v1'));
ok('Migration v0.4.2 permanece no namespace Food', read('supabase/migrations/202609021020_foodweb_v042_public_landing.sql').includes('food_get_public_landing_v1')&&!/alter table public\.(stores|products|orders|plans)\b/i.test(read('supabase/migrations/202609021020_foodweb_v042_public_landing.sql')));
ok('Contato comercial público usa Turnstile e rate limit',publicContact.includes('validateTurnstile')&&publicContact.includes('food_enforce_public_contact_rate_limit')&&config.includes('[functions.food-public-contact]')&&config.includes('verify_jwt = false'));
ok('Landing pública não recebe telefones da plataforma',!read('src/services/landingApi.ts').includes('marketingWhatsapp')&&!read('src/services/landingApi.ts').includes('supportWhatsapp')&&v044.includes("'contact_protected', true"));
ok('Suporte interno exige autenticação owner/admin ou Master',v044.includes('food_get_admin_support_contact_v1')&&v044.includes("su.role in ('owner','admin')")&&v044.includes('food_platform_admins'));
ok('Login Admin protegido por Turnstile',adminLogin.includes('action="login"')&&adminLogin.includes('captchaToken')&&auth.includes('options: captchaToken ? { captchaToken }'));
ok('Login Master protegido por Turnstile',masterLogin.includes('action="login"')&&masterLogin.includes('captchaToken'));
ok('CTA público não expõe telefone no DOM',landing.includes('ProtectedContactButton')&&!landing.includes('wa.me/')&&!landing.includes('supportWhatsapp'));


ok('FoodWeb v0.4.6 possui migration de mensalidade e acesso', exists('supabase/migrations/202609032230_foodweb_v046_billing_access.sql'));
ok('FoodWeb v0.4.6 possui gestão de e-mail/senha do lojista', exists('supabase/functions/food-platform-manage-store-user/index.ts')&&(read('src/pages/master/Stores.tsx').includes('Atualizar e-mail / senha')||read('src/pages/master/Stores.tsx').includes('Salvar e-mail / senha')));
ok('FoodWeb v0.4.6 mostra vencimento no Master', read('src/pages/master/Stores.tsx').includes('<th>Vencimento</th>')&&read('src/pages/master/Stores.tsx').includes('master-due-cell-v046'));
ok('FoodWeb v0.4.6 permite negar renovação', read('src/pages/master/Payments.tsx').includes('Não confirmar renovação')&&read('src/services/platformApi.ts').includes('food_platform_reject_subscription_payment_v1'));
ok('FoodWeb v0.4.7 mostra status verde amarelo vermelho no topo', read('src/layouts/AdminLayout.tsx').includes('admin-billing-status-v047')&&read('src/layouts/AdminLayout.tsx').includes('is-warning')&&billingStatus.includes('Mensalidade atrasada')&&billingStatus.includes('Mensalidade em dia')&&billingStatus.includes('Vencimento próximo'));
ok('FoodWeb v0.4.7 topo abre Meu plano no vencimento', read('src/layouts/AdminLayout.tsx').includes('/admin/plano#vencimento')&&planPage.includes('id="vencimento"'));
ok('FoodWeb v0.4.7 OCR reforca imagem pequena e valor por contexto',localReader.includes('MAX_UPSCALE')&&localReader.includes('LEITURA REFORCADA')&&localReader.includes('VALOR\\s+DO\\s+DOCUMENTO')&&localReader.includes('scoreAmountContext'));
ok('FoodWeb v0.4.8 mostra e-mail e senha no topo da gestao do cliente',read('src/pages/master/Stores.tsx').includes('master-credential-edit-v048')&&read('src/pages/master/Stores.tsx').indexOf('master-credential-edit-v048')<read('src/pages/master/Stores.tsx').indexOf('PLANO E COBRANÇA')&&read('src/pages/master/Stores.tsx').includes('Salvar e-mail / senha'));
ok('FoodWeb v0.4.8 estilos deixam acesso do lojista visivel',read('src/styles.css').includes('master-credential-edit-v048')&&read('src/styles.css').includes('master-credential-grid-v048'));
ok('FoodWeb v0.4.6 mostra ultimo pagamento ao lojista', read('src/pages/admin/Plan.tsx').includes('ÚLTIMO PAGAMENTO')&&read('src/pages/admin/Plan.tsx').includes('Próximo vencimento'));
ok('FoodWeb v0.4.6 preserva dia de vencimento no banco', read('supabase/migrations/202609032230_foodweb_v046_billing_access.sql').includes('food_subscription_reference_due_v1')&&read('supabase/migrations/202609032230_foodweb_v046_billing_access.sql').includes('v_reference_due'));



ok('FoodWeb v0.4.9 pedido possui estado de recebimento',types.includes("OrderPaymentStatus = 'pending' | 'paid'")&&storeApi.includes('payment_status')&&storeApi.includes('paymentReceivedAt'));
ok('FoodWeb v0.4.9 Orders possui botao Confirmar recebimento',orders.includes('Confirmar recebimento')&&orders.includes('confirmOrderPayment'));
ok('FoodWeb v0.4.9 StoreContext publica confirmacao de recebimento',storeContext.includes('confirmOrderPayment: typeof storeApi.confirmOrderPayment')&&storeContext.includes('storeApi.confirmOrderPayment(orderId)'));
ok('FoodWeb v0.4.9 confirmacao usa RPC transacional',storeApi.includes('rpc/food_confirm_order_payment_v1'));
ok('FoodWeb v0.4.9 migration troca receita de entrega por recebimento',orderPaymentMigration.includes('food_confirm_order_payment_v1')&&orderPaymentMigration.includes("new.payment_status='paid'")&&!orderPaymentMigration.includes("new.status in ('delivered','picked_up')"));
ok('FoodWeb v0.4.9 preserva anti-duplicidade por pedido',orderPaymentMigration.includes('food_financial_entries_order_uidx')||commercialMigration.includes('food_financial_entries_order_uidx'));
ok('FoodWeb v0.4.9 cancelamento invalida receita automatica',orderPaymentMigration.includes("new.status='cancelled'")&&orderPaymentMigration.includes("set status='cancelled'"));
ok('FoodWeb v0.4.9 Financeiro explica recebimento confirmado',financePage.includes('Pedidos com recebimento confirmado entram automaticamente como receita'));
ok('FoodWeb v0.4.9 possui SQL de validacao',exists('supabase/VALIDAR_V049.sql'));

ok('FoodWeb v0.5.0 possui botao explicito Confirmar renovacao',read('src/pages/master/Payments.tsx').includes('Confirmar renovação')&&read('src/pages/master/Payments.tsx').includes('Confirmar alteração de plano'));
ok('FoodWeb v0.5.0 registra interacoes e erros',exists('src/services/interactionTelemetry.ts')&&read('src/main.tsx').includes('installGlobalInteractionTelemetry'));
ok('FoodWeb v0.5.0 possui centro de pendencias no Master',read('src/pages/master/Dashboard.tsx').includes('CENTRO DE PENDÊNCIAS')&&read('src/pages/master/Dashboard.tsx').includes('listPlatformEvents'));
ok('FoodWeb v0.5.0 diagnostico mostra falhas e interacoes sem conclusao',read('src/pages/master/Diagnostics.tsx').includes('Interações sem conclusão')&&read('src/pages/master/Diagnostics.tsx').includes('Falhas recentes'));
ok('FoodWeb v0.5.0 vencimento aceita dias 1 a 31',read('src/pages/master/Stores.tsx').includes('max="31"')&&read('supabase/migrations/202609151040_foodweb_v050_stability_billing_audit.sql').includes('between 1 and 31'));
ok('FoodWeb v0.5.0 fevereiro usa ultimo dia sem perder due_day',read('supabase/migrations/202609151040_foodweb_v050_stability_billing_audit.sql').includes('least(v_day,v_last_day)'));
ok('FoodWeb v0.5.0 OCR reaproveita worker na sessao',read('src/utils/localFinancialDocumentReader.ts').includes('cachedOcrWorkerPromise')&&read('src/utils/localFinancialDocumentReader.ts').includes('pagehide'));
ok('FoodWeb v0.5.0 Financeiro destaca origem e campos do OCR',read('src/pages/admin/Finance.tsx').includes('finance-origin-badge-r69')&&read('src/pages/admin/Finance.tsx').includes('is-autofilled-r69'));
ok('FoodWeb v0.5.0 auditoria critica existe no banco',read('supabase/migrations/202609151040_foodweb_v050_stability_billing_audit.sql').includes('food_platform_event_log')&&read('supabase/migrations/202609151040_foodweb_v050_stability_billing_audit.sql').includes('subscription_renewal_confirmed'));
ok('FoodWeb v0.5.0 possui SQL de validacao',exists('supabase/VALIDAR_V050.sql'));

for(const item of checks)console.log(`${item.condition?'OK  ':'FAIL'} ${item.name}${item.detail?` - ${item.detail}`:''}`);

const v051Migration=read('supabase/migrations/202609151340_foodweb_v051_plan_alignment.sql');
ok('v0.5.1 planos comerciais alinhados',platformApi.includes("name:'Profissional'")&&platformApi.includes('monthlyPrice:89.9')&&platformApi.includes("name:'Premium'")&&platformApi.includes('monthlyPrice:149.9'));
ok('v0.5.1 nao vende multiusuario',!masterPlans.includes('value={plan.adminUserLimit')&&!planPage.includes('usuarios administrativos')&&!platformApi.includes("'multi_user'"));
ok('v0.5.1 Business sob medida aparece no painel',planPage.includes('food-business-plan-v051')&&planPage.includes('Sob consulta')&&planPage.includes('Domínio próprio incluído'));
ok('v0.5.1 Business aparece na landing',landing.includes('food-business-sales-v051')&&landing.includes('Quero avaliar um projeto Business'));
ok('v0.5.1 Master explica Business sob medida',masterPlans.includes('master-business-v051')&&masterPlans.includes('Valor sob consulta'));
ok('v0.5.1 migration alinha planos e desabilita multi_user',v051Migration.includes("name='Profissional'")&&v051Migration.includes('monthly_price=89.90')&&v051Migration.includes("name='Premium'")&&v051Migration.includes('monthly_price=149.90')&&v051Migration.includes("feature_code='multi_user'"));
ok('v0.5.1 Premium possui dominio proprio',v051Migration.includes('custom_domain=true'));


const interactiveV057=read('src/components/marketing/InteractiveShowcase.tsx');
const marketV057=read('supabase/migrations/202609211600_foodweb_v057_market_positioning.sql');
ok('v0.5.7 demonstracao cliente + gestao', landing.includes('InteractiveShowcase') && interactiveV057.includes('Experiência do cliente') && interactiveV057.includes('Painel de gestão'));
ok('v0.5.7 precos de teste comercial', marketV057.includes("when 'STARTER' then 79.90") && marketV057.includes("when 'PROFESSIONAL' then 129.90"));
ok('v0.5.7 Demo futuro de 14 dias', marketV057.includes('demo_duration_days = 14'));


const interactiveV058=read('src/components/marketing/InteractiveShowcase.tsx');
const valueV058=read('src/components/marketing/ExistingValueSection.tsx');
const landingV058=read('src/pages/store/Landing.tsx');
ok('v0.5.8 pedido demo localStorage',interactiveV058.includes('foodweb_interactive_demo_v060')&&interactiveV058.includes('Finalizar pedido demonstrativo')&&interactiveV058.includes('Ver no painel de gestão'));
ok('v0.5.8 pedido aparece na gestao',interactiveV058.includes('setOrders((current)=>[order,...current])')&&interactiveV058.includes('Confirmar recebimento')&&interactiveV058.includes('foodStatuses'));
ok('v0.5.9 CTA principal preserva teste',landingV058.includes('Criar conta e testar')&&landingV058.includes('href="#demonstracao"'));
ok('v0.5.9 remove CTA criar conta duplicado',!landingV058.includes('sales-nav-self-service')&&!landingV058.includes('sales-cta-self-service'));
ok('v0.5.9 planos usam contato comercial',!landingV058.includes('sales-plan-self-service--primary')&&landingV058.includes('sales-plan-contact-v59'));
ok('v0.5.9 Profissional detalhado',landingV058.includes('Até 120 produtos no cardápio')&&landingV058.includes('Até 30 categorias e 120 adicionais')&&landingV058.includes('Leitura local de boletos, cupons e comprovantes'));
ok('v0.5.9 CTA final WhatsApp',landingV058.includes('Entrar em contato no WhatsApp')&&landingV058.includes('sales-cta-contact-v59'));
ok('v0.5.9 visual de planos aplicado',css.includes('FOODWEB_LANDING_PLANOS_V059'));
ok('v0.5.8 remove demo estatica e texto explicativo',!landingV058.includes('demonstracao-legado')&&!interactiveV058.includes('Não é um slide:'));
ok('v0.5.8 valor real do produto',valueV058.includes('Venda sem comissão por pedido')&&valueV058.includes('Financeiro ligado ao recebimento')&&valueV058.includes('Leitura assistida de documentos'));
ok('v0.5.8 fallback global de produto',read('public/assets/placeholder-food.svg').includes('PRODUCT_IMAGE_FALLBACK_V058'));
const v060Migration=read('supabase/migrations/202609221300_foodweb_v060_product_personalization.sql');
const productMediaV060=read('src/components/ProductMedia.tsx');
ok('v0.6.0 emoji persistido no produto',v060Migration.includes('visual_emoji')&&storeApi.includes('visual_emoji:product.visualEmoji')&&types.includes('visualEmoji?: string'));
ok('v0.6.0 admin oferece emoji sem foto',productForm.includes('Visual sem foto')&&productForm.includes('productEmojiOptions')&&productForm.includes('product.visualEmoji'));
ok('v0.6.0 admin possui atalhos de personalizacao',productForm.includes('groupPresets')&&productForm.includes('Remover ingredientes')&&productForm.includes('Ponto da carne')&&productForm.includes('Banana'));
ok('v0.6.0 adicionais aceitam quantidade no cliente',productDetail.includes('changeAddonQuantity')&&productDetail.includes('addon-quantity-v060')&&cart.includes('option.quantity'));
ok('v0.6.0 midia usa emoji quando nao ha imagem',productMediaV060.includes('hasProductImage')&&productMediaV060.includes('product-emoji-visual')&&read('src/components/ProductCard.tsx').includes('visualEmoji'));
ok('v0.6.0 demonstracao mostra adicionais reais',interactiveV058.includes('selectedAddons')&&interactiveV058.includes('Bacon extra')&&interactiveV058.includes('Banana')&&interactiveV058.includes('Cadastro com imagem ou emoji'));
ok('v0.6.0 possui SQL de validacao',exists('supabase/VALIDAR_V060.sql'));


if(failures.length){
  console.error(`\n${failures.length} falha(s):`);
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
const ordersV061=read('src/pages/admin/Orders.tsx');
const cartV061=read('src/pages/store/Cart.tsx');
const settingsV061=read('src/pages/admin/Settings.tsx');
const landingV061=read('src/pages/store/Landing.tsx');
const growthMigrationV061=read('supabase/migrations/202609222000_foodweb_v061_growth_tools.sql');
ok('v0.6.1 recuperacao de vendas manual',ordersV061.includes('Recuperação de vendas')&&ordersV061.includes('buildSalesRecoveryMessage'));
ok('v0.6.1 CRM simples de clientes',ordersV061.includes('CRM simples de clientes')&&ordersV061.includes('Mensagem de recompra'));
ok('v0.6.1 KDS opcional em Pedidos',settingsV061.includes('Modo cozinha / KDS')&&ordersV061.includes('COZINHA / KDS')&&growthMigrationV061.includes('kds_enabled'));
ok('v0.6.1 upsell no carrinho',cartV061.includes('Que tal levar também?')&&cartV061.includes('cart-upsell-v061'));
ok('v0.6.1 pedir novamente local',cartV061.includes('Pedir novamente')&&read('src/pages/store/Checkout.tsx').includes('saveRecentOrder'));
ok('v0.6.1 landing comunica novas ferramentas',landingV061.includes('Recuperação de vendas')&&landingV061.includes('Cozinha / KDS opcional')&&landingV061.includes('CRM simples + pedir novamente'));
ok('v0.6.1 SQL de validacao existe',exists('supabase/VALIDAR_V061.sql'));
console.log(`\nSmoke FoodWeb v0.6.2 concluído: ${checks.length} verificações + ${sourceFiles.length} arquivos TS/TSX.`);


// FoodWeb v0.5.4 - paridade visual com FloriWeb no Admin/Admin Master
ok('v0.5.4 Admin usa agrupamento visual do FloriWeb',adminLayout.includes("label: 'Operação'")&&adminLayout.includes("label: 'Catálogo'")&&adminLayout.includes("label: 'Gestão'")&&adminLayout.includes("label: 'Conta'"));
ok('v0.5.4 Admin preserva regras Food por feature',adminLayout.includes('requiresFeature')&&adminLayout.includes('planHasFeature'));
ok('v0.5.4 Admin preserva navegacao para Admin Master',adminLayout.includes('platformAdmin')&&adminLayout.includes('/admin-master'));
ok('v0.5.4 visual possui marcador de paridade',css.includes('FoodWeb v0.5.4 — paridade visual com FloriWeb'));
ok('v0.5.4 visual mantem identidade alimentar',css.includes('--food-admin-accent:#c85d37')&&css.includes('--food-admin-sidebar:#3b251f'));
ok('v0.5.4 Admin Master usa mesmo sistema de cards',css.includes('.master-shell .admin-content')&&css.includes('.master-admin-mini'));

// FoodWeb v0.5.2 - acabamento para producao
const settingsV052=read('src/pages/admin/Settings.tsx');
const orderSuccessV052=read('src/pages/store/OrderSuccess.tsx');
ok('v0.5.2 pedidos possuem filtros e ordenacao',orders.includes('orders-toolbar--filters')&&orders.includes('Ordenar por')&&orders.includes('statusFilter'));
ok('v0.5.2 pedido relacionado abre destacado',financePage.includes('/admin/pedidos?highlight=')&&orders.includes('order-row-highlighted')&&orders.includes('highlightedOrderId'));
ok('v0.5.2 horario de hoje com outros dias',header.includes('<strong>Hoje</strong>')&&header.includes('Ver horários da semana')&&header.includes('food-hours-popover'));
ok('v0.5.2 popover fecha ao clicar fora',header.includes('pointerdown')&&header.includes('hoursRef'));
ok('v0.5.2 pausa de almoco configuravel',settingsV052.includes('breakStart')&&settingsV052.includes('breakEnd')&&settingsV052.includes('Fechar para almoço'));
ok('v0.5.2 PIX possui botao textual para copiar',orderSuccessV052.includes('Copiar PIX'));
ok('v0.5.2 admin segue padrao estrutural do FloriWeb',masterLayout.includes('master-admin-mini')&&css.includes('text-overflow:ellipsis'));

if(failures.length){
  console.error(`\n${failures.length} falha(s) apos as verificacoes v0.6.1:`);
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Smoke final FoodWeb v0.6.2: ${checks.length} verificações aprovadas.`);


// FoodWeb v0.6.2 - refinamento operacional e comercial
const settingsV062=read('src/pages/admin/Settings.tsx');
const ordersV062=read('src/pages/admin/Orders.tsx');
const landingV062=read('src/pages/store/Landing.tsx');
const masterPlansV062=read('src/pages/master/Plans.tsx');
const landingApiV062=read('src/services/landingApi.ts');
const opMigrationV062=read('supabase/migrations/202609230900_foodweb_v062_operational_refinement.sql');
const benefitsMigrationV062=read('supabase/migrations/202609231000_foodweb_v062_plan_marketing_benefits.sql');
ok('v0.6.2 recuperacao configuravel',settingsV062.includes('salesRecoveryMinutes')&&ordersV062.includes('settings.salesRecoveryMinutes')&&opMigrationV062.includes('sales_recovery_minutes'));
ok('v0.6.2 KDS usa acoes de status',ordersV062.includes('kds-status-buttons-v062')&&ordersV062.includes('changeStatusWithCustomerDraft')&&settingsV062.includes('kdsNotifyCustomer'));
ok('v0.6.2 upsell e recompra configuraveis',settingsV062.includes('upsellEnabled')&&settingsV062.includes('repeatOrderEnabled')&&read('src/pages/store/Cart.tsx').includes('settings.upsellEnabled'));
ok('v0.6.2 checkout refinado',css.includes('FoodWeb v0.6.2 - refinamento operacional e comercial')&&css.includes('.checkout-review-check-v44'));
ok('v0.6.2 Premium possui narrativa superior',landingV062.includes('POR QUE O PREMIUM?')&&landingV062.includes('MAIS COMPLETO'));
ok('v0.6.2 beneficios comerciais editaveis',masterPlansV062.includes('Benefícios comerciais extras')&&landingApiV062.includes('marketingBenefits')&&benefitsMigrationV062.includes('marketing_benefits'));
ok('v0.6.2 auto cadastro Demo acompanha LandingPlan',read('src/pages/store/SelfSignup.tsx').includes('marketingBenefits:[]'));
ok('v0.6.2 demo evita emoji nativo de produto',read('src/components/marketing/InteractiveShowcase.tsx').includes('interactive-demo__food-icon-v062'));
ok('v0.6.2 SQL de validacao existe',exists('supabase/VALIDAR_V062.sql'));
if(failures.length){console.error(`\n${failures.length} falha(s) nas verificacoes v0.6.2:`);for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log(`Smoke final FoodWeb v0.6.2: ${checks.length} verificações aprovadas.`);


// FoodWeb v0.6.3 - mensagens e responsividade operacional
const customerSalesV063=read('src/utils/customerSales.ts');
const migrationV063=read('supabase/migrations/202609231300_foodweb_v063_message_preferences.sql');
ok('v0.6.3 horario usa scroll horizontal seguro',css.includes('FoodWeb v0.6.3 - responsividade operacional')&&css.includes('overflow-x:auto')&&settingsV062.includes('opening-hours-scroll-note'));
ok('v0.6.3 status nao abre WhatsApp automaticamente',ordersV062.includes('setNotifyOrderId')&&ordersV062.includes('Enviar atualização')&&!ordersV062.includes("if (changed && settings.kdsNotifyCustomer && order.customerPhone && status !== 'cancelled')"));
ok('v0.6.3 mensagens personalizaveis',settingsV062.includes('Mensagens programadas')&&settingsV062.includes('updateMessageTemplate')&&customerSalesV063.includes('DEFAULT_CUSTOMER_MESSAGE_TEMPLATES'));
ok('v0.6.3 preferencias de recuperacao e recompra',settingsV062.includes('salesRecoveryWindowHours')&&settingsV062.includes('crmComeBackDays')&&settingsV062.includes('repeatOrderMaxAgeDays')&&migrationV063.includes('customer_message_templates'));
ok('v0.6.3 SQL de validacao existe',exists('supabase/VALIDAR_V063.sql'));
if(failures.length){console.error(`\n${failures.length} falha(s) nas verificacoes v0.6.3:`);for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log(`Smoke final FoodWeb v0.6.3: ${checks.length} verificações aprovadas.`);
