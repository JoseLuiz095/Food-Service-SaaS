import { isDemoMode } from '../lib/config';
import { invokeFunction, restFetch, storageUpload } from '../lib/supabaseRest';
import type { FinancialCategory, FinancialDocument, FinancialDocumentSuggestion, FinancialEntry, FinancialEntryStatus, FinancialDirection, FinancialDocumentType } from '../types';
import { createId } from '../utils/id';

const num=(value:number|string|null|undefined)=>value==null?0:Number(value);
type CategoryRow={id:string;store_id:string;name:string;direction:FinancialCategory['direction'];active:boolean;sort_order:number};
type EntryRow={id:string;store_id:string;direction:FinancialDirection;source:FinancialEntry['source'];order_id:string|null;category_id:string|null;description:string;amount:number|string;occurred_on:string;due_on:string|null;paid_at:string|null;status:FinancialEntryStatus;payment_method:string|null;counterparty:string|null;document_type:FinancialDocumentType;document_number:string|null;notes:string|null;created_at:string};
type DocumentRow={id:string;store_id:string;entry_id:string|null;storage_path:string;original_name:string;mime_type:string|null;extraction_status:FinancialDocument['extractionStatus'];extracted_text:string|null;extracted_json:Record<string,unknown>|null;confidence:number|string|null;created_at:string};
const mapCategory=(r:CategoryRow):FinancialCategory=>({id:r.id,storeId:r.store_id,name:r.name,direction:r.direction,active:r.active,sortOrder:r.sort_order});
const mapEntry=(r:EntryRow):FinancialEntry=>({id:r.id,storeId:r.store_id,direction:r.direction,source:r.source,orderId:r.order_id||undefined,categoryId:r.category_id||undefined,description:r.description,amount:num(r.amount),occurredOn:r.occurred_on,dueOn:r.due_on||undefined,paidAt:r.paid_at||undefined,status:r.status,paymentMethod:r.payment_method||undefined,counterparty:r.counterparty||undefined,documentType:r.document_type,documentNumber:r.document_number||undefined,notes:r.notes||undefined,createdAt:r.created_at});
const mapDocument=(r:DocumentRow):FinancialDocument=>({id:r.id,storeId:r.store_id,entryId:r.entry_id||undefined,storagePath:r.storage_path,originalName:r.original_name,mimeType:r.mime_type||undefined,extractionStatus:r.extraction_status,extractedText:r.extracted_text||undefined,extractedJson:r.extracted_json||undefined,confidence:r.confidence==null?undefined:num(r.confidence),createdAt:r.created_at});

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
  async uploadDocument(storeId:string,file:File):Promise<FinancialDocument>{
    const allowed=new Set(['application/pdf','image/jpeg','image/png','image/webp']);if(!allowed.has(file.type))throw new Error('Envie PDF, JPG, PNG ou WEBP.');if(file.size>10*1024*1024)throw new Error('O documento excede 10 MB.');
    if(isDemoMode)return {id:createId(),storeId,storagePath:'demo',originalName:file.name,mimeType:file.type,extractionStatus:'manual',createdAt:new Date().toISOString()};
    const ext=(file.name.split('.').pop()||'bin').replace(/[^a-zA-Z0-9]/g,'').toLowerCase();const path=`stores/${storeId}/finance/inbox/${createId()}.${ext}`;await storageUpload('food-finance-documents',path,file);
    const rows=await restFetch<DocumentRow[]>('food_financial_documents?select=*',{method:'POST',body:{store_id:storeId,storage_path:path,original_name:file.name,mime_type:file.type,extraction_status:'pending'},prefer:'return=representation'});return mapDocument(rows[0]);
  },
  async extractDocument(storeId:string,document:FinancialDocument):Promise<{suggestion:FinancialDocumentSuggestion;textPreview?:string}>{
    if(isDemoMode)return {suggestion:{direction:'expense',amount:148.5,occurredOn:new Date().toISOString().slice(0,10),documentType:'coupon',counterparty:'Fornecedor demonstracao',description:'Compra sugerida pela leitura do documento',categoryName:'Ingredientes',confidence:.88}};
    return invokeFunction('food-finance-document-extract',{storeId,storagePath:document.storagePath,documentId:document.id});
  },
  async linkDocument(documentId:string,entryId:string):Promise<void>{if(isDemoMode)return;await restFetch<unknown>(`food_financial_documents?id=eq.${encodeURIComponent(documentId)}`,{method:'PATCH',body:{entry_id:entryId,updated_at:new Date().toISOString()}});},
};
