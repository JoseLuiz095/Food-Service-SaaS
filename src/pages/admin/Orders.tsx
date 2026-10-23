import { AlertCircle, AlertTriangle, Ban, CalendarDays, CheckCircle2, ChefHat, ChevronLeft, ChevronRight, CircleDollarSign, Copy, Download, Eye, MessageCircle, Plus, QrCode, RefreshCw, RotateCcw, Search, Share2, ShoppingBag, Slash, Users, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { ErrorState, LoadingState } from '../../components/ui/AsyncState';
import { OrderDetailsModal } from '../../components/admin/OrderDetailsModal';
import { QuantityControl } from '../../components/QuantityControl';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import { stockLocationsApi, type StockLocation, type ProductLocationStock } from '../../services/stockLocationsApi';
import { trackInteraction } from '../../services/interactionTelemetry';
import { currency, formatDateTimeBR, roundMoney } from '../../utils/format';
import type { ManualOrderInput, ManualOrderItemInput, ManualOrderSource, Order, OrderStatus, PaymentMethod } from '../../types';
import { formatOrderNumber } from '../../utils/orderConfirmation';
import { copyText } from '../../utils/clipboard';
import { buildPixPayloadWithAmount } from '../../utils/pix';
import { sharePixQrImage } from '../../utils/pixShare';
import { buildComeBackMessage, buildOrderStatusMessage, buildSalesRecoveryMessage, normalizeWhatsappPhone, openCustomerWhatsapp } from '../../utils/customerSales';
import { downloadCsv } from '../../utils/exportCsv';

const statusOptions: Array<{ value: OrderStatus; label: string }> = [
  { value: 'received', label: 'Recebido' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'preparing', label: 'Em preparação' },
  { value: 'ready', label: 'Pronto' },
  { value: 'out_for_delivery', label: 'Saiu para entrega' },
  { value: 'picked_up', label: 'Retirado' },
  // Os dois estados finais ficam juntos no fim para facilitar a localização
  // no seletor e evitar que um pedido seja encerrado por engano.
  { value: 'delivered', label: 'Entregue' },
  { value: 'cancelled', label: 'Cancelado' },
];
const quickManualStatusOptions = statusOptions.filter((status) => status.value !== 'cancelled');

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

const dateKey = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const parseDateKey = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const formatCalendarDate = (value: string) => parseDateKey(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });

// Retirado é uma etapa operacional: o pedido só sai da fila quando for
// encerrado como Entregue ou Cancelado. Isso mantém o acompanhamento completo
// até a finalização real da venda.
const historyStatuses = new Set<OrderStatus>(['delivered', 'cancelled']);
const isHistoryOrder = (order: Pick<Order, 'status'>) => historyStatuses.has(order.status);

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
type ManualOrderMode = 'quick' | 'scheduled';
type SavedOrderFilter = { id: string; name: string; query: string; status: 'all' | OrderStatus; payment: 'all' | 'pending' | 'paid'; sort: SortMode; scheduledDate: string | null };
const newManualOrder = (): Omit<ManualOrderInput, 'items'> => ({
  customerName: 'Venda anônima', customerPhone: '', fulfillment: 'pickup', source: 'counter', paymentMethod: 'pix', status: 'delivered', received: false, notes: '',
});

