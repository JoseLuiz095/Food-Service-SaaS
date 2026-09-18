import { Ban, CalendarDays, CheckCircle2, RefreshCw, ReceiptText, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { platformApi } from '../../services/platformApi';
import { trackInteraction } from '../../services/interactionTelemetry';
import type { SubscriptionPayment } from '../../types';
import { currency } from '../../utils/format';

const dateBr=(value?:string)=>value?new Date(`${value.slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR'):'—';
const dateTimeBr=(value?:string)=>value?new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
const statusLabel=(payment:SubscriptionPayment)=>({
  pending:'Aguardando pagamento',proof_sent:'Comprovante enviado',paid:'Pago',rejected:'Não renovado',
  cancelled:'Cancelado',expired:'Vencido',refunded:'Estornado',
}[payment.status]||payment.status);

export default function MasterPayments(){
  const{showToast}=useToast();
  const[payments,setPayments]=useState<SubscriptionPayment[]>([]);
  const[busy,setBusy]=useState('');
  const[loading,setLoading]=useState(true);
  const[rejecting,setRejecting]=useState<SubscriptionPayment|null>(null);
  const[rejectReason,setRejectReason]=useState('');

  const load=async()=>{
    setLoading(true);
    try{setPayments(await platformApi.listSubscriptionPayments())}
    catch(error){showToast(error instanceof Error?error.message:'Falha ao carregar pagamentos.','error')}
    finally{setLoading(false)}
  };

  useEffect(()=>{void load()},[]);

  const stats=useMemo(()=>({
    waiting:payments.filter((payment)=>payment.status==='pending'||payment.status==='proof_sent').length,
    paid:payments.filter((payment)=>payment.status==='paid').length,
    rejected:payments.filter((payment)=>payment.status==='rejected').length,
  }),[payments]);

  const confirm=async(payment:SubscriptionPayment)=>{
    const action=payment.paymentIntent==='plan_change'
      ? `confirmar ${currency.format(payment.amount)} e alterar ${payment.storeName||'a loja'} de ${payment.previousPlanName||'plano atual'} para ${payment.planName||'o novo plano'}`
      : `confirmar ${currency.format(payment.amount)} de ${payment.storeName||'esta loja'} e renovar a assinatura`;
    if(!window.confirm(`Deseja ${action}? Confirme somente depois de validar o crédito PIX e o comprovante no WhatsApp.`))return;
    setBusy(payment.id);
    try{
      await trackInteraction(
        payment.paymentIntent === 'plan_change' ? 'subscription_plan_change_confirm' : 'subscription_renewal_confirm',
        () => platformApi.confirmSubscriptionPayment(payment.id),
        { storeId: payment.storeId, successKind: 'audit' },
      );
      showToast(payment.paymentIntent==='plan_change'?'Pagamento confirmado e novo plano ativado.':'Pagamento confirmado e assinatura renovada.','success');
      await load();
    }catch(error){showToast(error instanceof Error?error.message:'Não foi possível confirmar.','error')}
    finally{setBusy('')}
  };

  const openReject=(payment:SubscriptionPayment)=>{
    setRejectReason(payment.paymentIntent==='renewal'?'Renovação não confirmada pelo financeiro.':'Alteração de plano não confirmada pelo financeiro.');
    setRejecting(payment);
  };

  const reject=async()=>{
    if(!rejecting||rejectReason.trim().length<5){showToast('Informe um motivo para registrar a não renovação/negação.','error');return;}
    setBusy(rejecting.id);
    try{
      await trackInteraction(
        rejecting.paymentIntent === 'plan_change' ? 'subscription_plan_change_reject' : 'subscription_renewal_reject',
        () => platformApi.rejectSubscriptionPayment(rejecting.id,rejectReason.trim()),
        { storeId: rejecting.storeId, successKind: 'audit' },
      );
      showToast(rejecting.paymentIntent==='plan_change'?'Alteração de plano negada.':'Mensalidade registrada como não renovada.','success');
      setRejecting(null);setRejectReason('');await load();
    }catch(error){showToast(error instanceof Error?error.message:'Falha ao negar a cobrança.','error')}
    finally{setBusy('')}
  };

  return <>
    <div className="admin-page-title"><div><span className="eyebrow">MENSALIDADES</span><h1>Pagamentos e alterações de plano</h1><p>Confirme somente após conferir o PIX. Se a renovação não ocorreu, registre a negativa sem avançar o vencimento da loja.</p></div><button className="secondary-button" onClick={()=>void load()}><RefreshCw size={16}/>Atualizar</button></div>

    <section className="master-payment-summary-v046"><span><strong>{stats.waiting}</strong><small>Aguardando decisão</small></span><span><strong>{stats.paid}</strong><small>Pagamentos confirmados</small></span><span><strong>{stats.rejected}</strong><small>Não renovados</small></span></section>

    <section className="admin-card billing-payment-table"><div className="section-heading"><div><span className="eyebrow">PIX + WHATSAPP</span><h2>Histórico de cobranças</h2><p>O FoodWeb não confirma mensalidades sozinho. A decisão permanece sob controle do Admin Master.</p></div><ReceiptText size={21}/></div>
      {loading?<p>Carregando...</p>:payments.length===0?<p>Nenhuma cobrança registrada.</p>:<div className="food-master-payment-list-v046">
        {payments.map((payment)=><article key={payment.id} className="food-master-payment-card-v046">
          <div className="food-payment-status-v046"><ReceiptText/><div><span>{payment.storeName||payment.storeId}</span><h2>{payment.paymentIntent==='plan_change'?`${payment.previousPlanName||'Plano atual'} → ${payment.planName||'Novo plano'}`:payment.planName||'Renovação mensal'}</h2></div><b className={`status-${payment.status}`}>{statusLabel(payment)}</b></div>
          <div className="food-payment-admin-meta-v046">
            <span>Valor <strong>{currency.format(payment.amount)}</strong></span>
            <span>Cobrança <strong>#{payment.id.slice(0,8)}</strong></span>
            <span>Referência / vencimento <strong>{dateBr(payment.dueDate)}</strong></span>
            <span>Dia configurado <strong>{payment.dueDay?`Dia ${payment.dueDay}`:'—'}</strong></span>
            <span>Próximo vencimento <strong>{dateBr(payment.nextDueDate)}</strong></span>
            {payment.paidAt&&<span>Confirmado em <strong>{dateTimeBr(payment.paidAt)}</strong></span>}
            {payment.rejectedAt&&<span>Negado em <strong>{dateTimeBr(payment.rejectedAt)}</strong></span>}
          </div>
          {payment.billingState==='overdue'&&<div className="master-payment-overdue-v046"><CalendarDays size={16}/><span>A mensalidade desta loja está vencida. O próximo vencimento só avança quando um pagamento válido for confirmado.</span></div>}
          {payment.status==='rejected'&&payment.rejectionReason&&<div className="master-payment-rejection-reason-v046"><strong>Motivo:</strong> {payment.rejectionReason}</div>}
          {(payment.status==='pending'||payment.status==='proof_sent')&&<div className="master-payment-actions-v046">
            <button type="button" className="primary-button" disabled={busy===payment.id||(payment.proofRequired&&payment.status!=='proof_sent')} onClick={()=>void confirm(payment)} title={payment.proofRequired&&payment.status!=='proof_sent'?'Aguardando o lojista informar o envio do comprovante.':undefined}><CheckCircle2 size={16}/>{busy===payment.id?'Confirmando...':payment.paymentIntent==='plan_change'?'Confirmar alteração de plano':'Confirmar renovação'}</button>
            <button type="button" className="secondary-button danger-button-v046" disabled={busy===payment.id} onClick={()=>openReject(payment)}><Ban size={16}/>{payment.paymentIntent==='plan_change'?'Negar alteração':'Não confirmar renovação'}</button>
            {payment.proofRequired&&payment.status!=='proof_sent'&&<small className="master-payment-proof-note-r69">A confirmação fica disponível assim que o comprovante for informado pelo lojista.</small>}
          </div>}
        </article>)}
      </div>}
    </section>

    {rejecting&&<div className="modal-overlay"><div className="master-modal master-payment-reject-modal-v046"><button type="button" className="modal-close" onClick={()=>setRejecting(null)}><X/></button><span className="eyebrow">DECISÃO DO FINANCEIRO</span><h2>{rejecting.paymentIntent==='plan_change'?'Negar alteração de plano':'Registrar mensalidade não renovada'}</h2><p>A data de vencimento da assinatura não será avançada. Se ela estiver vencida, o lojista verá o alerta vermelho no painel.</p><label>Motivo<textarea value={rejectReason} onChange={(event)=>setRejectReason(event.target.value)} placeholder="Ex.: crédito não identificado, comprovante inválido ou renovação não realizada."/></label><div className="master-modal-actions"><button className="secondary-button" onClick={()=>setRejecting(null)}>Cancelar</button><button className="primary-button danger-primary-v046" disabled={busy===rejecting.id||rejectReason.trim().length<5} onClick={()=>void reject()}><Ban size={16}/>{busy===rejecting.id?'Registrando...':'Confirmar não renovação'}</button></div></div></div>}
  </>;
}
