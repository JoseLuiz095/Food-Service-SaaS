import { isDemoMode } from '../lib/config';
import { invokeFunction, restFetch } from '../lib/supabaseRest';
import type { SubscriptionCharge, SubscriptionPayment } from '../types';

const num=(value:number|string|null|undefined)=>value==null?0:Number(value);
type PaymentRow={id:string;store_id:string;subscription_id:string|null;plan_id:string;amount:number|string;due_date:string;provider:'manual'|'asaas';provider_payment_id:string|null;status:SubscriptionPayment['status'];pix_payload:string|null;pix_qr_base64:string|null;provider_expiration_at:string|null;proof_required:boolean;proof_sent_at:string|null;paid_at:string|null;created_at:string};
const map=(row:PaymentRow):SubscriptionPayment=>({id:row.id,storeId:row.store_id,subscriptionId:row.subscription_id||undefined,planId:row.plan_id,amount:num(row.amount),dueDate:row.due_date,provider:row.provider,providerPaymentId:row.provider_payment_id||undefined,status:row.status,pixPayload:row.pix_payload||undefined,pixQrBase64:row.pix_qr_base64||undefined,providerExpirationAt:row.provider_expiration_at||undefined,proofRequired:row.proof_required,proofSentAt:row.proof_sent_at||undefined,paidAt:row.paid_at||undefined,createdAt:row.created_at});

export type StoreBillingSettings={provider:'manual'|'asaas';pixKeyType:string;pixKey:string;pixHolderName:string;pixCopyPaste:string;whatsapp:string;proofRequired:boolean;autoRenew:boolean;graceDays:number};

export const billingApi={
  async getSettings(storeId:string):Promise<StoreBillingSettings>{
    if(isDemoMode)return {provider:'manual',pixKeyType:'CNPJ',pixKey:'12.345.678/0001-90',pixHolderName:'FoodWeb',pixCopyPaste:'',whatsapp:'5527999999999',proofRequired:true,autoRenew:false,graceDays:3};
    return restFetch<StoreBillingSettings>('rpc/food_get_billing_settings_for_store',{method:'POST',body:{p_store_id:storeId}});
  },
  async createManualCharge(storeId:string,planId:string):Promise<SubscriptionCharge>{
    if(isDemoMode)throw new Error('Cobranças reais não são geradas no modo demonstração.');
    const payload=await restFetch<any>('rpc/food_create_manual_subscription_payment',{method:'POST',body:{p_store_id:storeId,p_plan_id:planId}});
    const payment=payload?.payment as PaymentRow;
    if(!payment?.id)throw new Error('A cobrança não foi retornada pelo servidor.');
    return {payment:map(payment),plan:payload.plan,billing:payload.billing};
  },
  async createAutomaticPix(storeId:string,planId:string):Promise<SubscriptionCharge>{
    if(isDemoMode)throw new Error('Cobranças reais não são geradas no modo demonstração.');
    const payload=await invokeFunction<any>('food-billing-create-pix',{storeId,planId});
    return {...payload,payment:map(payload.payment as PaymentRow)};
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
