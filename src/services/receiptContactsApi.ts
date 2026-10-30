import {receiptPolicyApi} from './receiptPolicyApi';
import { restFetch, SupabaseHttpError } from '../lib/supabaseRest';
export const receiptContactsEnabled = import.meta.env.VITE_RECEIPT_CONTACTS_ENABLED === 'true';
export type ReceiptContact = { slot: number; name: string; phone: string };
export type ReceiptDestinations = { mode:'general'|'point'|'unassigned'|'unavailable'; contacts:ReceiptContact[] };
export function parseReceiptDestinations(value:unknown):ReceiptDestinations {
 const v=value as ReceiptDestinations;
 if(!v||!['general','point','unassigned','unavailable'].includes(v.mode)||!Array.isArray(v.contacts)||v.contacts.length>2||v.contacts.some(c=>!c||![1,2].includes(c.slot)||typeof c.name!=='string'||!c.name.trim()||c.name.length>60||!/^[1-9][0-9]{9,14}$/.test(c.phone))||new Set(v.contacts.map(c=>c.slot)).size!==v.contacts.length||(v.mode==='point'&&v.contacts.length!==1)||(v.mode==='unavailable'&&v.contacts.length))throw new Error('Contatos indisponíveis. Tente novamente.');
 return v;
}
export async function getReceiptDestinations(storeId:string,pointId?:string){return parseReceiptDestinations(await restFetch('rpc/food_get_receipt_destinations_v1',{method:'POST',body:{p_store_id:storeId,p_pickup_location_id:pointId||null}}));}
export const receiptContactsApi={
 async load(id:string){
  const [contacts,links,policy]=await Promise.all([
   restFetch<ReceiptContact[]>(`food_receipt_contacts?store_id=eq.${encodeURIComponent(id)}&select=slot,name,phone&order=slot`),
   restFetch<Array<{pickup_location_id:string;contact_slot:number}>>(`food_pickup_receipt_contacts?store_id=eq.${encodeURIComponent(id)}&select=pickup_location_id,contact_slot`),
   receiptPolicyApi.load(id),
  ]);
  try{
   const points=await restFetch<Array<{id:string;name:string;auto_pickup_on_receipt:boolean}>>(`food_pickup_locations?store_id=eq.${encodeURIComponent(id)}&active=eq.true&is_public=eq.true&select=id,name,auto_pickup_on_receipt&order=name`);
   return {contacts,links,points:points.map(p=>({...p,autoPickupSupported:true})),policy,autoPickupSupported:true};
  }catch(error){
   if(!(error instanceof SupabaseHttpError)||error.status!==400||!/auto_pickup_on_receipt/.test(error.message))throw error;
   const points=await restFetch<Array<{id:string;name:string}>>(`food_pickup_locations?store_id=eq.${encodeURIComponent(id)}&active=eq.true&is_public=eq.true&select=id,name&order=name`);
   return {contacts,links,points:points.map(p=>({...p,auto_pickup_on_receipt:false,autoPickupSupported:false})),policy,autoPickupSupported:false};
  }
 },
 save:(id:string,contacts:ReceiptContact[],points:Array<{pickup_location_id:string;contact_slot:number}>)=>restFetch('rpc/food_save_receipt_contacts_v1',{method:'POST',body:{p_store_id:id,p_contacts:contacts,p_points:points}}),
};
