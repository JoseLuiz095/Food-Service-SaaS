import { DEFAULT_PLATFORM_SETTINGS } from '../data/platformDefaults';
import { isDemoMode } from '../lib/config';
import { edgeFunctionHealth, invokeFunction, restFetch } from '../lib/supabaseRest';
import type { PlatformEventKind, PlatformEventLog, PlatformEventResult } from './interactionTelemetry';
import type {
  Plan,
  PlatformDashboardStats,
  PlatformSettings,
  PlatformStoreSummary,
  PlatformSystemCheck,
  StoreAccessStatus,
  StoreCredentialMode,
  SubscriptionPayment,
} from '../types';

const toNumber = (value: number | string | null | undefined) => value == null ? 0 : Number(value);
const addDaysIso = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + Math.max(1, Math.round(days)));
  return date.toISOString();
};

const alignSubscriptionDueDate = (dueDay:number, reference?:string|null) => {
  const configuredDay=Math.max(1,Math.min(31,Math.round(dueDay||10)));
  const dateForMonth=(year:number,month:number)=>{
    const lastDay=new Date(year,month,0).getDate();
    const actualDay=Math.min(configuredDay,lastDay);
    return `${year}-${String(month).padStart(2,'0')}-${String(actualDay).padStart(2,'0')}`;
  };
  if(reference){
    const match=reference.slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(match)return dateForMonth(Number(match[1]),Number(match[2]));
  }
  const now=new Date();
  let year=now.getFullYear();
  let month=now.getMonth()+1;
  const thisMonth=dateForMonth(year,month);
  const todayKey=`${year}-${String(month).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  if(thisMonth<todayKey){month+=1;if(month>12){month=1;year+=1;}}
  return dateForMonth(year,month);
};

const daysUntil = (value?: string) => {
  if (!value) return Number.POSITIVE_INFINITY;
  const end = new Date(value).getTime();
  if (!Number.isFinite(end)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
};
const trialExpired = (value?: string) => Boolean(value) && new Date(value as string).getTime() <= Date.now();

type StoreRow = { id:string; slug:string; name:string; city:string|null; state:string|null; owner_name:string|null; owner_email:string|null; active:boolean; access_status:StoreAccessStatus; suspended_at:string|null; suspension_reason:string|null };
type PlanRow = { id:string; code:string; name:string; product_limit:number|null; image_limit_per_product:number|null; custom_domain:boolean; reports:boolean; priority_support:boolean; monthly_price:number|string|null; setup_price:number|string|null; category_limit:number|null; addon_limit:number|null; admin_user_limit:number|null; sort_order:number|null; active:boolean; marketing_benefits?: string[] | null };
type SubscriptionRow = { id:string; store_id:string; plan_id:string; status:'trial'|'active'|'suspended'|'cancelled'; status_before_suspension:'trial'|'active'|null; started_at:string; expires_at:string|null; billing_amount:number|string|null; due_day:number|null; next_due_date:string|null };
type DomainRow = { id:string; store_id:string; domain:string; is_primary:boolean; active:boolean };
type CountRow = { id:string; store_id:string; active?:boolean };
type PlatformSettingsRow = { id:number; demo_enabled?:boolean; demo_duration_days:number; demo_warning_days:number; billing_provider?:'manual'|'asaas'; billing_pix_key_type?:string|null; billing_pix_key?:string|null; billing_pix_holder_name?:string|null; billing_pix_city?:string|null; billing_pix_copy_paste?:string|null; billing_whatsapp?:string|null; billing_proof_required?:boolean; billing_auto_renew?:boolean; billing_grace_days?:number|null; marketing_whatsapp?:string|null; support_whatsapp?:string|null };
type PlanFeatureRow={plan_id:string;feature_code:string;enabled:boolean;limit_value:number|null};
type PaymentRow={id:string;store_id:string;subscription_id:string|null;plan_id:string;previous_plan_id:string|null;payment_intent:'renewal'|'plan_change';amount:number|string;due_date:string;provider:'manual'|'asaas';provider_payment_id:string|null;status:SubscriptionPayment['status'];pix_payload:string|null;pix_qr_base64:string|null;provider_expiration_at:string|null;proof_required:boolean;proof_sent_at:string|null;paid_at:string|null;rejected_at?:string|null;rejection_reason?:string|null;created_at:string};

const mapPlan = (row: PlanRow, features:PlanFeatureRow[]=[]): Plan => ({
  id:row.id, code:row.code, name:row.name, productLimit:row.product_limit, imageLimitPerProduct:row.image_limit_per_product,
  customDomain:row.custom_domain, reports:row.reports, prioritySupport:row.priority_support,
  monthlyPrice:toNumber(row.monthly_price), setupPrice:toNumber(row.setup_price), categoryLimit:row.category_limit,
  addonLimit:row.addon_limit, adminUserLimit:row.admin_user_limit, sortOrder:row.sort_order ?? 0, active:row.active,
  featureCodes:features.filter((f)=>f.plan_id===row.id&&f.enabled).map((f)=>f.feature_code),
  featureLimits:Object.fromEntries(features.filter((f)=>f.plan_id===row.id&&f.enabled).map((f)=>[f.feature_code,f.limit_value])),
  marketingBenefits:Array.isArray(row.marketing_benefits)?row.marketing_benefits.filter(Boolean):[],
});

const mapPlatformSettings = (row?: PlatformSettingsRow): PlatformSettings => row ? {
  demoEnabled: row.demo_enabled !== false,
  demoDurationDays: row.demo_duration_days,
  demoWarningDays: row.demo_warning_days,
  billingProvider:'manual', billingPixKeyType:row.billing_pix_key_type||'', billingPixKey:row.billing_pix_key||'', billingPixHolderName:row.billing_pix_holder_name||'', billingPixCity:row.billing_pix_city||'Linhares', billingPixCopyPaste:row.billing_pix_copy_paste||'', billingWhatsapp:row.billing_whatsapp||'', billingProofRequired:true, billingAutoRenew:false, billingGraceDays:row.billing_grace_days??3, marketingWhatsapp:row.marketing_whatsapp||'', supportWhatsapp:row.support_whatsapp||'',
} : DEFAULT_PLATFORM_SETTINGS;

export type CreatePlatformStoreInput = {
  name:string;
  slug:string;
  city:string;
  state:string;
  ownerName:string;
  ownerEmail:string;
  planId:string;
  accessStatus:StoreAccessStatus;
  dueDay:number;
  customDomain?:string;
  appOrigin:string;
  credentialMode:StoreCredentialMode;
  temporaryPassword?:string;
  forcePasswordChange?:boolean;
};

const demoPlans: Plan[] = [
  {id:'demo',code:'DEMO',name:'Teste grátis',productLimit:120,imageLimitPerProduct:5,customDomain:false,reports:true,prioritySupport:false,monthlyPrice:0,setupPrice:0,categoryLimit:30,addonLimit:120,adminUserLimit:1,sortOrder:0,active:true,featureCodes:['catalog','orders','whatsapp','delivery','billing_pix','analytics','custom_banner','finance','financial_documents'],featureLimits:{}},
  {id:'essential',code:'ESSENTIAL',name:'Essencial',productLimit:40,imageLimitPerProduct:1,customDomain:false,reports:false,prioritySupport:false,monthlyPrice:49.9,setupPrice:0,categoryLimit:12,addonLimit:40,adminUserLimit:1,sortOrder:10,active:true,featureCodes:['catalog','orders','whatsapp','delivery','billing_pix'],featureLimits:{},marketingBenefits:['Atendimento direto, sem comissão por pedido']},
  {id:'starter',code:'STARTER',name:'Profissional',productLimit:120,imageLimitPerProduct:5,customDomain:false,reports:true,prioritySupport:false,monthlyPrice:89.9,setupPrice:0,categoryLimit:30,addonLimit:120,adminUserLimit:1,sortOrder:20,active:true,featureCodes:['catalog','orders','whatsapp','delivery','billing_pix','analytics','custom_banner','finance','financial_documents'],featureLimits:{},marketingBenefits:['Recuperação de vendas e CRM simples','Upsell no carrinho e pedir novamente']},
  {id:'professional',code:'PROFESSIONAL',name:'Premium',productLimit:null,imageLimitPerProduct:10,customDomain:true,reports:true,prioritySupport:true,monthlyPrice:149.9,setupPrice:0,categoryLimit:null,addonLimit:null,adminUserLimit:1,sortOrder:30,active:true,featureCodes:['catalog','orders','whatsapp','delivery','billing_pix','analytics','custom_banner','finance','financial_documents'],featureLimits:{},marketingBenefits:['KDS com mensagens prontas para o cliente','Domínio próprio e recursos de recorrência']},
];

export const platformApi = {
  async listPlans(): Promise<Plan[]> {
    if (isDemoMode) return demoPlans;
    const [rows,features]=await Promise.all([restFetch<PlanRow[]>('food_plans?select=*&order=sort_order.asc,name.asc'),restFetch<PlanFeatureRow[]>('food_plan_features?select=plan_id,feature_code,enabled,limit_value&enabled=eq.true')]);
    return rows.map((row)=>mapPlan(row,features));
  },

  async savePlan(plan: Plan): Promise<Plan> {
    if (isDemoMode) return plan;
    const body = {
      name:plan.name, product_limit:plan.productLimit, image_limit_per_product:plan.imageLimitPerProduct,
      custom_domain:plan.customDomain, reports:plan.reports, priority_support:plan.prioritySupport,
      monthly_price:plan.monthlyPrice ?? 0, setup_price:plan.setupPrice ?? 0, category_limit:plan.categoryLimit ?? null,
      addon_limit:plan.addonLimit ?? null, admin_user_limit:plan.adminUserLimit ?? null, sort_order:plan.sortOrder ?? 0, active:plan.active, marketing_benefits:(plan.marketingBenefits||[]).map((item)=>item.trim()).filter(Boolean).slice(0,20),
    };
    const rows = await restFetch<PlanRow[]>(`food_plans?id=eq.${encodeURIComponent(plan.id)}&select=*`, {method:'PATCH',body,prefer:'return=representation'});
    const features=await restFetch<PlanFeatureRow[]>(`food_plan_features?select=plan_id,feature_code,enabled,limit_value&plan_id=eq.${encodeURIComponent(plan.id)}&enabled=eq.true`);
    return mapPlan(rows[0],features);
  },

  async getPlatformSettings(): Promise<PlatformSettings> {
    if (isDemoMode) return DEFAULT_PLATFORM_SETTINGS;
    const rows = await restFetch<PlatformSettingsRow[]>('food_platform_settings?select=*&id=eq.1&limit=1');
    return mapPlatformSettings(rows[0]);
  },

  async savePlatformSettings(settings: PlatformSettings): Promise<PlatformSettings> {
    const normalized: PlatformSettings = {
      demoEnabled: settings.demoEnabled !== false,
      demoDurationDays: Math.max(1, Math.min(365, Math.round(settings.demoDurationDays))),
      demoWarningDays: Math.max(1, Math.min(Math.max(1, Math.round(settings.demoDurationDays) - 1), Math.round(settings.demoWarningDays))),
      billingProvider:'manual', billingPixKeyType:settings.billingPixKeyType.trim(), billingPixKey:settings.billingPixKey.trim(), billingPixHolderName:settings.billingPixHolderName.trim(), billingPixCity:settings.billingPixCity.trim(), billingPixCopyPaste:settings.billingPixCopyPaste.trim(), billingWhatsapp:settings.billingWhatsapp.replace(/\D/g,''), billingProofRequired:true, billingAutoRenew:false, billingGraceDays:Math.max(0,Math.min(30,Math.round(settings.billingGraceDays||0))), marketingWhatsapp:settings.marketingWhatsapp.replace(/\D/g,''), supportWhatsapp:settings.supportWhatsapp.replace(/\D/g,''),
    };
    if (isDemoMode) return normalized;
    const rows = await restFetch<PlatformSettingsRow[]>('food_platform_settings?id=eq.1&select=*', {
      method:'PATCH',
      body:{demo_enabled:normalized.demoEnabled,demo_duration_days:normalized.demoDurationDays,demo_warning_days:normalized.demoWarningDays,billing_provider:'manual',billing_pix_key_type:normalized.billingPixKeyType||null,billing_pix_key:normalized.billingPixKey||null,billing_pix_holder_name:normalized.billingPixHolderName||null,billing_pix_city:normalized.billingPixCity||null,billing_pix_copy_paste:normalized.billingPixCopyPaste||null,billing_whatsapp:normalized.billingWhatsapp||null,billing_proof_required:true,billing_auto_renew:false,billing_grace_days:normalized.billingGraceDays,marketing_whatsapp:normalized.marketingWhatsapp||null,support_whatsapp:normalized.supportWhatsapp||null},
      prefer:'return=representation',
    });
    return mapPlatformSettings(rows[0]);
  },

  async listStores(): Promise<PlatformStoreSummary[]> {
    if (isDemoMode) {
      const expiresAt = addDaysIso(12);
      return [{id:'00000000-0000-4000-8000-000000000001',name:'Central Food',slug:'central-food-demo',city:'Linhares',state:'ES',ownerName:'Cliente Demo',ownerEmail:'admin@foodservice.demo',active:true,accessStatus:'online',productCount:8,activeProductCount:8,adminUserCount:1,subscriptionStatus:'trial',planId:'demo',planName:'Demo',planCode:'DEMO',billingAmount:0,expiresAt}];
    }
    const [stores, plans, subscriptions, domains, products, users] = await Promise.all([
      restFetch<StoreRow[]>('food_stores?select=*&order=name.asc'),
      restFetch<PlanRow[]>('food_plans?select=*'),
      restFetch<SubscriptionRow[]>('food_store_subscriptions?select=*&order=started_at.desc'),
      restFetch<DomainRow[]>('food_store_domains?select=*&active=eq.true'),
      restFetch<CountRow[]>('food_products?select=id,store_id,active'),
      restFetch<CountRow[]>('food_store_users?select=id,store_id,active'),
    ]);
    const planMap = new Map(plans.map((p)=>[p.id,p]));
    return stores.map((store) => {
      const sub = subscriptions.find((item)=>item.store_id===store.id && item.status!=='cancelled') || subscriptions.find((item)=>item.store_id===store.id);
      const plan = sub ? planMap.get(sub.plan_id) : undefined;
      const storeProducts = products.filter((item)=>item.store_id===store.id);
      const demoExpired = plan?.code === 'DEMO' && sub?.status === 'trial' && Boolean(sub.expires_at) && new Date(sub.expires_at as string).getTime() <= Date.now();
      return {
        id:store.id,name:store.name,slug:store.slug,city:store.city||'',state:store.state||'',ownerName:store.owner_name||undefined,ownerEmail:store.owner_email||undefined,
        active:store.active,accessStatus:demoExpired?'suspended':(store.access_status||'online'),productCount:storeProducts.length,activeProductCount:storeProducts.filter((item)=>item.active).length,
        adminUserCount:users.filter((item)=>item.store_id===store.id&&item.active).length,subscriptionId:sub?.id,subscriptionStatus:sub?.status,
        planId:plan?.id,planName:plan?.name,planCode:plan?.code,billingAmount:sub?.billing_amount==null?toNumber(plan?.monthly_price):toNumber(sub.billing_amount),
        dueDay:sub?.due_day||undefined,nextDueDate:sub?.next_due_date||undefined,customDomain:domains.find((item)=>item.store_id===store.id&&item.is_primary)?.domain,
        suspendedAt:store.suspended_at||undefined,suspensionReason:store.suspension_reason||undefined,expiresAt:sub?.expires_at||undefined,
      };
    });
  },

  async dashboard(): Promise<PlatformDashboardStats> {
    const [stores, settings] = await Promise.all([platformApi.listStores(), platformApi.getPlatformSettings()]);
    return {
      storesTotal:stores.length,
      storesOnline:stores.filter((store)=>store.accessStatus==='online').length,
      storesSuspended:stores.filter((store)=>store.accessStatus==='suspended').length,
      storesTrial:stores.filter((store)=>store.subscriptionStatus==='trial').length,
      trialsExpiringSoon:stores.filter((store)=>store.subscriptionStatus==='trial'&&!trialExpired(store.expiresAt)&&daysUntil(store.expiresAt)<=settings.demoWarningDays).length,
      monthlyRecurringRevenue:stores.filter((store)=>store.accessStatus==='online'&&store.subscriptionStatus!=='trial').reduce((sum,store)=>sum+(store.billingAmount||0),0),
    };
  },

  async updateStore(input: { storeId:string; planId:string; accessStatus:StoreAccessStatus; billingAmount:number; dueDay:number; nextDueDate?:string; expiresAt?:string; customDomain?:string; suspensionReason?:string }): Promise<void> {
    if (isDemoMode) return;
    await restFetch<unknown>(`food_stores?id=eq.${encodeURIComponent(input.storeId)}`, {method:'PATCH',body:{
      access_status:input.accessStatus,
      suspended_at:input.accessStatus==='suspended'?new Date().toISOString():null,
      suspension_reason:input.accessStatus==='suspended'?(input.suspensionReason?.trim()||'Acesso suspenso manualmente pelo Admin Master'):null,
    }});

    const [subs, planRows] = await Promise.all([
      restFetch<SubscriptionRow[]>(`food_store_subscriptions?select=*&store_id=eq.${encodeURIComponent(input.storeId)}&order=started_at.desc&limit=1`),
      restFetch<PlanRow[]>(`food_plans?select=*&id=eq.${encodeURIComponent(input.planId)}&limit=1`),
    ]);
    const currentSub = subs[0];
    const plan = planRows[0];
    if (!plan) throw new Error('Plano selecionado não existe.');
    const planChanged = currentSub?.plan_id !== input.planId;
    const isDemo = plan.code === 'DEMO';
    const settings = isDemo ? await platformApi.getPlatformSettings() : DEFAULT_PLATFORM_SETTINGS;
    if (isDemo && !settings.demoEnabled && planChanged) {
      throw new Error('O acesso Demo está desabilitado no Admin Master. Habilite a Demo em Planos antes de atribuí-la a uma nova loja.');
    }

    let status: SubscriptionRow['status'];
    let beforeSuspension: SubscriptionRow['status_before_suspension'] = null;
    let expiresAt: string | null = null;
    let billingAmount = input.billingAmount;
    let dueDay: number | null = input.dueDay;
    let nextDueDate: string | null = alignSubscriptionDueDate(input.dueDay, input.nextDueDate || currentSub?.next_due_date || null);

    if (isDemo) {
      status = input.accessStatus === 'online' ? 'trial' : 'suspended';
      beforeSuspension = input.accessStatus === 'suspended' ? 'trial' : null;
      expiresAt = input.expiresAt
        ? new Date(`${input.expiresAt.slice(0,10)}T23:59:59.999Z`).toISOString()
        : (!currentSub || planChanged || !currentSub.expires_at ? addDaysIso(settings.demoDurationDays) : currentSub.expires_at);
      billingAmount = 0;
      dueDay = null;
      nextDueDate = null;
    } else {
      const previous = currentSub?.status === 'trial' || currentSub?.status === 'active'
        ? currentSub.status
        : currentSub?.status_before_suspension || 'active';
      beforeSuspension = input.accessStatus==='suspended' ? (previous === 'trial' ? 'active' : previous) : null;
      status = input.accessStatus==='online' ? 'active' : 'suspended';
      expiresAt = null;
    }

    const subscriptionBody = {
      plan_id:input.planId,
      status,
      status_before_suspension:beforeSuspension,
      billing_amount:billingAmount,
      due_day:dueDay,
      next_due_date:nextDueDate,
      expires_at:expiresAt,
    };
    if (currentSub) await restFetch<unknown>(`food_store_subscriptions?id=eq.${encodeURIComponent(currentSub.id)}`, {method:'PATCH',body:subscriptionBody});
    else await restFetch<unknown>('food_store_subscriptions', {method:'POST',body:{store_id:input.storeId,...subscriptionBody}});

    const existing = await restFetch<DomainRow[]>(`food_store_domains?select=*&store_id=eq.${encodeURIComponent(input.storeId)}&is_primary=eq.true&limit=1`);
    const domain = plan.custom_domain ? (input.customDomain||'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'') : '';
    if (!domain && existing[0]) await restFetch<unknown>(`food_store_domains?id=eq.${encodeURIComponent(existing[0].id)}`, {method:'DELETE'});
    else if (domain && existing[0]) await restFetch<unknown>(`food_store_domains?id=eq.${encodeURIComponent(existing[0].id)}`, {method:'PATCH',body:{domain,active:true}});
    else if (domain) await restFetch<unknown>('food_store_domains', {method:'POST',body:{store_id:input.storeId,domain,is_primary:true,active:true}});
  },

  async createStore(input: CreatePlatformStoreInput): Promise<{storeId:string;slug:string;invited:boolean;existingUser?:boolean;createdWithPassword?:boolean;warning?:string;expiresAt?:string}> {
    if (isDemoMode) return {storeId:'demo-new-store',slug:input.slug,invited:false,createdWithPassword:input.credentialMode==='temporary_password'};
    return invokeFunction<{storeId:string;slug:string;invited:boolean;existingUser?:boolean;createdWithPassword?:boolean;warning?:string;expiresAt?:string}>('food-platform-create-store', input);
  },

  async updateStoreCredentials(input: { storeId:string; email:string; password?:string; forcePasswordChange?:boolean }): Promise<{ok:boolean;email:string;emailChanged:boolean;passwordChanged:boolean;linkedStoreCount?:number}> {
    if (isDemoMode) return {ok:true,email:input.email,emailChanged:true,passwordChanged:Boolean(input.password),linkedStoreCount:1};
    return invokeFunction<{ok:boolean;email:string;emailChanged:boolean;passwordChanged:boolean;linkedStoreCount?:number}>('food-platform-manage-store-user', input);
  },

  async manageStoreUserFunctionHealth() {
    if (isDemoMode) return {ok:true,function:'food-platform-manage-store-user',version:'foodweb-0.5.0-demo',configured:true};
    return edgeFunctionHealth('food-platform-manage-store-user');
  },

  async listSubscriptionPayments(): Promise<SubscriptionPayment[]> {
    if(isDemoMode)return [];
    const result=await restFetch<{payments?:SubscriptionPayment[]}>('rpc/food_platform_get_billing_dashboard_v1',{method:'POST',body:{}});
    return (result.payments||[]).map((payment)=>({...payment,amount:toNumber(payment.amount)}));
  },

  async confirmSubscriptionPayment(paymentId:string):Promise<void>{
    if(isDemoMode)return;
    await restFetch<unknown>('rpc/food_confirm_subscription_payment',{method:'POST',body:{p_payment_id:paymentId,p_paid_at:new Date().toISOString(),p_provider_event_id:null}});
  },

  async rejectSubscriptionPayment(paymentId:string,reason:string):Promise<void>{
    if(isDemoMode)return;
    await restFetch<unknown>('rpc/food_platform_reject_subscription_payment_v1',{method:'POST',body:{p_payment_id:paymentId,p_reason:reason}});
  },


  async listPlatformEvents(input: { limit?: number; result?: PlatformEventResult; kind?: PlatformEventKind } = {}): Promise<PlatformEventLog[]> {
    if (isDemoMode) return [];
    const rows = await restFetch<PlatformEventLog[]>('rpc/food_platform_list_event_log_v1', {
      method: 'POST',
      body: {
        p_limit: Math.max(1, Math.min(input.limit || 100, 300)),
        p_result: input.result || null,
        p_kind: input.kind || null,
      },
    });
    return rows || [];
  },

  async systemCheck(): Promise<PlatformSystemCheck> {
    if (isDemoMode) return {version:'foodweb-0.4.0-demo',platformAdmin:true,stores:1,storesOnline:1,storesSuspended:0,plans:4,subscriptions:1,users:1,products:6,orders:0,deliveryZones:5,domains:0,analyticsEvents:0,analyticsReady:true,demoEnabled:true,demoTrials:1,demoTrialsExpiringSoon:0,demoDurationDays:30,demoWarningDays:7,demoCronScheduled:true,demoCronExists:true,demoCronActive:true,demoCronSchedule:'15 * * * *'};
    return restFetch<PlatformSystemCheck>('rpc/food_platform_system_check', {method:'POST', body:{}});
  },

  async createStoreFunctionHealth() {
    if (isDemoMode) return {ok:true,function:'food-platform-create-store',version:'foodweb-0.4.0-demo',configured:true};
    return edgeFunctionHealth('food-platform-create-store');
  },

  async publicCheckoutFunctionHealth() {
    if (isDemoMode) return {ok:true,function:'food-public-checkout',version:'foodweb-0.4.0-demo',configured:true,turnstileConfigured:true,turnstileRequired:true,originAllowed:true,originsConfigured:true};
    return edgeFunctionHealth('food-public-checkout');
  },
};
