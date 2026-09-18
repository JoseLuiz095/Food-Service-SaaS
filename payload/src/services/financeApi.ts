import { isDemoMode } from '../lib/config';
import { restFetch } from '../lib/supabaseRest';
import type { FinancialCategory, FinancialEntry, FinancialEntryStatus, FinancialDirection, FinancialDocumentType } from '../types';
import { createId } from '../utils/id';

const num=(value:number|string|null|undefined)=>value==null?0:Number(value);
type CategoryRow={id:string;store_id:string;name:string;direction:FinancialCategory['direction'];active:boolean;sort_order:number};
type EntryRow={id:string;store_id:string;direction:FinancialDirection;source:FinancialEntry['source'];order_id:string|null;category_id:string|null;description:string;amount:number|string;occurred_on:string;due_on:string|null;paid_at:string|null;status:FinancialEntryStatus;payment_method:string|null;counterparty:string|null;document_type:FinancialDocumentType;document_number:string|null;notes:string|null;created_at:string};
const mapCategory=(r:CategoryRow):FinancialCategory=>({id:r.id,storeId:r.store_id,name:r.name,direction:r.direction,active:r.active,sortOrder:r.sort_order});
const mapEntry=(r:EntryRow):FinancialEntry=>({id:r.id,storeId:r.store_id,direction:r.direction,source:r.source,orderId:r.order_id||undefined,categoryId:r.category_id||undefined,description:r.description,amount:num(r.amount),occurredOn:r.occurred_on,dueOn:r.due_on||undefined,paidAt:r.paid_at||undefined,status:r.status,paymentMethod:r.payment_method||undefined,counterparty:r.counterparty||undefined,documentType:r.document_type,documentNumber:r.document_number||undefined,notes:r.notes||undefined,createdAt:r.created_at});

export const financeApi={
  async listCategories(storeId:string):Promise<FinancialCategory[]>{
    if(isDemoMode)return [{id:'sales',storeId,name:'Vendas',direction:'income',active:true,sortOrder:10},{id:'ingredients',storeId,name:'Ingredientes',direction:'expense',active:true,sortOrder:100},{id:'other',storeId,name:'Outros',direction:'both',active:true,sortOrder:999}];
    const rows=await restFetch<CategoryRow[]>(`food_financial_categories?select=*&store_id=eq.${encodeURIComponent(storeId)}&active=eq.true&order=sort_order.asc,name.asc`);return rows.map(mapCategory);
  },
  async listEntries(storeId:string):Promise<FinancialEntry[]>{
    if(isDemoMode)return [];
    const rows=await restFetch<EntryRow[]>(`food_financial_entries?select=*&store_id=eq.${encodeURIComponent(storeId)}&order=occurred_on.desc,created_at.desc&limit=300`);return rows.map(mapEntry);
  },
  async saveEntry(input:Omit<FinancialEntry,'id'|'createdAt'|'source'> & {id?:string;source?:FinancialEntry['source']}):Promise<FinancialEntry>{
    if(isDemoMode)return {...input,id:input.id||createId(),source:input.source||'manual',createdAt:new Date().toISOString()};
    const body={id:input.id||undefined,store_id:input.storeId,direction:input.direction,source:input.source||'manual',order_id:input.orderId||null,category_id:input.categoryId||null,description:input.description.trim(),amount:input.amount,occurred_on:input.occurredOn,due_on:input.dueOn||null,paid_at:input.status==='paid'?(input.paidAt||new Date().toISOString()):null,status:input.status,payment_method:input.paymentMethod||null,counterparty:input.counterparty||null,document_type:input.documentType||'none',document_number:input.documentNumber||null,notes:input.notes||null};
    const path=input.id?`food_financial_entries?id=eq.${encodeURIComponent(input.id)}&select=*`:'food_financial_entries?select=*';
    const rows=await restFetch<EntryRow[]>(path,{method:input.id?'PATCH':'POST',body,prefer:'return=representation'});return mapEntry(rows[0]);
  },

};
