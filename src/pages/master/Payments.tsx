import { BadgeCheck, Clock3, QrCode, RefreshCw, ShieldCheck, WalletCards } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { platformApi } from '../../services/platformApi';
import type { SubscriptionPayment } from '../../types';
import { currency } from '../../utils/format';

const label:{[key:string]:string}={pending:'Aguardando pagamento',proof_sent:'Comprovante enviado',paid:'Pago',expired:'Vencido',cancelled:'Cancelado',refunded:'Estornado'};
export default function MasterPayments(){
  const{showToast}=useToast();const[items,setItems]=useState<SubscriptionPayment[]>([]);const[loading,setLoading]=useState(true);const[busy,setBusy]=useState('');
  const load=async()=>{setLoading(true);try{setItems(await platformApi.listSubscriptionPayments())}catch(err){showToast(err instanceof Error?err.message:'Falha ao carregar cobranças.','error')}finally{setLoading(false)}};
  useEffect(()=>{void load()},[]);
  const stats=useMemo(()=>({waiting:items.filter((p)=>p.status==='pending'||p.status==='proof_sent').reduce((s,p)=>s+p.amount,0),paid:items.filter((p)=>p.status==='paid').reduce((s,p)=>s+p.amount,0),proofs:items.filter((p)=>p.status==='proof_sent').length}),[items]);
  const confirm=async(payment:SubscriptionPayment)=>{if(!window.confirm(`Confirmar ${currency.format(payment.amount)} de ${payment.storeName||'esta loja'}? A assinatura será renovada.`))return;setBusy(payment.id);try{await platformApi.confirmSubscriptionPayment(payment.id);showToast('Pagamento confirmado e assinatura renovada.','success');await load()}catch(err){showToast(err instanceof Error?err.message:'Não foi possível confirmar.','error')}finally{setBusy('')}};
  return <><div className="admin-page-title"><div><h1>Pagamentos da plataforma</h1><p>Acompanhe comprovantes, cobranças PIX e renovações das assinaturas FoodWeb.</p></div><button className="secondary-button" onClick={()=>void load()}><RefreshCw size={16}/>Atualizar</button></div>
    <section className="billing-master-summary"><div><span>Em aberto</span><strong>{currency.format(stats.waiting)}</strong></div><div><span>Comprovantes para revisar</span><strong>{stats.proofs}</strong></div><div><span>Recebido no histórico</span><strong>{currency.format(stats.paid)}</strong></div><div><span>Automação</span><strong>{items.some((p)=>p.provider==='asaas')?'Asaas + webhook':'PIX manual'}</strong></div></section>
    <section className="admin-card billing-payment-table"><div className="section-heading"><div><h2>Histórico de cobranças</h2><p>No PIX manual, confirme somente depois de validar o crédito. No Asaas, o evento PAYMENT_RECEIVED renova automaticamente.</p></div><ShieldCheck size={21}/></div>
      {loading?<p>Carregando...</p>:items.length===0?<div className="empty-ledger"><WalletCards/><strong>Nenhuma cobrança gerada</strong><span>As cobranças aparecerão aqui quando os lojistas solicitarem renovação.</span></div>:<div className="master-payment-list">{items.map((payment)=><article key={payment.id}><span className={`payment-provider ${payment.provider}`}>{payment.provider==='asaas'?<QrCode/>:<WalletCards/>}</span><div><strong>{payment.storeName||payment.storeId}</strong><small>{payment.planName||'Plano'} · vencimento {new Date(`${payment.dueDate}T12:00:00`).toLocaleDateString('pt-BR')} · {payment.provider==='asaas'?'PIX automático':'PIX manual'}</small></div><strong className="payment-amount">{currency.format(payment.amount)}</strong><span className={`payment-status ${payment.status}`}>{payment.status==='paid'?<BadgeCheck/>:<Clock3/>}{label[payment.status]||payment.status}</span>{payment.status==='proof_sent'&&payment.provider==='manual'?<button className="primary-button compact" disabled={busy===payment.id} onClick={()=>void confirm(payment)}>{busy===payment.id?'Confirmando...':'Confirmar pagamento'}</button>:<span/>}</article>)}</div>}
    </section>
  </>;
}
