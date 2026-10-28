import { appConfig, isDemoMode } from '../lib/config';
import { invokePublicFunction, restFetch, storageDelete, storageUpload, SupabaseHttpError } from '../lib/supabaseRest';
import { seedAddons, seedCategories, seedDeliveryZones, seedOrders, seedPlan, seedProducts, seedSettings } from '../data/seed';
import type {
  Addon, CartItem, Category, CheckoutData, CheckoutSecurityContext, CreateOrderResult, DeliveryZone,
  ManualOrderInput, OptionGroup, OptionItem, Order, OrderDetailsUpdate, OrderItem, OrderItemOption, PaymentMethod, Plan, PlanUsage, Product, ProductImage, StoreSettings,
} from '../types';
import { roundMoney, slugify } from '../utils/format';
import { formatOpeningSchedule, normalizeOpeningSchedule } from '../utils/storeHours';
import { createId } from '../utils/id';
import { normalizeCustomerMessageTemplates } from '../utils/customerSales';
import { normalizeStoreVisualTheme } from '../utils/storeVisualTheme';
import { optimizeImageForUpload } from '../utils/imageUpload';

export type ProductCommercialUpdate = Partial<Pick<Product, 'price' | 'promotionalPrice' | 'availabilityStatus' | 'active'>>;

export class StorefrontUnavailableError extends Error {
  storeName: string;
  constructor(storeName: string) {
    super('Esta loja está temporariamente indisponível.');
    this.name = 'StorefrontUnavailableError';
    this.storeName = storeName;
  }
}

type StorefrontStatus = { found: boolean; id?: string; slug?: string; name?: string; status?: 'online' | 'unavailable' };

type PublicStorefrontRpc = {
  found: boolean;
  status?: 'online' | 'unavailable';
  store?: StoreRow | { id: string; slug: string; name: string };
  categories?: CategoryRow[];
  products?: ProductRow[];
  product_images?: ProductImageRow[];
  option_groups?: OptionGroupRow[];
  option_items?: OptionItemRow[];
  product_option_groups?: ProductOptionGroupRow[];
  product_variants?: ProductVariantRow[];
  addons?: AddonRow[];
  product_addons?: ProductAddonRow[];
  delivery_zones?: DeliveryZoneRow[];
};

export type StoreSnapshot = {
  settings: StoreSettings;
  categories: Category[];
  products: Product[];
  addons: Addon[];
  deliveryZones: DeliveryZone[];
  orders: Order[];
  planUsage: PlanUsage;
};

const DEMO_KEY = 'foodservice_demo_database_v1';
type DemoDatabase = StoreSnapshot;

type StoreRow = {
  id: string; slug: string; name: string; description: string | null; logo_url: string | null; logo_storage_path: string | null;
  cover_url: string | null; cover_storage_path: string | null; whatsapp: string | null; instagram: string | null; address: string | null;
  city: string | null; state: string | null; zip_code: string | null; delivery_enabled: boolean; pickup_enabled: boolean; show_whatsapp?: boolean | null;
  pix_enabled: boolean; pix_receipt_mode: 'copy_paste'|'key' | null; pix_key_type: string | null; pix_key: string | null; pix_copy_paste: string | null; pix_holder_name: string | null;
  show_pix_before_confirmation: boolean; confirmation_payment_enabled: boolean; card_payment_enabled: boolean; cash_payment_enabled: boolean; payment_method_order: unknown;
  minimum_order: number | string; opening_hours: unknown; active: boolean; access_status?: 'online'|'suspended';
  average_preparation_min?: number | null; average_preparation_max?: number | null; allow_scheduled_orders?: boolean | null; kds_enabled?: boolean | null; kds_notify_customer?: boolean | null; notifications_new_order_enabled?: boolean | null; notifications_scheduled_enabled?: boolean | null; notifications_scheduled_lead_minutes?: number | null; notifications_desktop_enabled?: boolean | null; notifications_sound_enabled?: boolean | null; sales_recovery_enabled?: boolean | null; sales_recovery_minutes?: number | null; sales_recovery_window_hours?: number | null; crm_enabled?: boolean | null; crm_come_back_days?: number | null; repeat_order_enabled?: boolean | null; repeat_order_max_age_days?: number | null; upsell_enabled?: boolean | null; upsell_limit?: number | null; customer_message_templates?: unknown;
  billing_document?: string | null; billing_phone?: string | null;
  visual_theme?: unknown; storefront_notice?: string | null; pickup_instructions?: string | null; hide_public_address?: boolean | null;
};
type CategoryRow = { id: string; store_id: string; name: string; slug: string; description: string | null; active: boolean; sort_order: number };
type ProductRow = {
  id: string; store_id: string; category_id: string; name: string; slug: string; description: string; price: number | string;
  promotional_price: number | string | null; active: boolean; featured: boolean; made_to_order: boolean; production_days: number | null;
  stock_status: Product['stockStatus']; internal_code?: string | null; visual_emoji?: string | null; availability_status?: Product['availabilityStatus'] | null;
  track_stock?: boolean | null; stock_quantity?: number | null; stock_reserved_quantity?: number | null; preparation_time_minutes?: number | null; sort_order?: number | null;
  party_order_enabled?: boolean | null; party_price_per_gram?: number | string | null; party_package_weight_grams?: number | string | null;
  party_minimum_packages?: number | null; party_lead_time_days?: number | null; party_artwork_instructions?: string | null; party_artwork_url?: string | null;
  default_order_status?: Order['status'] | null;
};
type ProductImageRow = { id: string; product_id: string; url: string; storage_path: string | null; alt_text: string | null; sort_order: number; is_primary: boolean };
type ProductVariantRow = { id: string; product_id: string; name: string; price_delta: number | string; active: boolean; sort_order: number };
type AddonRow = { id: string; store_id: string; name: string; description: string | null; price: number | string; active: boolean; image_url: string | null; image_storage_path: string | null };
type ProductAddonRow = { product_id: string; addon_id: string };
type OptionGroupRow = { id: string; store_id: string; name: string; description: string | null; kind: OptionGroup['kind']; min_choices: number; max_choices: number; active: boolean; sort_order: number };
type OptionItemRow = { id: string; group_id: string; store_id: string; name: string; description: string | null; price_delta: number | string; active: boolean; sort_order: number };
type ProductOptionGroupRow = { store_id: string; product_id: string; option_group_id: string; sort_order: number };
type DeliveryZoneRow = { id: string; store_id: string; name: string; aliases: string[] | null; city: string; state: string; fee: number | string; active: boolean; sort_order: number };
type PlanRow = { id: string; code: string; name: string; product_limit: number | null; image_limit_per_product: number | null; custom_domain: boolean; reports: boolean; priority_support: boolean; monthly_price: number | string | null; setup_price: number | string | null; category_limit: number | null; addon_limit: number | null; admin_user_limit: number | null; sort_order: number | null; active: boolean };
type PlanFeatureRow = { plan_id:string; feature_code:string; enabled:boolean; limit_value:number|null };
type SubscriptionRow = { id: string; store_id: string; plan_id: string; status: 'trial' | 'active' | 'suspended' | 'cancelled'; started_at: string; expires_at: string | null };
type StoreDomainRow = { store_id: string; domain: string; active: boolean; is_primary: boolean };
type OrderRow = {
  id: string; order_number?: number | string | null; store_id: string; customer_name: string; customer_phone: string | null; customer_email?: string | null;
  delivery_type: 'delivery'|'pickup'; desired_date?: string | null; desired_period?: string | null; recipient_name?: string | null; recipient_phone?: string | null;
  delivery_address?: string | null; delivery_zip_code?: string | null; delivery_street?: string | null; delivery_number?: string | null; delivery_complement?: string | null;
  delivery_neighborhood?: string | null; delivery_zone_id?: string | null; delivery_zone_name?: string | null; delivery_fee?: number | string | null;
  delivery_city?: string | null; delivery_state?: string | null; reference_point?: string | null; card_message?: string | null; card_signature?: string | null;
  anonymous_sender?: boolean | null; notes: string | null; payment_method: string; subtotal: number|string; total: number|string; status: Order['status'];
  payment_status?: 'pending'|'paid' | null; payment_received_at?: string | null; payment_confirmed_by?: string | null;
  needs_change?: boolean | null; change_for?: number | string | null; change_amount?: number | string | null; scheduled_for?: string | null;
  preparation_estimate_minutes?: number | null; inventory_status?: Order['inventoryStatus'] | null; source?: Order['source'] | null; customer_instagram?: string | null; acquisition_source?: Order['acquisitionSource'] | null; whatsapp_clicked_at: string | null; created_at: string;
};

type OrderItemRow = {
  id: string; order_id: string; product_id?: string | null; product_name: string; quantity: number; unit_price: number | string;
  variant_name?: string | null; variant_price_delta?: number | string | null; item_total: number | string; addons?: unknown; party_package_weight_grams?: number | string | null;
};
type OrderItemOptionRow = {
  id: string; order_item_id: string; group_name: string; option_name: string; option_kind: string;
  price_delta: number | string | null; quantity: number | null;
};

// Projeções enxutas para o painel. Em instalações que ainda estão aplicando
// migrations, restFetchProjected remove apenas a coluna ausente e tenta de
// novo sem quebrar o carregamento.
const ADMIN_ORDER_SELECT = [
  'id', 'order_number', 'store_id', 'customer_name', 'customer_phone', 'customer_email',
  'delivery_type', 'desired_date', 'desired_period', 'recipient_name', 'recipient_phone',
  'delivery_address', 'delivery_zip_code', 'delivery_street', 'delivery_number', 'delivery_complement',
  'delivery_neighborhood', 'delivery_zone_id', 'delivery_zone_name', 'delivery_fee', 'delivery_city',
  'delivery_state', 'reference_point', 'card_message', 'card_signature', 'anonymous_sender', 'notes',
  'payment_method', 'subtotal', 'total', 'status', 'payment_status', 'payment_received_at',
  'payment_confirmed_by', 'needs_change', 'change_for', 'change_amount', 'scheduled_for',
  'preparation_estimate_minutes', 'inventory_status', 'source', 'customer_instagram', 'acquisition_source',
  'whatsapp_clicked_at', 'created_at',
].join(',');
const ADMIN_ORDER_ITEM_SELECT = 'id,order_id,product_id,product_name,quantity,unit_price,variant_name,variant_price_delta,item_total,addons,party_package_weight_grams,created_at';
const ADMIN_ORDER_OPTION_SELECT = 'id,order_item_id,group_name,option_name,option_kind,price_delta,quantity,created_at';
const toNumber = (value: number | string | null | undefined) => value == null ? 0 : Number(value);
const encode = (value: string) => encodeURIComponent(value);
const inFilter = (ids: string[]) => `in.(${ids.join(',')})`;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// A vitrine pública é lida por várias telas durante a navegação. Um cache curto
// evita repetir o mesmo conjunto de consultas e o mapa de requisições em voo
// impede duplicidade quando mais de um componente monta ao mesmo tempo.
const PUBLIC_SNAPSHOT_CACHE_TTL_MS = 15_000;
const publicSnapshotCache = new Map<string, { snapshot: StoreSnapshot; cachedAt: number }>();
const publicSnapshotRequests = new Map<string, Promise<StoreSnapshot>>();

const isSchemaProjectionError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /schema cache|column .* does not exist|could not find the .* column/i.test(message);
};

