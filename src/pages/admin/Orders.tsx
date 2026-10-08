import { AlertCircle, CheckCircle2, ChefHat, CircleDollarSign, Copy, MessageCircle, Plus, QrCode, RefreshCw, RotateCcw, Search, ShoppingBag, Users, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { ErrorState, LoadingState } from '../../components/ui/AsyncState';
import { useStore } from '../../contexts/StoreContext';
import { trackInteraction } from '../../services/interactionTelemetry';
import { currency, formatDateTimeBR, roundMoney } from '../../utils/format';
import type { ManualOrderInput, ManualOrderItemInput, ManualOrderSource, Order, OrderStatus, PaymentMethod } from '../../types';
import { formatOrderNumber } from '../../utils/orderConfirmation';
import { copyText } from '../../utils/clipboard';
import { buildPixPayloadWithAmount } from '../../utils/pix';
import { buildComeBackMessage, buildOrderStatusMessage, buildSalesRecoveryMessage, normalizeWhatsappPhone, openCustomerWhatsapp } from '../../utils/customerSales';

const statusOptions: Array<{ value: OrderStatus; label: string }> = [
  { value: 'received', label: 'Recebido' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'preparing', label: 'Em preparação' },
  { value: 'ready', label: 'Pronto' },
  { value: 'out_for_delivery', label: 'Saiu para entrega' },
  { value: 'delivered', label: 'Entregue' },
  { value: 'picked_up', label: 'Retirado' },
  { value: 'cancelled', label: 'Cancelado' },
];

const kdsStatuses: OrderStatus[] = ['received', 'confirmed', 'preparing', 'ready', 'out_for_delivery'];
const statusLabel = Object.fromEntries(statusOptions.map((item) => [item.value, item.label])) as Record<OrderStatus, string>;
const paymentLabel: Record<PaymentMethod, string> = { confirm: 'Combinar com a loja', pix: 'PIX', card: 'Cartão', cash: 'Dinheiro' };
const manualSourceOptions: Array<{ value: ManualOrderSource; label: string }> = [
  { value: 'counter', label: 'Balcão' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'phone', label: 'Telefone' },
  { value: 'ifood', label: 'iFood' },
  { value: 'other', label: 'Outro' },
];
const orderSourceLabel: Record<NonNullable<Order['source']>, string> = {
  site: 'Site', counter: 'Balcão', whatsapp: 'WhatsApp', phone: 'Telefone', ifood: 'iFood', other: 'Outro',
};
const sortOptions = [
  { value: 'newest', label: 'Mais recentes' },
  { value: 'oldest', label: 'Mais antigos' },
  { value: 'total_desc', label: 'Maior valor' },
  { value: 'total_asc', label: 'Menor valor' },
  { value: 'customer_asc', label: 'Cliente A-Z' },
] as const;

const localDateTimeInputValue = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const tomorrowStart = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 1);
  return date;
};

const tomorrowAt = (hour: number, minute = 0) => {
  const date = tomorrowStart();
  date.setHours(hour, minute, 0, 0);
  return date;
};

const nextDeliveryWindow = (deliveryStartTime?: string) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(deliveryStartTime || '');
  return tomorrowAt(match ? Number(match[1]) : 18, match ? Number(match[2]) : 0);
};

/** Saldo que ainda pode ser usado por um novo pedido. A reserva de pedidos
 * pendentes também precisa ser descontada para que o avulso ofereça
 * agendamento antes de chegar ao RPC e falhar na reserva. */
const availableStock = (product: { trackStock: boolean; stockQuantity?: number; stockReservedQuantity?: number }) =>
  product.trackStock
    ? Math.max(0, Number(product.stockQuantity || 0) - Number(product.stockReservedQuantity || 0))
    : Number.POSITIVE_INFINITY;

const productNeedsFutureScheduling = (product: { availabilityStatus: string; stockStatus: string; trackStock: boolean; stockQuantity?: number; stockReservedQuantity?: number }, quantity = 1) =>
  product.availabilityStatus !== 'available'
  || product.stockStatus === 'unavailable'
  || availableStock(product) < quantity;

type SortMode = (typeof sortOptions)[number]['value'];
type CustomerSummary = { key: string; name: string; phone: string; orders: number; total: number; lastAt: string };
type ManualPixView = { orderNumber: number; total: number; payload: string; error?: string };
const newManualOrder = (): Omit<ManualOrderInput, 'items'> => ({
  customerName: '', customerPhone: '', fulfillment: 'pickup', source: 'counter', paymentMethod: 'cash', status: 'received', received: false, notes: '',
});

