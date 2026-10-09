import { AlertCircle, ArrowLeft, Banknote, CheckCircle2, CreditCard, LocateFixed, LockKeyhole, LoaderCircle, MapPin, QrCode, ShieldCheck, ShoppingBag, Store, Truck, UserRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { TurnstileWidget } from '../../components/ui/TurnstileWidget';
import { cartItemUnitTotal, useCart } from '../../contexts/CartContext';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import { appConfig } from '../../lib/config';
import { getAnalyticsSessionId, trackPublicEvent } from '../../services/analyticsApi';
import { lookupCep } from '../../services/cepApi';
import { lookupCurrentLocationAddress } from '../../services/geolocationApi';
import type { CheckoutData, OrderConfirmation, PaymentMethod } from '../../types';
import { currency, roundMoney } from '../../utils/format';
import { saveOrderConfirmation } from '../../utils/orderConfirmation';
import { buildPixCopyPasteWithAmount, buildStaticPixCopyPaste } from '../../utils/pix';
import { buildWhatsAppMessage } from '../../utils/whatsapp';
import { storefrontPath } from '../../utils/storefrontRoute';
import { normalizeText } from '../../utils/text';
import { getStoreOpenStatus } from '../../utils/storeHours';
import { loadCustomerCheckoutProfile, saveCustomerCheckoutProfile, saveRecentOrder } from '../../utils/customerSales';
import { loadFulfillmentPreference } from '../../utils/fulfillmentPreference';

const initial: CheckoutData = {
  customerName: '', customerPhone: '', customerEmail: '', fulfillment: 'delivery', zipCode: '', street: '', addressNumber: '', complement: '',
  neighborhood: '', deliveryZoneId: '', deliveryFee: 0, deliveryCity: '', deliveryState: '', referencePoint: '', notes: '', paymentMethod: 'pix',
  needsChange: false, changeFor: null, scheduledFor: '', reviewConfirmed: false, customerInstagram: '', acquisitionSource: undefined,
};

const REQUEST_KEY_PREFIX = 'foodservice_checkout_request_v1';
const requestKey = (storeId: string) => `${REQUEST_KEY_PREFIX}:${storeId}`;
const DRAFT_KEY_PREFIX = 'foodweb_checkout_draft_v1';
const draftKey = (storeId: string) => `${DRAFT_KEY_PREFIX}:${storeId}`;
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
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationHint, setLocationHint] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [requestId, setRequestId] = useState('');
  const [rememberCustomer, setRememberCustomer] = useState(false);
  const [draftReadyForStore, setDraftReadyForStore] = useState('');
  const [submitError, setSubmitError] = useState('');
  const trackedCheckout = useRef(false);

  const update = <K extends keyof CheckoutData>(key: K, value: CheckoutData[K]) => {
    setSubmitError('');
    setForm((current) => ({ ...current, [key]: value }));
  };
  const onTurnstileToken = useCallback((token: string) => setTurnstileToken(token), []);

  useEffect(() => {
    if (!settings.id) return;
    const profile = loadCustomerCheckoutProfile(settings.id);
    let draft: Partial<CheckoutData> = {};
    try {
      const stored = localStorage.getItem(draftKey(settings.id));
      if (stored) draft = JSON.parse(stored) as Partial<CheckoutData>;
    } catch { /* storage indisponível ou rascunho antigo inválido */ }
    const preferredFulfillment = loadFulfillmentPreference(settings.id);
    setDraftReadyForStore('');
    setForm({ ...initial, ...(profile || {}), ...draft, ...(preferredFulfillment ? { fulfillment: preferredFulfillment } : {}), deliveryFee: 0 });
    if (profile) setRememberCustomer(true);
    setDraftReadyForStore(settings.id);
    try {
      const key = requestKey(settings.id);
      const existing = sessionStorage.getItem(key);
      const value = existing || newRequestId();
      if (!existing) sessionStorage.setItem(key, value);
      setRequestId(value);
    } catch { setRequestId(newRequestId()); }
  }, [settings.id]);

  useEffect(() => {
    if (!settings.id || draftReadyForStore !== settings.id) return;
    const timer = window.setTimeout(() => {
      try {
        // O rascunho não contém token antifraude nem qualquer dado de pagamento.
        localStorage.setItem(draftKey(settings.id), JSON.stringify(form));
      } catch { /* modo privado ou cota do navegador esgotada */ }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draftReadyForStore, form, settings.id]);

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
    if (settings.cardPaymentEnabled && settings.showWhatsApp !== false && Boolean(settings.whatsapp?.trim())) available.add('card');
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
  const isDoceLuaPilot = settings.slug === 'doce-lua' || normalizeText(settings.name) === 'docelua';
  const whatsappAvailable = settings.showWhatsApp !== false && Boolean(settings.whatsapp?.trim());
  const openStatus = getStoreOpenStatus(settings.openingSchedule);
  const additionalPrep = items.reduce((max, item) => Math.max(max, products.find((product) => product.id === item.productId)?.preparationTimeMinutes || 0), 0);
  const stockUnavailableItems = items.filter((item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    return Boolean(!product || product.availabilityStatus !== 'available' || product.stockStatus === 'unavailable' || (product.trackStock && Number(product.stockQuantity || 0) - Number(product.stockReservedQuantity || 0) < item.quantity));
  });
  const stockSchedulingRequired = stockUnavailableItems.length > 0;
  const deliveryStartMinutes = settings.deliveryStartTime ? Number(settings.deliveryStartTime.slice(0, 2)) * 60 + Number(settings.deliveryStartTime.slice(3, 5)) : null;
  const nowTimeParts = (() => {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: settings.openingSchedule.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
      const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0) % 24;
      return hour * 60 + Number(parts.find((part) => part.type === 'minute')?.value || 0);
    } catch { return new Date().getHours() * 60 + new Date().getMinutes(); }
  })();
  const scheduledTimeMinutes = form.scheduledFor ? (() => { const date = new Date(form.scheduledFor); return Number.isNaN(date.getTime()) ? null : date.getHours() * 60 + date.getMinutes(); })() : null;
  const deliveryBlockedBeforeStart = form.fulfillment === 'delivery' && deliveryStartMinutes != null && (form.scheduledFor ? (scheduledTimeMinutes == null || scheduledTimeMinutes < deliveryStartMinutes) : nowTimeParts < deliveryStartMinutes);
  const tomorrowStart = new Date();
  tomorrowStart.setHours(0, 0, 0, 0);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const estimatedMin = settings.averagePreparationMin + additionalPrep;
  const estimatedMax = settings.averagePreparationMax + additionalPrep;
  const scheduleMinimum = (() => {
    const base = stockSchedulingRequired ? new Date(tomorrowStart) : new Date(Date.now() + 30 * 60 * 1000);
    if (form.fulfillment !== 'delivery' || deliveryStartMinutes == null) return base;
    const deliveryStart = new Date(base);
    deliveryStart.setHours(Math.floor(deliveryStartMinutes / 60), deliveryStartMinutes % 60, 0, 0);
    return deliveryStart > base ? deliveryStart : base;
  })();
  const scheduleMinimumMs = scheduleMinimum.getTime();
  const scheduleRequired = !openStatus.open || stockSchedulingRequired || deliveryBlockedBeforeStart;
  const submitDisabled = saving || (!openStatus.open && !settings.allowScheduledOrders) || (scheduleRequired && !form.scheduledFor);

  const selectFulfillment = (fulfillment: CheckoutData['fulfillment']) => {
    const clearDeliverySchedule = fulfillment === 'pickup' && deliveryBlockedBeforeStart && !stockSchedulingRequired;
    setSubmitError('');
    setForm((current) => ({
      ...current,
      fulfillment,
      // O horário preenchido automaticamente para o delivery não deve
      // prender a retirada ao mesmo horário. Agendamentos manuais continuam.
      scheduledFor: clearDeliverySchedule ? '' : current.scheduledFor,
    }));
  };

  // Rascunhos antigos podem conter um horário anterior ao início do delivery.
  // Corrigimos automaticamente para o primeiro horário válido, evitando que o
  // navegador mantenha um valor visualmente preenchido, mas inválido no envio.
  useEffect(() => {
    if (!scheduleRequired) return;
    const currentMs = form.scheduledFor ? new Date(form.scheduledFor).getTime() : Number.NaN;
    if (!Number.isFinite(currentMs) || currentMs < scheduleMinimumMs) {
      const nextValue = localDateTimeInputValue(scheduleMinimum);
      if (form.scheduledFor !== nextValue) update('scheduledFor', nextValue);
    }
  }, [scheduleMinimumMs, scheduleRequired, form.scheduledFor]);

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

  const useCurrentLocation = async () => {
    setLocationLoading(true);
    setLocationHint('');
    try {
      const suggestion = await lookupCurrentLocationAddress();
      let normalized = suggestion;
      if (suggestion.zipCode.length === 8) {
        try {
          const byCep = await lookupCep(suggestion.zipCode);
          normalized = { ...suggestion, zipCode: byCep.cep, street: byCep.street || suggestion.street, neighborhood: byCep.neighborhood || suggestion.neighborhood, city: byCep.city || suggestion.city, state: byCep.state || suggestion.state };
        } catch {
          // A sugestão de GPS ainda pode ajudar quando o CEP não responder.
        }
      }
      const matched = normalized.neighborhood ? findZoneByNeighborhood(normalized.neighborhood) : undefined;
      setForm((current) => ({
        ...current,
        zipCode: normalized.zipCode || current.zipCode,
        street: normalized.street || current.street,
        neighborhood: normalized.neighborhood || current.neighborhood,
        deliveryZoneId: matched?.id || current.deliveryZoneId,
        deliveryFee: matched?.fee ?? current.deliveryFee,
        deliveryCity: normalized.city || current.deliveryCity,
        deliveryState: normalized.state || current.deliveryState,
      }));
      setLocationHint(matched ? 'Endereço sugerido pela sua localização. Confira rua, número e área de entrega.' : 'Endereço sugerido pela sua localização. Confira os dados e selecione a área de entrega.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível usar sua localização. Informe o CEP manualmente.';
      setLocationHint(message);
      showToast(message, 'error');
    } finally {
      setLocationLoading(false);
    }
  };

  const validate = () => {
    if (!items.length) return 'Seu carrinho está vazio.';
    if (form.customerName.trim().length < 2) return 'Informe seu nome.';
    const phoneDigits = form.customerPhone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 15) return 'Informe um telefone válido.';
    if (form.customerEmail && !/^\S+@\S+\.\S+$/.test(form.customerEmail.trim())) return 'Confira o e-mail informado ou deixe esse campo em branco.';
    if (!openStatus.open && !settings.allowScheduledOrders) return `${settings.name} está fechada agora. ${openStatus.detail}.`;
    if (!openStatus.open && settings.allowScheduledOrders && !form.scheduledFor) return 'Escolha um horário futuro para agendar o pedido.';
    if (form.scheduledFor && new Date(form.scheduledFor).getTime() <= Date.now()) return 'O agendamento precisa estar no futuro.';
    if (stockSchedulingRequired && (!form.scheduledFor || new Date(form.scheduledFor).getTime() < tomorrowStart.getTime())) return 'Há item sem disponibilidade hoje. Escolha um horário a partir de amanhã para agendar o pedido.';
    if (deliveryBlockedBeforeStart) return `As entregas começam às ${settings.deliveryStartTime}. Escolha um horário de entrega a partir desse horário ou selecione retirada.`;
    if (form.fulfillment === 'delivery') {
      if (!settings.deliveryEnabled) return 'Delivery está desativado nesta loja.';
      if (!form.deliveryZoneId || !selectedZone) return 'Selecione uma área de entrega disponível.';
      if (!form.street.trim() || !form.addressNumber.trim()) return 'Informe rua e número da entrega.';
    } else if (!settings.pickupEnabled) return 'Retirada está desativada nesta loja.';
    if (!enabledPayments.includes(form.paymentMethod)) return 'Selecione uma forma de pagamento disponível.';
    if (form.paymentMethod === 'cash' && form.needsChange && (!form.changeFor || form.changeFor <= total)) return 'O valor para troco deve ser maior que o total do pedido.';
    if (settings.minimumOrder > 0 && subtotal < settings.minimumOrder) return `O pedido mínimo é ${currency.format(settings.minimumOrder)}.`;
    if (!isDoceLuaPilot && !form.reviewConfirmed) return 'Confirme que revisou o pedido antes de finalizar.';
    if (appConfig.turnstileSiteKey && !turnstileToken) return 'Conclua a verificação anti-spam.';
    return '';
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const error = validate();
    if (error) {
      setSubmitError(error);
      showToast(error, 'error');
      window.requestAnimationFrame(() => document.querySelector('.checkout-inline-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    setSubmitError('');
    setSaving(true);
    try {
      // A Doce Lua não exibe o checkbox de revisão no piloto, mas o registro
      // continua marcado como revisado para manter compatibilidade com o demo.
      const payloadForm: CheckoutData = { ...form, deliveryFee, reviewConfirmed: form.reviewConfirmed || isDoceLuaPilot };
      const result = await registerOrder(settings, items, payloadForm, subtotal, {
        turnstileToken,
        analyticsSessionId: getAnalyticsSessionId(settings.id),
        requestId,
      });
      const orderMessage = buildWhatsAppMessage(items, payloadForm, settings, result.orderNumber);
      let pixPayload = '';
      let pixGenerationError = '';
      let pixReceiptMode = settings.pixReceiptMode;
      let pixCopyPaste = settings.pixCopyPaste;
      if (form.paymentMethod === 'pix') {
        try {
          pixPayload = settings.pixReceiptMode === 'copy_paste'
            ? buildPixCopyPasteWithAmount(settings.pixCopyPaste, result.total)
            : buildStaticPixCopyPaste({
              key: settings.pixKey,
              receiver: settings.pixReceiver,
              city: settings.city || 'Linhares',
              amount: result.total,
              txid: `PED${result.orderNumber}`,
            });
        } catch (pixError) {
          // Um PIX Copia e Cola base pode estar inválido ou desatualizado.
          // Tenta gerar um payload estático pela chave antes de informar o cliente.
          if (settings.pixReceiptMode === 'copy_paste' && settings.pixKey.trim()) {
            try {
              pixPayload = buildStaticPixCopyPaste({
                key: settings.pixKey,
                receiver: settings.pixReceiver,
                city: settings.city || 'Linhares',
                amount: result.total,
                txid: `PED${result.orderNumber}`,
              });
              pixReceiptMode = 'copy_paste';
              pixCopyPaste = pixPayload;
            } catch (fallbackError) {
              pixGenerationError = fallbackError instanceof Error ? fallbackError.message : pixError instanceof Error ? pixError.message : 'Não foi possível gerar o PIX com valor.';
            }
          } else {
            pixGenerationError = pixError instanceof Error ? pixError.message : 'Não foi possível gerar o PIX com valor.';
          }
        }
      }
      const confirmation: OrderConfirmation = {
        orderId: result.orderId, orderNumber: result.orderNumber, total: result.total, paymentMethod: form.paymentMethod, customerName: form.customerName,
        fulfillment: form.fulfillment, storeName: settings.name, storeWhatsapp: settings.showWhatsApp !== false ? settings.whatsapp : '', pixEnabled: settings.pixEnabled,
        pixReceiptMode, pixKeyType: settings.pixKeyType, pixKey: settings.pixKey, pixCopyPaste, pixPayload: pixPayload || undefined, pixGenerationError: pixGenerationError || undefined,
        pixReceiver: settings.pixReceiver, orderMessage, changeAmount: form.paymentMethod === 'cash' && form.needsChange && form.changeFor ? roundMoney(form.changeFor - result.total) : undefined,
        createdAt: new Date().toISOString(),
      };
      saveOrderConfirmation(confirmation);
      saveRecentOrder(settings.id, items, form.customerName, form.customerPhone);
      if (rememberCustomer) saveCustomerCheckoutProfile(settings.id, {
        customerName: form.customerName, customerPhone: form.customerPhone, customerEmail: form.customerEmail, fulfillment: form.fulfillment,
        zipCode: form.zipCode, street: form.street, addressNumber: form.addressNumber, complement: form.complement, neighborhood: form.neighborhood,
        deliveryZoneId: form.deliveryZoneId, deliveryCity: form.deliveryCity, deliveryState: form.deliveryState, referencePoint: form.referencePoint,
        customerInstagram: form.customerInstagram, acquisitionSource: form.acquisitionSource,
      });
      clear();
      try { localStorage.removeItem(draftKey(settings.id)); } catch { /* sem storage */ }
      try { sessionStorage.removeItem(requestKey(settings.id)); } catch { /* sem storage */ }
      navigate(storefrontPath(storeBasePath, `/pedido/${result.orderId}`), { state: confirmation });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível registrar o pedido.';
      setSubmitError(message);
      showToast(message, 'error');
      window.requestAnimationFrame(() => document.querySelector('.checkout-inline-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      setTurnstileReset((value) => value + 1);
    } finally { setSaving(false); }
  };

  if (loading) return <div className="page-center"><LoaderCircle className="spin"/>Carregando checkout...</div>;
  if (!items.length) return <div className="simple-page"><header className="simple-topbar container"><a href={storefrontPath(storeBasePath)}><ArrowLeft size={19}/>Voltar ao cardápio</a></header><div className="cart-empty"><ShoppingBag size={48}/><h1>Seu carrinho está vazio</h1><a className="primary-button" href={storefrontPath(storeBasePath)}>Ver cardápio</a></div></div>;

  return <div className="simple-page checkout-page checkout-page-v44">
    <header className="simple-topbar checkout-topbar-v44 container"><a href={storefrontPath(storeBasePath, '/carrinho')}><ArrowLeft size={19}/>Voltar ao carrinho</a><strong>FoodWeb</strong><span>{settings.name}</span></header>
    <div className="checkout-trustbar-v44 container"><span><ShieldCheck size={17}/><b>Pedido protegido</b><small>Turnstile e validação no servidor</small></span><span><LockKeyhole size={17}/><b>Dados usados só no pedido</b><small>Sem exposição do suporte interno</small></span><span><CheckCircle2 size={17}/><b>{whatsappAvailable ? 'Pedido salvo primeiro' : 'WhatsApp opcional'}</b><small>{whatsappAvailable ? 'Essencial para agilizar confirmação e suporte' : 'Essencial para agilizar confirmação e suporte'}</small></span></div>
    <form className="container checkout-layout checkout-layout--premium" onSubmit={submit} noValidate>
      <section className="checkout-main">
        <div className="page-title"><span className="eyebrow">CHECKOUT</span><h1>Finalize seu pedido</h1><p>{whatsappAvailable ? 'O pedido será salvo antes de qualquer abertura do WhatsApp.' : 'O pedido será salvo e acompanhado pela loja diretamente no painel. O WhatsApp não é obrigatório, mas é essencial para agilizar confirmações e tirar dúvidas.'}</p><small className="checkout-draft-status">Se você recarregar a página, seus dados preenchidos serão restaurados automaticamente neste dispositivo.</small></div>
        {submitError && <div className="checkout-inline-error" role="alert"><AlertCircle size={19}/><div><strong>Não foi possível finalizar ainda</strong><span>{submitError}</span></div></div>}

        {(!openStatus.open || stockSchedulingRequired || deliveryBlockedBeforeStart) && <div className="checkout-alert"><AlertCircle size={19}/><div><strong>{stockSchedulingRequired ? 'Agendamento necessário para este pedido' : deliveryBlockedBeforeStart ? 'Entregas começam mais tarde' : 'Loja fechada agora'}</strong><span>{stockSchedulingRequired ? 'Um ou mais itens não têm disponibilidade hoje. Escolha um horário a partir de amanhã.' : deliveryBlockedBeforeStart ? `A janela de entrega começa às ${settings.deliveryStartTime}. A retirada continua disponível normalmente.` : `${openStatus.detail}. ${settings.allowScheduledOrders ? 'Você pode agendar o pedido.' : 'Novos pedidos ficam bloqueados fora do horário.'}`}</span>{(settings.allowScheduledOrders || stockSchedulingRequired || deliveryBlockedBeforeStart) && <label className="scheduled-order-field">Agendar para<input type="datetime-local" value={form.scheduledFor} min={localDateTimeInputValue(scheduleMinimum)} onChange={(event)=>update('scheduledFor',event.target.value)}/><small>{stockSchedulingRequired ? `Disponível a partir de amanhã${form.fulfillment === 'delivery' && settings.deliveryStartTime ? ` e para delivery após ${settings.deliveryStartTime}` : '.'}` : deliveryBlockedBeforeStart ? `Escolha ${settings.deliveryStartTime} ou mais tarde para delivery.` : 'Horário local do estabelecimento. A disponibilidade será validada novamente no servidor.'}</small></label>}</div></div>}

        <section className="checkout-card"><div className="checkout-card__title"><UserRound size={20}/><div><strong>Seus dados</strong><span>Somente o essencial para registrar o pedido.</span></div></div><div className="form-grid checkout-essential-fields"><label>Nome<input required value={form.customerName} onChange={(event) => update('customerName', event.target.value)} placeholder="Seu nome"/></label><label>WhatsApp / telefone<input required value={form.customerPhone} onChange={(event) => update('customerPhone', event.target.value)} placeholder="(27) 99999-9999"/></label></div><details className="checkout-extra-fields"><summary>Mais informações <small>opcionais</small></summary><div className="form-grid"><label className="full">E-mail<input type="email" value={form.customerEmail} onChange={(event) => update('customerEmail', event.target.value)} placeholder="voce@email.com"/></label><label>Como conheceu a loja?<select value={form.acquisitionSource || ''} onChange={(event) => update('acquisitionSource', (event.target.value || undefined) as CheckoutData['acquisitionSource'])}><option value="">Selecione</option><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option><option value="google">Google</option><option value="indicacao">Indicação</option><option value="outro">Outro</option></select></label><label>@ do Instagram<input value={form.customerInstagram || ''} onChange={(event) => update('customerInstagram', event.target.value)} placeholder="@seuusuario"/></label></div></details><label className="switch-row full checkout-remember-row"><span><strong>Salvar meus dados neste navegador</strong><small>Nome, contato e endereço ficam salvos por até 180 dias. Nenhum dado de pagamento é salvo.</small></span><input type="checkbox" checked={rememberCustomer} onChange={(event) => setRememberCustomer(event.target.checked)}/></label></section>

        <section className="checkout-card"><div className="checkout-card__title"><Truck size={20}/><div><strong>Como quer receber?</strong><span>Escolha delivery ou retirada.</span></div></div><div className="fulfillment-options">{settings.deliveryEnabled && <button type="button" className={form.fulfillment === 'delivery' ? 'selected' : ''} onClick={() => selectFulfillment('delivery')}><Truck size={20}/><span><strong>Delivery</strong><small>Receber no endereço</small></span></button>}{settings.pickupEnabled && <button type="button" className={form.fulfillment === 'pickup' ? 'selected' : ''} onClick={() => selectFulfillment('pickup')}><Store size={20}/><span><strong>Retirada</strong><small>Buscar na loja</small></span></button>}</div>
           {form.fulfillment === 'delivery' && <><div className="checkout-location-action"><div><strong>Preencher com minha localização</strong><small>Opcional. Usaremos sua localização uma única vez para sugerir o endereço; número e área continuam sob sua conferência.</small></div><button type="button" className="secondary-button" onClick={() => void useCurrentLocation()} disabled={locationLoading}>{locationLoading ? <LoaderCircle className="spin" size={16}/> : <LocateFixed size={16}/>}Usar localização</button></div>{locationHint && <div className="checkout-location-hint" role="status"><MapPin size={16}/><span>{locationHint} <small>Dados de endereço sugeridos por <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>.</small></span></div>}<div className="form-grid address-grid"><label>CEP<div className="field-with-button"><input value={form.zipCode} onChange={(event) => update('zipCode', event.target.value)} placeholder="00000-000"/><button type="button" onClick={() => void searchCep()} disabled={cepLoading}>{cepLoading ? <LoaderCircle className="spin" size={16}/> : <MapPin size={16}/>}Buscar</button></div></label><label>Bairro / área<select required value={form.deliveryZoneId} onChange={(event) => { const zone = deliveryZones.find((item) => item.id === event.target.value); setForm((current) => ({ ...current, deliveryZoneId: zone?.id || '', neighborhood: zone?.name || '', deliveryFee: zone?.fee || 0, deliveryCity: zone?.city || current.deliveryCity, deliveryState: zone?.state || current.deliveryState })); }}><option value="">Selecione</option>{deliveryZones.filter((zone) => zone.active).map((zone) => <option key={zone.id} value={zone.id}>{zone.name} · {zone.fee === 0 ? 'Grátis' : currency.format(zone.fee)}</option>)}</select></label><label className="full">Rua<input required value={form.street} onChange={(event) => update('street', event.target.value)}/></label><label>Número<input required value={form.addressNumber} onChange={(event) => update('addressNumber', event.target.value)}/></label><details className="checkout-extra-fields checkout-address-extra"><summary>Complemento e referência <small>opcionais</small></summary><div className="form-grid"><label>Complemento<input value={form.complement} onChange={(event) => update('complement', event.target.value)}/></label><label>Ponto de referência<input value={form.referencePoint} onChange={(event) => update('referencePoint', event.target.value)}/></label></div></details></div></>}
          {form.fulfillment === 'pickup' && <div className="pickup-info"><MapPin size={18}/><div><strong>{settings.hidePublicAddress ? 'Local de retirada combinado com a loja' : settings.address || settings.name}</strong><span>{settings.hidePublicAddress ? settings.pickupInstructions || 'Após registrar o pedido, confirme o local diretamente com a loja.' : `${settings.city}${settings.state ? `/${settings.state}` : ''}`}</span></div></div>}
        </section>

        <section className="checkout-card"><div className="checkout-card__title"><CreditCard size={20}/><div><strong>Pagamento</strong><span>Escolha como deseja pagar.</span></div></div><div className="payment-options">{enabledPayments.map((method) => <button type="button" key={method} className={form.paymentMethod === method ? 'selected' : ''} onClick={() => update('paymentMethod', method)}>{method === 'pix' ? <QrCode size={20}/> : method === 'cash' ? <Banknote size={20}/> : <CreditCard size={20}/>}<span><strong>{method === 'pix' ? 'PIX' : method === 'cash' ? 'Dinheiro' : method === 'card' ? (form.fulfillment === 'delivery' ? 'Cartão na entrega' : 'Cartão na retirada') : 'Confirmar com a loja'}</strong></span></button>)}</div>
          {form.paymentMethod === 'card' && <div className="cash-change-box"><strong>Cartão por aproximação (NFC)</strong><small>A cobrança será feita presencialmente pela loja. O WhatsApp fica disponível para confirmar o atendimento e eventuais orientações.</small></div>}
          {form.paymentMethod === 'cash' && <div className="cash-change-box"><label className="switch-row"><span><strong>Precisa de troco?</strong><small>Informe o valor que será entregue.</small></span><input type="checkbox" checked={form.needsChange} onChange={(event) => { update('needsChange', event.target.checked); if (!event.target.checked) update('changeFor', null); }}/></label>{form.needsChange && <label>Troco para<input type="number" min="0" step="0.01" value={form.changeFor ?? ''} onChange={(event) => update('changeFor', event.target.value ? Number(event.target.value) : null)} placeholder="Ex.: 100,00"/></label>}{form.needsChange && form.changeFor != null && changeAmount > 0 && <div className="change-result"><span>Troco calculado</span><strong>{currency.format(changeAmount)}</strong></div>}</div>}
        </section>

        {!isDoceLuaPilot && <section className="checkout-card"><div className="checkout-card__title"><ShoppingBag size={20}/><div><strong>Observações do pedido</strong><span>Informações úteis para o estabelecimento, se necessário.</span></div></div><textarea rows={4} maxLength={500} value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Ex.: sem cebola, tocar interfone, preferência de embalagem..."/></section>}

        <section className="checkout-card checkout-security-panel-v44"><div className="checkout-card__title"><ShieldCheck size={20}/><div><strong>Verificação de segurança</strong><span>Proteção contra pedidos automatizados e abusivos.</span></div></div><div className="checkout-security-check"><div><strong>Confirme que esta ação é humana</strong><span>Nenhum dado do pedido é enviado ao Turnstile. A validação retorna apenas um token de segurança.</span></div>{appConfig.turnstileSiteKey?<TurnstileWidget siteKey={appConfig.turnstileSiteKey} action="checkout" onToken={onTurnstileToken} resetSignal={turnstileReset}/>:<div className="checkout-security-missing"><AlertCircle size={17}/><span>Proteção anti-robô não configurada neste build.</span></div>}</div></section>
      </section>

      <aside className="order-summary checkout-summary">
        <span className="eyebrow">RESUMO</span>
        <div className="checkout-items-mini">{items.map((item) => <div key={item.id}><span>{item.quantity}x {item.productName}{item.options.length > 0 && <small>{item.options.map((option) => option.itemName).join(' · ')}</small>}</span><strong>{currency.format(cartItemUnitTotal(item) * item.quantity)}</strong></div>)}</div>
        <div className="summary-line"><span>Subtotal</span><strong>{currency.format(subtotal)}</strong></div>
        {form.fulfillment === 'delivery' && <div className="summary-line"><span>Entrega</span><strong>{deliveryFee === 0 ? 'Grátis' : currency.format(deliveryFee)}</strong></div>}
        <div className="summary-total"><span>Total</span><strong>{currency.format(total)}</strong></div>
        <div className="preparation-summary"><CheckCircle2 size={18}/><div><strong>Previsão atual</strong><span>{estimatedMin}–{estimatedMax} minutos</span></div></div>
        {!isDoceLuaPilot && <label className="checkout-review-check checkout-review-check-v44"><input type="checkbox" checked={form.reviewConfirmed} onChange={(event) => update('reviewConfirmed', event.target.checked)}/><span><strong>Confirmo que revisei o pedido.</strong><small>Confira itens, telefone, endereço e pagamento antes de registrar.</small></span></label>}
        {isDoceLuaPilot && <div className="checkout-pilot-note"><CheckCircle2 size={17}/><span>O pedido será conferido pela loja no painel após o envio. Guarde o número exibido na confirmação.</span></div>}
        <button className="primary-button checkout-submit" disabled={submitDisabled} type="submit">{saving ? <><LoaderCircle className="spin" size={18}/>Registrando...</> : <><CheckCircle2 size={18}/>Registrar pedido · {currency.format(total)}</>}</button>
        <small className="checkout-security-note">O navegador envia IDs e escolhas. Preços, opções e taxa são recalculados no servidor.</small>
      </aside>
      <div className="checkout-mobile-submit"><div><small>Total do pedido</small><strong>{currency.format(total)}</strong></div><button className="primary-button" disabled={submitDisabled} type="submit">{saving ? <LoaderCircle className="spin" size={18}/> : <><CheckCircle2 size={17}/> Finalizar</>}</button></div>
    </form>
  </div>;
}