const missingProjectionColumn = (error: unknown): string | null => {
  const message = error instanceof Error ? error.message : String(error);
  const quoted = message.match(/(?:could not find the|column)\s+['"]?([a-z0-9_]+)['"]?\s+column/i);
  if (quoted?.[1]) return quoted[1];
  const qualified = message.match(/column\s+[a-z0-9_]+\.([a-z0-9_]+)\s+does not exist/i);
  return qualified?.[1] || null;
};

/** Mantém compatibilidade com instalações que ainda estão aplicando migrations.
 * Em um schema atualizado a consulta enxuta é usada; se uma coluna opcional
 * ainda não estiver no cache do PostgREST, volta apenas aquela consulta para *.
 */
const restFetchProjected = async <T>(table: string, select: string, suffix: string): Promise<T[]> => {
  if (select === '*') return restFetch<T[]>(`${table}?select=*${suffix}`);
  let projection = select;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await restFetch<T[]>(`${table}?select=${projection}${suffix}`);
    } catch (error) {
      // Instalações que ainda estão atualizando o schema podem não conhecer
      // uma coluna nova. Removemos apenas a coluna ausente e tentamos de novo;
      // nunca fazemos fallback público para `select=*`, que poderia vazar
      // campos administrativos ou caminhos internos do Storage.
      if (!isSchemaProjectionError(error)) throw error;
      const missing = missingProjectionColumn(error);
      const columns = projection.split(',').map((column) => column.trim()).filter(Boolean);
      if (!missing || !columns.includes(missing) || columns.length <= 1) throw error;
      projection = columns.filter((column) => column !== missing).join(',');
    }
  }
  throw new Error(`Não foi possível carregar a projeção pública de ${table}.`);
};

// Whitelist pública: a vitrine recebe somente dados necessários para montar o
// catálogo/checkout. Preferências do painel, cobrança e caminhos internos de
// Storage nunca devem ser enviados a visitantes anônimos.
const PUBLIC_STORE_SELECT = 'id,slug,name,description,logo_url,cover_url,whatsapp,instagram,address,city,state,zip_code,delivery_enabled,pickup_enabled,show_whatsapp,pix_enabled,pix_receipt_mode,pix_key_type,pix_key,pix_copy_paste,pix_holder_name,show_pix_before_confirmation,confirmation_payment_enabled,card_payment_enabled,cash_payment_enabled,payment_method_order,minimum_order,opening_hours,active,access_status,average_preparation_min,average_preparation_max,allow_scheduled_orders,visual_theme,storefront_notice,pickup_instructions,hide_public_address';
const PUBLIC_CATEGORY_SELECT = 'id,store_id,name,slug,description,active,sort_order';
const PUBLIC_PRODUCT_SELECT = 'id,store_id,category_id,name,slug,description,price,promotional_price,active,featured,made_to_order,production_days,stock_status,visual_emoji,availability_status,track_stock,stock_quantity,stock_reserved_quantity,preparation_time_minutes,sort_order,party_order_enabled,party_price_per_gram,party_package_weight_grams,party_minimum_packages,party_lead_time_days,party_artwork_instructions,party_artwork_url,default_order_status';
const PUBLIC_IMAGE_SELECT = 'id,product_id,url,alt_text,sort_order,is_primary';
const PUBLIC_ADDON_SELECT = 'id,store_id,name,description,price,active,image_url';
const PUBLIC_OPTION_GROUP_SELECT = 'id,store_id,name,description,kind,min_choices,max_choices,active,sort_order';
const PUBLIC_OPTION_ITEM_SELECT = 'id,group_id,store_id,name,description,price_delta,active,sort_order';
const PUBLIC_OPTION_LINK_SELECT = 'store_id,product_id,option_group_id,sort_order';
const PUBLIC_VARIANT_SELECT = 'id,product_id,name,price_delta,active,sort_order';
const PUBLIC_PRODUCT_ADDON_SELECT = 'product_id,addon_id';
const PUBLIC_ZONE_SELECT = 'id,store_id,name,aliases,city,state,fee,active,sort_order';
// datetime-local não carrega fuso horário. Serializar no navegador evita que
// um agendamento à meia-noite local seja interpretado como o dia anterior
// pelo Postgres e acabe acionando a validação de estoque imediato.
const serializeScheduledDateTime = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : value;
};
const isMissingSchemaColumn = (error: unknown, column: string) => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes(column.toLowerCase()) && (message.includes('schema cache') || message.includes('column'));
};
const normalizePixCopyPaste = (value: string | null | undefined) => (value || '').trim().replace(/[\r\n\t]+/g, '');

const normalizePaymentOrder = (value: unknown): PaymentMethod[] => {
  const allowed: PaymentMethod[] = ['confirm', 'pix', 'card', 'cash'];
  const input = Array.isArray(value) ? value : [];
  const filtered = input.filter((method): method is PaymentMethod => typeof method === 'string' && allowed.includes(method as PaymentMethod));
  return [...filtered, ...allowed.filter((method) => !filtered.includes(method))];
};

const normalizeDeliveryMode = (value: unknown, deliveryEnabled: boolean): StoreSettings['deliveryMode'] => {
  if (value === 'own' || value === 'ninety_nine' || value === 'none') return value;
  return deliveryEnabled ? 'own' : 'none';
};

const mapStore = (row: StoreRow): StoreSettings => ({
  id: row.id, slug: row.slug, name: row.name, tagline: row.description || 'Pedidos rápidos e do seu jeito.', description: row.description || undefined,
  city: row.city || '', state: row.state || '', zipCode: row.zip_code || '', whatsapp: row.whatsapp || '', showWhatsApp: row.show_whatsapp ?? Boolean(row.whatsapp), instagram: row.instagram || '', address: row.address || '',
  logoUrl: row.logo_url || '/assets/marketing/app-splash-v2.png?v=20261015', logoStoragePath: row.logo_storage_path || undefined,
  heroUrl: row.cover_url || '/assets/food-hero.svg', heroStoragePath: row.cover_storage_path || undefined,
  visualTheme: normalizeStoreVisualTheme(row.visual_theme), storefrontNotice: row.storefront_notice || '', pickupInstructions: row.pickup_instructions || '', hidePublicAddress: row.hide_public_address ?? false,
  pixEnabled: row.pix_enabled, pixReceiptMode: row.pix_receipt_mode || 'key', pixKeyType: row.pix_key_type || '', pixKey: row.pix_key || '', pixCopyPaste: row.pix_copy_paste || '', pixReceiver: row.pix_holder_name || '',
  showPixBeforeConfirmation: row.show_pix_before_confirmation, confirmationPaymentEnabled: row.confirmation_payment_enabled ?? false, cardPaymentEnabled: row.card_payment_enabled ?? false, cashPaymentEnabled: row.cash_payment_enabled ?? false,
  paymentMethodOrder: normalizePaymentOrder(row.payment_method_order), deliveryMode: normalizeDeliveryMode(row.opening_hours && typeof row.opening_hours === 'object' ? (row.opening_hours as { delivery_mode?: unknown }).delivery_mode : undefined, row.delivery_enabled), deliveryEnabled: row.delivery_enabled, pickupEnabled: row.pickup_enabled, minimumOrder: toNumber(row.minimum_order),
  averagePreparationMin: Math.max(0, row.average_preparation_min ?? 30), averagePreparationMax: Math.max(0, row.average_preparation_max ?? 45), allowScheduledOrders: row.allow_scheduled_orders ?? false, kdsEnabled: row.kds_enabled ?? false, kdsNotifyCustomer: row.kds_notify_customer ?? true, notificationsNewOrderEnabled: row.notifications_new_order_enabled ?? true, notificationsScheduledEnabled: row.notifications_scheduled_enabled ?? true, notificationsScheduledLeadMinutes: Math.min(1440, Math.max(5, row.notifications_scheduled_lead_minutes ?? 30)), notificationsDesktopEnabled: row.notifications_desktop_enabled ?? true, notificationsSoundEnabled: row.notifications_sound_enabled ?? true, salesRecoveryEnabled: row.sales_recovery_enabled ?? true, salesRecoveryMinutes: Math.max(5, row.sales_recovery_minutes ?? 10), salesRecoveryWindowHours: Math.min(168, Math.max(1, row.sales_recovery_window_hours ?? 48)), crmEnabled: row.crm_enabled ?? true, crmComeBackDays: Math.min(365, Math.max(1, row.crm_come_back_days ?? 21)), repeatOrderEnabled: row.repeat_order_enabled ?? true, repeatOrderMaxAgeDays: Math.min(365, Math.max(1, row.repeat_order_max_age_days ?? 90)), upsellEnabled: row.upsell_enabled ?? true, upsellLimit: Math.min(6, Math.max(1, row.upsell_limit ?? 3)), messageTemplates: normalizeCustomerMessageTemplates(row.customer_message_templates),
  openingSchedule: normalizeOpeningSchedule(row.opening_hours),
  deliveryStartTime: (() => { const value = row.opening_hours && typeof row.opening_hours === 'object' ? (row.opening_hours as { delivery_start_time?: unknown }).delivery_start_time : ''; return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? value : ''; })(),
  pickupStartTime: (() => { const value = row.opening_hours && typeof row.opening_hours === 'object' ? (row.opening_hours as { pickup_start_time?: unknown }).pickup_start_time : ''; return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? value : '07:00'; })(),
  pickupEndTime: (() => { const value = row.opening_hours && typeof row.opening_hours === 'object' ? (row.opening_hours as { pickup_end_time?: unknown }).pickup_end_time : ''; return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? value : '22:00'; })(),
  openingHours: (() => { const schedule = normalizeOpeningSchedule(row.opening_hours); const legacy = typeof row.opening_hours === 'string' ? row.opening_hours : ((row.opening_hours as { display?: string } | null)?.display || ''); return schedule.days.some((day) => day.enabled) ? formatOpeningSchedule(schedule) : legacy; })(),
  active: row.active, accessStatus: row.access_status || 'online', billingDocument:row.billing_document||'', billingPhone:row.billing_phone||'',
});

const mapCategory = (row: CategoryRow): Category => ({ id: row.id, storeId: row.store_id, name: row.name, slug: row.slug, description: row.description || undefined, active: row.active, sortOrder: row.sort_order });
const mapAddon = (row: AddonRow): Addon => ({ id: row.id, storeId: row.store_id, name: row.name, description: row.description || undefined, price: toNumber(row.price), active: row.active, imageUrl: row.image_url || undefined, imageStoragePath: row.image_storage_path || undefined });
const mapDeliveryZone = (row: DeliveryZoneRow): DeliveryZone => ({ id: row.id, storeId: row.store_id, name: row.name, aliases: row.aliases || [], city: row.city, state: row.state, fee: toNumber(row.fee), active: row.active, sortOrder: row.sort_order });
const mapPlan = (row: PlanRow, features: PlanFeatureRow[] = []): Plan => ({ id: row.id, code: row.code, name: row.name, productLimit: row.product_limit, imageLimitPerProduct: row.image_limit_per_product, customDomain: row.custom_domain, reports: row.reports, prioritySupport: row.priority_support, monthlyPrice:toNumber(row.monthly_price), setupPrice:toNumber(row.setup_price), categoryLimit:row.category_limit, addonLimit:row.addon_limit, adminUserLimit:row.admin_user_limit, sortOrder:row.sort_order ?? 0, active: row.active, featureCodes:features.filter((feature)=>feature.plan_id===row.id&&feature.enabled).map((feature)=>feature.feature_code), featureLimits:Object.fromEntries(features.filter((feature)=>feature.plan_id===row.id&&feature.enabled).map((feature)=>[feature.feature_code,feature.limit_value])) });
const mapOrder = (row: OrderRow): Order => ({
  id: row.id, orderNumber: toNumber(row.order_number), storeId: row.store_id, customerName: row.customer_name, customerPhone: row.customer_phone || undefined, customerEmail: row.customer_email || undefined,
  deliveryType: row.delivery_type, desiredDate: row.desired_date || undefined, desiredPeriod: row.desired_period || undefined, recipientName: row.recipient_name || undefined, recipientPhone: row.recipient_phone || undefined,
  deliveryAddress: row.delivery_address || undefined, deliveryZipCode: row.delivery_zip_code || undefined, deliveryStreet: row.delivery_street || undefined, deliveryNumber: row.delivery_number || undefined,
  deliveryComplement: row.delivery_complement || undefined, deliveryNeighborhood: row.delivery_neighborhood || undefined, deliveryZoneId: row.delivery_zone_id || undefined, deliveryZoneName: row.delivery_zone_name || undefined,
  deliveryFee: toNumber(row.delivery_fee), deliveryCity: row.delivery_city || undefined, deliveryState: row.delivery_state || undefined, referencePoint: row.reference_point || undefined,
  notes: row.notes || undefined, paymentMethod: row.payment_method as PaymentMethod, subtotal: toNumber(row.subtotal), total: toNumber(row.total), status: row.status || 'received',
  paymentStatus: row.payment_status === 'paid' ? 'paid' : 'pending', paymentReceivedAt: row.payment_received_at || undefined, paymentConfirmedBy: row.payment_confirmed_by || undefined,
  needsChange: row.needs_change ?? undefined, changeFor: row.change_for == null ? undefined : toNumber(row.change_for), changeAmount: row.change_amount == null ? undefined : toNumber(row.change_amount),
  scheduledFor: row.scheduled_for || undefined, preparationEstimateMinutes: row.preparation_estimate_minutes ?? undefined, inventoryStatus: row.inventory_status || undefined, source: row.source || 'site', customerInstagram: row.customer_instagram || undefined, acquisitionSource: row.acquisition_source || undefined, whatsappClickedAt: row.whatsapp_clicked_at || undefined, createdAt: row.created_at,
});

