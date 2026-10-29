import {receiptPolicyApi} from './receiptPolicyApi';
import { restFetch } from '../lib/supabaseRest';
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
 load:(id:string)=>Promise.all([
  restFetch<ReceiptContact[]>(`food_receipt_contacts?store_id=eq.${encodeURIComponent(id)}&select=slot,name,phone&order=slot`),
  restFetch<Array<{pickup_location_id:string;contact_slot:number}>>(`food_pickup_receipt_contacts?store_id=eq.${encodeURIComponent(id)}&select=pickup_location_id,contact_slot`),
  restFetch<Array<{id:string;name:string}>>(`food_pickup_locations?store_id=eq.${encodeURIComponent(id)}&active=eq.true&is_public=eq.true&select=id,name&order=name`),
  receiptPolicyApi.load(id),
 ]),
 save:(id:string,contacts:ReceiptContact[],points:Array<{pickup_location_id:string;contact_slot:number}>)=>restFetch('rpc/food_save_receipt_contacts_v1',{method:'POST',body:{p_store_id:id,p_contacts:contacts,p_points:points}}),
};
