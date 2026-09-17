import { isDemoMode } from '../lib/config';
import { restFetch } from '../lib/supabaseRest';
import type { SubscriptionCharge, SubscriptionPayment } from '../types';

const num=(value:number|string|null|undefined)=>value==null?0:Number(value);

type PaymentRow={
  id:string;store_id:string;subscription_id:string|null;plan_id:string;previous_plan_id:string|null;
  payment_intent:'renewal'|'plan_change';amount:number|string;due_date:string;provider:'manual'|'asaas';
  provider_payment_id:string|null;status:SubscriptionPayment['status'];pix_payload:string|null;pix_qr_base64:string|null;
  provider_expiration_at:string|null;proof_required:boolean;proof_sent_at:string|null;paid_at:string|null;
  rejected_at?:string|null;rejection_reason?:string|null;created_at:string;
};

const map=(row:PaymentRow):SubscriptionPayment=>({
  id:row.id,storeId:row.store_id,subscriptionId:row.subscription_id||undefined,planId:row.plan_id,
  previousPlanId:row.previous_plan_id||undefined,paymentIntent:row.payment_intent||'renewal',amount:num(row.amount),
  dueDate:row.due_date,provider:'manual',providerPaymentId:row.provider_payment_id||undefined,status:row.status,
  pixPayload:row.pix_payload||undefined,pixQrBase64:row.pix_qr_base64||undefined,providerExpirationAt:row.provider_expiration_at||undefined,
  proofRequired:row.proof_required,proofSentAt:row.proof_sent_at||undefined,paidAt:row.paid_at||undefined,
  rejectedAt:row.rejected_at||undefined,rejectionReason:row.rejection_reason||undefined,createdAt:row.created_at,
});

export type StoreBillingSettings={
  provider:'manual';pixKeyType:string;pixKey:string;pixHolderName:string;pixCity:string;pixCopyPaste:string;
  whatsapp:string;proofRequired:boolean;autoRenew:false;graceDays:number;
};

export type BillingOverviewPlan={id:string;code:string;name:string;monthlyPrice:number};
export type BillingOverviewSubscription={
  id:string;status:'trial'|'active'|'suspended'|'cancelled';billingAmount:number;dueDay?:number;nextDueDate?:string;
  billingState:'current'|'overdue'|'trial'|'suspended'|'cancelled'|'none';daysOverdue:number;lastPayment?:SubscriptionPayment|null;
};
export type StoreBillingOverview={
  currentPlan?:BillingOverviewPlan|null;
  subscription?:BillingOverviewSubscription|null;
  plans:BillingOverviewPlan[];
  settings:StoreBillingSettings;
  payments:SubscriptionPayment[];
};

type OverviewRaw={
  currentPlan?:BillingOverviewPlan|null;
  subscription?:BillingOverviewSubscription|null;
  plans?:BillingOverviewPlan[];
  settings?:StoreBillingSettings;
  payments?:SubscriptionPayment[];
};

const normalizeOverview=(raw:OverviewRaw):StoreBillingOverview=>({
  currentPlan:raw.currentPlan||null,
  subscription:raw.subscription?{
    ...raw.subscription,
    billingAmount:num(raw.subscription.billingAmount),
    daysOverdue:num(raw.subscription.daysOverdue),
    lastPayment:raw.subscription.lastPayment?{...raw.subscription.lastPayment,amount:num(raw.subscription.lastPayment.amount)}:null,
  }:null,
  plans:(raw.plans||[]).map((plan)=>({...plan,monthlyPrice:num(plan.monthlyPrice)})),
  settings:{provider:'manual',pixKeyType:raw.settings?.pixKeyType||'',pixKey:raw.settings?.pixKey||'',pixHolderName:raw.settings?.pixHolderName||'',pixCity:raw.settings?.pixCity||'Linhares',pixCopyPaste:raw.settings?.pixCopyPaste||'',whatsapp:raw.settings?.whatsapp||'',proofRequired:true,autoRenew:false,graceDays:num(raw.settings?.graceDays||3)},
  payments:(raw.payments||[]).map((payment)=>({...payment,amount:num(payment.amount)})),
});

export const billingApi={
  async getSettings(storeId:string):Promise<StoreBillingSettings>{
    if(isDemoMode)return {provider:'manual',pixKeyType:'CNPJ',pixKey:'12.345.678/0001-90',pixHolderName:'FoodWeb',pixCity:'Linhares',pixCopyPaste:'',whatsapp:'5527999999999',proofRequired:true,autoRenew:false,graceDays:3};
    const result=await restFetch<StoreBillingSettings>('rpc/food_get_billing_settings_for_store',{method:'POST',body:{p_store_id:storeId}});
    return {...result,provider:'manual',autoRenew:false,proofRequired:true,pixCity:result.pixCity||'Linhares'};
  },

  async getOverview(storeId:string):Promise<StoreBillingOverview>{
    if(isDemoMode)return normalizeOverview({
      currentPlan:{id:'professional',code:'PROFESSIONAL',name:'Profissional',monthlyPrice:119.9},
      subscription:{id:'demo-sub',status:'active',billingAmount:119.9,dueDay:10,nextDueDate:new Date().toISOString().slice(0,10),billingState:'current',daysOverdue:0,lastPayment:null},
      plans:[],
      settings:{provider:'manual',pixKeyType:'CNPJ',pixKey:'12.345.678/0001-90',pixHolderName:'FoodWeb',pixCity:'Linhares',pixCopyPaste:'',whatsapp:'5527999999999',proofRequired:true,autoRenew:false,graceDays:3},
      payments:[],
    });
    return normalizeOverview(await restFetch<OverviewRaw>('rpc/food_get_store_billing_overview_v1',{method:'POST',body:{p_store_id:storeId}}));
  },

  async createManualCharge(storeId:string,planId:string):Promise<SubscriptionCharge>{
    if(isDemoMode)throw new Error('Cobranças reais não são geradas no modo demonstração.');
    const payload=await restFetch<any>('rpc/food_create_manual_subscription_payment',{method:'POST',body:{p_store_id:storeId,p_plan_id:planId}});
    const payment=payload?.payment as PaymentRow;
    if(!payment?.id)throw new Error('A cobrança não foi retornada pelo servidor.');
    return {payment:map(payment),plan:payload.plan,billing:{...payload.billing,provider:'manual',autoRenew:false,proofRequired:true,pixCity:payload.billing?.pixCity||'Linhares'}};
  },

  async markProofSent(paymentId:string):Promise<SubscriptionPayment>{
    const row=await restFetch<PaymentRow>('rpc/food_mark_subscription_proof_sent',{method:'POST',body:{p_payment_id:paymentId}});
    return map(row);
  },

  async listStorePayments(storeId:string):Promise<SubscriptionPayment[]>{
    if(isDemoMode)return [];
    const rows=await restFetch<PaymentRow[]>(`food_subscription_payments?select=*&store_id=eq.${encodeURIComponent(storeId)}&order=created_at.desc&limit=30`);
    return rows.map(map);
  },
};
