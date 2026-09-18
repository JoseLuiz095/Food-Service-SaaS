import { ArrowDownRight, ArrowUpRight, Camera, FileSearch2, Loader2, Plus, ReceiptText, Save, TrendingUp, Upload, WalletCards } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import { financeApi } from '../../services/financeApi';
import { trackInteraction } from '../../services/interactionTelemetry';
import type { FinancialCategory, FinancialDirection, FinancialDocumentType, FinancialEntry, FinancialEntryStatus } from '../../types';
import { currency } from '../../utils/format';
import { planHasFeature } from '../../utils/plan';
import { normalizeCounterpartyKey, readLocalFinancialDocument, type LocalFinancialReadProgress, type LocalFinancialReadResult } from '../../utils/localFinancialDocumentReader';

const today=()=>new Date().toISOString().slice(0,10);
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
  const[form,setForm]=useState(()=>emptyForm(settings.id));
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState(false);
  const[extracting,setExtracting]=useState(false);
  const[extractionInfo,setExtractionInfo]=useState<{recognizedFields:number;signals:string[];preview:string;confidence:number}|null>(null);
  const[readProgress,setReadProgress]=useState<LocalFinancialReadProgress|null>(null);
  const[readResult,setReadResult]=useState<LocalFinancialReadResult|null>(null);
  const fileRef=useRef<HTMLInputElement|null>(null);
  const cameraRef=useRef<HTMLInputElement|null>(null);

  const reload=async()=>{
    setLoading(true);
    try{
      const[c,e]=await Promise.all([financeApi.listCategories(settings.id),financeApi.listEntries(settings.id)]);
      setCategories(c);setEntries(e);
    }catch(err){
      showToast(err instanceof Error?err.message:'Falha ao carregar o financeiro.','error');
    }finally{setLoading(false)}
  };

  useEffect(()=>{
    setForm(emptyForm(settings.id));
    if(enabled)void reload();else setLoading(false);
  },[settings.id,enabled]);

  const summary=useMemo(()=>{
    const paid=entries.filter((entry)=>entry.status==='paid');
    const income=paid.filter((entry)=>entry.direction==='income').reduce((sum,e)=>sum+e.amount,0);
    const expense=paid.filter((entry)=>entry.direction==='expense').reduce((sum,e)=>sum+e.amount,0);
    const pendingIncome=entries.filter((entry)=>entry.status==='pending'&&entry.direction==='income').reduce((sum,e)=>sum+e.amount,0);
    const pendingExpense=entries.filter((entry)=>entry.status==='pending'&&entry.direction==='expense').reduce((sum,e)=>sum+e.amount,0);
    return{income,expense,result:income-expense,pendingIncome,pendingExpense};
  },[entries]);

  const expenseRanking=useMemo(()=>{
    const totals=new Map<string,number>();
    entries.filter((entry)=>entry.status==='paid'&&entry.direction==='expense').forEach((entry)=>{
      const name=categories.find((category)=>category.id===entry.categoryId)?.name||'Sem categoria';
      totals.set(name,(totals.get(name)||0)+entry.amount);
    });
    return [...totals.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6);
  },[entries,categories]);

  const monthly=useMemo(()=>{
    const now=new Date();
    const rows=Array.from({length:6},(_,index)=>{
      const date=new Date(now.getFullYear(),now.getMonth()-(5-index),1);
      return{key:monthKey(date),label:new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(date).replace('.',''),income:0,expense:0};
    });
    const byKey=new Map(rows.map((row)=>[row.key,row]));
    entries.filter((entry)=>entry.status==='paid').forEach((entry)=>{
      const row=byKey.get(entry.occurredOn.slice(0,7));
      if(!row)return;
      if(entry.direction==='income')row.income+=entry.amount;else row.expense+=entry.amount;
    });
    return rows;
  },[entries]);

  const chartMax=Math.max(1,...monthly.flatMap((row)=>[row.income,row.expense]));
  const expenseMax=Math.max(1,...expenseRanking.map(([,value])=>value));
  const categoryOptions=categories.filter((category)=>category.direction==='both'||category.direction===form.direction);

  const startEntry=(direction:FinancialDirection)=>{
    setForm(emptyForm(settings.id,direction));
    setExtractionInfo(null);
    setReadResult(null);
    setReadProgress(null);
    requestAnimationFrame(()=>document.getElementById('finance-entry-form')?.scrollIntoView({behavior:'smooth',block:'start'}));
  };

  const upload=async(file?:File)=>{
    if(!file)return;
    try{
      setExtracting(true);
      setExtractionInfo(null);
      setReadResult(null);
      setReadProgress({percent:1,message:'Preparando leitura local...'});
      const suggestion=await readLocalFinancialDocument(file,setReadProgress);
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

      setForm((current)=>({
        ...current,
        amount:suggestion.amount??current.amount,
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
    }
  };

  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    if(!form.description.trim()||form.amount<=0){
      showToast('Informe descrição e valor maior que zero.','error');return;
    }
    setSaving(true);
    try{
      await trackInteraction('financial_entry_create', () => financeApi.saveEntry({
        ...form,
        dueOn:form.dueOn||undefined,
        categoryId:form.categoryId||undefined,
        paidAt:form.status==='paid'?new Date().toISOString():undefined,
      }), { storeId: settings.id });
      showToast('Lançamento financeiro salvo.','success');
      setForm(emptyForm(settings.id));
      setExtractionInfo(null);
      setReadResult(null);
      setReadProgress(null);
      await reload();
    }catch(err){
      showToast(err instanceof Error?err.message:'Falha ao salvar lançamento.','error');
    }finally{setSaving(false)}
  };

  if(!enabled)return <section className="feature-lock"><div><ReceiptText size={28}/><h1>Financeiro disponível no Profissional</h1><p>Fluxo de caixa gerencial, entradas, saídas e leitura local de documentos ficam disponíveis no plano Profissional.</p><a className="primary-button" href="/admin/plano">Conhecer o Profissional</a></div></section>;

  return <>
    <div className="admin-page-title finance-heading finance-heading-v4">
      <div><span className="eyebrow">GESTÃO DO NEGÓCIO</span><h1>Financeiro</h1><p>Veja rapidamente quanto entrou, quanto saiu e o que está consumindo sua margem.</p></div>
      <div className="finance-title-actions">
        <button className="secondary-button" onClick={()=>startEntry('expense')}><ArrowDownRight size={17}/>Registrar saída</button>
        <button className="primary-button" onClick={()=>startEntry('income')}><Plus size={17}/>Registrar entrada</button>
      </div>
    </div>

    <section className="finance-summary-band finance-summary-band-v4">
      <div className="income"><span>Entradas realizadas</span><strong>{currency.format(summary.income)}</strong><small><ArrowUpRight size={14}/>Vendas e outras receitas</small></div>
      <div className="expense"><span>Saídas realizadas</span><strong>{currency.format(summary.expense)}</strong><small><ArrowDownRight size={14}/>Custos e despesas pagas</small></div>
      <div className={`result ${summary.result>=0?'positive':'negative'}`}><span>Resultado gerencial</span><strong>{currency.format(summary.result)}</strong><small>Entradas realizadas − saídas realizadas</small></div>
      <div className="pending"><span>Próximos compromissos</span><strong>{currency.format(summary.pendingExpense)}</strong><small>A receber: {currency.format(summary.pendingIncome)}</small></div>
    </section>

    <section className="finance-insights-grid">
      <article className="admin-card finance-evolution-card">
        <div className="section-heading"><div><span className="eyebrow">ÚLTIMOS 6 MESES</span><h2>Entradas × saídas</h2><p>Uma leitura simples da evolução do caixa gerencial.</p></div><TrendingUp size={21}/></div>
        <div className="finance-mini-chart">
          {monthly.map((row)=><div className="finance-month" key={row.key}>
            <div className="finance-month-bars">
              <span className="income" title={`Entradas ${currency.format(row.income)}`} style={{height:`${Math.max(4,(row.income/chartMax)*100)}%`}}/>
              <span className="expense" title={`Saídas ${currency.format(row.expense)}`} style={{height:`${Math.max(4,(row.expense/chartMax)*100)}%`}}/>
            </div>
            <small>{row.label}</small>
          </div>)}
        </div>
        <div className="finance-chart-legend"><span className="income">Entradas</span><span className="expense">Saídas</span></div>
      </article>

      <article className="admin-card finance-expense-card">
        <div className="section-heading"><div><span className="eyebrow">ONDE ESTOU GASTANDO?</span><h2>Principais despesas</h2><p>Ranking por categoria considerando valores realizados.</p></div><WalletCards size={21}/></div>
        {expenseRanking.length===0?<p className="analytics-empty">Registre despesas para visualizar a distribuição.</p>:<div className="finance-expense-ranking">
          {expenseRanking.map(([name,value])=><div key={name}>
            <div><span>{name}</span><strong>{currency.format(value)}</strong></div>
            <span className="finance-expense-track"><i style={{width:`${Math.max(3,(value/expenseMax)*100)}%`}}/></span>
          </div>)}
        </div>}
      </article>
    </section>

    <section className="finance-quick-actions">
      <button onClick={()=>startEntry('income')}><span className="income"><ArrowUpRight/></span><strong>Nova entrada</strong><small>Venda, recebimento ou outra receita</small></button>
      <button onClick={()=>startEntry('expense')}><span className="expense"><ArrowDownRight/></span><strong>Nova saída</strong><small>Compra, conta ou despesa operacional</small></button>
      <button onClick={()=>cameraRef.current?.click()}><span className="document"><Camera/></span><strong>Tirar foto</strong><small>Use a camera traseira do celular</small></button>
      <input ref={cameraRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={(event)=>void upload(event.target.files?.[0])}/>
    </section>

    <section className="finance-workspace finance-workspace-v4" id="finance-entry-form">
      <form className="finance-entry-form finance-entry-form-v4" onSubmit={submit}>
        <div className="section-heading"><div><span className="eyebrow">CADASTRO RÁPIDO</span><h2>Novo lançamento</h2><p>Primeiro escolha se é entrada ou saída. O documento pode preencher os demais campos.</p></div></div>

        <div className="finance-direction-toggle finance-direction-toggle-v4">
          <button type="button" className={form.direction==='income'?'active income':''} onClick={()=>setForm((current)=>({...current,direction:'income',categoryId:''}))}><ArrowUpRight/><span><strong>Entrada / ganho</strong><small>Dinheiro que entrou no negócio</small></span></button>
          <button type="button" className={form.direction==='expense'?'active expense':''} onClick={()=>setForm((current)=>({...current,direction:'expense',categoryId:''}))}><ArrowDownRight/><span><strong>Saída / despesa</strong><small>Dinheiro gasto pelo negócio</small></span></button>
        </div>

        <label className="finance-document-drop finance-document-drop-v4">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event)=>void upload(event.target.files?.[0])}/>
          {extracting?<Loader2 className="spin"/>:<Upload/>}
          <span><strong>{extracting?'Lendo documento...':'Preencher a partir de um documento'}</strong><small>Envie foto, cupom fiscal, nota, boleto ou PDF. A leitura ocorre no navegador e nunca salva automaticamente.</small></span>
        </label>

        {readProgress&&<div className="finance-ai-note"><FileSearch2 size={16}/><span><strong>Leitura local</strong> · {readProgress.message}{extracting?` (${readProgress.percent}%)`:''}. O arquivo nao e enviado para IA.</span></div>}
        {extractionInfo&&<div className={`finance-extraction-result ${extractionInfo.recognizedFields>0?'is-success':'is-warning'}`}>
          <div><strong>{extractionInfo.recognizedFields>0?`${extractionInfo.recognizedFields} campo(s) reconhecido(s)`:'Leitura sem campos confiáveis'}</strong><span>Confiança da leitura: {Math.round(extractionInfo.confidence*100)}%</span></div>
          {extractionInfo.signals.length>0&&<div className="finance-extraction-signals">{extractionInfo.signals.map((signal)=><span key={signal}>{signal}</span>)}</div>}
          {extractionInfo.preview&&<details><summary>Ver texto reconhecido no arquivo</summary><pre>{extractionInfo.preview.slice(0,1600)}</pre></details>}
        </div>}

        <div className="finance-form-grid">
          <label className={readResult?.description ? 'is-autofilled-r69' : undefined}>Descrição<span className="autofill-mark-r69">{readResult?.description ? '✓ identificado' : ''}</span><input value={form.description} onChange={(event)=>setForm((current)=>({...current,description:event.target.value}))} placeholder="Ex.: Compra de ingredientes" required/></label>
          <label className={readResult?.amount !== undefined ? 'is-autofilled-r69' : undefined}>Valor (R$)<span className="autofill-mark-r69">{readResult?.amount !== undefined ? '✓ identificado' : ''}</span><input type="number" min="0.01" step="0.01" value={form.amount||''} onChange={(event)=>setForm((current)=>({...current,amount:Number(event.target.value)}))} required/></label>
          <label>Categoria<select value={form.categoryId} onChange={(event)=>setForm((current)=>({...current,categoryId:event.target.value}))}><option value="">Sem categoria</option>{categoryOptions.map((category)=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className={readResult?.occurredOn ? 'is-autofilled-r69' : undefined}>Data<span className="autofill-mark-r69">{readResult?.occurredOn ? '✓ identificado' : ''}</span><input type="date" value={form.occurredOn} onChange={(event)=>setForm((current)=>({...current,occurredOn:event.target.value}))}/></label>
          <label>Situação<select value={form.status} onChange={(event)=>setForm((current)=>({...current,status:event.target.value as FinancialEntryStatus}))}><option value="paid">Pago/recebido</option><option value="pending">Pendente</option></select></label>
          <label>Vencimento<input type="date" value={form.dueOn} onChange={(event)=>setForm((current)=>({...current,dueOn:event.target.value}))}/></label>
          <label className={readResult?.counterparty ? 'is-autofilled-r69' : undefined}>Fornecedor / origem<span className="autofill-mark-r69">{readResult?.counterparty ? '✓ identificado' : ''}</span><input value={form.counterparty} onChange={(event)=>setForm((current)=>({...current,counterparty:event.target.value}))}/></label>
          <label className={readResult?.documentType && readResult.documentType !== 'other' && readResult.documentType !== 'none' ? 'is-autofilled-r69' : undefined}>Tipo de documento<span className="autofill-mark-r69">{readResult?.documentType && readResult.documentType !== 'other' && readResult.documentType !== 'none' ? '✓ identificado' : ''}</span><select value={form.documentType} onChange={(event)=>setForm((current)=>({...current,documentType:event.target.value as FinancialDocumentType}))}>{documentTypes.map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className={readResult?.documentNumber ? 'is-autofilled-r69' : undefined}>Número do documento<span className="autofill-mark-r69">{readResult?.documentNumber ? '✓ identificado' : ''}</span><input value={form.documentNumber} onChange={(event)=>setForm((current)=>({...current,documentNumber:event.target.value}))}/></label>
        </div>
        <label>Observação<textarea rows={3} value={form.notes} onChange={(event)=>setForm((current)=>({...current,notes:event.target.value}))}/></label>
        <button className="primary-button" disabled={saving} type="submit"><Save size={17}/>{saving?'Salvando...':`Salvar ${form.direction==='income'?'entrada':'saída'}`}</button>
      </form>

      <div className="finance-ledger finance-ledger-v4">
        <div className="section-heading"><div><span className="eyebrow">MOVIMENTAÇÕES</span><h2>Histórico recente</h2><p>Pedidos com recebimento confirmado entram automaticamente como receita; lançamentos manuais aparecem junto.</p></div><FileSearch2 size={21}/></div>
        {loading?<p>Carregando...</p>:entries.length===0?
          <div className="empty-ledger"><ReceiptText/><strong>Nenhum lançamento ainda</strong><span>Confirme o recebimento de um pedido ou registre sua primeira movimentação.</span></div>
        :<div className="finance-ledger-list">{entries.slice(0,50).map((entry)=><article key={entry.id}>
          <span className={`finance-entry-icon ${entry.direction}`}>{entry.direction==='income'?<ArrowUpRight/>:<ArrowDownRight/>}</span>
          <div><strong>{entry.description}</strong><small>{new Date(`${entry.occurredOn}T12:00:00`).toLocaleDateString('pt-BR')} · {categories.find((category)=>category.id===entry.categoryId)?.name||'Sem categoria'}</small><span className={`finance-origin-badge-r69 ${entry.source==='order'?'is-order':'is-manual'}`}>{entry.source==='order'?'Pedido automático':entry.source==='adjustment'?'Ajuste':'Lançamento manual'}</span>{entry.source==='order'&&entry.orderId?<a className="finance-order-link-r69" href={`/admin/pedidos?highlight=${encodeURIComponent(entry.orderId)}`}>Ver pedido relacionado</a>:null}</div>
          <div className="finance-entry-value"><strong>{entry.direction==='income'?'+':'−'} {currency.format(entry.amount)}</strong><span className={`status-dot ${entry.status}`}>{entry.status==='paid'?'Realizado':entry.status==='pending'?'Pendente':'Cancelado'}</span></div>
        </article>)}</div>}
      </div>
    </section>
  </>;
}