const normalizeOrderItemOptionKind = (value: string): OrderItemOption['optionKind'] => {
  const allowed: OrderItemOption['optionKind'][] = ['variant', 'choice', 'addon', 'removal'];
  return allowed.includes(value as OrderItemOption['optionKind']) ? value as OrderItemOption['optionKind'] : 'choice';
};

const mapOrderItem = (row: OrderItemRow, optionRows: OrderItemOptionRow[]): OrderItem => ({
  id: row.id,
  orderId: row.order_id,
  productId: row.product_id || undefined,
  productName: row.product_name,
  quantity: toNumber(row.quantity),
  unitPrice: toNumber(row.unit_price),
  variantName: row.variant_name || undefined,
  variantPriceDelta: toNumber(row.variant_price_delta),
  itemTotal: toNumber(row.item_total),
  partyPackageWeightGrams: row.party_package_weight_grams == null ? undefined : toNumber(row.party_package_weight_grams),
  options: optionRows.map((option) => ({
    id: option.id,
    orderItemId: option.order_item_id,
    groupName: option.group_name,
    optionName: option.option_name,
    optionKind: normalizeOrderItemOptionKind(option.option_kind),
    priceDelta: toNumber(option.price_delta),
    quantity: Math.max(1, toNumber(option.quantity)),
  })),
});
const mapOptionGroups = (groups: OptionGroupRow[], items: OptionItemRow[]): OptionGroup[] => groups.map((group) => ({
  id: group.id, storeId: group.store_id, name: group.name, description: group.description || undefined, kind: group.kind,
  minChoices: group.min_choices, maxChoices: group.max_choices, active: group.active, sortOrder: group.sort_order,
  items: items.filter((item) => item.group_id === group.id).sort((a,b) => a.sort_order - b.sort_order).map((item): OptionItem => ({
    id: item.id, groupId: item.group_id, storeId: item.store_id, name: item.name, description: item.description || undefined,
    priceDelta: toNumber(item.price_delta), active: item.active, sortOrder: item.sort_order,
  })),
}));

const buildProducts = (
  rows: ProductRow[], images: ProductImageRow[], optionGroups: OptionGroupRow[], optionItems: OptionItemRow[], productOptionLinks: ProductOptionGroupRow[],
  legacyVariants: ProductVariantRow[] = [], legacyAddons: Addon[] = [], legacyAddonLinks: ProductAddonRow[] = [],
): Product[] => {
  const groups = mapOptionGroups(optionGroups, optionItems);
  return rows.map((row) => {
    const productImages: ProductImage[] = images.filter((image) => image.product_id === row.id).sort((a,b) => a.sort_order - b.sort_order).map((image) => ({ id:image.id, productId:image.product_id, url:image.url, storagePath:image.storage_path || undefined, altText:image.alt_text || undefined, sortOrder:image.sort_order, isPrimary:image.is_primary }));
    const primaryIndex = productImages.findIndex((image) => image.isPrimary);
    const primary = primaryIndex >= 0 ? productImages[primaryIndex] : productImages[0];
    // A foto marcada como principal precisa ser também a primeira da galeria pública.
    const orderedProductImages = primary ? [primary, ...productImages.filter((image) => image.id !== primary.id)] : productImages;
    const linkedGroupIds = productOptionLinks.filter((link) => link.product_id === row.id).sort((a,b) => a.sort_order - b.sort_order).map((link) => link.option_group_id);
    let productGroups = linkedGroupIds.map((groupId) => groups.find((group) => group.id === groupId)).filter((group): group is OptionGroup => Boolean(group));

    // Fallback de rollout: banco antigo ainda sem grupos Food Service.
    if (!productGroups.length) {
      const variants = legacyVariants.filter((variant) => variant.product_id === row.id && variant.active).sort((a,b) => a.sort_order - b.sort_order);
      if (variants.length) productGroups.push({ id:`legacy-variant-${row.id}`, storeId:row.store_id, name:'Escolha uma opção', kind:'variant', minChoices:1, maxChoices:1, active:true, sortOrder:10, items:variants.map((variant) => ({ id:variant.id, groupId:`legacy-variant-${row.id}`, storeId:row.store_id, name:variant.name, priceDelta:toNumber(variant.price_delta), active:variant.active, sortOrder:variant.sort_order })) });
      const addonIds = new Set(legacyAddonLinks.filter((link) => link.product_id === row.id).map((link) => link.addon_id));
      const addons = legacyAddons.filter((addon) => addonIds.has(addon.id) && addon.active);
      if (addons.length) productGroups.push({ id:`legacy-addon-${row.id}`, storeId:row.store_id, name:'Adicionais', kind:'addon', minChoices:0, maxChoices:addons.length, active:true, sortOrder:20, items:addons.map((addon, index) => ({ id:addon.id, groupId:`legacy-addon-${row.id}`, storeId:row.store_id, name:addon.name, description:addon.description, priceDelta:addon.price, active:addon.active, sortOrder:(index+1)*10 })) });
    }

    const legacyProductAddonIds = new Set(legacyAddonLinks.filter((link) => link.product_id === row.id).map((link) => link.addon_id));
    return {
      id:row.id, storeId:row.store_id, categoryId:row.category_id, name:row.name, slug:row.slug, description:row.description,
      price:toNumber(row.price), promotionalPrice:row.promotional_price == null ? undefined : toNumber(row.promotional_price), active:row.active, featured:row.featured,
      madeToOrder:row.made_to_order, productionDays:row.production_days || 0, stockStatus:row.stock_status || 'available',
      stockLabel:row.stock_status === 'low_stock' ? 'Últimas unidades' : row.stock_status === 'unavailable' ? 'Indisponível' : undefined,
      internalCode:row.internal_code || undefined, availabilityStatus:row.availability_status || (row.stock_status === 'unavailable' ? 'unavailable' : 'available'),
      trackStock:row.track_stock ?? false, stockQuantity:row.stock_quantity ?? undefined, stockReservedQuantity:row.stock_reserved_quantity ?? 0, preparationTimeMinutes:row.preparation_time_minutes ?? 0, sortOrder:row.sort_order ?? 0,
      partyOrderConfig: row.party_order_enabled ? { enabled:true, pricePerGram:toNumber(row.party_price_per_gram), packageWeightGrams:Math.max(1,toNumber(row.party_package_weight_grams) || 100), minimumPackages:Math.max(1,row.party_minimum_packages || 1), leadTimeDays:Math.max(0,row.party_lead_time_days || 0), artworkInstructions:row.party_artwork_instructions || '' } : undefined,
      defaultOrderStatus: row.default_order_status || 'received',
      images:orderedProductImages, imageUrl:primary?.url || '/assets/placeholder-food.svg', visualEmoji:row.visual_emoji || undefined, gallery:orderedProductImages.map((image) => image.url), optionGroups:productGroups,
      variations:legacyVariants.filter((variant) => variant.product_id === row.id).map((variant) => ({ id:variant.id, productId:variant.product_id, name:variant.name, priceDelta:toNumber(variant.price_delta), active:variant.active, sortOrder:variant.sort_order })),
      addons:legacyAddons.filter((addon) => legacyProductAddonIds.has(addon.id)),
    };
  });
};

const createDemoDb = (): DemoDatabase => {
  const activeProductCount = seedProducts.filter((product) => product.active).length;
  return { settings:clone(seedSettings), categories:clone(seedCategories), products:clone(seedProducts), addons:clone(seedAddons), deliveryZones:clone(seedDeliveryZones), orders:clone(seedOrders), planUsage:{ plan:clone(seedPlan), productCount:seedProducts.length, activeProductCount, canCreateProduct:true, canActivateProduct:seedPlan.productLimit == null || activeProductCount < seedPlan.productLimit } };
};
const readDemo = (): DemoDatabase => {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (!raw) return createDemoDb();
    const db = JSON.parse(raw) as DemoDatabase;
    // Versões anteriores da demo não possuem optionGroups e devem ser resetadas.
    if (!Array.isArray(db.products) || db.products.some((product) => !Array.isArray(product.optionGroups))) return createDemoDb();
    // Compatibilidade com demos salvas antes das preferências de notificações.
    db.settings.notificationsNewOrderEnabled ??= true;
    db.settings.notificationsScheduledEnabled ??= true;
    db.settings.notificationsScheduledLeadMinutes ??= 30;
    db.settings.notificationsDesktopEnabled ??= true;
    db.settings.notificationsSoundEnabled ??= true;
    db.planUsage = db.planUsage || createDemoDb().planUsage;
    db.planUsage.productCount = db.products.length;
    db.planUsage.activeProductCount = db.products.filter((product) => product.active).length;
    db.planUsage.canCreateProduct = true;
    db.planUsage.canActivateProduct = db.planUsage.plan.productLimit == null || db.planUsage.activeProductCount < db.planUsage.plan.productLimit;
    return db;
  } catch { return createDemoDb(); }
};
const writeDemo = (db: DemoDatabase) => {
  db.planUsage.productCount = db.products.length;
  db.planUsage.activeProductCount = db.products.filter((product) => product.active).length;
  db.planUsage.canCreateProduct = true;
  db.planUsage.canActivateProduct = db.planUsage.plan.productLimit == null || db.planUsage.activeProductCount < db.planUsage.plan.productLimit;
  try { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); }
  catch { throw new Error('O armazenamento local ficou sem espaço. Use imagens menores ou configure o Supabase Storage.'); }
};

