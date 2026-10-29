import {getSupabaseClient} from '../lib/supabase';
import {restFetch,SupabaseHttpError} from '../lib/supabaseRest';
import type {ReceiptContact} from './receiptContactsApi';
export type ReceiptPolicy={supported:boolean;enabled:boolean;ready:boolean};
export const receiptPolicyApi={
 async load(storeId:string):Promise<ReceiptPolicy>{
  let rows:Array<{receipt_click_marks_paid?:boolean}>;
  try{rows=await restFetch(`food_stores?id=eq.${encodeURIComponent(storeId)}&select=receipt_click_marks_paid&limit=1`);}
  catch(error){if(error instanceof SupabaseHttpError&&error.status===400&&/receipt_click_marks_paid/.test(error.message))return{supported:false,enabled:false,ready:false};throw error;}
  if(typeof rows[0]?.receipt_click_marks_paid!=='boolean')return{supported:false,enabled:false,ready:false};
  const {data,error}=await getSupabaseClient().functions.invoke('food-order-payment',{body:{action:'receipt_capabilities'},timeout:8000});
  return{supported:true,enabled:rows[0].receipt_click_marks_paid,ready:!error&&data?.autoPaidConfigured===true};
 },
 save:(storeId:string,contacts:ReceiptContact[],points:Array<{pickup_location_id:string;contact_slot:number}>,enabled:boolean)=>restFetch('rpc/food_save_receipt_policy_v1',{method:'POST',body:{p_store_id:storeId,p_contacts:contacts,p_points:points,p_auto_paid:enabled}}),
};