export default function OrdersAdmin() {
  const { orders, products, loading, error, reloadAdmin, updateOrderStatus, confirmOrderPayment, createManualOrder, settings } = useStore();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [sortBy, setSortBy] = useState<SortMode>('newest');
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null);
  const [notifyOrderId, setNotifyOrderId] = useState<string | null>(null);
  const [manualOrderOpen, setManualOrderOpen] = useState(false);
  const [manualOrder, setManualOrder] = useState<Omit<ManualOrderInput, 'items'>>(newManualOrder);
  const [manualItems, setManualItems] = useState<ManualOrderItemInput[]>([]);
  const [manualProductId, setManualProductId] = useState('');
  const [manualQuantityDraft, setManualQuantityDraft] = useState(1);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualPixView, setManualPixView] = useState<ManualPixView | null>(null);
  const [manualPixQrCode, setManualPixQrCode] = useState('');
  const [manualPixQrCodeError, setManualPixQrCodeError] = useState('');
  const [manualPixPreviewQrCode, setManualPixPreviewQrCode] = useState('');
  const [manualPixPreviewQrCodeError, setManualPixPreviewQrCodeError] = useState('');
  const [manualPixChargeNow, setManualPixChargeNow] = useState(false);
  const [manualPixCopied, setManualPixCopied] = useState(false);
  const [manualFormError, setManualFormError] = useState('');
  const refreshingRef = useRef(false);
  const rowsRef = useRef<Record<string, HTMLTableRowElement | null>>({});
  const highlightedOrderId = searchParams.get('highlight') || '';

  useEffect(() => {
    let cancelled = false;
    if (!manualPixView?.payload) {
      setManualPixQrCode('');
      setManualPixQrCodeError('');
      return () => { cancelled = true; };
    }
    setManualPixQrCodeError('');
    void QRCode.toDataURL(manualPixView.payload, { errorCorrectionLevel: 'M', margin: 2, width: 360 })
      .then((dataUrl) => { if (!cancelled) setManualPixQrCode(dataUrl); })
      .catch(() => { if (!cancelled) { setManualPixQrCode(''); setManualPixQrCodeError('O QR Code não pôde ser desenhado neste aparelho. Use o PIX Copia e Cola abaixo.'); } });
    return () => { cancelled = true; };
  }, [manualPixView?.payload]);

  // Itens indisponíveis também aparecem para que o administrador possa
  // registrá-los como encomenda futura. A validação abaixo impede salvar sem
  // agendamento quando ainda não há disponibilidade.
  const manualProducts = useMemo(() => products.filter((product) => product.active), [products]);
  const manualSubtotal = useMemo(() => roundMoney(manualItems.reduce((sum, item) => {
    const product = products.find((current) => current.id === item.productId);
    if (!product) return sum;
    const optionsTotal = item.options.reduce((optionSum, option) => {
      const group = product.optionGroups.find((current) => current.id === option.groupId);
      const choice = group?.items.find((current) => current.id === option.itemId);
      return optionSum + (choice?.priceDelta || 0) * option.quantity;
    }, 0);
    return sum + ((product.promotionalPrice ?? product.price) + optionsTotal) * item.quantity;
  }, 0)), [manualItems, products]);

  const manualUnavailableItem = useMemo(() => manualItems.map((item) => {
    const product = products.find((current) => current.id === item.productId);
    if (!product) return null;
    const unavailable = productNeedsFutureScheduling(product, item.quantity);
    return unavailable ? { item, product } : null;
  }).find(Boolean) || null, [manualItems, products]);

  const manualPixPreview = useMemo(() => {
    if (!manualPixChargeNow || manualOrder.paymentMethod !== 'pix') return { payload: '', error: '' };
    if (manualSubtotal <= 0) return { payload: '', error: 'Adicione pelo menos um produto para calcular e gerar o PIX com valor.' };
    try {
      return {
        payload: buildPixPayloadWithAmount({
          receiptMode: settings.pixReceiptMode,
          copyPaste: settings.pixCopyPaste,
          key: settings.pixKey,
          receiver: settings.pixReceiver,
          city: settings.city || 'Linhares',
          amount: manualSubtotal,
          txid: 'PEDAVULSO',
        }),
        error: '',
      };
    } catch (error) {
      return { payload: '', error: error instanceof Error ? error.message : 'Configure a chave PIX ou um PIX Copia e Cola estático válido nas configurações da loja.' };
    }
  }, [manualOrder.paymentMethod, manualPixChargeNow, manualSubtotal, settings.city, settings.pixCopyPaste, settings.pixKey, settings.pixReceiver, settings.pixReceiptMode]);
  const manualPixPreviewPayload = manualPixPreview.payload;

  useEffect(() => {
    let cancelled = false;
    if (!manualPixPreviewPayload) {
      setManualPixPreviewQrCode('');
      setManualPixPreviewQrCodeError('');
      return () => { cancelled = true; };
    }
    setManualPixPreviewQrCodeError('');
    void QRCode.toDataURL(manualPixPreviewPayload, { errorCorrectionLevel: 'M', margin: 2, width: 280 })
      .then((dataUrl) => { if (!cancelled) setManualPixPreviewQrCode(dataUrl); })
      .catch(() => { if (!cancelled) { setManualPixPreviewQrCode(''); setManualPixPreviewQrCodeError('O QR Code não pôde ser desenhado neste aparelho. Use o PIX Copia e Cola.'); } });
    return () => { cancelled = true; };
  }, [manualPixPreviewPayload]);

  const openManualOrder = () => {
    setManualOrder(newManualOrder());
    setManualItems([]);
    setManualProductId(manualProducts[0]?.id || '');
    setManualQuantityDraft(1);
    setManualPixChargeNow(false);
    setManualFormError('');
    setManualOrderOpen(true);
  };

  const addManualProduct = () => {
    if (!manualProductId || manualItems.some((item) => item.productId === manualProductId)) return;
    const quantity = Math.max(1, Math.min(99, Number(manualQuantityDraft) || 1));
    setManualItems((items) => [...items, { productId: manualProductId, quantity, options: [] }]);
    setManualProductId('');
    setManualQuantityDraft(1);
  };

  const scheduleManualRestock = () => {
    setManualFormError('');
    setManualOrder((current) => ({ ...current, scheduledFor: localDateTimeInputValue(current.fulfillment === 'delivery' ? nextDeliveryWindow(settings.deliveryStartTime) : tomorrowStart()) }));
  };

  const updateManualItem = (productId: string, patch: Partial<ManualOrderItemInput>) => {
    setManualItems((items) => items.map((item) => item.productId === productId ? { ...item, ...patch } : item));
  };

  const updateManualOptionGroup = (productId: string, groupId: string, itemIds: string[]) => {
    const group = products.find((product) => product.id === productId)?.optionGroups.find((current) => current.id === groupId);
    const selectedIds = [...new Set(itemIds)].slice(0, group?.maxChoices ?? itemIds.length);
    setManualItems((items) => items.map((item) => item.productId === productId ? {
      ...item,
      options: [
        ...item.options.filter((option) => option.groupId !== groupId),
        ...selectedIds.map((itemId) => ({ groupId, itemId, quantity: 1 })),
      ],
    } : item));
  };

  const saveManualOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!manualOrder.customerName.trim() || !manualItems.length) return;
    if (manualOrder.status === 'cancelled' && manualOrder.received) return;
    if (manualOrder.fulfillment === 'delivery' && !settings.deliveryEnabled) {
      setManualFormError('O delivery está desativado nas configurações da loja. Selecione retirada ou ative o delivery.');
      return;
    }
    const scheduledAt = manualOrder.scheduledFor ? new Date(manualOrder.scheduledFor) : null;
    const minimumSchedule = manualOrder.fulfillment === 'delivery' ? nextDeliveryWindow(settings.deliveryStartTime) : tomorrowStart();
    if (scheduledAt && (!Number.isFinite(scheduledAt.getTime()) || scheduledAt < minimumSchedule)) {
      setManualFormError(manualOrder.fulfillment === 'delivery'
        ? `O delivery futuro precisa ser agendado a partir de amanhã às ${settings.deliveryStartTime || '18:00'}.`
        : 'A retirada futura precisa ser agendada a partir de amanhã.');
      return;
    }
    if (manualOrder.fulfillment === 'delivery' && !scheduledAt && settings.deliveryStartTime) {
      const [startHour, startMinute] = settings.deliveryStartTime.split(':').map(Number);
      const now = new Date();
      if (now.getHours() * 60 + now.getMinutes() < startHour * 60 + startMinute) {
        setManualFormError(`O delivery só pode ser lançado a partir das ${settings.deliveryStartTime}. Para antes desse horário, selecione retirada ou agende para amanhã.`);
        return;
      }
    }
    const unavailableItem = manualItems.find((item) => {
      const product = products.find((current) => current.id === item.productId);
      return !product || productNeedsFutureScheduling(product, item.quantity);
    });
    if (unavailableItem && manualOrder.received) {
      setManualFormError('Este produto precisa de reposição. Mantenha “A receber do cliente” e confirme o pagamento somente depois que o estoque for reposto.');
      return;
    }
    if (unavailableItem && !scheduledAt) {
      setManualFormError('Há produto sem disponibilidade ou estoque suficiente. Informe uma data a partir de amanhã para registrar como encomenda futura.');
      return;
    }
    const incompleteProduct = manualItems.find((item) => {
      const product = products.find((current) => current.id === item.productId);
      return product?.optionGroups.some((group) => group.active && new Set(item.options.filter((option) => option.groupId === group.id).map((option) => option.itemId)).size < group.minChoices);
    });
    if (incompleteProduct) {
      setManualFormError('Revise as opções obrigatórias dos produtos selecionados.');
      return;
    }
    if (manualOrder.paymentMethod === 'pix' && manualPixChargeNow && !manualPixPreviewPayload) {
      setManualFormError(manualPixPreview.error || 'Configure o PIX da loja antes de cobrar agora.');
      return;
    }
    setManualFormError('');
    setManualSaving(true);
    try {
      const result = await trackInteraction('manual_order_create', () => createManualOrder({ ...manualOrder, items: manualItems }), { storeId: settings.id });
      setLastUpdatedAt(new Date());
      setManualOrderOpen(false);
      if (manualOrder.paymentMethod === 'pix' && manualPixChargeNow) {
        let payload = '';
        let pixError = '';
        try {
          payload = buildPixPayloadWithAmount({
            receiptMode: settings.pixReceiptMode,
            copyPaste: settings.pixCopyPaste,
            key: settings.pixKey,
            receiver: settings.pixReceiver,
            city: settings.city || 'Linhares',
            amount: result.total,
            txid: `PED${result.orderNumber}`,
          });
        } catch (error) {
          pixError = error instanceof Error ? error.message : 'Não foi possível gerar o PIX com valor.';
        }
        setManualPixView({ orderNumber: result.orderNumber, total: result.total, payload, error: pixError || undefined });
        setManualPixCopied(false);
      }
    } catch (manualOrderError) {
      setManualFormError(manualOrderError instanceof Error ? manualOrderError.message : 'Não foi possível lançar o pedido avulso.');
    } finally {
      setManualSaving(false);
    }
  };

  const refreshOrders = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await reloadAdmin({ silent: true });
      setLastUpdatedAt(new Date());
    } catch (refreshError) {
      console.error('Não foi possível atualizar os pedidos em segundo plano:', refreshError);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [reloadAdmin]);

  const changeStatus = async (orderId: string, status: OrderStatus) => {
    setUpdatingId(orderId);
    try {
      await trackInteraction('order_status_update', () => updateOrderStatus(orderId, status), { storeId: settings.id });
      setLastUpdatedAt(new Date());
      return true;
    } catch (statusError) {
      window.alert(statusError instanceof Error ? statusError.message : 'Não foi possível atualizar o pedido.');
      return false;
    } finally {
      setUpdatingId(null);
    }
  };

  const changeStatusWithCustomerDraft = async (order: Order, status: OrderStatus) => {
    if (order.status === status) return;
    const changed = await changeStatus(order.id, status);
    if (changed && settings.kdsNotifyCustomer && order.customerPhone) setNotifyOrderId(order.id);
  };

  const operationalStatuses = (order: Order) => statusOptions.filter((option) => order.deliveryType === 'delivery' ? option.value !== 'picked_up' : option.value !== 'out_for_delivery' && option.value !== 'delivered');

  const confirmPayment = async (orderId: string, orderNumber: number, total: number) => {
    const order = orders.find((current) => current.id === orderId);
    const paymentDescription = order ? paymentLabel[order.paymentMethod] : 'pagamento informado';
    const inventoryDescription = order?.inventoryStatus === 'awaiting_restock'
      ? 'Este pedido aguarda reposição e não poderá baixar o estoque até haver saldo.'
      : 'A confirmação também baixará agora o estoque reservado deste pedido.';
    const confirmed = window.confirm(`CONFIRME SOMENTE APÓS CONFERIR O PAGAMENTO\n\nPedido #${formatOrderNumber(orderNumber)} · ${order?.customerName || 'cliente'}\nValor: ${currency.format(total)}\nForma: ${paymentDescription}\n\n${inventoryDescription}\nA entrada será lançada automaticamente no Financeiro.\n\nDeseja confirmar o recebimento?`);
    if (!confirmed) return;
    setConfirmingPaymentId(orderId);
    try {
      await trackInteraction('order_payment_confirm', () => confirmOrderPayment(orderId), { storeId: settings.id });
      setLastUpdatedAt(new Date());
    } catch (paymentError) {
      window.alert(paymentError instanceof Error ? paymentError.message : 'Não foi possível confirmar o recebimento.');
    } finally {
      setConfirmingPaymentId(null);
    }
  };

  useEffect(() => { if (!loading && !lastUpdatedAt) setLastUpdatedAt(new Date()); }, [loading, lastUpdatedAt]);
  useEffect(() => {
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshOrders(); }, 15000);
    const onFocus = () => void refreshOrders();
    const onVisibility = () => { if (document.visibilityState === 'visible') void refreshOrders(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisibility); };
  }, [refreshOrders]);

  const filtered = useMemo(() => {
    const term = query.toLowerCase().trim();
    const list = orders.filter((order) => {
      const searchable = `${order.customerName} ${order.customerPhone ?? ''} ${order.customerInstagram ?? ''} ${order.acquisitionSource ?? ''} ${order.id} ${order.orderNumber}`.toLowerCase();
      return (!term || searchable.includes(term))
        && (statusFilter === 'all' || order.status === statusFilter)
        && (paymentFilter === 'all' || order.paymentStatus === paymentFilter);
    });
    return [...list].sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortBy === 'total_desc') return b.total - a.total;
      if (sortBy === 'total_asc') return a.total - b.total;
      if (sortBy === 'customer_asc') return a.customerName.localeCompare(b.customerName, 'pt-BR');
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [orders, paymentFilter, query, statusFilter, sortBy]);

  const awaitingPaymentOrders = useMemo(() => orders
    .filter((order) => order.paymentStatus !== 'paid' && order.status !== 'cancelled')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, 12), [orders]);

  const recoveryOrders = useMemo(() => {
    const now = Date.now();
    return orders.filter((order) => {
      const age = now - new Date(order.createdAt).getTime();
      return settings.salesRecoveryEnabled && Boolean(order.customerPhone) && order.status === 'received' && !order.whatsappClickedAt && age >= settings.salesRecoveryMinutes * 60_000 && age <= (settings.salesRecoveryWindowHours ?? 48) * 60 * 60_000;
    }).slice(0, 12);
  }, [orders, settings.salesRecoveryEnabled, settings.salesRecoveryMinutes, settings.salesRecoveryWindowHours]);

  const customers = useMemo<CustomerSummary[]>(() => {
    const map = new Map<string, CustomerSummary>();
    for (const order of orders) {
      const key = normalizeWhatsappPhone(order.customerPhone);
      if (!key || order.status === 'cancelled') continue;
      const current = map.get(key);
      if (!current) {
        map.set(key, { key, name: order.customerName, phone: order.customerPhone || key, orders: 1, total: order.total, lastAt: order.createdAt });
      } else {
        current.orders += 1;
        current.total += order.total;
        if (new Date(order.createdAt).getTime() > new Date(current.lastAt).getTime()) { current.lastAt = order.createdAt; current.name = order.customerName; }
      }
    }
    return [...map.values()].sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()).slice(0, 20);
  }, [orders]);

  const comeBackCustomers = useMemo(() => customers.filter((customer) => (Date.now() - new Date(customer.lastAt).getTime()) >= (settings.crmComeBackDays ?? 21) * 86_400_000), [customers, settings.crmComeBackDays]);

  const kdsOrders = useMemo(() => orders.filter((order) => kdsStatuses.includes(order.status)), [orders]);

  useEffect(() => {
    if (!highlightedOrderId) return;
    const highlightedOrder = orders.find((order) => order.id === highlightedOrderId);
    if (!highlightedOrder) return;
    setQuery(''); setStatusFilter('all');
    const timer = window.setTimeout(() => rowsRef.current[highlightedOrderId]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 180);
    return () => window.clearTimeout(timer);
  }, [highlightedOrderId, orders]);

  const whatsappButton = (order: Order, kind: 'status' | 'recovery') => (
    <button type="button" className={`order-whatsapp-action-v061 ${kind === 'status' && notifyOrderId === order.id ? 'is-recommended-v063' : ''}`} disabled={!order.customerPhone} onClick={() => { openCustomerWhatsapp(order.customerPhone, kind === 'recovery' ? buildSalesRecoveryMessage(settings.name, order, settings.messageTemplates) : buildOrderStatusMessage(settings.name, order, settings.messageTemplates)); if (kind === 'status') setNotifyOrderId(null); }}>
      <MessageCircle size={15}/>{kind === 'recovery' ? 'Recuperar venda' : notifyOrderId === order.id ? 'Enviar atualização' : 'Avisar cliente'}
    </button>
  );

  if (loading) return <LoadingState label="Carregando pedidos..." />;
  if (error) return <ErrorState message={error} onRetry={() => void reloadAdmin()} />;

  return <>
    <div className="admin-page-title"><div><span className="eyebrow">OPERAÇÃO</span><h1>Pedidos</h1><p>Fila operacional, recuperação de vendas e relacionamento com clientes usando os pedidos já registrados.</p></div><button type="button" className="primary-button" onClick={openManualOrder} disabled={!manualProducts.length}><Plus size={17}/>Lançar pedido avulso</button></div>

    <div className="sales-ops-grid-v061">
      <details className="sales-ops-panel-v061" open={recoveryOrders.length > 0}>
        <summary><span><RotateCcw size={18}/><strong>Recuperação de vendas</strong></span><b>{recoveryOrders.length}</b></summary>
        <p>Pedidos registrados após {settings.salesRecoveryMinutes} min e mantidos como oportunidade por até {settings.salesRecoveryWindowHours ?? 48} h. O envio continua manual.</p>
        {recoveryOrders.length ? <div className="sales-ops-list-v061">{recoveryOrders.map((order) => <article key={order.id}><div><strong>#{formatOrderNumber(order.orderNumber)} · {order.customerName}</strong><span>{currency.format(order.total)} · {formatDateTimeBR(order.createdAt)}</span></div>{whatsappButton(order, 'recovery')}</article>)}</div> : <div className="sales-ops-empty-v061">Nenhuma oportunidade pendente agora.</div>}
      </details>

      {settings.crmEnabled && <details className="sales-ops-panel-v061">
        <summary><span><Users size={18}/><strong>CRM simples de clientes</strong></span><b>{comeBackCustomers.length}</b></summary>
        <p>Clientes sem comprar há pelo menos {settings.crmComeBackDays ?? 21} dias, com frequência, valor acumulado e última compra.</p>
        {comeBackCustomers.length ? <div className="sales-ops-list-v061">{comeBackCustomers.map((customer) => <article key={customer.key}><div><strong>{customer.name}</strong><span>{customer.orders} pedido{customer.orders === 1 ? '' : 's'} · {currency.format(customer.total)} · último {new Date(customer.lastAt).toLocaleDateString('pt-BR')}</span></div><button type="button" className="order-whatsapp-action-v061" onClick={() => openCustomerWhatsapp(customer.phone, buildComeBackMessage(settings.name, customer.name, settings.messageTemplates))}><MessageCircle size={15}/>Mensagem de recompra</button></article>)}</div> : <div className="sales-ops-empty-v061">Os clientes aparecerão aqui conforme os pedidos forem chegando.</div>}
      </details>}
    </div>

    {settings.kdsEnabled && <section className="kds-board-v061"><div className="kds-board-v061__heading"><div><span className="eyebrow">COZINHA / KDS</span><h2><ChefHat size={21}/>Fila operacional</h2><p>O quadro é opcional e usa os mesmos pedidos da operação, sem uma nova tela ou permissão.</p></div><span>{kdsOrders.length} em andamento</span></div><div className="kds-columns-v061">{kdsStatuses.map((status) => <section key={status}><header><strong>{statusLabel[status]}</strong><span>{kdsOrders.filter((order) => order.status === status).length}</span></header><div>{kdsOrders.filter((order) => order.status === status).map((order) => <article key={order.id}><strong>#{formatOrderNumber(order.orderNumber)} · {order.customerName}</strong><span>{currency.format(order.total)} · {order.deliveryType === 'delivery' ? 'Delivery' : 'Retirada'}</span><div className="kds-status-buttons-v062">{operationalStatuses(order).filter((option)=>option.value !== 'cancelled').map((option)=><button type="button" key={option.value} className={order.status===option.value?'active':''} disabled={updatingId===order.id || order.status===option.value} onClick={()=>void changeStatusWithCustomerDraft(order,option.value)}>{option.label}</button>)}</div><button type="button" className="kds-cancel-v062" disabled={updatingId===order.id || order.status==='cancelled'} onClick={()=>void changeStatus(order.id,'cancelled')}>Cancelar</button>{settings.kdsNotifyCustomer && whatsappButton(order, 'status')}</article>)}</div></section>)}</div></section>}

    <section className="admin-card orders-payment-inbox" aria-labelledby="orders-payment-inbox-title">
      <div className="orders-payment-inbox__heading"><div><span className="eyebrow">FINANCEIRO</span><h2 id="orders-payment-inbox-title">A receber do cliente</h2><p>Confirme somente depois de conferir o pagamento. A confirmação baixa o estoque reservado e lança a entrada no Financeiro.</p></div><strong>{awaitingPaymentOrders.length}</strong></div>
      {awaitingPaymentOrders.length ? <div className="orders-payment-inbox__list">{awaitingPaymentOrders.map((order) => <article key={order.id}><div><strong>#{formatOrderNumber(order.orderNumber)} · {order.customerName}</strong><span>{paymentLabel[order.paymentMethod]} · {currency.format(order.total)} · {formatDateTimeBR(order.createdAt)}</span><small>{order.scheduledFor ? `Agendado: ${formatDateTimeBR(order.scheduledFor)}` : 'Pedido aguardando conferência do recebimento'}</small></div><button type="button" className="order-payment-confirm-button order-payment-confirm-button--prominent" disabled={confirmingPaymentId === order.id} onClick={() => void confirmPayment(order.id, order.orderNumber, order.total)}><CircleDollarSign size={16}/>{confirmingPaymentId === order.id ? 'Confirmando...' : 'Confirmar recebimento'}</button></article>)}</div> : <div className="orders-payment-inbox__empty"><CheckCircle2 size={18}/>Nenhum pedido pendente de recebimento.</div>}
    </section>

    <section className="admin-card no-padding">
      <div className="table-toolbar orders-toolbar orders-toolbar--filters">
        <div className="admin-search"><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pedido, cliente ou telefone..."/></div>
        <div className="toolbar-selects"><label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | OrderStatus)}><option value="all">Todos</option>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label><span>Recebimento</span><select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value as 'all' | 'pending' | 'paid')}><option value="all">Todos</option><option value="pending">A receber do cliente</option><option value="paid">Recebido</option></select></label><label><span>Ordenar por</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortMode)}>{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
        <div className="orders-toolbar__sync" aria-live="polite"><span>{filtered.length} pedido{filtered.length === 1 ? '' : 's'}</span><small>{lastUpdatedAt ? `Atualizado às ${lastUpdatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Atualização automática ativa'}</small><button type="button" className="secondary-button compact-button" onClick={() => void refreshOrders()} disabled={refreshing} aria-busy={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''}/>{refreshing ? 'Atualizando...' : 'Atualizar'}</button></div>
      </div>
      {highlightedOrderId && <div className="highlight-order-banner">O pedido relacionado vindo do Financeiro foi destacado abaixo.</div>}
      {filtered.length === 0 ? <div className="admin-empty"><ShoppingBag size={32}/><strong>Nenhum pedido encontrado</strong><span>Ajuste os filtros ou aguarde o próximo pedido.</span></div> : <div className="responsive-table"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Entrega / retirada</th><th>Pagamento</th><th>Total</th><th>Recebimento</th><th>Status</th><th>Criado em</th></tr></thead><tbody>{filtered.map((order) => {
        const highlighted = order.id === highlightedOrderId;
        return <tr key={order.id} ref={(node) => { rowsRef.current[order.id] = node; }} className={highlighted ? 'order-row-highlighted' : ''}>
          <td><strong>#{order.orderNumber ? formatOrderNumber(order.orderNumber) : order.id.slice(0, 8)}</strong><small className="order-fee-note">{orderSourceLabel[order.source || 'site']}</small>{order.whatsappClickedAt ? <small className="order-fee-note">WhatsApp aberto</small> : null}{highlighted ? <small>Pedido vindo do Financeiro</small> : null}</td>
          <td><div className="order-customer"><strong>{order.customerName}</strong><span>{order.customerPhone || 'Sem telefone informado'}</span>{order.acquisitionSource ? <small>Origem: {({ instagram: 'Instagram', whatsapp: 'WhatsApp', google: 'Google', indicacao: 'Indicação', outro: 'Outro' } as const)[order.acquisitionSource]}</small> : null}{order.customerInstagram ? <small>{order.customerInstagram}</small> : null}</div></td>
          <td><div className="order-customer"><strong>{order.deliveryType === 'delivery' ? 'Delivery' : 'Retirada'}</strong>{order.deliveryType === 'delivery' && order.deliveryZoneName ? <span>{order.deliveryZoneName}{order.deliveryFee ? ` · ${currency.format(order.deliveryFee)}` : ''}</span> : null}{order.scheduledFor ? <span>Agendado: {formatDateTimeBR(order.scheduledFor)}</span> : null}{order.preparationEstimateMinutes ? <span>Estimativa: até {order.preparationEstimateMinutes} min</span> : null}</div></td>
          <td><div className="order-customer"><strong>{paymentLabel[order.paymentMethod]}</strong>{order.paymentMethod === 'cash' && order.needsChange && order.changeFor ? <span>Troco para {currency.format(order.changeFor)}</span> : null}</div></td>
          <td><strong>{currency.format(order.total)}</strong>{order.deliveryFee ? <small className="order-fee-note">inclui {currency.format(order.deliveryFee)} de entrega</small> : null}</td>
          <td>{order.paymentStatus === 'paid' ? <span className="order-payment-received"><CheckCircle2 size={15}/><span><strong>Recebido</strong>{order.paymentReceivedAt ? <small>{formatDateTimeBR(order.paymentReceivedAt)}</small> : null}</span></span> : order.status === 'cancelled' ? <span className="order-payment-cancelled">Pedido cancelado</span> : <><span className="order-payment-pending"><CircleDollarSign size={15}/><strong>A receber do cliente</strong></span><button type="button" className="order-payment-confirm-button" disabled={confirmingPaymentId === order.id} onClick={() => void confirmPayment(order.id, order.orderNumber, order.total)}><CircleDollarSign size={15}/>{confirmingPaymentId === order.id ? 'Confirmando...' : 'Confirmar recebimento'}</button><small className={`order-inventory-note order-inventory-note--${order.inventoryStatus || 'not_tracked'}`}>{order.inventoryStatus === 'awaiting_restock' ? 'Aguardando reposição' : order.inventoryStatus === 'reserved' ? 'Estoque reservado' : order.inventoryStatus === 'committed' ? 'Estoque baixado' : 'Sem controle de estoque'}</small></>}</td>
          <td><div className="order-status-actions-v061"><label className={`order-status-control order-status-control--${order.status}`}><span>{statusLabel[order.status]}</span><select value={order.status} disabled={updatingId === order.id} onChange={(event) => void changeStatusWithCustomerDraft(order, event.target.value as OrderStatus)} aria-label={`Status do pedido ${order.orderNumber || order.id}`}>{operationalStatuses(order).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>{settings.kdsNotifyCustomer && order.customerPhone && whatsappButton(order, 'status')}</div></td>
          <td>{formatDateTimeBR(order.createdAt)}</td>
        </tr>;
      })}</tbody></table></div>}
    </section>
    {manualOrderOpen && <div className="modal-overlay" role="presentation">
      <form className="master-modal master-modal--wide manual-order-modal" role="dialog" aria-modal="true" aria-labelledby="manual-order-title" onSubmit={saveManualOrder}>
        <button type="button" className="modal-close" aria-label="Fechar lançamento de pedido avulso" onClick={() => setManualOrderOpen(false)} disabled={manualSaving}><X/></button>
        <span className="eyebrow">LANÇAMENTO OPERACIONAL</span>
        <h2 id="manual-order-title">Pedido avulso</h2>
        <p>Registre uma venda feita fora do site. O sistema valida estoque, opções e agendamento antes de salvar.</p>
        {manualFormError && <div className="manual-order-feedback manual-order-feedback--error" role="alert"><AlertCircle size={17}/><span>{manualFormError}</span></div>}
        <div className="form-grid">
          <label>Cliente<input required value={manualOrder.customerName} onChange={(event) => setManualOrder((current) => ({ ...current, customerName: event.target.value }))} placeholder="Nome do cliente"/></label>
          <label>Como será recebido?<select value={manualOrder.fulfillment || 'pickup'} onChange={(event) => { const fulfillment = event.target.value as ManualOrderInput['fulfillment']; setManualOrder((current) => ({ ...current, fulfillment })); setManualFormError(''); }}><option value="pickup">Retirada</option><option value="delivery" disabled={!settings.deliveryEnabled}>Delivery{settings.deliveryEnabled ? '' : ' (desativado)'}</option></select><small>Delivery respeita o início configurado; retirada não.</small></label>
          <label>Pagamento<select value={manualOrder.paymentMethod} onChange={(event) => { const paymentMethod = event.target.value as PaymentMethod; setManualOrder((current) => ({ ...current, paymentMethod })); if (paymentMethod !== 'pix') setManualPixChargeNow(false); }}>{Object.entries(paymentLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Agendar pedido <span className="optional-label">opcional</span><input type="datetime-local" min={localDateTimeInputValue(manualOrder.fulfillment === 'delivery' ? nextDeliveryWindow(settings.deliveryStartTime) : tomorrowStart())} value={manualOrder.scheduledFor || ''} onChange={(event) => { setManualFormError(''); setManualOrder((current) => ({ ...current, scheduledFor: event.target.value || undefined })); }}/><span className="manual-order-schedule-actions"><button type="button" className="text-button" onClick={scheduleManualRestock}>Amanhã{manualOrder.fulfillment === 'delivery' ? ` às ${settings.deliveryStartTime || '18:00'}` : ''}</button><small>Para encomendas sem estoque, disponível somente a partir de amanhã{manualOrder.fulfillment === 'delivery' && settings.deliveryStartTime ? ` e delivery após ${settings.deliveryStartTime}` : ''}.</small></span></label>
          <details className="manual-order-more-options"><summary>Mais opções <small>telefone, origem e recebimento</small></summary><div className="form-grid manual-order-more-options__grid"><label>Telefone <span className="optional-label">opcional</span><input value={manualOrder.customerPhone || ''} onChange={(event) => setManualOrder((current) => ({ ...current, customerPhone: event.target.value }))} placeholder="(27) 99999-9999"/></label><label>Origem<select value={manualOrder.source} onChange={(event) => setManualOrder((current) => ({ ...current, source: event.target.value as ManualOrderSource }))}>{manualSourceOptions.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}</select></label><label>Status inicial<select value={manualOrder.status} onChange={(event) => { const status = event.target.value as OrderStatus; setManualOrder((current) => ({ ...current, status, received: status === 'cancelled' ? false : current.received })); }}>{statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label><label>Recebimento<select value={manualOrder.received ? 'paid' : 'pending'} disabled={manualOrder.status === 'cancelled'} onChange={(event) => setManualOrder((current) => ({ ...current, received: event.target.value === 'paid' }))}><option value="pending">A receber do cliente</option><option value="paid">Recebido</option></select><small>Use “A receber” para confirmar depois no painel.</small></label></div></details>
        </div>

        <section>
          <h3>Produtos</h3>
          {manualUnavailableItem && !manualOrder.scheduledFor && <div className="manual-stock-schedule-card" role="status"><AlertCircle size={18}/><div><strong>{manualUnavailableItem.product.name} precisa de reposição</strong><span>Registre como encomenda futura e o estoque só será baixado após a reposição e confirmação.</span></div><button type="button" className="secondary-button" onClick={scheduleManualRestock}>Agendar amanhã</button></div>}
          <div className="manual-product-quick-add">
            <label className="manual-product-quick-add__product">Adicionar produto<select value={manualProductId} onChange={(event) => setManualProductId(event.target.value)}><option value="">Selecione</option>{manualProducts.filter((product) => !manualItems.some((item) => item.productId === product.id)).map((product) => <option key={product.id} value={product.id}>{product.name} · {currency.format(product.promotionalPrice ?? product.price)}{product.availabilityStatus !== 'available' || product.stockStatus === 'unavailable' ? ' · encomenda' : ''}</option>)}</select></label>
            <label className="manual-product-quick-add__quantity">Qtd.<input type="number" min="1" max="99" value={manualQuantityDraft} onChange={(event) => setManualQuantityDraft(Math.max(1, Math.min(99, Number(event.target.value) || 1)))} /></label>
            <button className="secondary-button" type="button" onClick={addManualProduct} disabled={!manualProductId}><Plus size={15}/>Adicionar</button>
          </div>
          <small className="manual-product-quick-add__hint">Escolha o produto e a quantidade uma única vez. Você pode ajustar opções e quantidades abaixo.</small>
          {!manualItems.length ? <p>Nenhum produto selecionado.</p> : manualItems.map((item) => {
            const product = products.find((current) => current.id === item.productId);
            if (!product) return null;
            return <fieldset key={item.productId}>
              <legend>{product.name}</legend>
              <div className="form-grid">
                <label>Quantidade<input type="number" min="1" max="99" value={item.quantity} onChange={(event) => updateManualItem(item.productId, { quantity: Math.max(1, Math.min(99, Number(event.target.value) || 1)) })}/></label>
                <div><strong>{currency.format(roundMoney(((product.promotionalPrice ?? product.price) + item.options.reduce((sum, option) => { const group = product.optionGroups.find((current) => current.id === option.groupId); const choice = group?.items.find((current) => current.id === option.itemId); return sum + (choice?.priceDelta || 0) * option.quantity; }, 0)) * item.quantity))}</strong><br/><button type="button" className="secondary-button" onClick={() => setManualItems((items) => items.filter((current) => current.productId !== item.productId))}>Remover item</button></div>
                {product.optionGroups.filter((group) => group.active).map((group) => <label key={group.id} className="full">{group.name}{group.minChoices > 0 ? ' (obrigatório)' : ' (opcional)'}<select multiple={group.maxChoices > 1} value={group.maxChoices > 1 ? item.options.filter((option) => option.groupId === group.id).map((option) => option.itemId) : item.options.find((option) => option.groupId === group.id)?.itemId || ''} onChange={(event) => updateManualOptionGroup(item.productId, group.id, Array.from(event.currentTarget.selectedOptions, (option) => option.value))}>{group.minChoices === 0 && group.maxChoices <= 1 ? <option value="">Sem seleção</option> : null}{group.items.filter((choice) => choice.active).map((choice) => <option key={choice.id} value={choice.id}>{choice.name}{choice.priceDelta ? ` · ${choice.priceDelta > 0 ? '+' : ''}${currency.format(choice.priceDelta)}` : ''}</option>)}</select><small>{group.maxChoices > 1 ? `Selecione até ${group.maxChoices} opções.` : 'Selecione uma opção.'}</small></label>)}
              </div>
            </fieldset>;
          })}
        </section>
        <label>Observação<textarea rows={3} maxLength={500} value={manualOrder.notes || ''} onChange={(event) => setManualOrder((current) => ({ ...current, notes: event.target.value }))} placeholder="Ex.: venda registrada depois do atendimento presencial."/></label>
        <p><strong>Resumo: {manualItems.reduce((sum, item) => sum + item.quantity, 0)} item(ns) · {currency.format(manualSubtotal)}</strong></p>
        <section className="manual-pix-charge-section" aria-label="Cobrança por PIX">
          <label className="manual-pix-charge-toggle"><input type="checkbox" checked={manualPixChargeNow} disabled={manualOrder.paymentMethod !== 'pix' || manualOrder.status === 'cancelled'} onChange={(event) => { const checked = event.target.checked; setManualPixChargeNow(checked); if (checked) setManualOrder((current) => ({ ...current, received: false })); }}/><span><strong>Cobrar agora via PIX</strong><small>Última etapa: gera o QR Code e o PIX Copia e Cola com o valor final. O recebimento continua “A receber” até a conferência.</small></span></label>
          {manualPixChargeNow && manualOrder.paymentMethod === 'pix' && <div className="manual-pix-live-preview"><div><QrCode size={18}/><span><strong>Cobrança via PIX</strong><small>O QR Code e o PIX Copia e Cola usam o valor atualizado do pedido.</small></span></div>{manualPixPreviewPayload ? <div className="manual-pix-live-preview__content">{manualPixPreviewQrCode ? <img src={manualPixPreviewQrCode} alt={`QR Code PIX no valor de ${currency.format(manualSubtotal)}`} /> : manualPixPreviewQrCodeError ? <span className="manual-pix-live-preview__error">{manualPixPreviewQrCodeError}</span> : <span className="manual-pix-result-loading">Gerando QR Code…</span>}<div><strong>{currency.format(manualSubtotal)}</strong><button type="button" className="text-button" onClick={() => void copyText(manualPixPreviewPayload).then(() => { setManualPixCopied(true); window.setTimeout(() => setManualPixCopied(false), 1800); })}><Copy size={14}/>{manualPixCopied ? 'Copiado' : 'Copiar PIX'}</button></div></div> : <div className="manual-pix-live-preview__error">{manualPixPreview.error}</div>}</div>}
        </section>
        <div className="master-modal-actions"><button type="button" className="secondary-button" onClick={() => setManualOrderOpen(false)} disabled={manualSaving}>Cancelar</button><button className="primary-button" type="submit" disabled={manualSaving || !manualItems.length || !manualOrder.customerName.trim()}>{manualSaving ? 'Salvando...' : `Registrar pedido · ${currency.format(manualSubtotal)}`}</button></div>
      </form>
    </div>}
    {manualPixView && <div className="modal-overlay" role="presentation">
      <section className="master-modal manual-pix-result-modal" role="dialog" aria-modal="true" aria-labelledby="manual-pix-result-title">
        <button type="button" className="modal-close" aria-label="Fechar PIX do pedido avulso" onClick={() => setManualPixView(null)}><X/></button>
        <span className="eyebrow">PAGAMENTO DO PEDIDO AVULSO</span>
        <h2 id="manual-pix-result-title">PIX do pedido #{formatOrderNumber(manualPixView.orderNumber)}</h2>
        <p>Use este QR Code ou o PIX Copia e Cola para enviar a cobrança ao cliente. O recebimento ainda deve ser conferido no painel.</p>
        {manualPixView.payload ? <>
          {manualPixQrCode ? <img className="manual-pix-result-qr" src={manualPixQrCode} alt={`QR Code PIX no valor de ${currency.format(manualPixView.total)}`} /> : manualPixQrCodeError ? <div className="manual-pix-live-preview__error">{manualPixQrCodeError}</div> : <div className="manual-pix-result-loading"><QrCode size={18}/>Gerando QR Code…</div>}
          <label className="manual-pix-result-code">PIX Copia e Cola · {currency.format(manualPixView.total)}<div><textarea readOnly rows={4} value={manualPixView.payload}/><button type="button" className="secondary-button" onClick={() => void copyText(manualPixView.payload).then(() => { setManualPixCopied(true); window.setTimeout(() => setManualPixCopied(false), 1800); })}><Copy size={16}/>{manualPixCopied ? 'Copiado' : 'Copiar'}</button></div></label>
        </> : <div className="form-error">{manualPixView.error || 'Configure uma chave PIX ou um PIX Copia e Cola válido nas configurações da loja para gerar a cobrança com valor.'}</div>}
        <div className="master-modal-actions"><button type="button" className="primary-button" onClick={() => setManualPixView(null)}>Concluir</button></div>
      </section>
    </div>}
  </>;
}