export default function OrdersAdmin() {
  const { orders, products, loading, error, reloadAdmin, reloadOrders, updateOrderStatus, updateOrderStatuses, updateOrderDetails, confirmOrderPayment, createManualOrder, settings } = useStore();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [sortBy, setSortBy] = useState<SortMode>('newest');
  const [calendarMonth, setCalendarMonth] = useState(() => { const date = new Date(); return new Date(date.getFullYear(), date.getMonth(), 1); });
  const [scheduledDateFilter, setScheduledDateFilter] = useState<string | null>(null);
  const [paymentStatusDrafts, setPaymentStatusDrafts] = useState<Record<string, OrderStatus>>({});
  const [statusDrafts, setStatusDrafts] = useState<Record<string, OrderStatus>>({});
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [batchSaving, setBatchSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [dismissedRecoveryIds, setDismissedRecoveryIds] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [refreshError, setRefreshError] = useState('');
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null);
  const [notifyOrderId, setNotifyOrderId] = useState<string | null>(null);
  const [manualOrderOpen, setManualOrderOpen] = useState(false);
  const [stockLocations, setStockLocations] = useState<StockLocation[]>([]);
  const [locationBalances, setLocationBalances] = useState<ProductLocationStock[]>([]);
  const [manualLocationId, setManualLocationId] = useState('');
  const [manualRequestId, setManualRequestId] = useState(() => crypto.randomUUID());
  const [manualOrderMode, setManualOrderMode] = useState<ManualOrderMode>('quick');
  const [manualOrder, setManualOrder] = useState<Omit<ManualOrderInput, 'items'>>(newManualOrder);
  const [manualItems, setManualItems] = useState<ManualOrderItemInput[]>([]);
  const [manualProductId, setManualProductId] = useState('');
  const [manualQuantityDraft, setManualQuantityDraft] = useState(1);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualPixView, setManualPixView] = useState<ManualPixView | null>(null);
  const [manualPixQrCode, setManualPixQrCode] = useState('');
  const [manualPixQrCodeError, setManualPixQrCodeError] = useState('');
  const [paymentPixView, setPaymentPixView] = useState<ManualPixView | null>(null);
  const [paymentPixQrCode, setPaymentPixQrCode] = useState('');
  const [paymentPixQrCodeError, setPaymentPixQrCodeError] = useState('');
  const [paymentPixCopied, setPaymentPixCopied] = useState(false);
  const [sharingPix, setSharingPix] = useState(false);
  const [detailsOrderId, setDetailsOrderId] = useState<string | null>(null);
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [manualPixPreviewQrCode, setManualPixPreviewQrCode] = useState('');
  const [manualPixPreviewQrCodeError, setManualPixPreviewQrCodeError] = useState('');
  const [manualPixChargeNow, setManualPixChargeNow] = useState(false);
  const [manualPixCopied, setManualPixCopied] = useState(false);
  const [manualFormError, setManualFormError] = useState('');
  const [savedFilters, setSavedFilters] = useState<SavedOrderFilter[]>([]);
  const [saveFilterName, setSaveFilterName] = useState('');
  const [showSaveFilter, setShowSaveFilter] = useState(false);
  const refreshingRef = useRef(false);
  const rowsRef = useRef<Record<string, HTMLElement | null>>({});
  const mobileRowsRef = useRef<Record<string, HTMLElement | null>>({});
  const highlightedOrderId = searchParams.get('highlight') || '';
  const recoveryStorageKey = `foodweb:orders-recovery-dismissed:${settings.id}`;
  const savedFiltersStorageKey = `foodweb:orders-filters:${settings.id}`;
  const reportManualError = (message: string) => {
    setManualFormError(message);
    showToast(`Pedido avulso não salvo: ${message}`, 'error');
  };

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

  useEffect(() => {
    let cancelled = false;
    if (!paymentPixView?.payload) {
      setPaymentPixQrCode('');
      setPaymentPixQrCodeError('');
      return () => { cancelled = true; };
    }
    setPaymentPixQrCodeError('');
    void QRCode.toDataURL(paymentPixView.payload, { errorCorrectionLevel: 'M', margin: 2, width: 420 })
      .then((dataUrl) => { if (!cancelled) setPaymentPixQrCode(dataUrl); })
      .catch(() => { if (!cancelled) { setPaymentPixQrCode(''); setPaymentPixQrCodeError('O QR Code não pôde ser desenhado neste aparelho. Use o PIX Copia e Cola abaixo.'); } });
    return () => { cancelled = true; };
  }, [paymentPixView?.payload]);

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
    void stockLocationsApi.list(settings.id).then(([locations, balances]) => {
      setStockLocations(locations.filter((location) => location.active));
      setLocationBalances(balances);
      setManualLocationId((current) => current || locations.find((location) => location.is_default)?.id || locations[0]?.id || '');
    }).catch(() => reportManualError('Não foi possível carregar os estoques. Atualize a página e tente novamente.'));

    setManualOrder(newManualOrder());
    setManualOrderMode('quick');
    setManualItems([]);
    setManualProductId(manualProducts[0]?.id || '');
    setManualQuantityDraft(1);
    setManualPixChargeNow(true);
    setManualFormError('');
    setManualOrderOpen(true);
  };

  const changeManualOrderMode = (mode: ManualOrderMode) => {
    setManualOrderMode(mode);
    setManualFormError('');
    if (mode === 'quick') {
      setManualOrder((current) => ({ ...current, customerName: 'Venda anônima', customerPhone: '', fulfillment: 'pickup', scheduledFor: undefined, source: 'counter', status: 'delivered', received: false, notes: '' }));
      setManualPixChargeNow(manualOrder.paymentMethod === 'pix');
      return;
    }
    setManualOrder((current) => ({ ...current, customerName: current.customerName === 'Venda anônima' ? '' : current.customerName, status: 'received', received: false }));
    setManualPixChargeNow(false);
  };

  const addManualProduct = () => {
    if (!manualProductId || manualItems.some((item) => item.productId === manualProductId)) return;
    const quantity = Math.max(1, Math.min(99, Number(manualQuantityDraft) || 1));
    const product = manualProducts.find((current) => current.id === manualProductId);
    const needsFutureSchedule = product ? productNeedsFutureScheduling(product, quantity) : false;
    setManualItems((items) => [...items, { productId: manualProductId, quantity, options: [] }]);
    // Produtos pré-produzidos podem começar em um status operacional próprio.
    // Aplicamos a sugestão apenas no primeiro item para não sobrescrever uma
    // escolha manual quando o lançamento tiver produtos diferentes.
    if (!manualItems.length && product?.defaultOrderStatus) {
      setManualOrder((current) => ({ ...current, status: product.defaultOrderStatus!, received: product.defaultOrderStatus === 'cancelled' ? false : current.received }));
    }
    // Ao adicionar um item sem saldo, já preparamos a encomenda para amanhã.
    // O operador ainda pode ajustar o horário, mas não precisa descobrir a
    // regra de estoque depois de preencher todo o lançamento.
    if (needsFutureSchedule) {
      setManualOrderMode('scheduled');
      setManualOrder((current) => current.scheduledFor ? current : {
        ...current,
        customerName: current.customerName === 'Venda anônima' ? '' : current.customerName,
        status: 'received',
        received: false,
        scheduledFor: localDateTimeInputValue(current.fulfillment === 'delivery' ? nextDeliveryWindow(settings.deliveryStartTime) : tomorrowStart()),
      });
      setManualPixChargeNow(false);
    }
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
    const customerName = manualOrderMode === 'quick' ? 'Venda anônima' : manualOrder.customerName.trim();
    if (!customerName || !manualItems.length) return;
    if (!manualLocationId) { reportManualError('Selecione um estoque para registrar esta venda.'); return; }
    const insufficientAtLocation = manualItems.find((item) => {
      const product = products.find((candidate) => candidate.id === item.productId);
      if (!product?.trackStock) return false;
      const balance = locationBalances.find((row) => row.product_id === item.productId && row.location_id === manualLocationId);
      return !balance || Number(balance.stock_quantity) - Number(balance.stock_reserved_quantity) < item.quantity;
    });
    if (insufficientAtLocation && manualOrderMode === 'quick') { reportManualError('Saldo insuficiente no estoque escolhido. Selecione outro ponto ou registre uma encomenda.'); return; }
    if (manualOrder.status === 'cancelled' && manualOrder.received) return;
    if (manualOrder.fulfillment === 'delivery' && !settings.deliveryEnabled) {
      reportManualError('O delivery está desativado nas configurações da loja. Selecione retirada ou ative o delivery.');
      return;
    }
    const scheduledAt = manualOrder.scheduledFor ? new Date(manualOrder.scheduledFor) : null;
    const minimumSchedule = manualOrder.fulfillment === 'delivery' ? nextDeliveryWindow(settings.deliveryStartTime) : tomorrowStart();
    if (scheduledAt && (!Number.isFinite(scheduledAt.getTime()) || scheduledAt < minimumSchedule)) {
      reportManualError(manualOrder.fulfillment === 'delivery'
        ? `O delivery futuro precisa ser agendado a partir de amanhã às ${settings.deliveryStartTime || '18:00'}.`
        : 'A retirada futura precisa ser agendada a partir de amanhã.');
      return;
    }
    if (manualOrder.fulfillment === 'delivery' && !scheduledAt && settings.deliveryStartTime) {
      const [startHour, startMinute] = settings.deliveryStartTime.split(':').map(Number);
      const now = new Date();
      if (now.getHours() * 60 + now.getMinutes() < startHour * 60 + startMinute) {
        reportManualError(`O delivery só pode ser lançado a partir das ${settings.deliveryStartTime}. Para antes desse horário, selecione retirada ou agende para amanhã.`);
        return;
      }
    }
    const unavailableItem = manualItems.find((item) => {
      const product = products.find((current) => current.id === item.productId);
      return !product || productNeedsFutureScheduling(product, item.quantity);
    });
    if (unavailableItem && manualOrder.received) {
      reportManualError('Este produto precisa de reposição. Mantenha “A receber do cliente” e confirme o pagamento somente depois que o estoque for reposto.');
      return;
    }
    if (unavailableItem && !scheduledAt) {
      reportManualError('Há produto sem disponibilidade ou estoque suficiente. Informe uma data a partir de amanhã para registrar como encomenda futura.');
      return;
    }
    const incompleteProduct = manualItems.find((item) => {
      const product = products.find((current) => current.id === item.productId);
      return product?.optionGroups.some((group) => group.active && new Set(item.options.filter((option) => option.groupId === group.id).map((option) => option.itemId)).size < group.minChoices);
    });
    if (incompleteProduct) {
      reportManualError('Revise as opções obrigatórias dos produtos selecionados.');
      return;
    }
    if (manualOrder.paymentMethod === 'pix' && manualPixChargeNow && !manualPixPreviewPayload) {
      reportManualError(manualPixPreview.error || 'Configure o PIX da loja antes de cobrar agora.');
      return;
    }
    setManualFormError('');
    setManualSaving(true);
    try {
      const result = await trackInteraction('manual_order_create', () => createManualOrder({ ...manualOrder, customerName, items: manualItems, stockLocationId: manualLocationId, requestId: manualRequestId }), { storeId: settings.id });
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
      reportManualError(manualOrderError instanceof Error ? manualOrderError.message : 'Não foi possível lançar o pedido avulso.');
    } finally {
      setManualSaving(false);
    }
  };

  const openPaymentPix = (order: Order) => {
    if (order.paymentMethod !== 'pix') return;
    let payload = '';
    let pixError = '';
    try {
      payload = buildPixPayloadWithAmount({
        receiptMode: settings.pixReceiptMode,
        copyPaste: settings.pixCopyPaste,
        key: settings.pixKey,
        receiver: settings.pixReceiver,
        city: settings.city || 'Linhares',
        amount: order.total,
        txid: `PED${order.orderNumber}`,
      });
    } catch (error) {
      pixError = error instanceof Error ? error.message : 'Não foi possível gerar o PIX com valor.';
    }
    setPaymentPixView({ orderNumber: order.orderNumber, total: order.total, payload, error: pixError || undefined });
    setPaymentPixCopied(false);
  };

  const sharePix = async (view: ManualPixView, qrCode: string) => {
    if (!qrCode || sharingPix) return;
    setSharingPix(true);
    const text = `Pagamento PIX do pedido #${formatOrderNumber(view.orderNumber)}\nValor: ${currency.format(view.total)}\n\nPIX Copia e Cola:\n${view.payload}`;
    try {
      const result = await sharePixQrImage({
        dataUrl: qrCode,
        title: `PIX do pedido #${formatOrderNumber(view.orderNumber)}`,
        text,
        fileName: `pix-pedido-${formatOrderNumber(view.orderNumber)}.png`,
      });
      if (result === 'image') showToast('QR Code e instruções prontos para compartilhar.', 'success');
      else if (result === 'text') showToast('Compartilhamento de texto aberto; este aparelho não aceita imagem.', 'success');
      else {
        await copyText(text);
        showToast('PIX Copia e Cola copiado. O navegador não oferece compartilhamento.', 'success');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      try {
        await copyText(text);
        showToast('Compartilhamento cancelado; PIX Copia e Cola copiado.', 'success');
      } catch {
        showToast('Não foi possível compartilhar o QR Code.', 'error');
      }
    } finally {
      setSharingPix(false);
    }
  };

  const saveOrderDetails = async (input: Parameters<typeof updateOrderDetails>[1]) => {
    if (!detailsOrderId) return;
    setDetailsSaving(true);
    try {
      await updateOrderDetails(detailsOrderId, input);
      setLastUpdatedAt(new Date());
      showToast('Dados do pedido atualizados.', 'success');
    } catch (detailsError) {
      showToast(detailsError instanceof Error ? detailsError.message : 'Não foi possível editar o pedido.', 'error');
      throw detailsError;
    } finally {
      setDetailsSaving(false);
    }
  };

  const cancelOrderFromDetails = async (orderId: string) => {
    const cancelled = await changeStatus(orderId, 'cancelled');
    if (cancelled) {
      setLastUpdatedAt(new Date());
      showToast('Pedido cancelado e estoque reservado liberado.', 'success');
    }
    return cancelled;
  };

  const cancelOrderFromPaymentCard = async (orderId: string) => {
    const order = orders.find((current) => current.id === orderId);
    if (!order || !window.confirm(`Cancelar o pedido #${formatOrderNumber(order.orderNumber)}? O estoque reservado será liberado.`)) return;
    await cancelOrderFromDetails(orderId);
  };

  const refreshOrders = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await reloadOrders({ silent: true });
      setLastUpdatedAt(new Date());
      setRefreshError('');
    } catch (refreshError) {
      console.error('Não foi possível atualizar os pedidos em segundo plano:', refreshError);
      setRefreshError('Falha ao atualizar pedidos. Os dados exibidos podem estar desatualizados.');
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [reloadOrders]);

  const changeStatus = async (orderId: string, status: OrderStatus) => {
    setUpdatingId(orderId);
    try {
      await trackInteraction('order_status_update', () => updateOrderStatus(orderId, status), { storeId: settings.id });
      setLastUpdatedAt(new Date());
      return true;
    } catch (statusError) {
      showToast(statusError instanceof Error ? statusError.message : 'Não foi possível atualizar o pedido.', 'error');
      return false;
    } finally {
      setUpdatingId(null);
    }
  };

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrderIds((current) => current.includes(orderId)
      ? current.filter((id) => id !== orderId)
      : [...current, orderId]);
  };

  const setOrderStatusDraft = (order: Order, status: OrderStatus) => {
    setStatusDrafts((current) => {
      const next = { ...current };
      if (status === order.status) delete next[order.id];
      else next[order.id] = status;
      return next;
    });
    setSelectedOrderIds((current) => current.includes(order.id) ? current : [...current, order.id]);
  };

  const pendingStatusChanges = useMemo(() => selectedOrderIds
    .map((orderId) => {
      const order = orders.find((current) => current.id === orderId);
      const status = order ? statusDrafts[order.id] : undefined;
      return order && status && status !== order.status ? { orderId: order.id, status } : null;
    })
    .filter((item): item is { orderId: string; status: OrderStatus } => Boolean(item)), [orders, selectedOrderIds, statusDrafts]);

  const discardStatusDrafts = () => {
    setStatusDrafts({});
    setSelectedOrderIds([]);
  };

  const saveStatusBatch = async () => {
    if (!pendingStatusChanges.length || batchSaving) return;
    setBatchSaving(true);
    try {
      await trackInteraction('order_status_batch_update', () => updateOrderStatuses(pendingStatusChanges), { storeId: settings.id });
      const count = pendingStatusChanges.length;
      setStatusDrafts({});
      setSelectedOrderIds([]);
      setLastUpdatedAt(new Date());
      showToast(`${count} ${count === 1 ? 'pedido atualizado' : 'pedidos atualizados'} com sucesso.`, 'success');
    } catch (batchError) {
      showToast(batchError instanceof Error ? batchError.message : 'Não foi possível salvar os status selecionados.', 'error');
    } finally {
      setBatchSaving(false);
    }
  };

  useEffect(() => {
    // Limpa seleções de pedidos que saíram do resultado ou já foram
    // atualizados por outra ação para não manter um rodapé obsoleto.
    const availableIds = new Set(orders.map((order) => order.id));
    setSelectedOrderIds((current) => current.filter((id) => availableIds.has(id)));
    setStatusDrafts((current) => Object.fromEntries(Object.entries(current).filter(([id]) => availableIds.has(id))));
  }, [orders]);

  const changeStatusWithCustomerDraft = async (order: Order, status: OrderStatus) => {
    if (order.status === status) return;
    const changed = await changeStatus(order.id, status);
    if (changed && settings.kdsNotifyCustomer && order.customerPhone) setNotifyOrderId(order.id);
  };

  const operationalStatuses = (order: Order) => statusOptions.filter((option) => order.deliveryType === 'delivery'
    ? option.value !== 'picked_up'
    : option.value !== 'out_for_delivery');

  const confirmPayment = async (orderId: string, orderNumber: number, total: number, nextStatus?: OrderStatus) => {
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
      if (nextStatus && order && nextStatus !== order.status) {
        await trackInteraction('order_status_update_after_payment', () => updateOrderStatus(orderId, nextStatus), { storeId: settings.id });
      }
      setLastUpdatedAt(new Date());
    } catch (paymentError) {
      showToast(paymentError instanceof Error ? paymentError.message : 'Não foi possível confirmar o recebimento.', 'error');
    } finally {
      setConfirmingPaymentId(null);
    }
  };

  useEffect(() => { if (!loading && !lastUpdatedAt) setLastUpdatedAt(new Date()); }, [loading, lastUpdatedAt]);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(recoveryStorageKey);
      const parsed = stored ? JSON.parse(stored) : [];
      setDismissedRecoveryIds(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []);
    } catch {
      setDismissedRecoveryIds([]);
    }
  }, [recoveryStorageKey]);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(savedFiltersStorageKey);
      const parsed = stored ? JSON.parse(stored) : [];
      setSavedFilters(Array.isArray(parsed) ? parsed.filter((item): item is SavedOrderFilter => Boolean(item && typeof item.id === 'string' && typeof item.name === 'string')).slice(0, 8) : []);
    } catch {
      setSavedFilters([]);
    }
  }, [savedFiltersStorageKey]);
  useEffect(() => {
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshOrders(); }, 15000);
    const onFocus = () => void refreshOrders();
    const onVisibility = () => { if (document.visibilityState === 'visible') void refreshOrders(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisibility); };
  }, [refreshOrders]);
  useEffect(() => { const interval = window.setInterval(() => setNowTick(Date.now()), 60_000); return () => window.clearInterval(interval); }, []);

  const scheduledCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const order of orders) {
      // A agenda serve apenas a operação ativa; pedidos entregues/cancelados
      // continuam acessíveis no histórico, mas não poluem a contagem do dia.
      if (!order.scheduledFor || isHistoryOrder(order)) continue;
      const date = new Date(order.scheduledFor);
      if (!Number.isFinite(date.getTime())) continue;
      const key = dateKey(date);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [orders]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const gridStart = new Date(firstDay);
    gridStart.setDate(firstDay.getDate() - firstDay.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return { date, key: dateKey(date), inMonth: date.getMonth() === calendarMonth.getMonth(), count: scheduledCounts.get(dateKey(date)) || 0 };
    });
  }, [calendarMonth, scheduledCounts]);

  const filtered = useMemo(() => {
    const term = query.toLowerCase().trim();
    const list = orders.filter((order) => {
      const searchable = `${order.customerName} ${order.customerPhone ?? ''} ${order.customerInstagram ?? ''} ${order.acquisitionSource ?? ''} ${order.id} ${order.orderNumber}`.toLowerCase();
      return (!term || searchable.includes(term))
        && (statusFilter === 'all' || order.status === statusFilter)
        && (paymentFilter === 'all' || order.paymentStatus === paymentFilter)
        && (!scheduledDateFilter || (!isHistoryOrder(order) && order.scheduledFor && dateKey(new Date(order.scheduledFor)) === scheduledDateFilter));
    });
    return [...list].sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortBy === 'total_desc') return b.total - a.total;
      if (sortBy === 'total_asc') return a.total - b.total;
      if (sortBy === 'customer_asc') return a.customerName.localeCompare(b.customerName, 'pt-BR');
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [orders, paymentFilter, query, scheduledDateFilter, statusFilter, sortBy]);

  const activeOrders = useMemo(() => filtered.filter((order) => !isHistoryOrder(order)), [filtered]);
  const pendingOrders = useMemo(() => activeOrders.filter((order) => order.paymentStatus !== 'paid'), [activeOrders]);
  const processingOrders = useMemo(() => activeOrders.filter((order) => order.paymentStatus === 'paid'), [activeOrders]);
  const historyOrders = useMemo(() => filtered.filter((order) => isHistoryOrder(order)), [filtered]);
  const overdueOrders = useMemo(() => orders.filter((order) => {
    if (isHistoryOrder(order) || !order.scheduledFor) return false;
    const scheduledAt = new Date(order.scheduledFor).getTime();
    return Number.isFinite(scheduledAt) && scheduledAt < nowTick;
  }).sort((a, b) => new Date(a.scheduledFor || 0).getTime() - new Date(b.scheduledFor || 0).getTime()), [nowTick, orders]);

  useEffect(() => {
    // Se o operador escolheu um status terminal, abrir o histórico torna o
    // resultado do filtro imediatamente visível, inclusive no celular.
    if (statusFilter !== 'all' && historyStatuses.has(statusFilter)) setHistoryOpen(true);
  }, [statusFilter]);

  useEffect(() => {
    // Uma busca que só encontra pedidos arquivados não deve parecer vazia.
    if (query.trim() && !activeOrders.length && historyOrders.length) setHistoryOpen(true);
  }, [activeOrders.length, historyOrders.length, query]);

  const awaitingPaymentOrders = useMemo(() => orders
    .filter((order) => order.paymentStatus !== 'paid' && order.status !== 'cancelled' && (!scheduledDateFilter || (order.scheduledFor && dateKey(new Date(order.scheduledFor)) === scheduledDateFilter)))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, 12), [orders, scheduledDateFilter]);
  const detailsOrder = detailsOrderId ? orders.find((order) => order.id === detailsOrderId) || null : null;
  const scheduledFilterLabel = scheduledDateFilter ? formatCalendarDate(scheduledDateFilter) : '';

  const moveCalendarMonth = (offset: number) => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  const clearScheduledFilter = () => setScheduledDateFilter(null);

  const saveCurrentFilter = () => {
    const name = saveFilterName.trim();
    if (!name) {
      showToast('Dê um nome para salvar este filtro.', 'error');
      return;
    }
    const filter: SavedOrderFilter = { id: `${Date.now()}`, name, query, status: statusFilter, payment: paymentFilter, sort: sortBy, scheduledDate: scheduledDateFilter };
    setSavedFilters((current) => {
      const next = [filter, ...current.filter((item) => item.name.toLocaleLowerCase('pt-BR') !== name.toLocaleLowerCase('pt-BR'))].slice(0, 8);
      try { window.localStorage.setItem(savedFiltersStorageKey, JSON.stringify(next)); } catch { /* filtros continuam disponíveis nesta sessão */ }
      return next;
    });
    setSaveFilterName('');
    setShowSaveFilter(false);
    showToast('Filtro salvo neste aparelho.', 'success');
  };

  const applySavedFilter = (filter: SavedOrderFilter) => {
    setQuery(filter.query || '');
    setStatusFilter(filter.status || 'all');
    setPaymentFilter(filter.payment || 'all');
    setSortBy(filter.sort || 'newest');
    setScheduledDateFilter(filter.scheduledDate || null);
  };

  const removeSavedFilter = (id: string) => {
    setSavedFilters((current) => {
      const next = current.filter((item) => item.id !== id);
      try { window.localStorage.setItem(savedFiltersStorageKey, JSON.stringify(next)); } catch { /* armazenamento local pode estar bloqueado */ }
      return next;
    });
  };

  const exportFilteredOrders = () => {
    if (!filtered.length) {
      showToast('Não há pedidos neste filtro para exportar.', 'error');
      return;
    }
    downloadCsv(`pedidos-${dateKey(new Date())}`, ['Pedido', 'Criado em', 'Cliente', 'Telefone', 'Origem', 'Entrega', 'Agendamento', 'Pagamento', 'Status', 'Total', 'Produtos'], filtered.map((order) => [
      `#${formatOrderNumber(order.orderNumber)}`,
      formatDateTimeBR(order.createdAt),
      order.customerName,
      order.customerPhone || '',
      order.source ? orderSourceLabel[order.source] : 'Site',
      order.deliveryType === 'delivery' ? 'Delivery' : 'Retirada',
      order.scheduledFor ? formatDateTimeBR(order.scheduledFor) : '',
      paymentLabel[order.paymentMethod],
      statusLabel[order.status],
      currency.format(order.total),
      order.items?.map((item) => `${item.quantity}x ${item.productName}`).join(' | ') || '',
    ]));
    showToast(`${filtered.length} pedido${filtered.length === 1 ? '' : 's'} exportado${filtered.length === 1 ? '' : 's'}.`, 'success');
  };

  const recoveryOrders = useMemo(() => {
    const now = Date.now();
    return orders.filter((order) => {
      const age = now - new Date(order.createdAt).getTime();
      return settings.salesRecoveryEnabled && !dismissedRecoveryIds.includes(order.id) && Boolean(order.customerPhone) && order.status === 'received' && !order.whatsappClickedAt && age >= settings.salesRecoveryMinutes * 60_000 && age <= (settings.salesRecoveryWindowHours ?? 48) * 60 * 60_000;
    }).slice(0, 12);
  }, [dismissedRecoveryIds, orders, settings.salesRecoveryEnabled, settings.salesRecoveryMinutes, settings.salesRecoveryWindowHours]);

  const dismissRecoveryOrder = (orderId: string) => {
    setDismissedRecoveryIds((current) => {
      const next = [...new Set([...current, orderId])];
      try { window.localStorage.setItem(recoveryStorageKey, JSON.stringify(next)); } catch { /* armazenamento local pode estar bloqueado */ }
      return next;
    });
  };

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
    if (isHistoryOrder(highlightedOrder)) setHistoryOpen(true);
    const timer = window.setTimeout(() => (rowsRef.current[highlightedOrderId] || mobileRowsRef.current[highlightedOrderId])?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 180);
    return () => window.clearTimeout(timer);
  }, [highlightedOrderId, orders]);

  const whatsappButton = (order: Order, kind: 'status' | 'recovery') => (
    <button type="button" className={`order-whatsapp-action-v061 ${kind === 'status' && notifyOrderId === order.id ? 'is-recommended-v063' : ''}`} disabled={!order.customerPhone} onClick={() => { openCustomerWhatsapp(order.customerPhone, kind === 'recovery' ? buildSalesRecoveryMessage(settings.name, order, settings.messageTemplates) : buildOrderStatusMessage(settings.name, order, settings.messageTemplates)); if (kind === 'status') setNotifyOrderId(null); }}>
      <MessageCircle size={15}/>{kind === 'recovery' ? 'Recuperar venda' : notifyOrderId === order.id ? 'Enviar atualização' : 'Avisar cliente'}
    </button>
  );

  const renderDesktopOrder = (order: Order) => {
    const highlighted = order.id === highlightedOrderId;
    const draftStatus = statusDrafts[order.id] || order.status;
    const selected = selectedOrderIds.includes(order.id);
    return <tr key={`desktop-${order.id}`} ref={(node) => { rowsRef.current[order.id] = node; }} className={highlighted ? 'order-row-highlighted' : ''}>
      <td><label className="order-select-checkbox"><input type="checkbox" checked={selected} onChange={() => toggleOrderSelection(order.id)} aria-label={`Selecionar pedido ${order.orderNumber || order.id}`} /><span><strong>#{order.orderNumber ? formatOrderNumber(order.orderNumber) : order.id.slice(0, 8)}</strong></span></label><small className="order-fee-note">{orderSourceLabel[order.source || 'site']}</small>{order.whatsappClickedAt ? <small className="order-fee-note">WhatsApp aberto</small> : null}{highlighted ? <small>Pedido vindo do Financeiro</small> : null}</td>
      <td><div className="order-customer"><strong>{order.customerName}</strong><span>{order.customerPhone || 'Sem telefone informado'}</span>{order.acquisitionSource ? <small>Origem: {({ instagram: 'Instagram', whatsapp: 'WhatsApp', google: 'Google', indicacao: 'Indicação', outro: 'Outro' } as const)[order.acquisitionSource]}</small> : null}{order.customerInstagram ? <small>{order.customerInstagram}</small> : null}</div></td>
      <td><div className="order-customer"><strong>{order.deliveryType === 'delivery' ? 'Delivery' : 'Retirada'}</strong>{order.deliveryType === 'delivery' && order.deliveryZoneName ? <span>{order.deliveryZoneName}{order.deliveryFee ? ` · ${currency.format(order.deliveryFee)}` : ''}</span> : null}{order.scheduledFor ? <span>Agendado: {formatDateTimeBR(order.scheduledFor)}</span> : null}{order.preparationEstimateMinutes ? <span>Estimativa: até {order.preparationEstimateMinutes} min</span> : null}</div></td>
      <td><div className="order-customer"><strong>{paymentLabel[order.paymentMethod]}</strong>{order.paymentMethod === 'cash' && order.needsChange && order.changeFor ? <span>Troco para {currency.format(order.changeFor)}</span> : null}</div></td>
      <td><strong>{currency.format(order.total)}</strong>{order.deliveryFee ? <small className="order-fee-note">inclui {currency.format(order.deliveryFee)} de entrega</small> : null}</td>
       <td>{order.paymentStatus === 'paid' ? <span className="order-payment-received"><CheckCircle2 size={15}/><span><strong>Recebido</strong>{order.paymentReceivedAt ? <small>{formatDateTimeBR(order.paymentReceivedAt)}</small> : null}</span></span> : order.status === 'cancelled' ? <span className="order-payment-cancelled">Pedido cancelado</span> : <><span className="order-payment-pending"><CircleDollarSign size={15}/><strong>A receber do cliente</strong></span><small className={`order-inventory-note order-inventory-note--${order.inventoryStatus || 'not_tracked'}`}>{order.inventoryStatus === 'awaiting_restock' ? 'Aguardando reposição' : order.inventoryStatus === 'reserved' ? 'Estoque reservado' : order.inventoryStatus === 'committed' ? 'Estoque baixado' : 'A confirmação fica na área Financeiro acima.'}</small></>}</td>
       <td><div className="order-status-actions-v061"><label className={`order-status-control order-status-control--${draftStatus} ${statusDrafts[order.id] ? 'is-draft' : ''}`}><span>{statusDrafts[order.id] ? 'Alteração pendente' : statusLabel[order.status]}</span><select value={draftStatus} disabled={batchSaving || updatingId === order.id} onChange={(event) => setOrderStatusDraft(order, event.target.value as OrderStatus)} aria-label={`Status do pedido ${order.orderNumber || order.id}`}>{operationalStatuses(order).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>{settings.kdsNotifyCustomer && order.customerPhone && whatsappButton(order, 'status')}</div></td>
      <td>{formatDateTimeBR(order.createdAt)}</td>
       <td><button type="button" className="order-inline-action" onClick={() => setDetailsOrderId(order.id)}><Eye size={14}/>Detalhes</button></td>
    </tr>;
  };

  const renderMobileOrder = (order: Order) => {
    const highlighted = order.id === highlightedOrderId;
    const awaitingPayment = order.paymentStatus !== 'paid' && order.status !== 'cancelled';
    const draftStatus = statusDrafts[order.id] || order.status;
    const selected = selectedOrderIds.includes(order.id);
    return <article key={`mobile-${order.id}`} className={`orders-mobile-card ${highlighted ? 'order-row-highlighted' : ''}`} ref={(node) => { mobileRowsRef.current[order.id] = node; }}>
      <div className="orders-mobile-card__top"><label className="order-select-checkbox"><input type="checkbox" checked={selected} onChange={() => toggleOrderSelection(order.id)} aria-label={`Selecionar pedido ${order.orderNumber || order.id}`} /><strong>#{order.orderNumber ? formatOrderNumber(order.orderNumber) : order.id.slice(0, 8)}</strong></label><span>{formatDateTimeBR(order.createdAt)}</span></div>
      <div className="orders-mobile-card__customer"><strong>{order.customerName}</strong><span>{order.customerPhone || 'Sem telefone informado'}</span>{order.customerInstagram ? <small>{order.customerInstagram}</small> : null}</div>
      <div className="orders-mobile-card__facts"><span><small>Recebimento</small><strong>{order.deliveryType === 'delivery' ? 'Delivery' : 'Retirada'}</strong>{order.scheduledFor ? <em>Agendado: {formatDateTimeBR(order.scheduledFor)}</em> : null}</span><span><small>Pagamento</small><strong>{paymentLabel[order.paymentMethod]}</strong><strong className="orders-mobile-card__total">{currency.format(order.total)}</strong></span></div>
       <div className="orders-mobile-card__status"><label><small>{statusDrafts[order.id] ? 'Alteração pendente' : 'Status do pedido'}</small><select className={statusDrafts[order.id] ? 'is-draft' : ''} value={draftStatus} disabled={batchSaving || updatingId === order.id} onChange={(event) => setOrderStatusDraft(order, event.target.value as OrderStatus)} aria-label={`Status do pedido ${order.orderNumber || order.id}`}>{operationalStatuses(order).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>{awaitingPayment ? <span className="orders-mobile-card__payment-pending"><CircleDollarSign size={15}/>A confirmar no Financeiro</span> : <span className="orders-mobile-card__received"><CheckCircle2 size={15}/>{order.status === 'cancelled' ? 'Pedido cancelado' : 'Pagamento recebido'}</span>}</div>
       <div className="orders-mobile-card__actions"><button type="button" className="order-inline-action" onClick={() => setDetailsOrderId(order.id)}><Eye size={14}/>Ver detalhes e editar</button></div>
    </article>;
  };

  const renderOrderCollection = (collection: Order[], label: string) => <div className="orders-collection" aria-label={label}>
    <div className="responsive-table orders-desktop-table"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Entrega / retirada</th><th>Pagamento</th><th>Total</th><th>Recebimento</th><th>Status</th><th>Criado em</th><th>Ações</th></tr></thead><tbody>{collection.map(renderDesktopOrder)}</tbody></table></div>
    <div className="orders-mobile-list" aria-label={`${label} em formato compacto`}>{collection.map(renderMobileOrder)}</div>
  </div>;

  if (loading) return <LoadingState label="Carregando pedidos..." />;
  if (error) return <ErrorState message={error} onRetry={() => void reloadAdmin()} />;

  return <>
    <div className="admin-page-title"><div><span className="eyebrow">OPERAÇÃO</span><h1>Pedidos</h1><p>Fila operacional, recuperação de vendas e relacionamento com clientes usando os pedidos já registrados.</p></div><button type="button" className="primary-button" onClick={openManualOrder} disabled={!manualProducts.length}><Plus size={17}/>Lançar pedido avulso</button></div>

    <div className="sales-ops-grid-v061">
      <details className="sales-ops-panel-v061" open={recoveryOpen} onToggle={(event) => setRecoveryOpen(event.currentTarget.open)}>
        <summary><span><RotateCcw size={18}/><strong>Recuperação de vendas</strong></span><b>{recoveryOrders.length}</b></summary>
        <p>Há {recoveryOrders.length} oportunidade{recoveryOrders.length === 1 ? '' : 's'} pendente{recoveryOrders.length === 1 ? '' : 's'}. Expiram após {settings.salesRecoveryWindowHours ?? 48} h. Abra para enviar ou dispensar um teste.</p>
        {recoveryOrders.length ? <div className="sales-ops-list-v061">{recoveryOrders.map((order) => <article key={order.id}><div><strong>#{formatOrderNumber(order.orderNumber)} · {order.customerName}</strong><span>{currency.format(order.total)} · {formatDateTimeBR(order.createdAt)}</span></div><div className="sales-ops-list-v061__actions">{whatsappButton(order, 'recovery')}<button type="button" className="sales-recovery-dismiss" onClick={() => dismissRecoveryOrder(order.id)} aria-label={`Dispensar recuperação do pedido ${formatOrderNumber(order.orderNumber)}`}><X size={14}/>Dispensar</button></div></article>)}</div> : <div className="sales-ops-empty-v061">Nenhuma oportunidade pendente agora.</div>}
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
      {awaitingPaymentOrders.length ? <div className="orders-payment-inbox__list">{awaitingPaymentOrders.map((order) => {
        const nextStatus = paymentStatusDrafts[order.id] || order.status;
        return <article key={order.id}><div><strong>#{formatOrderNumber(order.orderNumber)} · {order.customerName}</strong><span>{paymentLabel[order.paymentMethod]} · {currency.format(order.total)} · {formatDateTimeBR(order.createdAt)}</span><small>{order.scheduledFor ? `Agendado: ${formatDateTimeBR(order.scheduledFor)}` : 'Pedido aguardando conferência do recebimento'}</small></div><div className="orders-payment-inbox__actions"><label className="orders-payment-status-select"><span>Status após recebimento</span><select value={nextStatus} onChange={(event) => setPaymentStatusDrafts((current) => ({ ...current, [order.id]: event.target.value as OrderStatus }))} aria-label={`Status após recebimento do pedido ${order.orderNumber}`}>{operationalStatuses(order).filter((option) => option.value !== 'cancelled').map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small>Para cancelar, use o botão vermelho abaixo.</small></label><button type="button" className="secondary-button compact-button" onClick={() => setDetailsOrderId(order.id)}><Eye size={15}/>Detalhes / editar</button>{order.paymentMethod === 'pix' && <button type="button" className="secondary-button compact-button" onClick={() => openPaymentPix(order)}><QrCode size={15}/>Mostrar QR Code</button>}<button type="button" className="orders-payment-cancel-button" onClick={() => void cancelOrderFromPaymentCard(order.id)}><Ban size={15}/>Cancelar pedido</button><button type="button" className="order-payment-confirm-button order-payment-confirm-button--prominent" disabled={confirmingPaymentId === order.id} onClick={() => void confirmPayment(order.id, order.orderNumber, order.total, nextStatus)}><CircleDollarSign size={16}/>{confirmingPaymentId === order.id ? 'Confirmando...' : 'Confirmar recebimento e status'}</button></div></article>;
      })}</div> : <div className="orders-payment-inbox__empty"><CheckCircle2 size={18}/>Nenhum pedido pendente de recebimento.</div>}
    </section>

    <section className="admin-card orders-calendar-card" aria-labelledby="orders-calendar-title">
      <div className="orders-calendar-card__header">
        <div><span className="eyebrow">AGENDA</span><h2 id="orders-calendar-title"><CalendarDays size={19}/>Pedidos agendados</h2><p>Escolha um dia para filtrar somente as encomendas programadas.</p></div>
        <div className="orders-calendar-card__actions"><button type="button" className="icon-button" onClick={() => moveCalendarMonth(-1)} aria-label="Mês anterior"><ChevronLeft size={17}/></button><strong>{calendarMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</strong><button type="button" className="icon-button" onClick={() => moveCalendarMonth(1)} aria-label="Próximo mês"><ChevronRight size={17}/></button></div>
      </div>
      <div className="orders-calendar-weekdays" aria-hidden="true">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="orders-calendar-grid" role="grid" aria-label="Calendário de pedidos agendados">{calendarDays.map(({ date, key, inMonth, count }) => <button type="button" role="gridcell" key={key} className={`orders-calendar-day ${inMonth ? '' : 'is-outside'} ${scheduledDateFilter === key ? 'is-selected' : ''}`} onClick={() => count ? setScheduledDateFilter(key) : undefined} disabled={!count} aria-label={`${date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}${count ? `, ${count} pedido${count === 1 ? '' : 's'} agendado${count === 1 ? '' : 's'}` : ', sem pedidos agendados'}`}><span>{date.getDate()}</span>{count ? <b>{count}</b> : null}</button>)}</div>
      {scheduledDateFilter && <div className="orders-calendar-filter-chip"><span><CalendarDays size={15}/>Filtrando: <strong>{scheduledFilterLabel}</strong></span><button type="button" onClick={clearScheduledFilter} aria-label="Limpar filtro de pedidos agendados" title="Limpar filtro"><Slash size={15}/></button></div>}
    </section>

    {overdueOrders.length > 0 && <section className="orders-overdue-banner" role="alert" aria-live="assertive"><div className="orders-overdue-banner__title"><AlertTriangle size={19}/><strong>{overdueOrders.length} pedido{overdueOrders.length === 1 ? '' : 's'} atrasado{overdueOrders.length === 1 ? '' : 's'}</strong><span>Priorize a produção ou entre em contato com o cliente.</span></div><div className="orders-overdue-banner__list">{overdueOrders.slice(0, 4).map((order) => <button type="button" key={order.id} onClick={() => setDetailsOrderId(order.id)}><strong>#{formatOrderNumber(order.orderNumber)} · {order.customerName}</strong><span>Agendado para {formatDateTimeBR(order.scheduledFor!)}</span></button>)}{overdueOrders.length > 4 && <small>+ {overdueOrders.length - 4} pedido(s)</small>}</div></section>}
    <section className="admin-card no-padding orders-workspace">
      <div className="table-toolbar orders-toolbar orders-toolbar--filters">
        <div className="admin-search"><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pedido, cliente ou telefone..."/></div>
        <div className="toolbar-selects"><label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | OrderStatus)}><option value="all">Todos</option>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label><span>Recebimento</span><select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value as 'all' | 'pending' | 'paid')}><option value="all">Todos</option><option value="pending">A receber do cliente</option><option value="paid">Recebido</option></select></label><label><span>Ordenar por</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortMode)}>{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
        <div className="orders-filter-actions" aria-label="Ações dos filtros">
          <button type="button" className="secondary-button compact-button" onClick={() => setShowSaveFilter((current) => !current)}>{showSaveFilter ? <X size={14}/> : <Plus size={14}/>}Salvar filtro</button>
          <button type="button" className="secondary-button compact-button" onClick={exportFilteredOrders}><Download size={14}/>Exportar CSV</button>
        </div>
        {showSaveFilter && <form className="orders-save-filter" onSubmit={(event) => { event.preventDefault(); saveCurrentFilter(); }}><input value={saveFilterName} onChange={(event) => setSaveFilterName(event.target.value)} placeholder="Ex.: Pendentes de hoje" aria-label="Nome do filtro" autoFocus/><button type="submit" className="primary-button compact-button">Salvar</button></form>}
        {savedFilters.length > 0 && <div className="orders-saved-filters" aria-label="Filtros salvos">{savedFilters.map((filter) => <span key={filter.id}><button type="button" onClick={() => applySavedFilter(filter)}>{filter.name}</button><button type="button" className="orders-saved-filters__remove" onClick={() => removeSavedFilter(filter.id)} aria-label={`Remover filtro ${filter.name}`}><X size={12}/></button></span>)}</div>}
        <div className="orders-toolbar__sync" aria-live="polite"><span>{pendingOrders.length} no Financeiro · {processingOrders.length} em processamento · {historyOrders.length} no histórico</span>{scheduledDateFilter && <button type="button" className="orders-active-filter" onClick={clearScheduledFilter}><CalendarDays size={14}/>Agendados: {scheduledFilterLabel}<Slash size={14}/></button>}{refreshError ? <strong className="orders-refresh-error" role="status">{refreshError}</strong> : <small>{lastUpdatedAt ? `Atualizado às ${lastUpdatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Atualização automática ativa'}</small>}<button type="button" className="secondary-button compact-button" onClick={() => void refreshOrders()} disabled={refreshing} aria-busy={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''}/>{refreshing ? 'Atualizando...' : refreshError ? 'Tentar novamente' : 'Atualizar'}</button></div>
      </div>
      {highlightedOrderId && <div className="highlight-order-banner">O pedido relacionado vindo do Financeiro foi destacado abaixo.</div>}
       {filtered.length === 0 ? <div className="admin-empty"><ShoppingBag size={32}/><strong>Nenhum pedido encontrado</strong><span>Ajuste os filtros ou aguarde o próximo pedido.</span></div> : (processingOrders.length === 0 && historyOrders.length === 0) ? <div className="admin-empty"><CircleDollarSign size={32}/><strong>Pedidos pendentes no Financeiro</strong><span>Os pedidos aguardando pagamento ficam exclusivamente no card “A receber do cliente” acima.</span></div> : <>
        <section className="orders-collection-section orders-collection-section--processing" aria-labelledby="processing-orders-title">
          <header className="orders-collection-heading"><div><span className="eyebrow">OPERAÇÃO</span><h2 id="processing-orders-title">Recebidos · em processamento</h2><p>Depois de confirmar o recebimento, o pedido fica aqui até ser marcado como Entregue ou Cancelado.</p></div><strong>{processingOrders.length}</strong></header>
          {processingOrders.length ? renderOrderCollection(processingOrders, 'Pedidos recebidos em processamento') : <div className="orders-collection-empty"><CheckCircle2 size={18}/>Nenhum pedido recebido em processamento.</div>}
        </section>
        <details className="orders-history-panel" open={historyOpen} onToggle={(event) => setHistoryOpen(event.currentTarget.open)}>
          <summary><span><ShoppingBag size={18}/><strong>Histórico de pedidos</strong><small>Entregues e cancelados ficam aqui para não disputar espaço com a operação.</small></span><b>{historyOrders.length}</b></summary>
          {historyOrders.length ? renderOrderCollection(historyOrders, 'Histórico de pedidos') : <div className="orders-collection-empty"><CheckCircle2 size={18}/>Nenhum pedido finalizado com estes filtros.</div>}
        </details>
      </>}
    </section>
    {selectedOrderIds.length > 0 && <aside className="orders-batch-status-bar" aria-live="polite">
      <div><strong>{selectedOrderIds.length} {selectedOrderIds.length === 1 ? 'pedido selecionado' : 'pedidos selecionados'}</strong><span>{pendingStatusChanges.length ? `${pendingStatusChanges.length} alteração${pendingStatusChanges.length === 1 ? '' : 'ões'} de status pendente${pendingStatusChanges.length === 1 ? '' : 's'}.` : 'Escolha o novo status nos pedidos selecionados.'}</span></div>
      <div className="orders-batch-status-bar__actions"><button type="button" className="secondary-button compact-button" onClick={discardStatusDrafts} disabled={batchSaving}>Descartar</button><button type="button" className="primary-button compact-button" onClick={() => void saveStatusBatch()} disabled={!pendingStatusChanges.length || batchSaving}>{batchSaving ? 'Salvando...' : `Salvar ${pendingStatusChanges.length || ''} status`}</button></div>
    </aside>}
    {detailsOrder && <OrderDetailsModal order={detailsOrder} settings={settings} onClose={() => setDetailsOrderId(null)} onSave={saveOrderDetails} onCancelOrder={cancelOrderFromDetails} saving={detailsSaving} />}
    {manualOrderOpen && <div className="modal-overlay" role="presentation">
      <form className="master-modal master-modal--wide manual-order-modal" role="dialog" aria-modal="true" aria-labelledby="manual-order-title" onSubmit={saveManualOrder}>
        <button type="button" className="modal-close" aria-label="Fechar lançamento de pedido avulso" onClick={() => setManualOrderOpen(false)} disabled={manualSaving}><X/></button>
        <span className="eyebrow">LANÇAMENTO OPERACIONAL</span>
        <h2 id="manual-order-title">Pedido avulso</h2>
         <p>Registre uma venda feita fora do site. Escolha o fluxo mais rápido para o atendimento.</p>
         <div className="manual-order-mode-switch" role="tablist" aria-label="Tipo de lançamento">
           <button type="button" role="tab" aria-selected={manualOrderMode === 'quick'} className={manualOrderMode === 'quick' ? 'is-active' : ''} onClick={() => changeManualOrderMode('quick')}>Venda rápida <small>anônima</small></button>
           <button type="button" role="tab" aria-selected={manualOrderMode === 'scheduled'} className={manualOrderMode === 'scheduled' ? 'is-active' : ''} onClick={() => changeManualOrderMode('scheduled')}>Agendar pedido <small>cliente e data</small></button>
         </div>
         <p className="manual-order-mode-hint">{manualOrderMode === 'quick' ? 'Preencha somente pagamento e produto. O PIX é preparado automaticamente quando selecionado.' : 'Use este fluxo para identificar o cliente, delivery/retirada e pedidos sob encomenda.'}</p>
        {manualFormError && <div className="manual-order-feedback manual-order-feedback--error" role="alert"><AlertCircle size={17}/><span>{manualFormError}</span></div>}
        <div className="form-grid">
           {manualOrderMode === 'scheduled' && <>
             <label>Cliente<input required value={manualOrder.customerName} onChange={(event) => setManualOrder((current) => ({ ...current, customerName: event.target.value }))} placeholder="Nome do cliente"/></label>
             <label>Como será recebido?<select value={manualOrder.fulfillment || 'pickup'} onChange={(event) => { const fulfillment = event.target.value as ManualOrderInput['fulfillment']; setManualOrder((current) => ({ ...current, fulfillment })); setManualFormError(''); }}><option value="pickup">Retirada</option><option value="delivery" disabled={!settings.deliveryEnabled}>Delivery{settings.deliveryEnabled ? '' : ' (desativado)'}</option></select><small>Delivery respeita o início configurado; retirada não.</small></label>
             <label>Agendar pedido <span className="optional-label">opcional</span><input type="datetime-local" min={localDateTimeInputValue(manualOrder.fulfillment === 'delivery' ? nextDeliveryWindow(settings.deliveryStartTime) : tomorrowStart())} value={manualOrder.scheduledFor || ''} onChange={(event) => { setManualFormError(''); setManualOrder((current) => ({ ...current, scheduledFor: event.target.value || undefined })); }}/><span className="manual-order-schedule-actions"><button type="button" className="text-button" onClick={scheduleManualRestock}>Amanhã{manualOrder.fulfillment === 'delivery' ? ` às ${settings.deliveryStartTime || '18:00'}` : ''}</button><small>Para encomendas sem estoque, disponível somente a partir de amanhã{manualOrder.fulfillment === 'delivery' && settings.deliveryStartTime ? ` e delivery após ${settings.deliveryStartTime}` : ''}.</small></span></label>
             <details className="manual-order-more-options"><summary>Mais opções <small>telefone, origem e recebimento</small></summary><div className="form-grid manual-order-more-options__grid"><label>Telefone <span className="optional-label">opcional</span><input value={manualOrder.customerPhone || ''} onChange={(event) => setManualOrder((current) => ({ ...current, customerPhone: event.target.value }))} placeholder="(27) 99999-9999"/></label><label>Origem<select value={manualOrder.source} onChange={(event) => setManualOrder((current) => ({ ...current, source: event.target.value as ManualOrderSource }))}>{manualSourceOptions.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}</select></label><label>Status inicial<select value={manualOrder.status} onChange={(event) => { const status = event.target.value as OrderStatus; setManualOrder((current) => ({ ...current, status, received: status === 'cancelled' ? false : current.received })); }}>{statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label><label>Recebimento<select value={manualOrder.received ? 'paid' : 'pending'} disabled={manualOrder.status === 'cancelled'} onChange={(event) => setManualOrder((current) => ({ ...current, received: event.target.value === 'paid' }))}><option value="pending">A receber do cliente</option><option value="paid">Recebido</option></select><small>Use “A receber” para confirmar depois no painel.</small></label></div></details>
           </>}
           <label>Estoque de saída<select required value={manualLocationId} onChange={(event) => setManualLocationId(event.target.value)}><option value="">Selecione o ponto</option>{stockLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select><small>A venda usa somente o saldo do ponto selecionado.</small></label>
           <label>Pagamento<select value={manualOrder.paymentMethod} onChange={(event) => { const paymentMethod = event.target.value as PaymentMethod; setManualOrder((current) => ({ ...current, paymentMethod })); if (paymentMethod !== 'pix') setManualPixChargeNow(false); else if (manualOrderMode === 'quick') setManualPixChargeNow(true); }}>{Object.entries(paymentLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
           {manualOrderMode === 'quick' && <label>Recebimento<select value={manualOrder.received ? 'paid' : 'pending'} onChange={(event) => { const paid = event.target.value === 'paid'; setManualOrder((current) => ({ ...current, received: paid })); if (paid) setManualPixChargeNow(false); }}><option value="pending">A receber</option><option value="paid">Recebido e conferido</option></select></label>}
           {manualOrderMode === 'quick' && <label>Status inicial<select value={manualOrder.status} onChange={(event) => { const status = event.target.value as OrderStatus; setManualOrder((current) => ({ ...current, status, received: status === 'cancelled' ? false : current.received })); }}>{quickManualStatusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select><small>A venda rápida já começa como “Entregue”. O recebimento do PIX continua separado até a conferência.</small></label>}
        </div>

        <section>
          <h3>Produtos</h3>
          {manualUnavailableItem && <div className={`manual-stock-schedule-card ${manualOrder.scheduledFor ? 'is-scheduled' : ''}`} role="status" aria-live="polite"><AlertCircle size={18}/><div><strong>{manualUnavailableItem.product.name} precisa de reposição</strong><span>{manualOrder.scheduledFor ? `Encomenda sob demanda preparada para ${new Date(manualOrder.scheduledFor).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}. O estoque só será baixado após a reposição e confirmação.` : 'Registre como encomenda futura e o estoque só será baixado após a reposição e confirmação.'}</span></div>{!manualOrder.scheduledFor && <button type="button" className="secondary-button" onClick={scheduleManualRestock}>Agendar amanhã</button>}</div>}
          <div className="manual-product-quick-add">
            <label className="manual-product-quick-add__product">Adicionar produto<select value={manualProductId} onChange={(event) => setManualProductId(event.target.value)}><option value="">Selecione</option>{manualProducts.filter((product) => !manualItems.some((item) => item.productId === product.id)).map((product) => <option key={product.id} value={product.id}>{product.name} · {currency.format(product.promotionalPrice ?? product.price)}{product.availabilityStatus !== 'available' || product.stockStatus === 'unavailable' ? ' · encomenda' : ''}</option>)}</select></label>
            <div className="manual-product-quick-add__quantity"><span>Qtd.</span><QuantityControl value={manualQuantityDraft} onChange={setManualQuantityDraft}/></div>
            <button className="secondary-button" type="button" onClick={addManualProduct} disabled={!manualProductId}><Plus size={15}/>Adicionar</button>
          </div>
          <small className="manual-product-quick-add__hint">Escolha o produto e a quantidade uma única vez. Você pode ajustar opções e quantidades abaixo.</small>
          {!manualItems.length ? <p>Nenhum produto selecionado.</p> : manualItems.map((item) => {
            const product = products.find((current) => current.id === item.productId);
            if (!product) return null;
            return <fieldset key={item.productId}>
              <legend>{product.name}</legend>
              <div className="form-grid">
                <div className="manual-quantity-field"><span>Quantidade</span><QuantityControl value={item.quantity} onChange={(quantity) => updateManualItem(item.productId, { quantity })}/></div>
                <div><strong>{currency.format(roundMoney(((product.promotionalPrice ?? product.price) + item.options.reduce((sum, option) => { const group = product.optionGroups.find((current) => current.id === option.groupId); const choice = group?.items.find((current) => current.id === option.itemId); return sum + (choice?.priceDelta || 0) * option.quantity; }, 0)) * item.quantity))}</strong><br/><button type="button" className="secondary-button" onClick={() => setManualItems((items) => items.filter((current) => current.productId !== item.productId))}>Remover item</button></div>
                {product.optionGroups.filter((group) => group.active).map((group) => <label key={group.id} className="full">{group.name}{group.minChoices > 0 ? ' (obrigatório)' : ' (opcional)'}<select multiple={group.maxChoices > 1} value={group.maxChoices > 1 ? item.options.filter((option) => option.groupId === group.id).map((option) => option.itemId) : item.options.find((option) => option.groupId === group.id)?.itemId || ''} onChange={(event) => updateManualOptionGroup(item.productId, group.id, Array.from(event.currentTarget.selectedOptions, (option) => option.value))}>{group.minChoices === 0 && group.maxChoices <= 1 ? <option value="">Sem seleção</option> : null}{group.items.filter((choice) => choice.active).map((choice) => <option key={choice.id} value={choice.id}>{choice.name}{choice.priceDelta ? ` · ${choice.priceDelta > 0 ? '+' : ''}${currency.format(choice.priceDelta)}` : ''}</option>)}</select><small>{group.maxChoices > 1 ? `Selecione até ${group.maxChoices} opções.` : 'Selecione uma opção.'}</small></label>)}
              </div>
            </fieldset>;
          })}
        </section>
         {manualOrderMode === 'scheduled' && <label>Observação<textarea rows={3} maxLength={500} value={manualOrder.notes || ''} onChange={(event) => setManualOrder((current) => ({ ...current, notes: event.target.value }))} placeholder="Ex.: venda registrada depois do atendimento presencial."/></label>}
        <p><strong>Resumo: {manualItems.reduce((sum, item) => sum + item.quantity, 0)} item(ns) · {currency.format(manualSubtotal)}</strong></p>
        {manualOrder.paymentMethod === 'pix' && <section className="manual-pix-charge-section" aria-label="Cobrança por PIX">
           {manualOrderMode === 'scheduled' && <label className="manual-pix-charge-toggle"><input type="checkbox" checked={manualPixChargeNow} disabled={manualOrder.status === 'cancelled'} onChange={(event) => { const checked = event.target.checked; setManualPixChargeNow(checked); if (checked) setManualOrder((current) => ({ ...current, received: false })); }}/><span><strong>Cobrar agora via PIX</strong><small>Gera o QR Code e o PIX Copia e Cola com o valor final. O recebimento continua “A receber” até a conferência.</small></span></label>}
          {manualPixChargeNow && <div className="manual-pix-live-preview"><div><QrCode size={18}/><span><strong>Cobrança via PIX</strong><small>O QR Code e o PIX Copia e Cola usam o valor atualizado do pedido.</small></span></div>{manualPixPreviewPayload ? <div className="manual-pix-live-preview__content">{manualPixPreviewQrCode ? <img src={manualPixPreviewQrCode} alt={`QR Code PIX no valor de ${currency.format(manualSubtotal)}`} /> : manualPixPreviewQrCodeError ? <span className="manual-pix-live-preview__error">{manualPixPreviewQrCodeError}</span> : <span className="manual-pix-result-loading">Gerando QR Code…</span>}<div><strong>{currency.format(manualSubtotal)}</strong><button type="button" className="text-button" onClick={() => void copyText(manualPixPreviewPayload).then(() => { setManualPixCopied(true); window.setTimeout(() => setManualPixCopied(false), 1800); })}><Copy size={14}/>{manualPixCopied ? 'Copiado' : 'Copiar PIX'}</button></div></div> : <div className="manual-pix-live-preview__error">{manualPixPreview.error}</div>}</div>}
        </section>}
         <div className="master-modal-actions"><button type="button" className="secondary-button" onClick={() => setManualOrderOpen(false)} disabled={manualSaving}>Cancelar</button><button className="primary-button" type="submit" disabled={manualSaving || !manualLocationId || !manualItems.length || (manualOrderMode === 'scheduled' && !manualOrder.customerName.trim())}>{manualSaving ? 'Salvando...' : `Registrar ${manualOrderMode === 'quick' ? 'venda' : 'pedido'} · ${currency.format(manualSubtotal)}`}</button></div>
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
          {manualPixQrCode && <button type="button" className="secondary-button pix-share-button" disabled={sharingPix} onClick={() => void sharePix(manualPixView, manualPixQrCode)}><Share2 size={16}/>{sharingPix ? 'Preparando...' : 'Compartilhar QR Code + texto'}</button>}
        </> : <div className="form-error">{manualPixView.error || 'Configure uma chave PIX ou um PIX Copia e Cola válido nas configurações da loja para gerar a cobrança com valor.'}</div>}
        <div className="master-modal-actions"><button type="button" className="primary-button" onClick={() => setManualPixView(null)}>Concluir</button></div>
      </section>
    </div>}
    {paymentPixView && <div className="modal-overlay" role="presentation">
      <section className="master-modal manual-pix-result-modal" role="dialog" aria-modal="true" aria-labelledby="payment-pix-result-title">
        <button type="button" className="modal-close" aria-label="Fechar PIX do pedido" onClick={() => setPaymentPixView(null)}><X/></button>
        <span className="eyebrow">CONFERÊNCIA FINANCEIRA</span>
        <h2 id="payment-pix-result-title">PIX do pedido #{formatOrderNumber(paymentPixView.orderNumber)}</h2>
        <p>Confira este valor com o comprovante recebido antes de confirmar o pagamento do cliente.</p>
        {paymentPixView.payload ? <>
          {paymentPixQrCode ? <img className="manual-pix-result-qr" src={paymentPixQrCode} alt={`QR Code PIX no valor de ${currency.format(paymentPixView.total)}`} /> : paymentPixQrCodeError ? <div className="manual-pix-live-preview__error">{paymentPixQrCodeError}</div> : <div className="manual-pix-result-loading"><QrCode size={18}/>Gerando QR Code…</div>}
          <label className="manual-pix-result-code">PIX Copia e Cola · {currency.format(paymentPixView.total)}<div><textarea readOnly rows={4} value={paymentPixView.payload}/><button type="button" className="secondary-button" onClick={() => void copyText(paymentPixView.payload).then(() => { setPaymentPixCopied(true); window.setTimeout(() => setPaymentPixCopied(false), 1800); })}><Copy size={16}/>{paymentPixCopied ? 'Copiado' : 'Copiar'}</button></div></label>
          {paymentPixQrCode && <button type="button" className="secondary-button pix-share-button" disabled={sharingPix} onClick={() => void sharePix(paymentPixView, paymentPixQrCode)}><Share2 size={16}/>{sharingPix ? 'Preparando...' : 'Compartilhar QR Code + texto'}</button>}
        </> : <div className="form-error">{paymentPixView.error || 'Configure uma chave PIX ou um PIX Copia e Cola válido nas configurações da loja para gerar a cobrança com valor.'}</div>}
        <div className="master-modal-actions"><button type="button" className="primary-button" onClick={() => setPaymentPixView(null)}>Concluir</button></div>
      </section>
    </div>}
  </>;
}
