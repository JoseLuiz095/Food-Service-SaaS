import { AlertCircle, ArrowLeft, Banknote, CheckCircle2, CreditCard, LoaderCircle, MapPin, Phone, QrCode, ShoppingBag, Store, Truck, UserRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { TurnstileWidget } from '../../components/ui/TurnstileWidget';
import { cartItemUnitTotal, useCart } from '../../contexts/CartContext';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import { appConfig } from '../../lib/config';
import { getAnalyticsSessionId, trackPublicEvent } from '../../services/analyticsApi';
import { lookupCep } from '../../services/cepApi';
import type { CheckoutData, OrderConfirmation, PaymentMethod } from '../../types';
import { currency, roundMoney } from '../../utils/format';
import { saveOrderConfirmation } from '../../utils/orderConfirmation';
import { buildWhatsAppMessage } from '../../utils/whatsapp';
import { storefrontPath } from '../../utils/storefrontRoute';
import { normalizeText } from '../../utils/text';
import { getStoreOpenStatus } from '../../utils/storeHours';

const initial: CheckoutData = {
  customerName: '', customerPhone: '', customerEmail: '', fulfillment: 'delivery', zipCode: '', street: '', addressNumber: '', complement: '',
  neighborhood: '', deliveryZoneId: '', deliveryFee: 0, deliveryCity: '', deliveryState: '', referencePoint: '', notes: '', paymentMethod: 'pix',
  needsChange: false, changeFor: null, scheduledFor: '', reviewConfirmed: false,
};

const REQUEST_KEY_PREFIX = 'foodservice_checkout_request_v1';
const requestKey = (storeId: string) => `${REQUEST_KEY_PREFIX}:${storeId}`;
const newRequestId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
const localDateTimeInputValue = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function Checkout() {
  const { items, subtotal, clear } = useCart();
  const { settings, products, deliveryZones, registerOrder, loading, storeBasePath } = useStore();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState<CheckoutData>(initial);
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [requestId, setRequestId] = useState('');
  const trackedCheckout = useRef(false);

  const update = <K extends keyof CheckoutData>(key: K, value: CheckoutData[K]) => setForm((current) => ({ ...current, [key]: value }));
  const onTurnstileToken = useCallback((token: string) => setTurnstileToken(token), []);

  useEffect(() => {
    if (!settings.id) return;
    try {
      const key = requestKey(settings.id);
      const existing = sessionStorage.getItem(key);
      const value = existing || newRequestId();
      if (!existing) sessionStorage.setItem(key, value);
      setRequestId(value);
    } catch { setRequestId(newRequestId()); }
  }, [settings.id]);

  useEffect(() => {
    if (!loading && items.length && settings.id && !trackedCheckout.current) {
      trackedCheckout.current = true;
      void trackPublicEvent(settings.id, 'checkout_started');
    }
  }, [loading, items.length, settings.id]);

  useEffect(() => {
    if (form.fulfillment === 'delivery' && !settings.deliveryEnabled && settings.pickupEnabled) update('fulfillment', 'pickup');
    if (form.fulfillment === 'pickup' && !settings.pickupEnabled && settings.deliveryEnabled) update('fulfillment', 'delivery');
  }, [settings.deliveryEnabled, settings.pickupEnabled]);

  const enabledPayments = useMemo(() => {
    const available = new Set<PaymentMethod>();
    if (settings.pixEnabled && settings.showPixBeforeConfirmation) available.add('pix');
    if (settings.cardPaymentEnabled) available.add('card');
    if (settings.cashPaymentEnabled) available.add('cash');
    if (settings.confirmationPaymentEnabled) available.add('confirm');
    return settings.paymentMethodOrder.filter((method) => available.has(method));
  }, [settings]);

  useEffect(() => {
    if (enabledPayments.length && !enabledPayments.includes(form.paymentMethod)) update('paymentMethod', enabledPayments[0]);
  }, [enabledPayments, form.paymentMethod]);

  const selectedZone = deliveryZones.find((zone) => zone.id === form.deliveryZoneId && zone.active);
  const deliveryFee = form.fulfillment === 'delivery' ? selectedZone?.fee ?? 0 : 0;
  const total = roundMoney(subtotal + deliveryFee);
  const changeAmount = form.paymentMethod === 'cash' && form.needsChange && form.changeFor ? roundMoney(form.changeFor - total) : 0;
  const openStatus = getStoreOpenStatus(settings.openingSchedule);
  const additionalPrep = items.reduce((max, item) => Math.max(max, products.find((product) => product.id === item.productId)?.preparationTimeMinutes || 0), 0);
  const estimatedMin = settings.averagePreparationMin + additionalPrep;
  const estimatedMax = settings.averagePreparationMax + additionalPrep;

  const findZoneByNeighborhood = (name: string) => {
    const normalized = normalizeText(name);
    return deliveryZones.find((zone) => zone.active && [zone.name, ...zone.aliases].some((alias) => normalizeText(alias) === normalized));
  };

  const searchCep = async () => {
    if (form.zipCode.replace(/\D/g, '').length !== 8) { showToast('Informe um CEP com 8 dígitos.', 'error'); return; }
    setCepLoading(true);
    try {
      const address = await lookupCep(form.zipCode);
      const matched = findZoneByNeighborhood(address.neighborhood);
      setForm((current) => ({ ...current, zipCode: address.cep, street: address.street, complement: current.complement || address.complement, neighborhood: matched?.name || address.neighborhood, deliveryZoneId: matched?.id || '', deliveryFee: matched?.fee || 0, deliveryCity: address.city, deliveryState: address.state }));
      if (!matched && address.neighborhood) showToast('CEP localizado. Selecione uma área de entrega disponível.', 'info');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Falha ao consultar CEP.', 'error'); }
    finally { setCepLoading(false); }
  };

  const validate = () => {
    if (!items.length) return 'Seu carrinho está vazio.';
    if (form.customerName.trim().length < 2) return 'Informe seu nome.';
    const phoneDigits = form.customerPhone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 15) return 'Informe um telefone válido.';
    if (!openStatus.open && !settings.allowScheduledOrders) return `${settings.name} está fechada agora. ${openStatus.detail}.`;
    if (!openStatus.open && settings.allowScheduledOrders && !form.scheduledFor) return 'Escolha um horário futuro para agendar o pedido.';
    if (form.scheduledFor && new Date(form.scheduledFor).getTime() <= Date.now()) return 'O agendamento precisa estar no futuro.';
    if (form.fulfillment === 'delivery') {
      if (!settings.deliveryEnabled) return 'Delivery está desativado nesta loja.';
      if (!form.deliveryZoneId || !selectedZone) return 'Selecione uma área de entrega disponível.';
      if (!form.street.trim() || !form.addressNumber.trim()) return 'Informe rua e número da entrega.';
    } else if (!settings.pickupEnabled) return 'Retirada está desativada nesta loja.';
    if (!enabledPayments.includes(form.paymentMethod)) return 'Selecione uma forma de pagamento disponível.';
    if (form.paymentMethod === 'cash' && form.needsChange && (!form.changeFor || form.changeFor <= total)) return 'O valor para troco deve ser maior que o total do pedido.';
    if (settings.minimumOrder > 0 && subtotal < settings.minimumOrder) return `O pedido mínimo é ${currency.format(settings.minimumOrder)}.`;
    if (!form.reviewConfirmed) return 'Confirme que revisou o pedido antes de finalizar.';
    if (appConfig.turnstileSiteKey && !turnstileToken) return 'Conclua a verificação anti-spam.';
    return '';
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const error = validate();
    if (error) { showToast(error, 'error'); return; }
    setSaving(true);
    try {
      const payloadForm: CheckoutData = { ...form, deliveryFee };
      const result = await registerOrder(settings, items, payloadForm, subtotal, {
        turnstileToken,
        analyticsSessionId: getAnalyticsSessionId(settings.id),
        requestId,
      });
      const orderMessage = buildWhatsAppMessage(items, payloadForm, settings, result.orderNumber);
      const confirmation: OrderConfirmation = {
        orderId: result.orderId, orderNumber: result.orderNumber, total: result.total, paymentMethod: form.paymentMethod, customerName: form.customerName,
        fulfillment: form.fulfillment, storeName: settings.name, storeWhatsapp: settings.whatsapp, pixEnabled: settings.pixEnabled,
        pixReceiptMode: settings.pixReceiptMode, pixKeyType: settings.pixKeyType, pixKey: settings.pixKey, pixCopyPaste: settings.pixCopyPaste,
        pixReceiver: settings.pixReceiver, orderMessage, changeAmount: form.paymentMethod === 'cash' && form.needsChange && form.changeFor ? roundMoney(form.changeFor - result.total) : undefined,
        createdAt: new Date().toISOString(),
      };
      saveOrderConfirmation(confirmation);
      clear();
      try { sessionStorage.removeItem(requestKey(settings.id)); } catch { /* sem storage */ }
      navigate(storefrontPath(storeBasePath, `/pedido/${result.orderId}`), { state: confirmation });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível registrar o pedido.', 'error');
      setTurnstileReset((value) => value + 1);
    } finally { setSaving(false); }
  };

  if (loading) return <div className="page-center"><LoaderCircle className="spin"/>Carregando checkout...</div>;
  if (!items.length) return <div className="simple-page"><header className="simple-topbar container"><a href={storefrontPath(storeBasePath)}><ArrowLeft size={19}/>Voltar ao cardápio</a></header><div className="cart-empty"><ShoppingBag size={48}/><h1>Seu carrinho está vazio</h1><a className="primary-button" href={storefrontPath(storeBasePath)}>Ver cardápio</a></div></div>;

  return <div className="simple-page checkout-page">
    <header className="simple-topbar container"><a href={storefrontPath(storeBasePath, '/carrinho')}><ArrowLeft size={19}/>Voltar ao carrinho</a><span>Finalizar pedido</span></header>
    <form className="container checkout-layout" onSubmit={submit}>
      <section className="checkout-main">
        <div className="page-title"><span className="eyebrow">CHECKOUT</span><h1>Finalize seu pedido</h1><p>O pedido será salvo antes de qualquer abertura do WhatsApp.</p></div>

        {!openStatus.open && <div className="checkout-alert"><AlertCircle size={19}/><div><strong>Loja fechada agora</strong><span>{openStatus.detail}. {settings.allowScheduledOrders ? 'Você pode agendar o pedido.' : 'Novos pedidos ficam bloqueados fora do horário.'}</span>{settings.allowScheduledOrders && <label className="scheduled-order-field">Agendar para<input type="datetime-local" value={form.scheduledFor} min={localDateTimeInputValue(new Date(Date.now()+30*60*1000))} onChange={(event)=>update('scheduledFor',event.target.value)}/><small>Horário local do estabelecimento. A disponibilidade será validada novamente no servidor.</small></label>}</div></div>}

        <section className="checkout-card"><div className="checkout-card__title"><UserRound size={20}/><div><strong>Seus dados</strong><span>Usados somente para este pedido e operação da loja.</span></div></div><div className="form-grid"><label>Nome<input required value={form.customerName} onChange={(event) => update('customerName', event.target.value)} placeholder="Seu nome"/></label><label>WhatsApp / telefone<input required value={form.customerPhone} onChange={(event) => update('customerPhone', event.target.value)} placeholder="(27) 99999-9999"/></label><label className="full">E-mail (opcional)<input type="email" value={form.customerEmail} onChange={(event) => update('customerEmail', event.target.value)} placeholder="voce@email.com"/></label></div></section>

        <section className="checkout-card"><div className="checkout-card__title"><Truck size={20}/><div><strong>Como quer receber?</strong><span>Escolha delivery ou retirada.</span></div></div><div className="fulfillment-options">{settings.deliveryEnabled && <button type="button" className={form.fulfillment === 'delivery' ? 'selected' : ''} onClick={() => update('fulfillment', 'delivery')}><Truck size={20}/><span><strong>Delivery</strong><small>Receber no endereço</small></span></button>}{settings.pickupEnabled && <button type="button" className={form.fulfillment === 'pickup' ? 'selected' : ''} onClick={() => update('fulfillment', 'pickup')}><Store size={20}/><span><strong>Retirada</strong><small>Buscar na loja</small></span></button>}</div>
          {form.fulfillment === 'delivery' && <div className="form-grid address-grid"><label>CEP<div className="field-with-button"><input value={form.zipCode} onChange={(event) => update('zipCode', event.target.value)} placeholder="00000-000"/><button type="button" onClick={() => void searchCep()} disabled={cepLoading}>{cepLoading ? <LoaderCircle className="spin" size={16}/> : <MapPin size={16}/>}Buscar</button></div></label><label>Bairro / área<select required value={form.deliveryZoneId} onChange={(event) => { const zone = deliveryZones.find((item) => item.id === event.target.value); setForm((current) => ({ ...current, deliveryZoneId: zone?.id || '', neighborhood: zone?.name || '', deliveryFee: zone?.fee || 0, deliveryCity: zone?.city || current.deliveryCity, deliveryState: zone?.state || current.deliveryState })); }}><option value="">Selecione</option>{deliveryZones.filter((zone) => zone.active).map((zone) => <option key={zone.id} value={zone.id}>{zone.name} · {zone.fee === 0 ? 'Grátis' : currency.format(zone.fee)}</option>)}</select></label><label className="full">Rua<input required value={form.street} onChange={(event) => update('street', event.target.value)}/></label><label>Número<input required value={form.addressNumber} onChange={(event) => update('addressNumber', event.target.value)}/></label><label>Complemento<input value={form.complement} onChange={(event) => update('complement', event.target.value)}/></label><label className="full">Ponto de referência<input value={form.referencePoint} onChange={(event) => update('referencePoint', event.target.value)}/></label></div>}
          {form.fulfillment === 'pickup' && <div className="pickup-info"><MapPin size={18}/><div><strong>{settings.address || settings.name}</strong><span>{settings.city}{settings.state ? `/${settings.state}` : ''}</span></div></div>}
        </section>

        <section className="checkout-card"><div className="checkout-card__title"><CreditCard size={20}/><div><strong>Pagamento</strong><span>Escolha como deseja pagar.</span></div></div><div className="payment-options">{enabledPayments.map((method) => <button type="button" key={method} className={form.paymentMethod === method ? 'selected' : ''} onClick={() => update('paymentMethod', method)}>{method === 'pix' ? <QrCode size={20}/> : method === 'cash' ? <Banknote size={20}/> : <CreditCard size={20}/>}<span><strong>{method === 'pix' ? 'PIX' : method === 'cash' ? 'Dinheiro' : method === 'card' ? (form.fulfillment === 'delivery' ? 'Cartão na entrega' : 'Cartão na retirada') : 'Confirmar com a loja'}</strong></span></button>)}</div>
          {form.paymentMethod === 'cash' && <div className="cash-change-box"><label className="switch-row"><span><strong>Precisa de troco?</strong><small>Informe o valor que será entregue.</small></span><input type="checkbox" checked={form.needsChange} onChange={(event) => { update('needsChange', event.target.checked); if (!event.target.checked) update('changeFor', null); }}/></label>{form.needsChange && <label>Troco para<input type="number" min="0" step="0.01" value={form.changeFor ?? ''} onChange={(event) => update('changeFor', event.target.value ? Number(event.target.value) : null)} placeholder="Ex.: 100,00"/></label>}{form.needsChange && form.changeFor != null && changeAmount > 0 && <div className="change-result"><span>Troco calculado</span><strong>{currency.format(changeAmount)}</strong></div>}</div>}
        </section>

        <section className="checkout-card"><div className="checkout-card__title"><Phone size={20}/><div><strong>Observações</strong><span>Ex.: tocar interfone, preferência de embalagem.</span></div></div><textarea rows={4} maxLength={500} value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Observação opcional"/></section>
      </section>

      <aside className="order-summary checkout-summary">
        <span className="eyebrow">RESUMO</span>
        <div className="checkout-items-mini">{items.map((item) => <div key={item.id}><span>{item.quantity}x {item.productName}{item.options.length > 0 && <small>{item.options.map((option) => option.itemName).join(' · ')}</small>}</span><strong>{currency.format(cartItemUnitTotal(item) * item.quantity)}</strong></div>)}</div>
        <div className="summary-line"><span>Subtotal</span><strong>{currency.format(subtotal)}</strong></div>
        {form.fulfillment === 'delivery' && <div className="summary-line"><span>Entrega</span><strong>{deliveryFee === 0 ? 'Grátis' : currency.format(deliveryFee)}</strong></div>}
        <div className="summary-total"><span>Total</span><strong>{currency.format(total)}</strong></div>
        <div className="preparation-summary"><CheckCircle2 size={18}/><div><strong>Previsão atual</strong><span>{estimatedMin}–{estimatedMax} minutos</span></div></div>
        <label className="checkout-review-check"><input type="checkbox" checked={form.reviewConfirmed} onChange={(event) => update('reviewConfirmed', event.target.checked)}/><span>Revisei os itens, endereço e pagamento.</span></label>
        <TurnstileWidget siteKey={appConfig.turnstileSiteKey} onToken={onTurnstileToken} resetSignal={turnstileReset}/>
        <button className="primary-button checkout-submit" disabled={saving || (!openStatus.open && !settings.allowScheduledOrders) || (!openStatus.open && settings.allowScheduledOrders && !form.scheduledFor)} type="submit">{saving ? <><LoaderCircle className="spin" size={18}/>Registrando...</> : <><CheckCircle2 size={18}/>Registrar pedido · {currency.format(total)}</>}</button>
        <small className="checkout-security-note">O navegador envia IDs e escolhas. Preços, opções e taxa são recalculados no servidor.</small>
      </aside>
    </form>
  </div>;
}