const loadPlanUsage = async (storeId: string, productCount: number, activeProductCount: number): Promise<PlanUsage> => {
  const subs = await restFetch<SubscriptionRow[]>(`food_store_subscriptions?select=*&store_id=eq.${encode(storeId)}&status=in.(trial,active)&order=started_at.desc&limit=10`);
  const current = subs.find((sub) => !sub.expires_at || new Date(sub.expires_at).getTime() >= Date.now());
  if (!current) return { plan:seedPlan, productCount, activeProductCount, canCreateProduct:true, canActivateProduct:seedPlan.productLimit == null || activeProductCount < seedPlan.productLimit };
  const [plans,featureRows] = await Promise.all([
    restFetch<PlanRow[]>(`food_plans?select=*&id=eq.${encode(current.plan_id)}&limit=1`),
    restFetch<PlanFeatureRow[]>(`food_plan_features?select=plan_id,feature_code,enabled,limit_value&plan_id=eq.${encode(current.plan_id)}&enabled=eq.true`),
  ]);
  const plan = plans[0] ? mapPlan(plans[0],featureRows) : seedPlan;
  return { plan, productCount, activeProductCount, canCreateProduct:true, canActivateProduct:plan.productLimit == null || activeProductCount < plan.productLimit, subscriptionStatus:current.status, expiresAt:current.expires_at || undefined };
};

const loadPublicSnapshotFromRpc = async (slug: string, hostname: string): Promise<StoreSnapshot> => {
  let payload: PublicStorefrontRpc;
  payload = await restFetch<PublicStorefrontRpc>('rpc/food_get_public_storefront_v1', { method:'POST', body:{ p_slug:slug || null, p_hostname:hostname || null } });

  if (!payload?.found) throw new Error('Loja não encontrada.');
  const publicStore = payload.store;
  if (payload.status !== 'online') {
    const name = publicStore && 'name' in publicStore ? publicStore.name : 'Loja';
    throw new StorefrontUnavailableError(name || 'Loja');
  }
  if (!publicStore || !('delivery_enabled' in publicStore)) throw new Error('A vitrine pública retornou dados incompletos.');
  const settings = mapStore(publicStore as StoreRow);
  const categories = (payload.categories || []).map(mapCategory);
  const addons = (payload.addons || []).map(mapAddon);
  const deliveryZones = (payload.delivery_zones || []).map(mapDeliveryZone);
  const products = buildProducts(payload.products || [], payload.product_images || [], payload.option_groups || [], payload.option_items || [], payload.product_option_groups || [], payload.product_variants || [], addons, payload.product_addons || []);
  const activeProductCount = products.filter((product) => product.active).length;
  return { settings, categories, products, addons, deliveryZones, orders:[], planUsage:{ plan:seedPlan, productCount:products.length, activeProductCount, canCreateProduct:true, canActivateProduct:true } };
};

// Pedidos mudam com muito mais frequência que catálogo, configurações e plano.
// Esta consulta é reutilizada pelo carregamento completo e pela atualização
// silenciosa da tela de pedidos, evitando baixar novamente todas as imagens e
// estruturas do cardápio a cada ciclo de acompanhamento da operação.
const loadAdminOrders = async (storeId: string): Promise<Order[]> => {
  const orderRows = await restFetchProjected<OrderRow>('food_orders', ADMIN_ORDER_SELECT, `&store_id=eq.${encode(storeId)}&order=created_at.desc&limit=100`);
  if (!orderRows.length) return [];

  const orderIds = orderRows.map((order) => order.id);
  const itemRows = await restFetchProjected<OrderItemRow>('food_order_items', ADMIN_ORDER_ITEM_SELECT, `&order_id=${encode(inFilter(orderIds))}&order=created_at.asc`).catch(() => [] as OrderItemRow[]);
  const itemIds = itemRows.map((item) => item.id);
  const optionRows = itemIds.length
    ? await restFetchProjected<OrderItemOptionRow>('food_order_item_options', ADMIN_ORDER_OPTION_SELECT, `&order_item_id=${encode(inFilter(itemIds))}&order=created_at.asc`).catch(() => [] as OrderItemOptionRow[])
    : [];

  const itemsByOrder = new Map<string, OrderItemRow[]>();
  itemRows.forEach((item) => {
    const rows = itemsByOrder.get(item.order_id) || [];
    rows.push(item);
    itemsByOrder.set(item.order_id, rows);
  });
  const optionsByItem = new Map<string, OrderItemOptionRow[]>();
  optionRows.forEach((option) => {
    const rows = optionsByItem.get(option.order_item_id) || [];
    rows.push(option);
    optionsByItem.set(option.order_item_id, rows);
  });

  return orderRows.map((order) => ({
    ...mapOrder(order),
    items: (itemsByOrder.get(order.id) || []).map((item) => mapOrderItem(item, optionsByItem.get(item.id) || [])),
  }));
};

const loadSnapshotFromSupabase = async (slugOrId: string, admin = false): Promise<StoreSnapshot> => {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slugOrId);
  const storeFilter = isUuid ? `id=eq.${encode(slugOrId)}` : `slug=eq.${encode(slugOrId)}`;
  const stores = await restFetchProjected<StoreRow>('food_stores', admin ? '*' : PUBLIC_STORE_SELECT, `&${storeFilter}&limit=1`);
  if (!stores.length) throw new Error('Loja não encontrada ou sem permissão.');
  const settings = mapStore(stores[0]);
  // Plano não depende do catálogo. Começamos a consulta enquanto o restante
  // do painel carrega, reduzindo uma etapa de rede na abertura do admin.
  const planUsagePromise = admin ? loadPlanUsage(settings.id, 0, 0) : null;
  // Categorias, produtos, zonas e adicionais são independentes. Em vez de
  // esperar cada consulta em sequência, carregamos o primeiro bloco em
  // paralelo para reduzir o tempo de abertura do painel/vitrine.
  const [categoryRows, productRows, deliveryZoneRows, addonRows] = await Promise.all([
    restFetchProjected<CategoryRow>('food_categories', admin ? '*' : PUBLIC_CATEGORY_SELECT, `&store_id=eq.${encode(settings.id)}${admin ? '' : '&active=eq.true'}&order=sort_order.asc,name.asc`),
    restFetchProjected<ProductRow>('food_products', admin ? '*' : PUBLIC_PRODUCT_SELECT, `&store_id=eq.${encode(settings.id)}${admin ? '' : '&active=eq.true'}&order=featured.desc,sort_order.asc,name.asc`),
    restFetchProjected<DeliveryZoneRow>('food_delivery_zones', admin ? '*' : PUBLIC_ZONE_SELECT, `&store_id=eq.${encode(settings.id)}${admin ? '' : '&active=eq.true'}&order=sort_order.asc,name.asc`),
    restFetchProjected<AddonRow>('food_addons', admin ? '*' : PUBLIC_ADDON_SELECT, `&store_id=eq.${encode(settings.id)}${admin ? '' : '&active=eq.true'}&order=name.asc`).catch(() => [] as AddonRow[]),
  ]);
  const productIds = productRows.map((product) => product.id);

  let imageRows: ProductImageRow[] = [], optionGroupRows: OptionGroupRow[] = [], optionItemRows: OptionItemRow[] = [], optionLinks: ProductOptionGroupRow[] = [];
  let variantRows: ProductVariantRow[] = [], addonLinks: ProductAddonRow[] = [];
  if (productIds.length) {
    // Imagens, vínculos de opções e variantes não dependem uns dos outros.
    // Buscá-los juntos reduz a latência da primeira abertura do catálogo.
    const imagePromise = restFetchProjected<ProductImageRow>('food_product_images', admin ? '*' : PUBLIC_IMAGE_SELECT, `&product_id=${encode(inFilter(productIds))}&order=sort_order.asc`);
    const optionLinksPromise = restFetchProjected<ProductOptionGroupRow>('food_product_option_groups', admin ? '*' : PUBLIC_OPTION_LINK_SELECT, `&product_id=${encode(inFilter(productIds))}&order=sort_order.asc`).catch(() => [] as ProductOptionGroupRow[]);
    const variantsPromise = Promise.all([
      restFetchProjected<ProductVariantRow>('food_product_variants', admin ? '*' : PUBLIC_VARIANT_SELECT, `&product_id=${encode(inFilter(productIds))}${admin ? '' : '&active=eq.true'}&order=sort_order.asc`),
      restFetchProjected<ProductAddonRow>('food_product_addons', admin ? '*' : PUBLIC_PRODUCT_ADDON_SELECT, `&product_id=${encode(inFilter(productIds))}`),
    ]).catch(() => [[], []] as [ProductVariantRow[], ProductAddonRow[]]);
    const [loadedImages, loadedOptionLinks, [loadedVariants, loadedAddonLinks]] = await Promise.all([imagePromise, optionLinksPromise, variantsPromise]);
    imageRows = loadedImages;
    optionLinks = loadedOptionLinks;
    variantRows = loadedVariants;
    addonLinks = loadedAddonLinks;
    const groupIds = [...new Set(optionLinks.map((link) => link.option_group_id))];
    if (groupIds.length) {
      try {
        [optionGroupRows, optionItemRows] = await Promise.all([
          restFetchProjected<OptionGroupRow>('food_option_groups', admin ? '*' : PUBLIC_OPTION_GROUP_SELECT, `&id=${encode(inFilter(groupIds))}${admin ? '' : '&active=eq.true'}&order=sort_order.asc`),
          restFetchProjected<OptionItemRow>('food_option_items', admin ? '*' : PUBLIC_OPTION_ITEM_SELECT, `&group_id=${encode(inFilter(groupIds))}${admin ? '' : '&active=eq.true'}&order=sort_order.asc`),
        ]);
      } catch { optionGroupRows = []; optionItemRows = []; optionLinks = []; }
    }
  }

  const categories = categoryRows.map(mapCategory);
  const addons = addonRows.map(mapAddon);
  const deliveryZones = deliveryZoneRows.map(mapDeliveryZone);
  const products = buildProducts(productRows, imageRows, optionGroupRows, optionItemRows, optionLinks, variantRows, addons, addonLinks);
  const activeProductCount = products.filter((product) => product.active).length;
  const [orders, loadedPlanUsage] = await Promise.all([
    admin ? loadAdminOrders(settings.id) : Promise.resolve([] as Order[]),
    planUsagePromise || Promise.resolve({ plan:seedPlan, productCount:0, activeProductCount:0, canCreateProduct:true, canActivateProduct:true }),
  ]);
  const planUsage: PlanUsage = {
    ...loadedPlanUsage,
    productCount: products.length,
    activeProductCount,
    canCreateProduct: true,
    canActivateProduct: loadedPlanUsage.plan.productLimit == null || activeProductCount < loadedPlanUsage.plan.productLimit,
  };
  return { settings, categories, products, addons, deliveryZones, orders, planUsage };
};

