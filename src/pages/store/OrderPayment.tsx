import ReceiptDestination from '../../components/ReceiptDestination';
import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { resolveOrderPayment, type OrderPayment as Payment } from '../../services/orderPaymentApi';
import PixCopyButton from '../../components/PixCopyButton';
import { currency } from '../../utils/format';
import { formatOrderNumber } from '../../utils/orderConfirmation';
import './order-payment.css';

export default function OrderPayment() {
  const [token] = useState(() => window.location.hash.slice(1));
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState('');
  const [qr, setQr] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [receiptOpened,setReceiptOpened]=useState(false);
  const retry = useCallback(() => setAttempt(a => a + 1), []);
  useEffect(() => {
    document.title = 'Pagamento Pix · VendeWeb';
    const meta = document.createElement('meta'); meta.name = 'robots'; meta.content = 'noindex,nofollow,noarchive'; document.head.append(meta);
    const referrer = document.createElement('meta'); referrer.name = 'referrer'; referrer.content = 'no-referrer'; document.head.append(referrer);
    return () => { meta.remove(); referrer.remove(); };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setPayment(null); setError(''); setQr('');
    if (!token) { setError('Link incompleto. Solicite o link de pagamento à loja.'); setLoading(false); return; }
    void resolveOrderPayment(token).then(value => { if (active) setPayment(value); }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Pagamento indisponível.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, attempt]);
  useEffect(() => {
    if (!payment?.pixPayload) return;
    let active = true;
    void QRCode.toDataURL(payment.pixPayload, { width: 260, margin: 2, errorCorrectionLevel: 'M' }).then(url => { if (active) setQr(url); }).catch(() => { /* Copy remains available. */ });
    return () => { active = false; };
  }, [payment?.pixPayload]);
  useEffect(() => {
    // Invalidate displayed instructions on expiry, and recheck after returning from a banking app.
    const refresh = () => { if (!document.hidden) retry(); };
    document.addEventListener('visibilitychange', refresh);
    const timer = payment?.expiresAt ? window.setTimeout(retry, Math.max(0, Date.parse(payment.expiresAt) - Date.now())) : undefined;
    return () => { document.removeEventListener('visibilitychange', refresh); if (timer !== undefined) clearTimeout(timer); };
  }, [payment?.expiresAt, retry]);
  return <main className="order-payment-page"><section className="order-payment-card" aria-busy={loading}>
    <span>VendeWeb · Pagamento</span><h1>Pagamento Pix</h1>
    {loading ? <p role="status">Conferindo pagamento…</p> : error ? <><p role="alert">{error}</p><button type="button" className="primary-button" onClick={retry}>Tentar novamente</button></> : payment && <>
      <h2>{payment.storeName}</h2><p>Pedido #{formatOrderNumber(payment.orderNumber)}</p>
      {payment.status === 'pending' ? <>
        <strong className="order-payment-total">{currency.format(payment.total!)}</strong>
        <p role="status">Aguardando confirmação do pagamento pela loja.</p>
        <p>Recebedor: {payment.receiver || payment.storeName}. Confira os dados no banco antes de pagar.</p>
        <PixCopyButton key={payment.pixPayload} value={payment.pixPayload!}/>
        <ol className="pix-bank-steps" aria-label="Como pagar no seu banco">
          <li>Copie o código Pix no botão acima.</li>
          <li>Abra o aplicativo do banco de sua preferência e escolha Pix → Copia e Cola.</li>
          <li>Cole o código, confira o recebedor e o valor e confirme no banco.</li>
        </ol>
        {qr && <details><summary>Mostrar QR Code</summary><img src={qr} alt={`QR Code Pix no valor de ${currency.format(payment.total!)}`} width="260" height="260"/></details>}
        <p>Link válido até {new Date(payment.expiresAt!).toLocaleString('pt-BR')}. A expiração do link não cancela um Pix já copiado.</p>
        <button type="button" className="secondary-button" onClick={retry}>Já paguei · verificar status</button>

        <small>O pagamento é feito no seu banco. A cópia do Pix não confirma o recebimento bancário.</small>
      </> : <p role="status">{payment.status === 'paid' ? payment.paymentReportedByCustomer?`Pago informado pelo cliente${payment.fulfillmentStatus==='picked_up'?' · retirada registrada':''}. A loja pode conferir o recebimento.`:'Pagamento confirmado pela loja. Não pague novamente.' : 'Pedido cancelado. Não efetue o pagamento.'}</p>}
        {payment.status!=='cancelled'&&payment.receiptDestinations&&<ReceiptDestination opened={receiptOpened} onOpen={()=>setReceiptOpened(true)} receiptToken={payment.receiptToken} onReported={(autoPickedUp)=>setPayment(current=>current?{...current,status:'paid',paymentReportedByCustomer:true,fulfillmentStatus:autoPickedUp?'picked_up':current.fulfillmentStatus}:current)} destinations={payment.receiptDestinations} message={`Olá! Quero enviar o comprovante do pedido #${formatOrderNumber(payment.orderNumber)} da ${payment.storeName}, no valor de ${currency.format(payment.total!)}.`}/>}
    </>}
  </section></main>;
}
