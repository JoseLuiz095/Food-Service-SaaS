import { isDemoMode } from '../lib/config';
import { restFetch } from '../lib/supabaseRest';
import type { FinancialCategory, FinancialEntry, FinancialEntryStatus, FinancialDirection, FinancialDocumentType } from '../types';
import { createId } from '../utils/id';

const num=(value:number|string|null|undefined)=>value==null?0:Number(value);
type CategoryRow={id:string;store_id:string;name:string;direction:FinancialCategory['direction'];active:boolean;sort_order:number};
type EntryRow={id:string;store_id:string;direction:FinancialDirection;source:FinancialEntry['source'];order_id:string|null;purchase_id:string|null;category_id:string|null;description:string;amount:number|string;occurred_on:string;due_on:string|null;paid_at:string|null;status:FinancialEntryStatus;payment_method:string|null;counterparty:string|null;document_type:FinancialDocumentType;document_number:string|null;notes:string|null;created_at:string};
export type FinancialEntriesPage = { entries: FinancialEntry[]; hasMore: boolean; nextOffset: number };
const CATEGORY_SELECT='id,store_id,name,direction,active,sort_order';
const ENTRY_SELECT='id,store_id,direction,source,order_id,purchase_id,category_id,description,amount,occurred_on,due_on,paid_at,status,payment_method,counterparty,document_type,document_number,notes,created_at';
const mapCategory=(r:CategoryRow):FinancialCategory=>({id:r.id,storeId:r.store_id,name:r.name,direction:r.direction,active:r.active,sortOrder:r.sort_order});
const mapEntry=(r:EntryRow):FinancialEntry=>({id:r.id,storeId:r.store_id,direction:r.direction,source:r.source,orderId:r.order_id||undefined,purchaseId:r.purchase_id||undefined,categoryId:r.category_id||undefined,description:r.description,amount:num(r.amount),occurredOn:r.occurred_on,dueOn:r.due_on||undefined,paidAt:r.paid_at||undefined,status:r.status,paymentMethod:r.payment_method||undefined,counterparty:r.counterparty||undefined,documentType:r.document_type,documentNumber:r.document_number||undefined,notes:r.notes||undefined,createdAt:r.created_at});

export const financeApi={
  async listCategories(storeId:string):Promise<FinancialCategory[]>{
    if(isDemoMode)return [{id:'sales',storeId,name:'Vendas',direction:'income',active:true,sortOrder:10},{id:'ingredients',storeId,name:'Ingredientes',direction:'expense',active:true,sortOrder:100},{id:'other',storeId,name:'Outros',direction:'both',active:true,sortOrder:999}];
    const rows=await restFetch<CategoryRow[]>(`food_financial_categories?select=${CATEGORY_SELECT}&store_id=eq.${encodeURIComponent(storeId)}&active=eq.true&order=sort_order.asc,name.asc`);return rows.map(mapCategory);
  },
  async listEntries(storeId:string):Promise<FinancialEntry[]>{
    const page=await this.listEntriesPage(storeId,{limit:300});
    return page.entries;
  },
  async listEntriesPage(storeId:string,{limit=100,offset=0}:{limit?:number;offset?:number}={}):Promise<FinancialEntriesPage>{
    if(isDemoMode)return {entries:[],hasMore:false,nextOffset:offset};
    const safeLimit=Math.min(300,Math.max(1,Math.floor(limit)));
    const safeOffset=Math.max(0,Math.floor(offset));
    const rows=await restFetch<EntryRow[]>(`food_financial_entries?select=${ENTRY_SELECT}&store_id=eq.${encodeURIComponent(storeId)}&order=occurred_on.desc,created_at.desc&limit=${safeLimit}&offset=${safeOffset}`);
    return {entries:rows.map(mapEntry),hasMore:rows.length===safeLimit,nextOffset:safeOffset+rows.length};
  },
  async saveEntry(input:Omit<FinancialEntry,'id'|'createdAt'|'source'> & {id?:string;source?:FinancialEntry['source']}):Promise<FinancialEntry>{
    if(isDemoMode)return {...input,id:input.id||createId(),source:input.source||'manual',createdAt:new Date().toISOString()};
    const body={id:input.id||undefined,store_id:input.storeId,direction:input.direction,source:input.source||'manual',order_id:input.orderId||null,category_id:input.categoryId||null,description:input.description.trim(),amount:input.amount,occurred_on:input.occurredOn,due_on:input.dueOn||null,paid_at:input.status==='paid'?(input.paidAt||new Date().toISOString()):null,status:input.status,payment_method:input.paymentMethod||null,counterparty:input.counterparty||null,document_type:input.documentType||'none',document_number:input.documentNumber||null,notes:input.notes||null};
    const path=input.id?`food_financial_entries?id=eq.${encodeURIComponent(input.id)}&store_id=eq.${encodeURIComponent(input.storeId)}&select=${ENTRY_SELECT}`:`food_financial_entries?select=${ENTRY_SELECT}`;
    const rows=await restFetch<EntryRow[]>(path,{method:input.id?'PATCH':'POST',body,prefer:'return=representation'});return mapEntry(rows[0]);
  },
  async markPurchasePaid(storeId:string,entryId:string):Promise<void>{
    if(isDemoMode)throw new Error('A quitação exige o modo conectado ao Supabase.');
    const rows=await restFetch<EntryRow[]>(`food_financial_entries?id=eq.${encodeURIComponent(entryId)}&store_id=eq.${encodeURIComponent(storeId)}&source=eq.purchase&status=eq.pending&select=${ENTRY_SELECT}`,{
      method:'PATCH',body:{status:'paid',paid_at:new Date().toISOString()},prefer:'return=representation'
    });
    if(rows.length!==1)throw new Error('A compra não está pendente ou você não tem acesso para quitá-la.');
  },

};