export const storeApi = {
  get mode() { return isDemoMode ? 'demo' as const : 'supabase' as const; },

  async loadPublic(slug: string | null = null, hostname = '') {
    if (!isDemoMode) {
      const requestedSlug = slug || appConfig.defaultStoreSlug;
      const publicHostname = hostname && !['localhost','127.0.0.1'].includes(hostname) ? hostname.toLowerCase() : '';
      const cacheKey = `${requestedSlug}::${publicHostname}`;
      const cached = publicSnapshotCache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt < PUBLIC_SNAPSHOT_CACHE_TTL_MS) return clone(cached.snapshot);
      const inFlight = publicSnapshotRequests.get(cacheKey);
      if (inFlight) return clone(await inFlight);

      const request = (async () => {
        try { return await loadPublicSnapshotFromRpc(requestedSlug, publicHostname); }
        catch (error) {
          if (error instanceof StorefrontUnavailableError) throw error;
          // Último fallback para instalações sem os RPCs consolidados.
          try {
            const status = await restFetch<StorefrontStatus>('rpc/food_resolve_storefront_status', { method:'POST', body:{ p_slug:requestedSlug || null, p_hostname:publicHostname || null } });
            if (!status?.found || !status.id) throw new Error('Loja não encontrada.');
            if (status.status !== 'online') throw new StorefrontUnavailableError(status.name || 'Loja');
            return loadSnapshotFromSupabase(status.id, false);
          } catch (fallbackError) {
            if (fallbackError instanceof StorefrontUnavailableError) throw fallbackError;
            let reference = slug || '';
            if (!reference && publicHostname) {
              try { const domains = await restFetch<StoreDomainRow[]>(`food_store_domains?select=store_id,domain,active,is_primary&domain=eq.${encode(publicHostname)}&active=eq.true&limit=1`); reference = domains[0]?.store_id || ''; } catch { /* fallback */ }
            }
            return loadSnapshotFromSupabase(reference || appConfig.defaultStoreSlug, false);
          }
        }
      })();
      publicSnapshotRequests.set(cacheKey, request);
      try {
        const snapshot = await request;
        publicSnapshotCache.set(cacheKey, { snapshot, cachedAt: Date.now() });
        return clone(snapshot);
      } finally {
        if (publicSnapshotRequests.get(cacheKey) === request) publicSnapshotRequests.delete(cacheKey);
      }
    }
    const db = readDemo();
    const activeCategoryIds = new Set(db.categories.filter((category) => category.active).map((category) => category.id));
    return { ...db, categories:db.categories.filter((category) => category.active), products:db.products.filter((product) => product.active && activeCategoryIds.has(product.categoryId)), deliveryZones:db.deliveryZones.filter((zone) => zone.active).sort((a,b) => a.sortOrder - b.sortOrder), orders:[] };
  },

  async loadAdmin(storeId: string) { return isDemoMode ? readDemo() : loadSnapshotFromSupabase(storeId, true); },
  async loadAdminOrders(storeId: string) { return isDemoMode ? readDemo().orders : loadAdminOrders(storeId); },
  invalidatePublicCache() { publicSnapshotCache.clear(); },
  async resetDemo() { const db = createDemoDb(); writeDemo(db); return db; },

  async saveSettings(settings: StoreSettings): Promise<StoreSettings> {
    if (isDemoMode) { const db = readDemo(); db.settings = clone(settings); writeDemo(db); return settings; }
    const payload = {
      name:settings.name, description:settings.tagline, logo_url:settings.logoUrl, logo_storage_path:settings.logoStoragePath ?? null,
      cover_url:settings.heroUrl, cover_storage_path:settings.heroStoragePath ?? null, whatsapp:settings.whatsapp, show_whatsapp:settings.showWhatsApp !== false, instagram:settings.instagram,
      address:settings.address, city:settings.city, state:settings.state, zip_code:settings.zipCode || null, delivery_enabled:settings.deliveryEnabled, pickup_enabled:settings.pickupEnabled,
      visual_theme:normalizeStoreVisualTheme(settings.visualTheme), storefront_notice:settings.storefrontNotice?.trim() || null, pickup_instructions:settings.pickupInstructions?.trim() || null, hide_public_address:settings.hidePublicAddress,
      pix_enabled:settings.pixEnabled, pix_receipt_mode:settings.pixReceiptMode, pix_key_type:settings.pixKeyType || null, pix_key:settings.pixKey || null,
      pix_copy_paste:settings.pixCopyPaste || null, pix_holder_name:settings.pixReceiver || null, show_pix_before_confirmation:settings.showPixBeforeConfirmation,
      confirmation_payment_enabled:settings.confirmationPaymentEnabled, card_payment_enabled:settings.cardPaymentEnabled, cash_payment_enabled:settings.cashPaymentEnabled,
      payment_method_order:settings.paymentMethodOrder, minimum_order:settings.minimumOrder, average_preparation_min:settings.averagePreparationMin,
      average_preparation_max:settings.averagePreparationMax, allow_scheduled_orders:settings.allowScheduledOrders, kds_enabled:settings.kdsEnabled, kds_notify_customer:settings.kdsNotifyCustomer, notifications_new_order_enabled:settings.notificationsNewOrderEnabled, notifications_scheduled_enabled:settings.notificationsScheduledEnabled, notifications_scheduled_lead_minutes:settings.notificationsScheduledLeadMinutes, notifications_desktop_enabled:settings.notificationsDesktopEnabled, notifications_sound_enabled:settings.notificationsSoundEnabled, sales_recovery_enabled:settings.salesRecoveryEnabled, sales_recovery_minutes:settings.salesRecoveryMinutes, sales_recovery_window_hours:settings.salesRecoveryWindowHours??48, crm_enabled:settings.crmEnabled, crm_come_back_days:settings.crmComeBackDays??21, repeat_order_enabled:settings.repeatOrderEnabled, repeat_order_max_age_days:settings.repeatOrderMaxAgeDays??90, upsell_enabled:settings.upsellEnabled, upsell_limit:settings.upsellLimit, customer_message_templates:settings.messageTemplates??{},
      // Mantemos o modo no JSON de horários para não exigir uma migration/coluna
      // antes de o contrato da integração 99 estar definido. O checkout continua
      // independente desse campo e nunca dispara a 99 automaticamente.
      opening_hours:{ display:formatOpeningSchedule(settings.openingSchedule), timezone:settings.openingSchedule.timezone, days:settings.openingSchedule.days, delivery_start_time: settings.deliveryStartTime || null, pickup_start_time: settings.pickupStartTime || '07:00', pickup_end_time: settings.pickupEndTime || '22:00', delivery_mode: settings.deliveryMode || (settings.deliveryEnabled ? 'own' : 'none') }, billing_document:settings.billingDocument||null, billing_phone:settings.billingPhone||null,
    };
    let rows: StoreRow[];
    // PostgREST pode manter o schema cache antigo após uma implantação parcial.
    // Retiramos apenas a coluna reportada e tentamos novamente, preservando as demais.
    const pilotColumns = ['show_whatsapp', 'hide_public_address', 'visual_theme', 'storefront_notice', 'pickup_instructions', 'notifications_new_order_enabled', 'notifications_scheduled_enabled', 'notifications_scheduled_lead_minutes', 'notifications_desktop_enabled', 'notifications_sound_enabled'] as const;
    const requestPayload = { ...payload } as Record<string, unknown>;
    for (let attempt = 0; ; attempt += 1) {
      try {
        rows = await restFetch<StoreRow[]>(`food_stores?id=eq.${encode(settings.id)}&select=*`, { method:'PATCH', body:requestPayload, prefer:'return=representation' });
        break;
      } catch (error) {
        const missingColumn = pilotColumns.find((column) => isMissingSchemaColumn(error, column) && column in requestPayload);
        if (!missingColumn || attempt >= pilotColumns.length) throw error;
        delete requestPayload[missingColumn];
        if (missingColumn === 'show_whatsapp') requestPayload.whatsapp = settings.showWhatsApp === false ? null : settings.whatsapp;
      }
    }
     const persistedRows = await restFetch<StoreRow[]>(`food_stores?id=eq.${encode(settings.id)}&select=*`);
     const persisted = persistedRows[0] || rows[0];
     if (!persisted) throw new Error('A loja não retornou a configuração salva. Recarregue a página e tente novamente.');
     if (settings.pixReceiptMode === 'copy_paste' && normalizePixCopyPaste(settings.pixCopyPaste) && normalizePixCopyPaste(persisted.pix_copy_paste) !== normalizePixCopyPaste(settings.pixCopyPaste)) {
       throw new Error('O PIX Copia e Cola não foi persistido pelo banco. A configuração anterior foi preservada; tente salvar novamente após atualizar a página.');
     }
     return mapStore(persisted);
  },

  async saveCategory(category: Category): Promise<Category> {
    if (isDemoMode) { const db=readDemo(); const index=db.categories.findIndex((item)=>item.id===category.id); if(index>=0)db.categories[index]=clone(category); else db.categories.push(clone(category)); writeDemo(db); return category; }
    const payload={ id:category.id, store_id:category.storeId, name:category.name, slug:category.slug||slugify(category.name), description:category.description||null, active:category.active, sort_order:category.sortOrder };
    const rows=await restFetch<CategoryRow[]>('food_categories?on_conflict=id&select=*',{method:'POST',body:payload,prefer:'resolution=merge-duplicates,return=representation'}); return mapCategory(rows[0]);
  },
  async deleteCategory(id: string) {
    if (isDemoMode) { const db=readDemo(); if(db.products.some((product)=>product.categoryId===id))throw new Error('Existem produtos vinculados a esta categoria.'); db.categories=db.categories.filter((category)=>category.id!==id); writeDemo(db); return; }
    await restFetch<unknown>(`food_categories?id=eq.${encode(id)}`,{method:'DELETE'});
  },

  // API legada mantida durante a transição. Novos adicionais devem ser criados em optionGroups.
  async saveAddon(addon: Addon): Promise<Addon> {
    if(isDemoMode){const db=readDemo();const index=db.addons.findIndex((item)=>item.id===addon.id);if(index>=0)db.addons[index]=clone(addon);else db.addons.push(clone(addon));writeDemo(db);return addon;}
    const payload={id:addon.id,store_id:addon.storeId,name:addon.name,description:addon.description||null,price:addon.price,active:addon.active,image_url:addon.imageUrl||null,image_storage_path:addon.imageStoragePath||null};
    const rows=await restFetch<AddonRow[]>('food_addons?on_conflict=id&select=*',{method:'POST',body:payload,prefer:'resolution=merge-duplicates,return=representation'});return mapAddon(rows[0]);
  },
  async deleteAddon(id:string){ if(isDemoMode){const db=readDemo();db.addons=db.addons.filter((addon)=>addon.id!==id);writeDemo(db);return;} await restFetch<unknown>(`food_addons?id=eq.${encode(id)}`,{method:'DELETE'}); },
  async uploadAddonImage(storeId:string,addonId:string,file:File):Promise<{url:string;path?:string}>{
    const maxSize=5*1024*1024; const allowed=new Set(['image/jpeg','image/png','image/webp']); if(!allowed.has(file.type))throw new Error('Use uma imagem JPG, PNG ou WEBP.'); if(file.size>maxSize)throw new Error('A imagem excede 5 MB.');
    const prepared=await optimizeImageForUpload(file,'addon');
    if(isDemoMode){const url=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(prepared);});return{url};}
    const ext=(prepared.name.split('.').pop()||'webp').toLowerCase().replace(/[^a-z0-9]/g,''); const path=`stores/${storeId}/options/${addonId}/${createId()}.${ext}`; return storageUpload('food-store-assets',path,prepared);
  },

  async saveDeliveryZones(zones: DeliveryZone[]): Promise<DeliveryZone[]> {
    if(isDemoMode){const db=readDemo();const byId=new Map(zones.map((zone)=>[zone.id,clone(zone)]));db.deliveryZones=db.deliveryZones.map((zone)=>byId.get(zone.id)||zone);for(const zone of zones)if(!db.deliveryZones.some((item)=>item.id===zone.id))db.deliveryZones.push(clone(zone));writeDemo(db);return zones;}
    if(!zones.length)return[];
    const payload=zones.map((zone)=>({id:zone.id,store_id:zone.storeId,name:zone.name,aliases:zone.aliases,city:zone.city,state:zone.state.toUpperCase(),fee:zone.fee,active:zone.active,sort_order:zone.sortOrder}));
    const rows=await restFetch<DeliveryZoneRow[]>('food_delivery_zones?on_conflict=id&select=*',{method:'POST',body:payload,prefer:'resolution=merge-duplicates,return=representation'}); return rows.map(mapDeliveryZone);
  },
  async deleteDeliveryZone(id:string){if(isDemoMode){const db=readDemo();db.deliveryZones=db.deliveryZones.filter((zone)=>zone.id!==id);writeDemo(db);return;}await restFetch<unknown>(`food_delivery_zones?id=eq.${encode(id)}`,{method:'DELETE'});},

  async saveProduct(product: Product, options: { isNew?: boolean } = {}): Promise<Product> {
    if(isDemoMode){const db=readDemo();const existing=db.products.find((item)=>item.id===product.id);const activeCount=db.products.filter((item)=>item.active&&item.id!==product.id).length;const limit=db.planUsage.plan.productLimit;if(product.active&&limit!=null&&activeCount>=limit)throw new Error(`Seu plano permite até ${limit} produtos ativos.`);db.products=existing?db.products.map((item)=>item.id===product.id?clone(product):item):[clone(product),...db.products];writeDemo(db);return product;}
    const partyConfig = product.partyOrderConfig?.enabled ? product.partyOrderConfig : undefined;
    const payload={id:product.id,store_id:product.storeId,category_id:product.categoryId,name:product.name,slug:product.slug||slugify(product.name),description:product.description,price:product.price,promotional_price:product.promotionalPrice??null,active:product.active,featured:product.featured,made_to_order:Boolean(partyConfig?.enabled || product.madeToOrder),production_days:partyConfig?.leadTimeDays ?? product.productionDays ?? 0,...(options.isNew?{stock_status:product.availabilityStatus==='available'?(product.trackStock&&Number(product.stockQuantity||0)<=0?'low_stock':product.stockStatus==='unavailable'?'available':product.stockStatus):'unavailable',stock_quantity:product.trackStock?product.stockQuantity??0:null}:{}),internal_code:product.internalCode||null,visual_emoji:product.visualEmoji?.trim()||null,availability_status:product.availabilityStatus,track_stock:product.trackStock,preparation_time_minutes:product.preparationTimeMinutes,sort_order:product.sortOrder,party_order_enabled:Boolean(partyConfig?.enabled),party_price_per_gram:partyConfig?.pricePerGram ?? null,party_package_weight_grams:partyConfig?.packageWeightGrams ?? null,party_minimum_packages:partyConfig?.minimumPackages ?? 1,party_lead_time_days:partyConfig?.leadTimeDays ?? 0,party_artwork_instructions:partyConfig?.artworkInstructions?.trim() || null,party_artwork_url:null,default_order_status:product.defaultOrderStatus || 'received'};
    await restFetch<ProductRow[]>('food_products?on_conflict=id&select=*',{method:'POST',body:payload,prefer:'resolution=merge-duplicates,return=representation'});

    await restFetch<unknown>(`food_product_option_groups?product_id=eq.${encode(product.id)}`,{method:'DELETE'});
    for (const [groupIndex, group] of product.optionGroups.entries()) {
      const groupPayload={id:group.id,store_id:product.storeId,name:group.name,description:group.description||null,kind:group.kind,min_choices:group.minChoices,max_choices:group.maxChoices,active:group.active,sort_order:(groupIndex+1)*10};
      await restFetch<unknown>('food_option_groups?on_conflict=id',{method:'POST',body:groupPayload,prefer:'resolution=merge-duplicates'});
      await restFetch<unknown>(`food_option_items?group_id=eq.${encode(group.id)}`,{method:'DELETE'});
      if(group.items.length)await restFetch<unknown>('food_option_items',{method:'POST',body:group.items.map((item,itemIndex)=>({id:item.id,group_id:group.id,store_id:product.storeId,name:item.name,description:item.description||null,price_delta:group.kind==='removal'?0:item.priceDelta,active:item.active,sort_order:(itemIndex+1)*10}))});
      await restFetch<unknown>('food_product_option_groups',{method:'POST',body:{store_id:product.storeId,product_id:product.id,option_group_id:group.id,sort_order:(groupIndex+1)*10}});
    }
    return product;
  },

  /** Ações rápidas não regravam opções, imagens ou saldos de estoque. */
  async updateProductCommercial(storeId: string, productId: string, input: ProductCommercialUpdate): Promise<ProductCommercialUpdate> {
    if (!storeId || !productId) throw new Error('Selecione uma loja e um produto válidos.');
    const payload: Record<string, unknown> = {};
    if ('price' in input || 'promotionalPrice' in input) {
      if (!('price' in input) || !('promotionalPrice' in input) || !Number.isFinite(input.price) || Number(input.price) < 0
        || (input.promotionalPrice != null && (!Number.isFinite(input.promotionalPrice) || input.promotionalPrice < 0 || input.promotionalPrice > Number(input.price)))) {
        throw new Error('Informe um preço válido e uma promoção menor ou igual ao preço normal.');
      }
      payload.price = roundMoney(Number(input.price));
      payload.promotional_price = input.promotionalPrice == null ? null : roundMoney(input.promotionalPrice);
    }
    if (input.availabilityStatus !== undefined) {
      if (!['available', 'unavailable', 'sold_out'].includes(input.availabilityStatus)) throw new Error('Disponibilidade inválida.');
      payload.availability_status = input.availabilityStatus;
    }
    if (input.active !== undefined) {
      if (typeof input.active !== 'boolean') throw new Error('Publicação inválida.');
      payload.active = input.active;
    }
    if (!Object.keys(payload).length) throw new Error('Nenhuma alteração informada.');
    if (isDemoMode) {
      const db = readDemo();
      const product = db.products.find(item => item.id === productId && item.storeId === storeId);
      if (!product) throw new Error('Produto não encontrado na loja selecionada.');
      const limit = db.planUsage.plan.productLimit;
      if (input.active && limit != null && db.products.filter(item => item.active && item.id !== productId).length >= limit) throw new Error(`Seu plano permite até ${limit} produtos ativos.`);
      const defined = Object.fromEntries(Object.entries(input).filter(([,value])=>value!==undefined)) as ProductCommercialUpdate;
      if ('promotionalPrice' in input) defined.promotionalPrice = input.promotionalPrice;
      Object.assign(product, defined);
      writeDemo(db);
      return defined;
    }
    const rows = await restFetch<Array<{id: string; store_id: string; price: number | string; promotional_price: number | string | null; availability_status: Product['availabilityStatus']; active: boolean}>>(`food_products?id=eq.${encode(productId)}&store_id=eq.${encode(storeId)}&select=id,store_id,price,promotional_price,availability_status,active`, {
      method: 'PATCH', body: payload, prefer: 'return=representation',
    });
    if (rows.length !== 1 || rows[0].id !== productId || rows[0].store_id !== storeId) {
      throw new Error('A alteração não foi confirmada. Verifique a loja selecionada e sua permissão antes de tentar novamente.');
    }
    const row=rows[0];
    const confirmed: ProductCommercialUpdate = {};
    if ('price' in payload) { confirmed.price=Number(row.price); confirmed.promotionalPrice=row.promotional_price==null ? undefined : Number(row.promotional_price); }
    if ('availability_status' in payload) confirmed.availabilityStatus=row.availability_status;
    if ('active' in payload) confirmed.active=row.active;
    return confirmed;
  },

  /** Atualiza somente o saldo operacional do produto.
   * Evita reenviar opções, imagens e configurações de festa quando o admin
   * usa os botões rápidos de estoque.
   */
  async updateProductStock(storeId: string, productId: string, input: { mode: 'set' | 'add' | 'remove'; quantity: number; reason: string; idempotencyKey?: string }): Promise<Pick<Product, 'stockQuantity' | 'stockReservedQuantity' | 'stockStatus' | 'availabilityStatus'>> {
    if (!productId || !Number.isSafeInteger(input.quantity) || input.quantity < 0 || !input.reason.trim()) throw new Error('Informe uma quantidade e um motivo válidos.');
    if (isDemoMode) {
      const db = readDemo();
      const current = db.products.find((product) => product.id === productId);
      if (!current?.trackStock) throw new Error('Produto não encontrado ou sem controle de estoque.');
      const physical = Number(current.stockQuantity || 0); const reserved = Number(current.stockReservedQuantity || 0);
      const stockQuantity = input.mode === 'set' ? input.quantity : input.mode === 'add' ? physical + input.quantity : physical - input.quantity;
      if (stockQuantity < 0) throw new Error('O estoque físico não pode ser negativo.');
      const available = stockQuantity - reserved;
      const updated = { stockQuantity, stockReservedQuantity: reserved, stockStatus: (available <= 3 ? 'low_stock' : 'available') as Product['stockStatus'], availabilityStatus: (available <= 0 ? 'sold_out' : 'available') as Product['availabilityStatus'] };
      db.products = db.products.map((product) => product.id === productId ? { ...product, ...updated } : product);
      writeDemo(db);
      return updated;
    }
    let result: { stock_quantity: number; stock_reserved_quantity: number; stock_status: Product['stockStatus']; availability_status: Product['availabilityStatus'] };
    try {
      result = await restFetch<typeof result>('rpc/food_adjust_product_stock_v1', {
        method: 'POST',
        body: { p_store_id: storeId, p_product_id: productId, p_mode: input.mode, p_quantity: input.quantity, p_reason: input.reason.trim(), p_idempotency_key: input.idempotencyKey || createId() },
      });
    } catch (error) {
      const missingFunction = error instanceof SupabaseHttpError
        && (error.details === 'PGRST202' || /Could not find the function public\.food_adjust_product_stock_v1/i.test(error.message));
      if (missingFunction) {
        throw new Error('O ajuste de estoque ainda não está disponível no banco conectado. A migration 20261023101500_food_product_stock_adjustments precisa estar aplicada e o cache do PostgREST atualizado. Nenhum ajuste foi confirmado.');
      }
      throw error;
    }
    if (!result || !Number.isFinite(result.stock_quantity)) throw new Error('O servidor não retornou o estoque atualizado.');
    return { stockQuantity: result.stock_quantity, stockReservedQuantity: result.stock_reserved_quantity, stockStatus: result.stock_status, availabilityStatus: result.availability_status };
  },

  async deleteProduct(id:string){
    if(isDemoMode){const db=readDemo();db.products=db.products.filter((product)=>product.id!==id);writeDemo(db);return;}
    const images=await restFetch<ProductImageRow[]>(`food_product_images?select=*&product_id=eq.${encode(id)}`); await restFetch<unknown>(`food_products?id=eq.${encode(id)}`,{method:'DELETE'});
    const paths=images.map((image)=>image.storage_path).filter((path):path is string=>Boolean(path)); if(paths.length){try{await storageDelete('food-product-images',paths)}catch(error){console.warn('Produto removido, mas houve falha ao limpar imagens.',error)}}
  },

  async uploadProductImages(storeId:string,productId:string,files:File[],current:ProductImage[]):Promise<ProductImage[]>{
    const maxSize=5*1024*1024;const allowed=new Set(['image/jpeg','image/png','image/webp']);for(const file of files){if(!allowed.has(file.type))throw new Error(`Formato não permitido: ${file.name}`);if(file.size>maxSize)throw new Error(`${file.name} excede 5 MB.`);}
    const preparedFiles=await Promise.all(files.map((file)=>optimizeImageForUpload(file,'product')));
    if(isDemoMode){
      const readFile=(file:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
      const urls=await Promise.all(preparedFiles.map(readFile));
      const next=[...current,...urls.map((url,index)=>({id:createId(),productId,url,altText:files[index].name,sortOrder:current.length+index,isPrimary:current.length===0&&index===0}))];
      const db=readDemo();db.products=db.products.map((product)=>product.id===productId?{...product,images:next,imageUrl:(next.find((image)=>image.isPrimary)||next[0])?.url||product.imageUrl,gallery:next.map((image)=>image.url)}:product);writeDemo(db);return next;
    }
    // Cada imagem é independente: enviar em paralelo reduz o tempo percebido
    // ao cadastrar uma galeria, enquanto o Promise.all preserva a ordem escolhida.
    const added=await Promise.all(preparedFiles.map(async (file,index)=>{
      const ext=(file.name.split('.').pop()||'webp').toLowerCase().replace(/[^a-z0-9]/g,'');
      const path=`stores/${storeId}/products/${productId}/${createId()}.${ext}`;
      const uploaded=await storageUpload('food-product-images',path,file);
      const row={id:createId(),product_id:productId,url:uploaded.url,storage_path:uploaded.path,alt_text:files[index].name,sort_order:current.length+index,is_primary:current.length===0&&index===0};
      const result=await restFetch<ProductImageRow[]>('food_product_images?select=*',{method:'POST',body:row,prefer:'return=representation'});
      const saved=result[0];
      return{id:saved.id,productId:saved.product_id,url:saved.url,storagePath:saved.storage_path||undefined,altText:saved.alt_text||undefined,sortOrder:saved.sort_order,isPrimary:saved.is_primary};
    }));
    return[...current,...added];
  },
  async deleteProductImage(image:ProductImage){if(isDemoMode){const db=readDemo();db.products=db.products.map((product)=>{if(product.id!==image.productId)return product;let next=product.images.filter((item)=>item.id!==image.id);if(image.isPrimary&&next.length&&!next.some((item)=>item.isPrimary))next=next.map((item,index)=>({...item,isPrimary:index===0}));const primary=next.find((item)=>item.isPrimary)||next[0];return{...product,images:next,gallery:next.map((item)=>item.url),imageUrl:primary?.url||'/assets/placeholder-food.svg'};});writeDemo(db);return;}await restFetch<unknown>(`food_product_images?id=eq.${encode(image.id)}`,{method:'DELETE'});if(image.isPrimary){const remaining=await restFetch<ProductImageRow[]>(`food_product_images?select=*&product_id=eq.${encode(image.productId)}&order=sort_order.asc&limit=1`);if(remaining[0])await restFetch<unknown>(`food_product_images?id=eq.${encode(remaining[0].id)}`,{method:'PATCH',body:{is_primary:true}});}if(image.storagePath)await storageDelete('food-product-images',[image.storagePath]);},
  async setPrimaryImage(productId:string,imageId:string){if(isDemoMode){const db=readDemo();db.products=db.products.map((product)=>product.id===productId?{...product,images:product.images.map((image)=>({...image,isPrimary:image.id===imageId})),imageUrl:product.images.find((image)=>image.id===imageId)?.url||product.imageUrl}:product);writeDemo(db);return;}await restFetch<unknown>(`food_product_images?product_id=eq.${encode(productId)}`,{method:'PATCH',body:{is_primary:false}});await restFetch<unknown>(`food_product_images?id=eq.${encode(imageId)}`,{method:'PATCH',body:{is_primary:true}});},
  async uploadStoreAsset(storeId:string,file:File,kind:'logo'|'cover'):Promise<{url:string;path?:string}>{const maxSize=5*1024*1024;const allowed=new Set(['image/jpeg','image/png','image/webp']);if(!allowed.has(file.type))throw new Error('Use uma imagem JPG, PNG ou WEBP.');if(file.size>maxSize)throw new Error('A imagem excede 5 MB.');const prepared=await optimizeImageForUpload(file,'storeAsset');if(isDemoMode){const url=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(prepared);});return{url};}const ext=(prepared.name.split('.').pop()||'webp').toLowerCase().replace(/[^a-z0-9]/g,'');const path=`stores/${storeId}/${kind}/${createId()}.${ext}`;return storageUpload('food-store-assets',path,prepared);},

  async createOrder(store:StoreSettings,items:CartItem[],form:CheckoutData,subtotal:number,security:CheckoutSecurityContext={}):Promise<CreateOrderResult>{
    const deliveryAddress=form.fulfillment==='delivery'?[`${form.street}${form.addressNumber?`, ${form.addressNumber}`:''}`,form.complement,`${form.neighborhood}${form.deliveryCity?` - ${form.deliveryCity}`:''}${form.deliveryState?`/${form.deliveryState}`:''}`,form.zipCode?`CEP ${form.zipCode}`:'',form.referencePoint?`Referência: ${form.referencePoint}`:''].filter(Boolean).join(' | '):null;
    const payload={
      store_id:store.id,customer_name:form.customerName,customer_phone:form.customerPhone||null,customer_email:form.customerEmail||null,
      receipt_pickup_location_id:form.receiptPickupLocationId||null,delivery_type:form.fulfillment,pickup_location_id:form.fulfillment==='pickup'?form.pickupLocationId||null:null,delivery_address:deliveryAddress,delivery_zip_code:form.fulfillment==='delivery'?form.zipCode||null:null,
      delivery_street:form.fulfillment==='delivery'?form.street||null:null,delivery_number:form.fulfillment==='delivery'?form.addressNumber||null:null,
      delivery_complement:form.fulfillment==='delivery'?form.complement||null:null,delivery_neighborhood:form.fulfillment==='delivery'?form.neighborhood||null:null,
      delivery_zone_id:form.fulfillment==='delivery'?form.deliveryZoneId||null:null,delivery_city:form.fulfillment==='delivery'?form.deliveryCity||null:null,
      delivery_state:form.fulfillment==='delivery'?form.deliveryState||null:null,reference_point:form.fulfillment==='delivery'?form.referencePoint||null:null,
      notes:form.notes||null,payment_method:form.paymentMethod,needs_change:form.paymentMethod==='cash'&&form.needsChange,change_for:form.paymentMethod==='cash'&&form.needsChange?form.changeFor:null,
      scheduled_for:serializeScheduledDateTime(form.scheduledFor),flexible_timing_confirmed:form.flexibleTimingConfirmed,review_confirmed:form.reviewConfirmed,
      // Atribuição opcional: a Edge Function grava estes dois campos quando a
      // migração correspondente já estiver ativa. O pedido continua compatível
      // com instalações antigas caso as colunas ainda não existam.
      customer_instagram: form.customerInstagram?.trim() || null,
      acquisition_source: form.acquisitionSource || null,
       items:items.map((item)=>({product_id:item.productId,quantity:item.quantity,party_package_weight_grams:item.partyPackageWeightGrams ?? null,options:item.options.map((option)=>({group_id:option.groupId,item_id:option.itemId,quantity:option.quantity}))})),
    };
    if(isDemoMode){
      const db=readDemo();if(subtotal<store.minimumOrder)throw new Error(`Pedido mínimo de R$ ${store.minimumOrder.toFixed(2).replace('.',',')}.`);if(!form.reviewConfirmed)throw new Error('Confirme que revisou os dados do pedido.');
      const selectedZone=form.fulfillment==='delivery'?db.deliveryZones.find((zone)=>zone.id===form.deliveryZoneId&&zone.active):undefined;if(form.fulfillment==='delivery'&&!selectedZone)throw new Error('Selecione um bairro/área de entrega disponível.');
      if(form.paymentMethod==='cash'&&form.needsChange&&(!form.changeFor||form.changeFor<=subtotal+(selectedZone?.fee??0)))throw new Error('O valor para troco deve ser maior que o total do pedido.');
      const id=createId();const orderNumber=Math.max(28623,...db.orders.map((order)=>order.orderNumber||0))+1;const deliveryFee=selectedZone?.fee??0;const total=roundMoney(subtotal+deliveryFee);const extraPrep=items.reduce((max,item)=>Math.max(max,db.products.find((product)=>product.id===item.productId)?.preparationTimeMinutes||0),0);const prep=Math.max(store.averagePreparationMin,store.averagePreparationMax)+extraPrep;
      db.orders.unshift({id,orderNumber,storeId:store.id,customerName:form.customerName,customerPhone:form.customerPhone||undefined,customerEmail:form.customerEmail||undefined,deliveryType:form.fulfillment,deliveryAddress:deliveryAddress||undefined,deliveryZipCode:form.zipCode||undefined,deliveryStreet:form.street||undefined,deliveryNumber:form.addressNumber||undefined,deliveryComplement:form.complement||undefined,deliveryNeighborhood:selectedZone?.name||form.neighborhood||undefined,deliveryZoneId:selectedZone?.id,deliveryZoneName:selectedZone?.name,deliveryFee,deliveryCity:form.deliveryCity||undefined,deliveryState:form.deliveryState||undefined,referencePoint:form.referencePoint||undefined,notes:form.notes||undefined,paymentMethod:form.paymentMethod,subtotal:roundMoney(subtotal),total,status:'received',paymentStatus:'pending',needsChange:form.paymentMethod==='cash'&&form.needsChange,changeFor:form.changeFor||undefined,changeAmount:form.changeFor?roundMoney(form.changeFor-total):undefined,scheduledFor:form.scheduledFor||undefined,preparationEstimateMinutes:prep,source:'site',customerInstagram:form.customerInstagram?.trim()||undefined,acquisitionSource:form.acquisitionSource,createdAt:new Date().toISOString()});writeDemo(db);return{orderId:id,orderNumber,total};
    }
    const created=await invokePublicFunction<{orderId:string;orderNumber:number|string;total:number|string;receiptPickupLocationId?:string|null}>('food-public-checkout',{payload,turnstileToken:security.turnstileToken||'',analyticsSessionId:security.analyticsSessionId||'',requestId:security.requestId||''});
    if(!created?.orderId)throw new Error('O pedido foi registrado, mas o identificador não foi retornado.');return{orderId:created.orderId,orderNumber:toNumber(created.orderNumber),total:toNumber(created.total),receiptPickupLocationId:created.receiptPickupLocationId};
  },

  async createManualOrder(store: StoreSettings, products: Product[], input: ManualOrderInput): Promise<CreateOrderResult> {
    if (!input.customerName.trim() || !input.items.length) throw new Error('Informe o cliente e pelo menos um produto.');

    if (isDemoMode) {
      let subtotal = 0;
      const now = new Date().toISOString();
      let requiresRestock = false;
      const scheduledAt = input.scheduledFor ? new Date(input.scheduledFor) : null;
      const tomorrow = new Date();
      tomorrow.setHours(0, 0, 0, 0);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (scheduledAt && (!Number.isFinite(scheduledAt.getTime()) || scheduledAt < tomorrow)) throw new Error('O lançamento futuro precisa ser agendado a partir de amanhã.');
      if (input.fulfillment === 'delivery' && store.deliveryStartTime) {
        const [startHour, startMinute] = store.deliveryStartTime.split(':').map(Number);
        const reference = scheduledAt || new Date();
        if (reference.getHours() * 60 + reference.getMinutes() < startHour * 60 + startMinute) {
          throw new Error(`O delivery só pode ser lançado a partir das ${store.deliveryStartTime}.`);
        }
      }

      for (const item of input.items) {
        const product = products.find((current) => current.id === item.productId);
        const productUnavailable = !product || !product.active || product.availabilityStatus !== 'available' || product.stockStatus === 'unavailable';
        if (productUnavailable && !scheduledAt) {
          throw new Error('Um dos produtos selecionados não está disponível.');
        }
        if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) throw new Error('Quantidade inválida.');
        if (!product) throw new Error('Um dos produtos selecionados não foi encontrado.');
        const availableStock = product.trackStock
          ? Math.max(0, Number(product.stockQuantity || 0) - Number(product.stockReservedQuantity || 0))
          : Number.POSITIVE_INFINITY;
        if (product.trackStock && item.quantity > availableStock) {
          if (!scheduledAt) throw new Error('Estoque insuficiente.');
          requiresRestock = true;
        }
        if (productUnavailable) requiresRestock = true;

        let unitPrice = product.promotionalPrice ?? product.price;
        for (const group of product.optionGroups.filter((current) => current.active)) {
          const selections = item.options.filter((option) => option.groupId === group.id);
          const distinctSelections = new Set(selections.map((option) => option.itemId));
          if (distinctSelections.size < group.minChoices || distinctSelections.size > group.maxChoices) {
            throw new Error(`Revise as opções obrigatórias de ${product.name}.`);
          }
        }

        const selectedOptionIds = new Set<string>();
        for (const option of item.options) {
          const group = product.optionGroups.find((current) => current.id === option.groupId && current.active);
          const choice = group?.items.find((current) => current.id === option.itemId && current.active);
          if (!group || !choice || selectedOptionIds.has(option.itemId) || option.quantity < 1 || option.quantity > 20) {
            throw new Error(`Revise as opções de ${product.name}.`);
          }
          if (group.kind !== 'addon' && option.quantity !== 1) throw new Error(`Quantidade inválida para uma opção de ${product.name}.`);
          selectedOptionIds.add(option.itemId);
          unitPrice += choice.priceDelta * option.quantity;
        }
        subtotal += roundMoney(unitPrice * item.quantity);
      }

      if (input.status === 'cancelled' && input.received) throw new Error('Um pedido cancelado não pode ser marcado como recebido.');
      const db = readDemo();
      const id = createId();
      const orderNumber = Math.max(28623, ...db.orders.map((order) => order.orderNumber || 0)) + 1;
      db.orders.unshift({
        id,
        orderNumber,
        storeId: store.id,
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone?.trim() || undefined,
        deliveryType: input.fulfillment || 'pickup',
        paymentMethod: input.paymentMethod,
        scheduledFor: scheduledAt?.toISOString(),
        subtotal: roundMoney(subtotal),
        total: roundMoney(subtotal),
        status: input.status,
        paymentStatus: input.received ? 'paid' : 'pending',
        inventoryStatus: requiresRestock ? 'awaiting_restock' : undefined,
        paymentReceivedAt: input.received ? now : undefined,
        paymentConfirmedBy: input.received ? 'demo-admin' : undefined,
        notes: input.notes?.trim() || undefined,
        source: input.source,
        createdAt: now,
      });
      writeDemo(db);
      return { orderId: id, orderNumber, total: roundMoney(subtotal) };
    }

    const rows = await restFetch<Array<{ order_id: string; order_number: number | string; order_total: number | string }>>(
      'rpc/food_create_admin_order_v1',
      {
        method: 'POST',
        body: {
          payload: {
            store_id: store.id,
            stock_location_id: input.stockLocationId || null,
            admin_request_id: input.requestId || null,
            customer_name: input.customerName.trim(),
            customer_phone: input.customerPhone?.trim() || null,
            delivery_type: input.fulfillment || 'pickup',
            source: input.source,
            payment_method: input.paymentMethod,
            status: input.status,
            received: input.received,
            scheduled_for: serializeScheduledDateTime(input.scheduledFor),
            notes: input.notes?.trim() || null,
            items: input.items.map((item) => ({
              product_id: item.productId,
              quantity: item.quantity,
              options: item.options.map((option) => ({
                group_id: option.groupId,
                item_id: option.itemId,
                quantity: option.quantity,
              })),
            })),
          },
        },
      },
    );
    const created = rows[0];
    if (!created?.order_id) throw new Error('O pedido avulso foi registrado, mas o identificador não foi retornado.');
    return { orderId: created.order_id, orderNumber: toNumber(created.order_number), total: toNumber(created.order_total) };
  },

  async confirmOrderPayment(orderId:string):Promise<{alreadyPaid:boolean;paymentReceivedAt?:string}>{
    if(isDemoMode){
      const db=readDemo();
      const index=db.orders.findIndex((order)=>order.id===orderId);
      if(index<0)throw new Error('Pedido não encontrado.');
      if(db.orders[index].status==='cancelled')throw new Error('Não é possível confirmar o recebimento de um pedido cancelado.');
      const alreadyPaid=db.orders[index].paymentStatus==='paid';
      const receivedAt=db.orders[index].paymentReceivedAt||new Date().toISOString();
      db.orders[index]={...db.orders[index],paymentStatus:'paid',paymentReceivedAt:receivedAt};
      writeDemo(db);
      return {alreadyPaid,paymentReceivedAt:receivedAt};
    }
    const result=await restFetch<{ok:boolean;alreadyPaid?:boolean;paymentReceivedAt?:string}>('rpc/food_confirm_order_payment_v1',{method:'POST',body:{p_order_id:orderId}});
    return {alreadyPaid:Boolean(result?.alreadyPaid),paymentReceivedAt:result?.paymentReceivedAt};
  },

  async updateOrderDetails(storeId: string, orderId: string, input: OrderDetailsUpdate): Promise<void> {
    const customerName = input.customerName.trim();
    if (customerName.length < 2) throw new Error('Informe o nome do cliente.');

    if (isDemoMode) {
      const db = readDemo();
      const index = db.orders.findIndex((order) => order.id === orderId && order.storeId === storeId);
      if (index < 0) throw new Error('Pedido não encontrado.');
      if (input.items) {
        if (db.orders[index].paymentStatus === 'paid') throw new Error('Itens de um pedido já recebido não podem ser alterados.');
        const quantities = new Map(input.items.map((item) => [item.itemId, Math.max(0, Math.min(99, Math.floor(item.quantity)))]));
        const currentItems = db.orders[index].items || [];
        const nextItems = currentItems.filter((item) => quantities.has(item.id) && (quantities.get(item.id) || 0) > 0).map((item) => {
          const quantity = quantities.get(item.id) ?? item.quantity;
          const unitPrice = item.quantity > 0 ? item.itemTotal / item.quantity : item.unitPrice + item.variantPriceDelta;
          return { ...item, quantity, itemTotal: roundMoney(unitPrice * quantity) };
        });
        if (!nextItems.length) throw new Error('Mantenha pelo menos um produto no pedido.');
        const subtotal = roundMoney(nextItems.reduce((sum, item) => sum + item.itemTotal, 0));
        db.orders[index] = { ...db.orders[index], items: nextItems, subtotal, total: roundMoney(subtotal + (db.orders[index].deliveryFee || 0)) };
      }
      db.orders[index] = {
        ...db.orders[index],
        customerName,
        customerPhone: input.customerPhone?.trim() || undefined,
        scheduledFor: input.scheduledFor || undefined,
        notes: input.notes?.trim() || undefined,
      };
      writeDemo(db);
      return;
    }

    if (input.items) {
      await restFetch<{ subtotal: number; total: number }>('rpc/food_update_order_items_v1', {
        method: 'POST',
        body: { p_order_id: orderId, p_items: input.items.map((item) => ({ item_id: item.itemId, quantity: item.quantity })) },
      });
    }

    const rows = await restFetch<OrderRow[]>(
      `food_orders?id=eq.${encode(orderId)}&store_id=eq.${encode(storeId)}&select=*`,
      {
        method: 'PATCH',
        body: {
          customer_name: customerName,
          customer_phone: input.customerPhone?.trim() || null,
          scheduled_for: serializeScheduledDateTime(input.scheduledFor),
          notes: input.notes?.trim() || null,
        },
        prefer: 'return=representation',
      },
    );
    if (!rows.length) throw new Error('Pedido não encontrado ou sem permissão para atualização.');
  },
  async updateManualOrder(orderId: string, input: Omit<ManualOrderInput, 'items'>): Promise<void> {
    const customerName = input.customerName.trim();
    if (customerName.length < 2) throw new Error('Informe o nome do cliente.');
    if (input.status === 'cancelled' && input.received) throw new Error('Um pedido cancelado não pode ser marcado como recebido.');

    if (isDemoMode) {
      const db = readDemo();
      const index = db.orders.findIndex((order) => order.id === orderId && order.source !== 'site');
      if (index < 0) throw new Error('Pedido avulso não encontrado.');
      db.orders[index] = {
        ...db.orders[index],
        customerName,
        customerPhone: input.customerPhone?.trim() || undefined,
        deliveryType: input.fulfillment || 'pickup',
        paymentMethod: input.paymentMethod,
        status: input.status,
        scheduledFor: input.scheduledFor || undefined,
        notes: input.notes?.trim() || undefined,
        source: input.source,
      };
      writeDemo(db);
      return;
    }

    const rows = await restFetch<OrderRow[]>(
      `food_orders?id=eq.${encode(orderId)}&source=neq.site&select=*`,
      {
        method: 'PATCH',
        body: {
          customer_name: customerName,
          customer_phone: input.customerPhone?.trim() || null,
          delivery_type: input.fulfillment || 'pickup',
          payment_method: input.paymentMethod,
          status: input.status,
          scheduled_for: serializeScheduledDateTime(input.scheduledFor),
          notes: input.notes?.trim() || null,
          source: input.source,
        },
        prefer: 'return=representation',
      },
    );
    if (!rows.length) throw new Error('Pedido avulso não encontrado ou sem permissão para atualização.');
  },

  async updateOrderStatus(orderId:string,status:Order['status']):Promise<void>{
    if(isDemoMode){
      const db=readDemo();
      const index=db.orders.findIndex((order)=>order.id===orderId);
      if(index<0)throw new Error('Pedido não encontrado.');
      db.orders[index]={...db.orders[index],status};
      writeDemo(db);
      return;
    }
    const rows=await restFetch<OrderRow[]>(`food_orders?id=eq.${encode(orderId)}&select=*`,{method:'PATCH',body:{status},prefer:'return=representation'});
    if(!rows.length)throw new Error('Pedido não encontrado ou sem permissão para atualização.');
  },

  /**
   * Atualiza vários pedidos em uma ação do painel. O demo grava uma vez e,
   * no Supabase, as alterações são disparadas em paralelo para evitar que o
   * operador precise esperar um reload entre cada pedido. O StoreContext faz
   * apenas um reload ao final da operação.
   */
  async updateOrderStatuses(updates: Array<{ orderId: string; status: Order['status'] }>): Promise<void> {
    const normalized = updates.filter((item) => item.orderId && item.status);
    if (!normalized.length) return;

    if (isDemoMode) {
      const db = readDemo();
      const ids = new Set(normalized.map((item) => item.orderId));
      const found = new Set(db.orders.filter((order) => ids.has(order.id)).map((order) => order.id));
      if (found.size !== ids.size) throw new Error('Um ou mais pedidos não foram encontrados. Atualize a tela e tente novamente.');
      const nextStatus = new Map(normalized.map((item) => [item.orderId, item.status]));
      db.orders = db.orders.map((order) => nextStatus.has(order.id) ? { ...order, status: nextStatus.get(order.id)! } : order);
      writeDemo(db);
      return;
    }

    const uniqueStatuses = new Set(normalized.map((item) => item.status));
    if (uniqueStatuses.size === 1) {
      const rows = await restFetch<OrderRow[]>(
        `food_orders?id=in.(${normalized.map((item) => encode(item.orderId)).join(',')})&select=*`,
        { method: 'PATCH', body: { status: normalized[0].status }, prefer: 'return=representation' },
      );
      if (rows.length !== normalized.length) throw new Error('Um ou mais pedidos não puderam ser atualizados. Atualize a tela e tente novamente.');
      return;
    }

    const results = await Promise.all(normalized.map((item) => restFetch<OrderRow[]>(
      `food_orders?id=eq.${encode(item.orderId)}&select=*`,
      { method: 'PATCH', body: { status: item.status }, prefer: 'return=representation' },
    )));
    if (results.some((rows) => !rows.length)) throw new Error('Um ou mais pedidos não puderam ser atualizados. Atualize a tela e tente novamente.');
  },

  async markOrderWhatsAppClicked(orderId:string):Promise<void>{
    if(isDemoMode){const db=readDemo();db.orders=db.orders.map((order)=>order.id===orderId?{...order,whatsappClickedAt:order.whatsappClickedAt||new Date().toISOString()}:order);writeDemo(db);return;}
    await restFetch<unknown>('rpc/food_mark_public_order_whatsapp_clicked',{method:'POST',body:{p_order_id:orderId},keepalive:true});
  },
};
