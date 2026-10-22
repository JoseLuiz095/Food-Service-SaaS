import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { TurnstileWidget } from '../components/ui/TurnstileWidget';
import { appConfig } from '../lib/config';
import { buildPixPayloadWithAmount } from '../utils/pix';
import { modulesApi } from './api';
import { moduleMoney } from './calculator';
import { offerKindLabels } from './types';
import type { CustomerOrder, PublicCatalog } from './types';
import './modules.css';

const makeToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x => x.toString(16).padStart(2,'0')).join('');

export default function EventsPage() {
  const { sellerId, eventOrderId } = useParams();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<PublicCatalog>();
  const [choice, setChoice] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [order, setOrder] = useState<CustomerOrder>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [captcha, setCaptcha] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  const [qr, setQr] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', starts: '', ends: '' });
  const pending = useRef<{ request: string; token: string } | null>(null);
  const capability = new URLSearchParams(window.location.hash.slice(1)).get('key') || '';
  useEffect(() => {
    let active = true; setError(''); setLoading(true); setOrder(undefined); setCatalog(undefined);
    if (sellerId) { pending.current = null; setChoice(''); setQuantity(1); }
    const promise = eventOrderId ? modulesApi.customer('get', { order_id: eventOrderId, token: capability }).then(value => { if (active) setOrder(value); })
      : sellerId ? modulesApi.catalog(sellerId).then(value => { if (active) setCatalog(value); }) : Promise.reject(new Error('Loja não informada.'));
    void promise.catch(e => { if (active) setError((e as Error).message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sellerId, eventOrderId, capability]);
  const refresh = async () => {
    if (!eventOrderId) return;
    setBusy(true); setError('');
    try { setOrder(await modulesApi.customer('get', { order_id: eventOrderId, token: capability })); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const selectedOffer = catalog?.offers.find(o => choice === `offer:${o.id}`);
  const selectedCombo = catalog?.combos.find(c => choice === `combo:${c.id}`);
  const lead = selectedOffer?.lead_hours ?? Math.max(0,...(selectedCombo?.items.map(i => i.lead_hours) || []));
  const scheduleUrgent = !!form.starts && new Date(form.starts).getTime() < Date.now() + lead * 3600000;
  const pix = useMemo(() => {
    if (!order?.pix || order.status !== 'payment_pending' || order.charged_cents !== order.total_cents || new Date(order.expires_at).getTime() <= Date.now()) return { code: '', error: '' };
    try { return { code: buildPixPayloadWithAmount({ ...order.pix, amount: order.charged_cents / 100, txid: `FWE${order.code}` }), error: '' }; }
    catch (e) { return { code: '', error: (e as Error).message }; }
  }, [order]);
  useEffect(() => { let active = true; setQr(''); if (pix.code) void QRCode.toDataURL(pix.code, { width: 240, margin: 2 }).then(url => { if (active) setQr(url); }).catch(() => {}); return () => { active = false; }; }, [pix.code]);
  useEffect(() => {
    if (!order || !['draft','payment_pending'].includes(order.status)) return;
    const delay = Math.max(0,new Date(order.expires_at).getTime() - Date.now()) + 100;
    if (delay > 2147483647) return;
    const timeout = window.setTimeout(() => { setQr(''); void refresh(); },delay);
    return () => window.clearTimeout(timeout);
  }, [order?.id, order?.status, order?.expires_at]);
  const create = async () => {
    if (!sellerId) return;
    setBusy(true); setError('');
    try {
      if (!pending.current) pending.current = { request: crypto.randomUUID(), token: makeToken() };
      const result = await modulesApi.customer('create', { seller_store_id: sellerId, request_id: pending.current.request, token: pending.current.token,
        customer_name: form.name, customer_phone: form.phone, scheduled_for: new Date(form.starts).toISOString(), ends_at: new Date(form.ends).toISOString(),
        version_id: selectedCombo?.id, items: selectedOffer ? [{ offer_id: selectedOffer.id, quantity }] : undefined,
      }, captcha);
      navigate(`/modulos/eventos/pedido/${result.id}#key=${pending.current.token}`);
    } catch (e) { setError((e as Error).message); setCaptcha(''); setCaptchaReset(x => x + 1); } finally { setBusy(false); }
  };
  const mutate = async (action: 'remove' | 'freeze', itemId?: string) => {
    if (!order) return;
    setBusy(true); setError('');
    try { setOrder(await modulesApi.customer(action, { order_id: order.id, token: capability, item_id: itemId, expected_cents: order.total_cents })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <main className="food-modules module-public"><header><h1>{catalog?.store?.name || 'VendeWeb'} · Eventos e encomendas</h1><p>Escolha produtos e serviços para uma data. O pedido reúne os fornecedores em uma cobrança.</p></header>
    {error && <p role="alert" className="module-message module-error">{error}</p>}{loading && <p role="status">Carregando...</p>}
    {catalog && <>
      {!catalog.offers.length && !catalog.combos.length ? <p>Esta loja ainda não disponibilizou ofertas para eventos.</p> : <form onSubmit={e => { e.preventDefault(); void create(); }}>
        <fieldset className="module-card"><legend>Escolha uma oferta ou combo</legend>
          {catalog.offers.map(o => <label className="module-check module-row" key={o.id}><input type="radio" name="offer" required checked={choice === `offer:${o.id}`} onChange={() => { setChoice(`offer:${o.id}`); setQuantity(1); }} /><span><strong>{o.name} · {moduleMoney(o.price_cents)}</strong><br />{offerKindLabels[o.kind]} · {o.ready_now ? 'Pronta entrega' : 'Requer agendamento'} · Prazo mínimo: {o.lead_hours} h</span></label>)}
          {catalog.combos.map(c => <label className="module-check module-row" key={c.id}><input type="radio" name="offer" required checked={choice === `combo:${c.id}`} onChange={() => setChoice(`combo:${c.id}`)} /><span><strong>{c.name} · versão {c.version}</strong><br />{c.items.map(i => `${i.quantity} × ${i.name}`).join(' + ')}<br />Valor inicial: {moduleMoney(c.items.reduce((sum,i) => sum + Math.round(i.price_cents * i.quantity * (10000 - i.discount_bps) / 10000),0))}<br />Você poderá remover itens na revisão.</span></label>)}
        </fieldset>
        <section className="module-card"><h2>Dados e agendamento</h2><div className="module-grid">
          <label>Seu nome<input required minLength={2} maxLength={120} autoComplete="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <label>WhatsApp<input required type="tel" minLength={10} maxLength={30} autoComplete="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
          <label>Data e horário<input required type="datetime-local" value={form.starts} onChange={e => setForm({ ...form, starts: e.target.value })} /></label>
          <label>Término do evento / retirada do aluguel<input required type="datetime-local" value={form.ends} onChange={e => setForm({ ...form, ends: e.target.value })} /></label>
          {selectedOffer && <label>Quantidade (máximo {selectedOffer.max_quantity})<input required type="number" min="1" max={selectedOffer.max_quantity} value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></label>}
        </div>
        {scheduleUrgent && <p role="status" className="module-message">Prazo mínimo de {lead} horas não atendido. A solicitação dependerá do aceite de urgência de cada fornecedor e poderá ter acréscimo. Você verá o valor antes de pagar.</p>}
        <TurnstileWidget siteKey={appConfig.turnstileSiteKey} onToken={setCaptcha} resetSignal={captchaReset} action="modules" />
        {!appConfig.turnstileSiteKey && <p>Verificação de segurança indisponível. Entre em contato com a loja.</p>}
        <button className="button button-primary" disabled={busy || !choice || !captcha}>{busy ? 'Preparando...' : 'Revisar pedido e valores'}</button>
        </section>
      </form>}
    </>}
    {order && <section className="module-card"><h2>Pedido FW-E{order.code}</h2><p>Situação: {order.status} · Reserva válida até {new Date(order.expires_at).toLocaleString('pt-BR')}</p>
      <p>Guarde o endereço desta página para acompanhar o pedido. Ele contém sua chave privada de acesso.</p>
      {order.items.map(i => <article className="module-row" key={i.id}><div><strong>{i.quantity} × {i.name}</strong><p>{moduleMoney(i.total_cents)} · {i.status}</p>{i.urgent && <p>Urgência: {i.urgency} · Acréscimo: {i.urgency_bps / 100}%</p>}</div>{order.status === 'draft' && i.status === 'active' && <button className="button" disabled={busy} onClick={() => void mutate('remove',i.id)}>Remover item</button>}</article>)}
      <h3>Total vigente: {moduleMoney(order.total_cents)}</h3>{order.paid_cents > 0 && <p>Pagamento registrado: {moduleMoney(order.paid_cents)}</p>}
      {order.refund_due_cents > 0 && <p>Reembolso a conferir com a loja: {moduleMoney(order.refund_due_cents)}</p>}
      <div className="module-actions"><button className="button" disabled={busy} onClick={() => void refresh()}>Atualizar situação</button>{order.status === 'draft' && order.total_cents > 0 && <button className="button button-primary" disabled={busy} onClick={() => void mutate('freeze')}>Concluir revisão e gerar Pix</button>}</div>
      {order.status === 'draft' && <p>Confira os itens antes de concluir a revisão. Depois de gerar o Pix, alterações dependem da loja.</p>}
      {pix.error && <p role="alert">{pix.error}</p>}
      {pix.code && <div className="module-card"><h3>Pix para {order.pix?.receiver}</h3><p>Valor único: {moduleMoney(order.charged_cents)}. A loja conferirá o crédito manualmente.</p>{qr && <img className="module-pix" src={qr} alt={`QR Code Pix de ${moduleMoney(order.charged_cents)}`} />}
        <label>Pix Copia e Cola<textarea readOnly value={pix.code} /></label><button className="button button-primary" onClick={() => void navigator.clipboard.writeText(pix.code).then(() => setCopyStatus('Pix copiado.')).catch(() => setCopyStatus('Selecione e copie o código acima.'))}>Copiar Pix</button><p role="status">{copyStatus}</p></div>}
      {order.status === 'payment_pending' && order.charged_cents !== order.total_cents && <div><p role="alert">O pedido foi alterado após a cobrança. Não pague o Pix anterior. Se já pagou, informe a loja para conferir o crédito antes de qualquer novo pagamento.</p><button className="button" disabled={busy || order.total_cents <= 0} onClick={() => void mutate('freeze')}>Conferi os itens; gerar cobrança atualizada</button></div>}
      <Link to={`/modulos/eventos/${order.seller_store_id}`}>Ver catálogo de eventos</Link>
    </section>}
  </main>;
}
