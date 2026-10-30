import './admin-clarity.css';
import { InfoHint } from '../../components/ui/InfoHint';
import { ArrowDownRight, ArrowUpRight, Camera, ChevronDown, Download, FileSearch2, Loader2, Pencil, Plus, ReceiptText, Save, ShoppingCart, TrendingUp, Upload, WalletCards, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import { financeApi } from '../../services/financeApi';
import { inventoryApi, inventoryUnitLabels } from '../../services/inventoryApi';
import { trackInteraction } from '../../services/interactionTelemetry';
import type { FinancialCategory, FinancialDirection, FinancialDocumentType, FinancialEntry, FinancialEntryStatus, InventoryItem } from '../../types';
import { currency } from '../../utils/format';
import { planHasFeature } from '../../utils/plan';
import { normalizeCounterpartyKey, readLocalFinancialDocument, type LocalFinancialReadProgress, type LocalFinancialReadResult } from '../../utils/localFinancialDocumentReader';
import { downloadCsv } from '../../utils/exportCsv';
import { createId } from '../../utils/id';
import { ErrorState, LoadingState } from '../../components/ui/AsyncState';

const today=()=>{const date=new Date();return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`};
const documentTypes:{value:FinancialDocumentType;label:string}[]=[
  {value:'none',label:'Sem documento'},{value:'coupon',label:'Cupom fiscal'},{value:'nfe',label:'NF-e'},
  {value:'nfce',label:'NFC-e'},{value:'nfse',label:'NFS-e'},{value:'boleto',label:'Boleto'},
  {value:'receipt',label:'Recibo'},{value:'other',label:'Outro'},
];
const emptyForm=(storeId:string,direction:FinancialDirection='expense')=>({
  storeId,direction,categoryId:'',description:'',amount:0,occurredOn:today(),dueOn:'',
  status:'paid' as FinancialEntryStatus,paymentMethod:'',counterparty:'',
  documentType:'none' as FinancialDocumentType,documentNumber:'',notes:'',
});
const monthKey=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;

export default function Finance(){
  const {settings,planUsage}=useStore();
  const {showToast}=useToast();
  const enabled=planHasFeature(planUsage.plan,'finance');
  const[categories,setCategories]=useState<FinancialCategory[]>([]);
  const[entries,setEntries]=useState<FinancialEntry[]>([]);
  const[analysisEntries,setAnalysisEntries]=useState<FinancialEntry[]>([]);
  const[hasMoreEntries,setHasMoreEntries]=useState(false);
  const[loadingMoreEntries,setLoadingMoreEntries]=useState(false);
  const[ledgerQuery,setLedgerQuery]=useState('');
  const[ledgerStatus,setLedgerStatus]=useState<'all'|FinancialEntryStatus>('all');
  const[form,setForm]=useState(()=>emptyForm(settings.id));
  const[loading,setLoading]=useState(true);
  const[financeError,setFinanceError]=useState('');
  const[saving,setSaving]=useState(false);
  const[extracting,setExtracting]=useState(false);
  const[extractionInfo,setExtractionInfo]=useState<{recognizedFields:number;signals:string[];preview:string;confidence:number}|null>(null);
  const[readProgress,setReadProgress]=useState<LocalFinancialReadProgress|null>(null);
  const[readResult,setReadResult]=useState<LocalFinancialReadResult|null>(null);
  const[documentItems,setDocumentItems]=useState<LocalFinancialReadResult['items']>([]);
  const[excludedItemIndexes,setExcludedItemIndexes]=useState<number[]>([]);
  const[editingEntryId,setEditingEntryId]=useState<string|null>(null);
  const[quickExpenseOpen,setQuickExpenseOpen]=useState(false);
  const[quickExpense,setQuickExpense]=useState(()=>({...emptyForm(settings.id,'expense'),description:'Despesa operacional'}));
  const[quickExpenseSaving,setQuickExpenseSaving]=useState(false);
  const[entryFormOpen,setEntryFormOpen]=useState(false);
  const[purchaseOpen,setPurchaseOpen]=useState(false);
  const[purchaseItems,setPurchaseItems]=useState<InventoryItem[]>([]);
  const[purchaseLoading,setPurchaseLoading]=useState(false);
  const[purchaseSaving,setPurchaseSaving]=useState(false);
  const[purchaseDraft,setPurchaseDraft]=useState({itemId:'',quantity:'',total:'',supplier:'',status:'paid' as 'paid'|'pending',paymentMethod:''});
  const purchaseKeyRef=useRef({signature:'',key:''});
  const[selectedMonthKey,setSelectedMonthKey]=useState<string|null>(null);
  const[selectedExpenseCategory,setSelectedExpenseCategory]=useState<string|null>(null);
  const fileRef=useRef<HTMLInputElement|null>(null);
  const cameraRef=useRef<HTMLInputElement|null>(null);

  const reload=async()=>{
    setLoading(true);setFinanceError('');
    try{
      const[c,page]=await Promise.all([financeApi.listCategories(settings.id),financeApi.listEntriesPage(settings.id,{limit:100})]);
      const all=await financeApi.listAllEntries(settings.id,page);
      setCategories(c);setEntries(page.entries);setHasMoreEntries(page.hasMore);setAnalysisEntries(all);
    }catch(err){
      setEntries([]);setAnalysisEntries([]);setHasMoreEntries(false);
      setFinanceError('Não foi possível carregar os lançamentos financeiros. Tente novamente.');
      showToast(err instanceof Error?err.message:'Falha ao carregar o financeiro.','error');
    }finally{setLoading(false)}
  };

  const loadMoreEntries=async()=>{
    if(loadingMoreEntries||!hasMoreEntries)return;
    setLoadingMoreEntries(true);
    try{
      const page=await financeApi.listEntriesPage(settings.id,{limit:100,offset:entries.length});
      setEntries((current)=>[...current,...page.entries.filter((entry)=>!current.some((known)=>known.id===entry.id))]);
      setHasMoreEntries(page.hasMore);
    }catch(err){
      showToast(err instanceof Error?err.message:'Falha ao carregar mais lançamentos.','error');
    }finally{setLoadingMoreEntries(false)}
  };

  useEffect(()=>{
    setForm(emptyForm(settings.id));
    setQuickExpense({...emptyForm(settings.id,'expense'),description:'Despesa operacional'});
    setPurchaseOpen(false);setPurchaseItems([]);purchaseKeyRef.current={signature:'',key:''};
    if(enabled)void reload();else setLoading(false);
  },[settings.id,enabled]);

  const summary=useMemo(()=>{
    const paid=analysisEntries.filter((entry)=>entry.status==='paid');
    const income=paid.filter((entry)=>entry.direction==='income').reduce((sum,e)=>sum+e.amount,0);
    const expense=paid.filter((entry)=>entry.direction==='expense').reduce((sum,e)=>sum+e.amount,0);
    const pendingIncome=analysisEntries.filter((entry)=>entry.status==='pending'&&entry.direction==='income').reduce((sum,e)=>sum+e.amount,0);
    const pendingExpense=analysisEntries.filter((entry)=>entry.status==='pending'&&entry.direction==='expense').reduce((sum,e)=>sum+e.amount,0);
    return{income,expense,result:income-expense,pendingIncome,pendingExpense};
  },[analysisEntries]);

  const expenseRanking=useMemo(()=>{
    const totals=new Map<string,number>();
    analysisEntries.filter((entry)=>entry.status==='paid'&&entry.direction==='expense').forEach((entry)=>{
      const name=categories.find((category)=>category.id===entry.categoryId)?.name||'Sem categoria';
      totals.set(name,(totals.get(name)||0)+entry.amount);
    });
    return [...totals.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6);
  },[analysisEntries,categories]);

  const monthly=useMemo(()=>{
    const now=new Date();
    const rows=Array.from({length:6},(_,index)=>{
      const date=new Date(now.getFullYear(),now.getMonth()-(5-index),1);
      return{key:monthKey(date),label:new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(date).replace('.',''),income:0,expense:0};
    });
    const byKey=new Map(rows.map((row)=>[row.key,row]));
    analysisEntries.filter((entry)=>entry.status==='paid').forEach((entry)=>{
      const row=byKey.get(entry.occurredOn.slice(0,7));
      if(!row)return;
      if(entry.direction==='income')row.income+=entry.amount;else row.expense+=entry.amount;
    });
    return rows;
  },[analysisEntries]);

  const chartMax=Math.max(1,...monthly.flatMap((row)=>[row.income,row.expense]));
  const expenseMax=Math.max(1,...expenseRanking.map(([,value])=>value));
  const selectedMonth=monthly.find((row)=>row.key===selectedMonthKey)||monthly[monthly.length-1];
  const selectedExpense=expenseRanking.find(([name])=>name===selectedExpenseCategory);
  const categoryOptions=categories.filter((category)=>category.direction==='both'||category.direction===form.direction);
  const filteredEntries=useMemo(()=>{
    const query=ledgerQuery.trim().toLocaleLowerCase('pt-BR');
    return entries.filter((entry)=>{
      if(ledgerStatus!=='all'&&entry.status!==ledgerStatus)return false;
      if(!query)return true;
      return [entry.description,entry.counterparty||'',entry.documentNumber||'',entry.notes||''].some((value)=>value.toLocaleLowerCase('pt-BR').includes(query));
    });
  },[entries,ledgerQuery,ledgerStatus]);

  const exportFinancialEntries=()=>{
    if(!filteredEntries.length){showToast('Não há lançamentos neste filtro para exportar.','error');return;}
    downloadCsv(`financeiro-${today()}`,['Data','Vencimento','Tipo','Descrição','Categoria','Contraparte','Pagamento','Status','Valor','Documento','Observações'],filteredEntries.map((entry)=>[
      entry.occurredOn,entry.dueOn||'',entry.direction==='income'?'Entrada':'Saída',entry.description,
      categories.find((category)=>category.id===entry.categoryId)?.name||'Sem categoria',entry.counterparty||'',entry.paymentMethod||'',
      entry.status==='paid'?'Pago':entry.status==='pending'?'Pendente':'Cancelado',currency.format(entry.amount),entry.documentNumber||'',entry.notes||'',
    ]));
    showToast(`${filteredEntries.length} lançamento${filteredEntries.length===1?'':'s'} exportado${filteredEntries.length===1?'':'s'}.`,'success');
  };

  const startEntry=(direction:FinancialDirection)=>{
    setEntryFormOpen(true);
    setForm(emptyForm(settings.id,direction));
    setExtractionInfo(null);
    setReadResult(null);
    setDocumentItems([]);
    setReadProgress(null);
    setExcludedItemIndexes([]);
    setEditingEntryId(null);
    requestAnimationFrame(()=>document.getElementById('finance-entry-form')?.scrollIntoView({behavior:'smooth',block:'start'}));
  };

  const openQuickExpense=()=>{
    setQuickExpense({...emptyForm(settings.id,'expense'),description:'Despesa operacional'});
    setQuickExpenseOpen(true);
    requestAnimationFrame(()=>document.getElementById('finance-quick-expense')?.scrollIntoView({behavior:'smooth',block:'nearest'}));
  };
  const openPurchase=async()=>{
    setPurchaseOpen(true);setPurchaseLoading(true);
    try{
      const items=await inventoryApi.listItems(settings.id);
      setPurchaseItems(items.filter(item=>item.active));
    }catch(error){
      showToast(error instanceof Error?error.message:'Não foi possível carregar os insumos.','error');
    }finally{setPurchaseLoading(false)}
  };
  const submitPurchase=async(event:FormEvent)=>{
    event.preventDefault();
    const item=purchaseItems.find(current=>current.id===purchaseDraft.itemId);
    const quantity=Number(purchaseDraft.quantity),total=Number(purchaseDraft.total);
    if(!item||!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(total)||total<=0){
      showToast('Selecione um insumo e informe a quantidade e o custo real da compra.','error');return;
    }
    const intent=JSON.stringify([settings.id,item.id,quantity,total,purchaseDraft.supplier.trim(),purchaseDraft.status,purchaseDraft.paymentMethod]);
    if(purchaseKeyRef.current.signature!==intent)purchaseKeyRef.current={signature:intent,key:createId()};
    setPurchaseSaving(true);
    try{
      const result=await inventoryApi.recordFinancedPurchase({
        storeId:settings.id,items:[{inventoryItemId:item.id,quantity,unitCost:total/quantity}],
        supplier:purchaseDraft.supplier.trim(),paymentStatus:purchaseDraft.status,
        paymentMethod:purchaseDraft.status==='paid'?purchaseDraft.paymentMethod:undefined,
        idempotencyKey:purchaseKeyRef.current.key,
        categoryId:categories.find(category=>category.name.toLocaleLowerCase('pt-BR')==='ingredientes'&&category.active)?.id,
        description:`Compra de ${item.name}`,
      });
      purchaseKeyRef.current={signature:'',key:''};
      setPurchaseDraft({itemId:'',quantity:'',total:'',supplier:'',status:'paid',paymentMethod:''});
      setPurchaseOpen(false);
      await reload();
      showToast(result.duplicate?'Compra já registrada; estoque e financeiro conferidos.':'Compra registrada no estoque e no financeiro.','success');
    }catch(error){showToast(error instanceof Error?error.message:'Não foi possível registrar a compra. Nenhuma operação parcial foi confirmada.','error')}
    finally{setPurchaseSaving(false)}
  };
  const payPurchase=async(entry:FinancialEntry)=>{
    try{await financeApi.markPurchasePaid(settings.id,entry.id);await reload();showToast('Pagamento da compra confirmado. O estoque não foi alterado novamente.','success')}
    catch(error){showToast(error instanceof Error?error.message:'Não foi possível confirmar o pagamento.','error')}
  };

  const submitQuickExpense=async(event:FormEvent)=>{
    event.preventDefault();
    if(!quickExpense.description.trim()||quickExpense.amount<=0){
      showToast('Informe descrição e valor maior que zero.','error');return;
    }
    setQuickExpenseSaving(true);
    try{
      await trackInteraction('financial_quick_expense_create',()=>financeApi.saveEntry({...quickExpense,source:'manual',categoryId:quickExpense.categoryId||undefined,paymentMethod:quickExpense.paymentMethod||undefined}),{storeId:settings.id});
      showToast('Despesa operacional registrada.','success');
      setQuickExpenseOpen(false);
      setQuickExpense({...emptyForm(settings.id,'expense'),description:'Despesa operacional'});
      await reload();
    }catch(err){
      showToast(err instanceof Error?err.message:'Falha ao registrar despesa operacional.','error');
    }finally{setQuickExpenseSaving(false)}
  };

  const upload=async(file?:File)=>{
    if(!file)return;
    setEntryFormOpen(true);
    try{
      setExtracting(true);
      setExtractionInfo(null);
      setReadResult(null);
      setExcludedItemIndexes([]);
      setReadProgress({percent:1,message:'Preparando leitura local...'});
      const suggestion=await readLocalFinancialDocument(file,setReadProgress);
      const suggestedDocumentTotal=suggestion.amount??suggestion.items.reduce((sum,item)=>sum+item.total,0);
      const supplierKey=normalizeCounterpartyKey(suggestion.counterparty||'');
      const previousCategoryId=supplierKey
        ?entries.find((entry)=>entry.direction===form.direction&&entry.categoryId&&normalizeCounterpartyKey(entry.counterparty||'')===supplierKey)?.categoryId
        :undefined;

      setExtractionInfo({
        recognizedFields:suggestion.recognizedFields,
        signals:suggestion.signals,
        preview:suggestion.rawText,
        confidence:suggestion.confidence,
      });
      setReadResult(suggestion);
      setDocumentItems(suggestion.items);
      setExcludedItemIndexes([]);

      setForm((current)=>({
        ...current,
        amount:suggestedDocumentTotal>0?suggestedDocumentTotal:current.amount,
        occurredOn:suggestion.occurredOn||current.occurredOn,
        dueOn:suggestion.dueOn||current.dueOn,
        status:suggestion.documentType==='boleto'&&suggestion.dueOn?'pending':current.status,
        documentType:(suggestion.documentType||current.documentType) as FinancialDocumentType,
        documentNumber:suggestion.documentNumber||current.documentNumber,
        counterparty:suggestion.counterparty||current.counterparty,
        description:suggestion.description||current.description,
        categoryId:previousCategoryId||current.categoryId,
      }));

      if(suggestion.recognizedFields===0){
        showToast('O documento foi lido localmente, mas nenhum campo financeiro confiavel foi encontrado. Preencha manualmente.','error');
      }else{
        showToast(`${suggestion.recognizedFields} campo(s) reconhecido(s) no seu aparelho. Revise antes de salvar.`,'success');
      }
    }catch(err){
      showToast(err instanceof Error?err.message:'Nao foi possivel ler o documento. Preencha manualmente.','error');
    }finally{
      setExtracting(false);
      if(fileRef.current)fileRef.current.value='';
      if(cameraRef.current)cameraRef.current.value='';
    }
  };

  const documentItemsTotal=documentItems.reduce((sum,item)=>sum+item.total,0);
  const documentGrossAmount=readResult?.amount??documentItemsTotal;
  const excludedItems=documentItems.filter((_,index)=>excludedItemIndexes.includes(index));
  const excludedAmount=excludedItems.reduce((sum,item)=>sum+item.total,0);
  const consideredDocumentAmount=Math.max(0,Number((documentGrossAmount-excludedAmount).toFixed(2)));
  const toggleDocumentItem=(index:number)=>{
    const next=excludedItemIndexes.includes(index)
      ? excludedItemIndexes.filter((itemIndex)=>itemIndex!==index)
      : [...excludedItemIndexes,index];
    setExcludedItemIndexes(next);
    if(documentGrossAmount>0){
      const nextExcluded=documentItems.filter((_,itemIndex)=>next.includes(itemIndex)).reduce((sum,item)=>sum+item.total,0);
      setForm((current)=>({...current,amount:Math.max(0,Number((documentGrossAmount-nextExcluded).toFixed(2)))}));
    }
  };
  const updateDocumentItem=(index:number,field:'description'|'quantity'|'unitPrice'|'total',value:string)=>{
    const numeric=Math.max(0,Number(value.replace(',','.'))||0);
    const nextItems=documentItems.map((item,itemIndex)=>{
      if(itemIndex!==index)return item;
      if(field==='description')return {...item,description:value};
      if(field==='quantity')return {...item,quantity:numeric||undefined,total:Number(((numeric||1)*(item.unitPrice||item.total)).toFixed(2))};
      if(field==='unitPrice')return {...item,unitPrice:numeric,total:Number(((item.quantity||1)*numeric).toFixed(2))};
      return {...item,total:numeric};
    });
    setDocumentItems(nextItems);
    const nextTotal=nextItems.reduce((sum,item)=>sum+item.total,0);
    const nextExcluded=nextItems.reduce((sum,item,itemIndex)=>sum+(excludedItemIndexes.includes(itemIndex)?item.total:0),0);
    setForm((current)=>({...current,amount:Math.max(0,Number((nextTotal-nextExcluded).toFixed(2)))}));
  };
  const addDocumentItem=()=>{
    setDocumentItems((current)=>[...current,{description:'Novo item',quantity:1,unitPrice:0,total:0,confidence:1}]);
    setForm((current)=>({...current,amount:Math.max(0,Number((current.amount||0).toFixed(2)))}));
  };
  const removeDocumentItem=(index:number)=>{
    const nextItems=documentItems.filter((_,itemIndex)=>itemIndex!==index);
    const nextExcluded=excludedItemIndexes.filter((itemIndex)=>itemIndex!==index).map((itemIndex)=>itemIndex>index?itemIndex-1:itemIndex);
    setDocumentItems(nextItems);
    setExcludedItemIndexes(nextExcluded);
    const nextExcludedAmount=nextItems.reduce((sum,item,itemIndex)=>sum+(nextExcluded.includes(itemIndex)?item.total:0),0);
    setForm((current)=>({...current,amount:Math.max(0,Number((documentGrossAmount-nextExcludedAmount).toFixed(2)))}));
  };

  const editEntry=(entry:FinancialEntry)=>{
    if(entry.source==='purchase')return;
    setEntryFormOpen(true);
    setEditingEntryId(entry.id);
    setForm({storeId:entry.storeId,direction:entry.direction,categoryId:entry.categoryId||'',description:entry.description,amount:entry.amount,occurredOn:entry.occurredOn,dueOn:entry.dueOn||'',status:entry.status,paymentMethod:entry.paymentMethod||'',counterparty:entry.counterparty||'',documentType:entry.documentType,documentNumber:entry.documentNumber||'',notes:entry.notes||''});
    setExtractionInfo(null);setReadResult(null);setDocumentItems([]);setExcludedItemIndexes([]);
    requestAnimationFrame(()=>document.getElementById('finance-entry-form')?.scrollIntoView({behavior:'smooth',block:'start'}));
  };

  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    if(!form.description.trim()||form.amount<=0){
      showToast('Informe descrição e valor maior que zero.','error');return;
    }
    setSaving(true);
    try{
      const documentAdjustmentNote=excludedItems.length
        ? `Documento lido: total ${currency.format(documentGrossAmount)}; itens desconsiderados (${currency.format(excludedAmount)}): ${excludedItems.map((item)=>item.description).join(', ')}.`
        : '';
      const documentItemsNote=documentItems.length
        ? `Itens conferidos: ${documentItems.filter((_,index)=>!excludedItemIndexes.includes(index)).map((item)=>`${item.quantity||1}x ${item.description} (${currency.format(item.total)})`).join('; ')}.`
        : '';
      const existingEntry=editingEntryId ? entries.find((entry)=>entry.id===editingEntryId) : undefined;
      await trackInteraction(editingEntryId?'financial_entry_update':'financial_entry_create', () => financeApi.saveEntry({
        ...form,
        id:editingEntryId||undefined,
        source:editingEntryId ? entries.find((entry)=>entry.id===editingEntryId)?.source : 'manual',
        orderId:editingEntryId ? entries.find((entry)=>entry.id===editingEntryId)?.orderId : undefined,
        notes:[form.notes.trim(),documentAdjustmentNote,documentItemsNote].filter(Boolean).join('\n'),
        dueOn:form.dueOn||undefined,
        categoryId:form.categoryId||undefined,
        paidAt:form.status==='paid' ? existingEntry?.paidAt || new Date().toISOString() : undefined,
      }), { storeId: settings.id });
      showToast('Lançamento financeiro salvo.','success');
      setForm(emptyForm(settings.id));
      setEditingEntryId(null);
      setEntryFormOpen(false);
      setExtractionInfo(null);
      setReadResult(null);
      setDocumentItems([]);
      setReadProgress(null);
      setExcludedItemIndexes([]);
      await reload();
    }catch(err){
      showToast(err instanceof Error?err.message:'Falha ao salvar lançamento.','error');
    }finally{setSaving(false)}
  };

  if(!enabled)return <section className="feature-lock"><div><ReceiptText size={28}/><h1>Financeiro disponível no Profissional</h1><p>Fluxo de caixa gerencial, entradas, saídas e leitura local de documentos ficam disponíveis no plano Profissional.</p><a className="primary-button" href="/admin/plano">Conhecer o Profissional</a></div></section>;
  if(loading)return <LoadingState label="Carregando lançamentos financeiros..."/>;
  if(financeError)return <ErrorState message={financeError} onRetry={()=>void reload()}/>;

  return <>
    <div className="admin-page-title finance-heading finance-heading-v4">
      <div><span className="eyebrow">GESTÃO DO NEGÓCIO</span><h1>Financeiro</h1><InfoHint label="Sobre Financeiro">Registre uma compra uma vez: a despesa e a entrada de insumos ficam vinculadas.</InfoHint></div>
    </div>

    <section className="finance-summary-band finance-summary-band-v4">
      <div className="income"><span>Entradas realizadas <InfoHint label="Sobre entradas realizadas">Vendas e outras receitas com recebimento confirmado.</InfoHint></span><strong>{currency.format(summary.income)}</strong></div>
      <div className="expense"><span>Saídas realizadas <InfoHint label="Sobre saídas realizadas">Custos e despesas com pagamento realizado.</InfoHint></span><strong>{currency.format(summary.expense)}</strong></div>
      <div className={`result ${summary.result>=0?'positive':'negative'}`}><span>Resultado gerencial <InfoHint label="Sobre o resultado gerencial">Entradas realizadas menos saídas realizadas.</InfoHint></span><strong>{currency.format(summary.result)}</strong></div>
      <div className="pending"><span>Próximos compromissos</span><strong>{currency.format(summary.pendingExpense)}</strong><small>A receber: {currency.format(summary.pendingIncome)}</small></div>
    </section>

    <section className="finance-daily-actions" aria-label="Ações do dia">
      <button type="button" className="primary-button" onClick={()=>void openPurchase()}><ShoppingCart size={17}/>Compra de insumos</button>
      <button type="button" className="secondary-button" onClick={openQuickExpense}><WalletCards size={17}/>Despesa rápida</button>
      <button type="button" className="secondary-button" onClick={()=>startEntry('income')}><ArrowUpRight size={17}/>Entrada</button>
    </section>
    {purchaseOpen&&<section className="admin-card finance-purchase-panel" aria-labelledby="finance-purchase-title">
      <div className="finance-quick-expense__heading"><div><span className="eyebrow">UMA AÇÃO, DOIS REGISTROS</span><h2 id="finance-purchase-title">Compra recebida</h2><InfoHint>Confirme o item e o custo real. O saldo de insumos e a despesa são salvos juntos.</InfoHint></div><button type="button" className="icon-button" aria-label="Fechar compra" onClick={()=>setPurchaseOpen(false)}><X size={18}/></button></div>
      {purchaseLoading?<p role="status">Carregando insumos…</p>:purchaseItems.length===0?<p>Nenhum insumo ativo. <a href="/admin/estoque">Cadastre o primeiro em Estoque.</a></p>:<form className="finance-purchase-form" onSubmit={submitPurchase}>
        <label>Insumo<select value={purchaseDraft.itemId} onChange={event=>setPurchaseDraft(current=>({...current,itemId:event.target.value}))} required><option value="">Selecione</option>{purchaseItems.map(item=><option key={item.id} value={item.id}>{item.name} · {inventoryUnitLabels[item.unit]}</option>)}</select></label>
        <label>Quantidade recebida<input type="number" min="0.001" step="0.001" inputMode="decimal" value={purchaseDraft.quantity} onChange={event=>setPurchaseDraft(current=>({...current,quantity:event.target.value}))} required/></label>
        <label>Custo total (R$)<input type="number" min="0.01" step="0.01" inputMode="decimal" value={purchaseDraft.total} onChange={event=>setPurchaseDraft(current=>({...current,total:event.target.value}))} required/></label>
        <label>Pagamento<select value={purchaseDraft.status} onChange={event=>setPurchaseDraft(current=>({...current,status:event.target.value as 'paid'|'pending'}))}><option value="paid">Já paguei</option><option value="pending">Vou pagar depois</option></select></label>
        <details className="finance-purchase-more"><summary>Fornecedor e forma de pagamento <small>opcional</small></summary><div><label>Fornecedor<input value={purchaseDraft.supplier} onChange={event=>setPurchaseDraft(current=>({...current,supplier:event.target.value}))}/></label>{purchaseDraft.status==='paid'&&<label>Forma de pagamento<select value={purchaseDraft.paymentMethod} onChange={event=>setPurchaseDraft(current=>({...current,paymentMethod:event.target.value}))}><option value="">Não informado</option><option value="pix">PIX</option><option value="cash">Dinheiro</option><option value="credit_card">Crédito</option><option value="debit_card">Débito</option><option value="transfer">Transferência</option><option value="other">Outro</option></select></label>}</div></details>
        <p className="finance-purchase-note">O saldo entra agora. Se o pagamento estiver pendente, a saída aparecerá em Próximos compromissos.</p>
        <button type="submit" className="primary-button" disabled={purchaseSaving}>{purchaseSaving?'Salvando…':'Registrar compra e atualizar estoque'}</button>
      </form>}
    </section>}
    <details className="finance-insights-disclosure"><summary><TrendingUp size={18}/>Análises e gráficos <small>abrir quando precisar</small></summary>
    <section className="finance-insights-grid">
      <article className="admin-card finance-evolution-card">
        <div className="section-heading"><div><span className="eyebrow">ÚLTIMOS 6 MESES</span><h2>Entradas × saídas</h2><InfoHint label="Sobre Entradas × saídas">Uma leitura simples da evolução do caixa gerencial.</InfoHint></div><TrendingUp size={21}/></div>
        <div className="finance-mini-chart">
          {monthly.map((row)=><div className="finance-month" key={row.key}>
            <div className="finance-month-bars">
              <button type="button" className={`income${selectedMonth?.key===row.key?' is-selected':''}`} aria-label={`${row.label}: entradas ${currency.format(row.income)}`} aria-pressed={selectedMonth?.key===row.key} title={`Entradas ${currency.format(row.income)}`} onClick={()=>setSelectedMonthKey(row.key)} style={{height:`${Math.max(4,(row.income/chartMax)*100)}%`}}/>
              <button type="button" className={`expense${selectedMonth?.key===row.key?' is-selected':''}`} aria-label={`${row.label}: saídas ${currency.format(row.expense)}`} aria-pressed={selectedMonth?.key===row.key} title={`Saídas ${currency.format(row.expense)}`} onClick={()=>setSelectedMonthKey(row.key)} style={{height:`${Math.max(4,(row.expense/chartMax)*100)}%`}}/>
            </div>
            <small>{row.label}</small>
          </div>)}
        </div>
        {selectedMonth&&<div className="finance-chart-selection" aria-live="polite"><div><span>Detalhe do período</span><strong>{selectedMonth.label}</strong></div><div><small>Entradas</small><b className="income">{currency.format(selectedMonth.income)}</b></div><div><small>Saídas</small><b className="expense">{currency.format(selectedMonth.expense)}</b></div><div><small>Saldo</small><b className={selectedMonth.income-selectedMonth.expense>=0?'income':'expense'}>{currency.format(selectedMonth.income-selectedMonth.expense)}</b></div></div>}
        <div className="finance-chart-legend"><span className="income">Entradas</span><span className="expense">Saídas</span></div>
      </article>

      <article className="admin-card finance-expense-card">
        <div className="section-heading"><div><span className="eyebrow">ONDE ESTOU GASTANDO?</span><h2>Principais despesas</h2><InfoHint label="Sobre Principais despesas">Ranking por categoria considerando valores realizados.</InfoHint></div><WalletCards size={21}/></div>
        {expenseRanking.length===0?<p className="analytics-empty">Registre despesas para visualizar a distribuição.</p>:<div className="finance-expense-ranking">
          {expenseRanking.map(([name,value])=><button type="button" className={`finance-expense-row${selectedExpenseCategory===name?' is-selected':''}`} aria-pressed={selectedExpenseCategory===name} onClick={()=>setSelectedExpenseCategory(name)} key={name}>
            <span className="finance-expense-row__heading"><span>{name}</span><strong>{currency.format(value)}</strong></span>
            <span className="finance-expense-track"><i style={{width:`${Math.max(3,(value/expenseMax)*100)}%`}}/></span>
          </button>)}
        </div>}
        {selectedExpense&&<div className="finance-expense-selection" aria-live="polite"><span>Categoria selecionada</span><strong>{selectedExpense[0]}</strong><b>{currency.format(selectedExpense[1])} realizados</b></div>}
      </article>
    </section>
    </details>

    <details className="finance-extra-actions"><summary>Documentos e opções detalhadas</summary><section className="finance-quick-actions">
      <button type="button" onClick={()=>startEntry('expense')}><span className="expense"><ArrowDownRight/></span><strong>Saída detalhada</strong><small>Contas, vencimentos e documentos</small></button>
      <button type="button" onClick={()=>fileRef.current?.click()}><span className="document"><Upload/></span><strong>Abrir galeria</strong><small>Selecione foto ou PDF do cupom</small></button>
      <button type="button" onClick={()=>cameraRef.current?.click()}><span className="document"><Camera/></span><strong>Fotografar documento</strong><small>A câmera traseira abre para enquadrar o cupom</small></button>
      <button type="button" onClick={exportFinancialEntries}><span className="document"><Download/></span><strong>Exportar CSV</strong><small>Baixar o histórico filtrado</small></button>
      <input aria-label="Fotografar documento financeiro" ref={cameraRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={(event)=>void upload(event.target.files?.[0])}/>
    </section></details>

    {quickExpenseOpen&&<section className="finance-quick-expense" id="finance-quick-expense" aria-labelledby="finance-quick-expense-title">
      <div className="finance-quick-expense__heading"><div><span className="eyebrow">LANÇAMENTO OPERACIONAL</span><h2 id="finance-quick-expense-title">Registrar despesa rápida</h2><InfoHint>Registre um gasto do dia sem abrir todos os campos do financeiro.</InfoHint></div><button type="button" className="icon-button" aria-label="Fechar despesa rápida" onClick={()=>setQuickExpenseOpen(false)}><X size={18}/></button></div>
      <form className="finance-quick-expense__form" onSubmit={submitQuickExpense}>
        <label>Descrição<input value={quickExpense.description} onChange={(event)=>setQuickExpense((current)=>({...current,description:event.target.value}))} placeholder="Ex.: Leite em pó" required/></label>
        <label>Valor (R$)<input type="number" min="0.01" step="0.01" value={quickExpense.amount||''} onChange={(event)=>setQuickExpense((current)=>({...current,amount:Number(event.target.value)}))} placeholder="0,00" required/></label>
        <details className="finance-quick-more"><summary>Categoria, data e pagamento <small>opcionais</small></summary><div><label>Categoria<select value={quickExpense.categoryId} onChange={(event)=>setQuickExpense((current)=>({...current,categoryId:event.target.value}))}><option value="">Sem categoria</option>{categories.filter((category)=>category.direction==='expense'||category.direction==='both').map((category)=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Data<input type="date" value={quickExpense.occurredOn} onChange={(event)=>setQuickExpense((current)=>({...current,occurredOn:event.target.value}))}/></label><label>Forma de pagamento<select value={quickExpense.paymentMethod} onChange={(event)=>setQuickExpense((current)=>({...current,paymentMethod:event.target.value}))}><option value="">Não informado</option><option value="pix">PIX</option><option value="credit_card">Cartão de crédito</option><option value="debit_card">Cartão de débito</option><option value="cash">Dinheiro</option><option value="transfer">Transferência</option><option value="other">Outro</option></select></label></div></details>
        <div className="finance-quick-expense__actions"><button type="button" className="secondary-button" onClick={()=>setQuickExpenseOpen(false)}>Cancelar</button><button type="submit" className="primary-button" disabled={quickExpenseSaving}><Save size={15}/>{quickExpenseSaving?'Salvando...':'Salvar despesa'}</button></div>
      </form>
    </section>}

    <section className="finance-workspace finance-workspace-v4" id="finance-entry-form">
      <details className="finance-entry-disclosure" open={entryFormOpen} onToggle={event=>setEntryFormOpen(event.currentTarget.open)}><summary>Lançamento detalhado <small>para contas, ajustes e documentos</small></summary>
      <form className="finance-entry-form finance-entry-form-v4" onSubmit={submit}>
        <div className="section-heading"><div><span className="eyebrow">CADASTRO RÁPIDO</span><h2>{editingEntryId?'Editar lançamento':'Novo lançamento'}</h2><InfoHint>Primeiro escolha se é entrada ou saída. O documento pode preencher os demais campos.</InfoHint></div>{editingEntryId&&<button type="button" className="secondary-button" onClick={()=>{setEditingEntryId(null);setForm(emptyForm(settings.id));}}>Cancelar edição</button>}</div>

        <div className="finance-direction-toggle finance-direction-toggle-v4">
          <button type="button" className={form.direction==='income'?'active income':''} onClick={()=>setForm((current)=>({...current,direction:'income',categoryId:''}))}><ArrowUpRight/><span><strong>Entrada / ganho</strong><small>Dinheiro que entrou no negócio</small></span></button>
          <button type="button" className={form.direction==='expense'?'active expense':''} onClick={()=>setForm((current)=>({...current,direction:'expense',categoryId:''}))}><ArrowDownRight/><span><strong>Saída / despesa</strong><small>Dinheiro gasto pelo negócio</small></span></button>
        </div>

        <label className="finance-document-drop finance-document-drop-v4">
          <input aria-label="Selecionar documento financeiro" ref={fileRef} type="file" accept="image/*,application/pdf" onChange={(event)=>void upload(event.target.files?.[0])}/>
          {extracting?<Loader2 className="spin"/>:<Upload/>}
          <span><strong>{extracting?'Lendo documento...':'Preencher a partir de um documento'}</strong><small>Envie foto, cupom fiscal, nota, boleto ou PDF. A leitura ocorre no navegador e nunca salva automaticamente.</small></span>
        </label>

        {readProgress&&<div className="finance-ai-note"><FileSearch2 size={16}/><span><strong>Leitura local</strong> · {readProgress.message}{extracting?` (${readProgress.percent}%)`:''}. O arquivo nao e enviado para IA.</span></div>}
        {extractionInfo&&<div className={`finance-extraction-result ${extractionInfo.recognizedFields>0?'is-success':'is-warning'}`}>
          <div><strong>{extractionInfo.recognizedFields>0?`${extractionInfo.recognizedFields} campo(s) reconhecido(s)`:'Leitura sem campos confiáveis'}</strong><span>Confiança da leitura: {Math.round(extractionInfo.confidence*100)}%</span></div>
          {extractionInfo.signals.length>0&&<div className="finance-extraction-signals">{extractionInfo.signals.map((signal)=><span key={signal}>{signal}</span>)}</div>}
          {extractionInfo.preview&&<details><summary>Ver texto reconhecido no arquivo</summary><pre>{extractionInfo.preview.slice(0,1600)}</pre></details>}
        </div>}

        {documentItems.length>0&&<section className="finance-document-items" aria-labelledby="finance-document-items-title">
          <div className="finance-document-items__heading"><div><span className="eyebrow">CONFERÊNCIA DO DOCUMENTO</span><h3 id="finance-document-items-title">Itens identificados</h3><InfoHint>Marque apenas o que não deve entrar neste lançamento. O valor será recalculado, mas você continua podendo revisá-lo manualmente.</InfoHint></div><span>{documentItems.length} item{documentItems.length===1?'':'s'}</span></div>
          <div className="finance-document-items__list">{documentItems.map((item,index)=>{const excluded=excludedItemIndexes.includes(index);return <div key={`${item.description}-${index}`} className={`finance-document-item${excluded?' is-excluded':''}`}><input aria-label={`Desconsiderar ${item.description}`} type="checkbox" checked={excluded} onChange={()=>toggleDocumentItem(index)}/><div className="finance-document-items__copy"><input aria-label="Descrição do item" value={item.description} onChange={(event)=>updateDocumentItem(index,'description',event.target.value)}/><div className="finance-document-item__fields"><label>Qtd.<input type="number" min="0" step="0.001" value={item.quantity??''} onChange={(event)=>updateDocumentItem(index,'quantity',event.target.value)}/></label><label>Unitário<input type="number" min="0" step="0.01" value={item.unitPrice??''} onChange={(event)=>updateDocumentItem(index,'unitPrice',event.target.value)}/></label></div><small>{item.confidence<0.75?'Confira a leitura deste item.':'Identificado automaticamente'}</small></div><label className="finance-document-item__total">Total<input type="number" min="0" step="0.01" value={item.total} onChange={(event)=>updateDocumentItem(index,'total',event.target.value)}/></label><button type="button" className="icon-button" aria-label={`Remover ${item.description}`} title="Remover item" onClick={()=>removeDocumentItem(index)}>×</button><em>{excluded?'Desconsiderado':'Considerar'}</em></div>})}</div>
          <button type="button" className="secondary-button finance-document-items__add" onClick={addDocumentItem}><Plus size={15}/>Adicionar item</button>
          <div className="finance-document-items__summary"><span>Total do documento <strong>{currency.format(documentGrossAmount)}</strong></span><span>Desconsiderado <strong>− {currency.format(excludedAmount)}</strong></span><span>Valor a lançar <strong>{currency.format(consideredDocumentAmount)}</strong></span></div>
        </section>}

        <div className="finance-form-grid">
          <label className={readResult?.description ? 'is-autofilled-r69' : undefined}>Descrição<span className="autofill-mark-r69">{readResult?.description ? '✓ identificado' : ''}</span><input value={form.description} onChange={(event)=>setForm((current)=>({...current,description:event.target.value}))} placeholder="Ex.: Compra de ingredientes" required/></label>
          <label className={readResult?.amount !== undefined ? 'is-autofilled-r69' : undefined}>Valor (R$)<span className="autofill-mark-r69">{readResult?.amount !== undefined ? '✓ identificado' : ''}</span><input type="number" min="0.01" step="0.01" value={form.amount||''} onChange={(event)=>setForm((current)=>({...current,amount:Number(event.target.value)}))} required/></label>
          <label>Categoria<select value={form.categoryId} onChange={(event)=>setForm((current)=>({...current,categoryId:event.target.value}))}><option value="">Sem categoria</option>{categoryOptions.map((category)=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className={readResult?.occurredOn ? 'is-autofilled-r69' : undefined}>Data<span className="autofill-mark-r69">{readResult?.occurredOn ? '✓ identificado' : ''}</span><input type="date" value={form.occurredOn} onChange={(event)=>setForm((current)=>({...current,occurredOn:event.target.value}))}/></label>
          <label>Situação<select value={form.status} onChange={(event)=>setForm((current)=>({...current,status:event.target.value as FinancialEntryStatus}))}><option value="paid">Pago/recebido</option><option value="pending">Pendente</option><option value="cancelled">Cancelado</option></select></label>
          <label>Vencimento<input type="date" value={form.dueOn} onChange={(event)=>setForm((current)=>({...current,dueOn:event.target.value}))}/></label>
          <label className={readResult?.counterparty ? 'is-autofilled-r69' : undefined}>Fornecedor / origem<span className="autofill-mark-r69">{readResult?.counterparty ? '✓ identificado' : ''}</span><input value={form.counterparty} onChange={(event)=>setForm((current)=>({...current,counterparty:event.target.value}))}/></label>
          <label>Forma de pagamento<select value={form.paymentMethod} onChange={(event)=>setForm((current)=>({...current,paymentMethod:event.target.value}))}><option value="">Não informado</option><option value="pix">PIX</option><option value="credit_card">Cartão de crédito</option><option value="debit_card">Cartão de débito</option><option value="cash">Dinheiro</option><option value="transfer">Transferência</option><option value="other">Outro</option></select></label>
          <label className={readResult?.documentType && readResult.documentType !== 'other' && readResult.documentType !== 'none' ? 'is-autofilled-r69' : undefined}>Tipo de documento<span className="autofill-mark-r69">{readResult?.documentType && readResult.documentType !== 'other' && readResult.documentType !== 'none' ? '✓ identificado' : ''}</span><select value={form.documentType} onChange={(event)=>setForm((current)=>({...current,documentType:event.target.value as FinancialDocumentType}))}>{documentTypes.map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className={readResult?.documentNumber ? 'is-autofilled-r69' : undefined}>Número do documento<span className="autofill-mark-r69">{readResult?.documentNumber ? '✓ identificado' : ''}</span><input value={form.documentNumber} onChange={(event)=>setForm((current)=>({...current,documentNumber:event.target.value}))}/></label>
        </div>
        <label>Observação<textarea rows={3} value={form.notes} onChange={(event)=>setForm((current)=>({...current,notes:event.target.value}))}/></label>
        <button className="primary-button" disabled={saving} type="submit"><Save size={17}/>{saving?'Salvando...':`${editingEntryId?'Atualizar':'Salvar'} ${form.direction==='income'?'entrada':'saída'}`}</button>
      </form>
      </details>

      <div className="finance-ledger finance-ledger-v4">
        <div className="section-heading finance-ledger-heading"><div><span className="eyebrow">MOVIMENTAÇÕES</span><h2>Histórico recente</h2><InfoHint label="Sobre Histórico recente">Pedidos com recebimento confirmado entram automaticamente como receita; lançamentos manuais aparecem junto.</InfoHint></div><FileSearch2 size={21}/></div>
        <div className="finance-ledger-filters" role="search" aria-label="Filtrar lançamentos">
          <label><span className="sr-only">Buscar lançamento</span><input value={ledgerQuery} onChange={(event)=>setLedgerQuery(event.target.value)} placeholder="Buscar por descrição, fornecedor ou documento" /></label>
          <label><span className="sr-only">Filtrar situação</span><select value={ledgerStatus} onChange={(event)=>setLedgerStatus(event.target.value as typeof ledgerStatus)}><option value="all">Todas as situações</option><option value="paid">Realizados</option><option value="pending">Pendentes</option><option value="cancelled">Cancelados</option></select></label>
        </div>
        {loading?<p>Carregando...</p>:entries.length===0?
          <div className="empty-ledger"><ReceiptText/><strong>Nenhum lançamento ainda</strong><span>Confirme o recebimento de um pedido ou registre sua primeira movimentação.</span></div>
        :filteredEntries.length===0?<div className="empty-ledger finance-ledger-empty-filter"><ReceiptText/><strong>Nenhum lançamento encontrado</strong><span>Altere a busca ou o filtro de situação.</span></div>
        :<><div className="finance-ledger-list">{filteredEntries.map((entry)=><article key={entry.id}>
          <span className={`finance-entry-icon ${entry.direction}`}>{entry.direction==='income'?<ArrowUpRight/>:<ArrowDownRight/>}</span>
          <div><strong>{entry.description}</strong><small>{new Date(`${entry.occurredOn}T12:00:00`).toLocaleDateString('pt-BR')} · {categories.find((category)=>category.id===entry.categoryId)?.name||'Sem categoria'}</small><span className={`finance-origin-badge-r69 ${entry.source==='order'?'is-order':'is-manual'}`}>{entry.source==='order'?'Pedido automático':entry.source==='purchase'?'Compra · estoque atualizado':entry.source==='adjustment'?'Ajuste':'Lançamento manual'}</span>{entry.source==='order'&&entry.orderId?<a className="finance-order-link-r69" href={`/admin/pedidos?highlight=${encodeURIComponent(entry.orderId)}`}>Ver pedido relacionado</a>:null}</div>
          <div className="finance-entry-value"><strong>{entry.direction==='income'?'+':'−'} {currency.format(entry.amount)}</strong><span className={`status-dot ${entry.status}`}>{entry.status==='paid'?'Realizado':entry.status==='pending'?'Pendente':'Cancelado'}</span>{entry.source==='purchase' ? entry.status==='pending' ? <button type="button" className="finance-entry-action" onClick={()=>void payPurchase(entry)}>Marcar como pago</button> : null : <button type="button" className="finance-entry-action" onClick={()=>editEntry(entry)}><Pencil size={13}/>Editar</button>}<details className="finance-entry-details"><summary><ChevronDown size={13}/>Detalhes</summary><div><span>Documento: {documentTypes.find((item)=>item.value===entry.documentType)?.label||'Sem documento'}</span>{entry.documentNumber&&<span>Número: {entry.documentNumber}</span>}{entry.counterparty&&<span>Fornecedor/origem: {entry.counterparty}</span>}{entry.paymentMethod&&<span>Pagamento: {entry.paymentMethod}</span>}{entry.dueOn&&<span>Vencimento: {new Date(`${entry.dueOn}T12:00:00`).toLocaleDateString('pt-BR')}</span>}{entry.notes&&<span>Observação: {entry.notes}</span>}{entry.source==='purchase' ? <span>Valor vinculado à compra e ao movimento de estoque.</span> : <button type="button" className="secondary-button" onClick={()=>editEntry(entry)}><Pencil size={13}/>Editar lançamento</button>}</div></details></div>
        </article>)}</div><div className="finance-ledger-footer"><span>Exibindo {filteredEntries.length} de {entries.length} lançamento{entries.length===1?'':'s'} carregado{entries.length===1?'':'s'}.</span>{hasMoreEntries&&<button type="button" className="secondary-button" onClick={()=>void loadMoreEntries()} disabled={loadingMoreEntries}>{loadingMoreEntries?<Loader2 className="spin" size={15}/>:<Plus size={15}/>} {loadingMoreEntries?'Carregando...':'Carregar mais'}</button>}</div></>}
      </div>
    </section>
  </>;
}
