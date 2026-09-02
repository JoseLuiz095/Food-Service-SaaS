import { appConfig, isDemoMode } from '../lib/config';
import { invokePublicFunction, restFetch, storageDelete, storageUpload } from '../lib/supabaseRest';
import { seedAddons, seedCategories, seedDeliveryZones, seedOrders, seedPlan, seedProducts, seedSettings } from '../data/seed';
import type {
  Addon, CartItem, Category, CheckoutData, CheckoutSecurityContext, CreateOrderResult, DeliveryZone,
  OptionGroup, OptionItem, Order, PaymentMethod, Plan, PlanUsage, Product, ProductImage, StoreSettings,
} from '../types';
import { roundMoney, slugify } from '../utils/format';
import { formatOpeningSchedule, normalizeOpeningSchedule } from '../utils/storeHours';
import { createId } from '../utils/id';

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
  city: string | null; state: string | null; zip_code: string | null; delivery_enabled: boolean; pickup_enabled: boolean;
  pix_enabled: boolean; pix_receipt_mode: 'copy_paste'|'key' | null; pix_key_type: string | null; pix_key: string | null; pix_copy_paste: string | null; pix_holder_name: string | null;
  show_pix_before_confirmation: boolean; confirmation_payment_enabled: boolean; card_payment_enabled: boolean; cash_payment_enabled: boolean; payment_method_order: unknown;
  minimum_order: number | string; opening_hours: unknown; active: boolean; access_status?: 'online'|'suspended';
  average_preparation_min?: number | null; average_preparation_max?: number | null; allow_scheduled_orders?: boolean | null;
  billing_document?: string | null; billing_phone?: string | null;
};
type CategoryRow = { id: string; store_id: string; name: string; slug: string; description: string | null; active: boolean; sort_order: number };
type ProductRow = {
  id: string; store_id: string; category_id: string; name: string; slug: string; description: string; price: number | string;
  promotional_price: number | string | null; active: boolean; featured: boolean; made_to_order: boolean; production_days: number | null;
  stock_status: Product['stockStatus']; internal_code?: string | null; availability_status?: Product['availabilityStatus'] | null;
  track_stock?: boolean | null; stock_quantity?: number | null; preparation_time_minutes?: number | null; sort_order?: number | null;
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
  needs_change?: boolean | null; change_for?: number | string | null; change_amount?: number | string | null; scheduled_for?: string | null;
  preparation_estimate_minutes?: number | null; source?: Order['source'] | null; whatsapp_clicked_at: string | null; created_at: string;
};

const toNumber = (value: number | string | null | undefined) => value == null ? 0 : Number(value);
const encode = (value: string) => encodeURIComponent(value);
const inFilter = (ids: string[]) => `in.(${ids.join(',')})`;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const normalizePaymentOrder = (value: unknown): PaymentMethod[] => {
  const allowed: PaymentMethod[] = ['confirm', 'pix', 'card', 'cash'];
  const input = Array.isArray(value) ? value : [];
  const filtered = input.filter((method): method is PaymentMethod => typeof method === 'string' && allowed.includes(method as PaymentMethod));
  return [...filtered, ...allowed.filter((method) => !filtered.includes(method))];
};

const mapStore = (row: StoreRow): StoreSettings => ({
  id: row.id, slug: row.slug, name: row.name, tagline: row.description || 'Pedidos rápidos e do seu jeito.', description: row.description || undefined,
  city: row.city || '', state: row.state || '', zipCode: row.zip_code || '', whatsapp: row.whatsapp || '', instagram: row.instagram || '', address: row.address || '',
  logoUrl: row.logo_url || '/assets/food-logo.svg', logoStoragePath: row.logo_storage_path || undefined,
  heroUrl: row.cover_url || '/assets/food-hero.svg', heroStoragePath: row.cover_storage_path || undefined,
  pixEnabled: row.pix_enabled, pixReceiptMode: row.pix_receipt_mode || 'key', pixKeyType: row.pix_key_type || '', pixKey: row.pix_key || '', pixCopyPaste: row.pix_copy_paste || '', pixReceiver: row.pix_holder_name || '',
  showPixBeforeConfirmation: row.show_pix_before_confirmation, confirmationPaymentEnabled: row.confirmation_payment_enabled ?? false, cardPaymentEnabled: row.card_payment_enabled ?? false, cashPaymentEnabled: row.cash_payment_enabled ?? false,
  paymentMethodOrder: normalizePaymentOrder(row.payment_method_order), deliveryEnabled: row.delivery_enabled, pickupEnabled: row.pickup_enabled, minimumOrder: toNumber(row.minimum_order),
  averagePreparationMin: Math.max(0, row.average_preparation_min ?? 30), averagePreparationMax: Math.max(0, row.average_preparation_max ?? 45), allowScheduledOrders: row.allow_scheduled_orders ?? false,
  openingSchedule: normalizeOpeningSchedule(row.opening_hours),
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
  needsChange: row.needs_change ?? undefined, changeFor: row.change_for == null ? undefined : toNumber(row.change_for), changeAmount: row.change_amount == null ? undefined : toNumber(row.change_amount),
  scheduledFor: row.scheduled_for || undefined, preparationEstimateMinutes: row.preparation_estimate_minutes ?? undefined, source: row.source || 'site', whatsappClickedAt: row.whatsapp_clicked_at || undefined, createdAt: row.created_at,
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
    const primary = productImages.find((image) => image.isPrimary) || productImages[0];
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
      trackStock:row.track_stock ?? false, stockQuantity:row.stock_quantity ?? undefined, preparationTimeMinutes:row.preparation_time_minutes ?? 0, sortOrder:row.sort_order ?? 0,
      images:productImages, imageUrl:primary?.url || '/assets/placeholder-food.svg', gallery:productImages.map((image) => image.url), optionGroups:productGroups,
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

const loadSnapshotFromSupabase = async (slugOrId: string, admin = false): Promise<StoreSnapshot> => {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slugOrId);
  const storeFilter = isUuid ? `id=eq.${encode(slugOrId)}` : `slug=eq.${encode(slugOrId)}`;
  const stores = await restFetch<StoreRow[]>(`food_stores?select=*&${storeFilter}&limit=1`);
  if (!stores.length) throw new Error('Loja não encontrada ou sem permissão.');
  const settings = mapStore(stores[0]);
  const categoryRows = await restFetch<CategoryRow[]>(`food_categories?select=*&store_id=eq.${encode(settings.id)}${admin ? '' : '&active=eq.true'}&order=sort_order.asc,name.asc`);
  const productRows = await restFetch<ProductRow[]>(`food_products?select=*&store_id=eq.${encode(settings.id)}${admin ? '' : '&active=eq.true'}&order=featured.desc,sort_order.asc,name.asc`);
  const deliveryZoneRows = await restFetch<DeliveryZoneRow[]>(`food_delivery_zones?select=*&store_id=eq.${encode(settings.id)}${admin ? '' : '&active=eq.true'}&order=sort_order.asc,name.asc`);
  const addonRows = await restFetch<AddonRow[]>(`food_addons?select=*&store_id=eq.${encode(settings.id)}${admin ? '' : '&active=eq.true'}&order=name.asc`).catch(() => [] as AddonRow[]);
  const productIds = productRows.map((product) => product.id);

  let imageRows: ProductImageRow[] = [], optionGroupRows: OptionGroupRow[] = [], optionItemRows: OptionItemRow[] = [], optionLinks: ProductOptionGroupRow[] = [];
  let variantRows: ProductVariantRow[] = [], addonLinks: ProductAddonRow[] = [];
  if (productIds.length) {
    imageRows = await restFetch<ProductImageRow[]>(`food_product_images?select=*&product_id=${encode(inFilter(productIds))}&order=sort_order.asc`);
    try {
      optionLinks = await restFetch<ProductOptionGroupRow[]>(`food_product_option_groups?select=*&product_id=${encode(inFilter(productIds))}&order=sort_order.asc`);
      const groupIds = [...new Set(optionLinks.map((link) => link.option_group_id))];
      if (groupIds.length) {
        optionGroupRows = await restFetch<OptionGroupRow[]>(`food_option_groups?select=*&id=${encode(inFilter(groupIds))}${admin ? '' : '&active=eq.true'}&order=sort_order.asc`);
        optionItemRows = await restFetch<OptionItemRow[]>(`food_option_items?select=*&group_id=${encode(inFilter(groupIds))}${admin ? '' : '&active=eq.true'}&order=sort_order.asc`);
      }
    } catch { optionGroupRows = []; optionItemRows = []; optionLinks = []; }
    try {
      [variantRows, addonLinks] = await Promise.all([
        restFetch<ProductVariantRow[]>(`food_product_variants?select=*&product_id=${encode(inFilter(productIds))}${admin ? '' : '&active=eq.true'}&order=sort_order.asc`),
        restFetch<ProductAddonRow[]>(`food_product_addons?select=*&product_id=${encode(inFilter(productIds))}`),
      ]);
    } catch { variantRows = []; addonLinks = []; }
  }

  const categories = categoryRows.map(mapCategory);
  const addons = addonRows.map(mapAddon);
  const deliveryZones = deliveryZoneRows.map(mapDeliveryZone);
  const products = buildProducts(productRows, imageRows, optionGroupRows, optionItemRows, optionLinks, variantRows, addons, addonLinks);
  const orders = admin ? (await restFetch<OrderRow[]>(`food_orders?select=*&store_id=eq.${encode(settings.id)}&order=created_at.desc&limit=100`)).map(mapOrder) : [];
  const activeProductCount = products.filter((product) => product.active).length;
  const planUsage = admin ? await loadPlanUsage(settings.id, products.length, activeProductCount) : { plan:seedPlan, productCount:products.length, activeProductCount, canCreateProduct:true, canActivateProduct:true };
  return { settings, categories, products, addons, deliveryZones, orders, planUsage };
};

export const storeApi = {
  get mode() { return isDemoMode ? 'demo' as const : 'supabase' as const; },

  async loadPublic(slug: string | null = null, hostname = '') {
    if (!isDemoMode) {
      const requestedSlug = slug || appConfig.defaultStoreSlug;
      const publicHostname = hostname && !['localhost','127.0.0.1'].includes(hostname) ? hostname.toLowerCase() : '';
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
    }
    const db = readDemo();
    const activeCategoryIds = new Set(db.categories.filter((category) => category.active).map((category) => category.id));
    return { ...db, categories:db.categories.filter((category) => category.active), products:db.products.filter((product) => product.active && activeCategoryIds.has(product.categoryId)), deliveryZones:db.deliveryZones.filter((zone) => zone.active).sort((a,b) => a.sortOrder - b.sortOrder), orders:[] };
  },

  async loadAdmin(storeId: string) { return isDemoMode ? readDemo() : loadSnapshotFromSupabase(storeId, true); },
  async resetDemo() { const db = createDemoDb(); writeDemo(db); return db; },

  async saveSettings(settings: StoreSettings): Promise<StoreSettings> {
    if (isDemoMode) { const db = readDemo(); db.settings = clone(settings); writeDemo(db); return settings; }
    const payload = {
      name:settings.name, description:settings.tagline, logo_url:settings.logoUrl, logo_storage_path:settings.logoStoragePath ?? null,
      cover_url:settings.heroUrl, cover_storage_path:settings.heroStoragePath ?? null, whatsapp:settings.whatsapp, instagram:settings.instagram,
      address:settings.address, city:settings.city, state:settings.state, zip_code:settings.zipCode || null, delivery_enabled:settings.deliveryEnabled, pickup_enabled:settings.pickupEnabled,
      pix_enabled:settings.pixEnabled, pix_receipt_mode:settings.pixReceiptMode, pix_key_type:settings.pixKeyType || null, pix_key:settings.pixKey || null,
      pix_copy_paste:settings.pixCopyPaste || null, pix_holder_name:settings.pixReceiver || null, show_pix_before_confirmation:settings.showPixBeforeConfirmation,
      confirmation_payment_enabled:settings.confirmationPaymentEnabled, card_payment_enabled:settings.cardPaymentEnabled, cash_payment_enabled:settings.cashPaymentEnabled,
      payment_method_order:settings.paymentMethodOrder, minimum_order:settings.minimumOrder, average_preparation_min:settings.averagePreparationMin,
      average_preparation_max:settings.averagePreparationMax, allow_scheduled_orders:settings.allowScheduledOrders,
      opening_hours:{ display:formatOpeningSchedule(settings.openingSchedule), timezone:settings.openingSchedule.timezone, days:settings.openingSchedule.days }, billing_document:settings.billingDocument||null, billing_phone:settings.billingPhone||null,
    };
    const rows = await restFetch<StoreRow[]>(`food_stores?id=eq.${encode(settings.id)}&select=*`, { method:'PATCH', body:payload, prefer:'return=representation' });
    return mapStore(rows[0]);
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
    if(isDemoMode){const url=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});return{url};}
    const ext=(file.name.split('.').pop()||'webp').toLowerCase().replace(/[^a-z0-9]/g,''); const path=`stores/${storeId}/options/${addonId}/${createId()}.${ext}`; return storageUpload('food-store-assets',path,file);
  },

  async saveDeliveryZones(zones: DeliveryZone[]): Promise<DeliveryZone[]> {
    if(isDemoMode){const db=readDemo();const byId=new Map(zones.map((zone)=>[zone.id,clone(zone)]));db.deliveryZones=db.deliveryZones.map((zone)=>byId.get(zone.id)||zone);for(const zone of zones)if(!db.deliveryZones.some((item)=>item.id===zone.id))db.deliveryZones.push(clone(zone));writeDemo(db);return zones;}
    if(!zones.length)return[];
    const payload=zones.map((zone)=>({id:zone.id,store_id:zone.storeId,name:zone.name,aliases:zone.aliases,city:zone.city,state:zone.state.toUpperCase(),fee:zone.fee,active:zone.active,sort_order:zone.sortOrder}));
    const rows=await restFetch<DeliveryZoneRow[]>('food_delivery_zones?on_conflict=id&select=*',{method:'POST',body:payload,prefer:'resolution=merge-duplicates,return=representation'}); return rows.map(mapDeliveryZone);
  },
  async deleteDeliveryZone(id:string){if(isDemoMode){const db=readDemo();db.deliveryZones=db.deliveryZones.filter((zone)=>zone.id!==id);writeDemo(db);return;}await restFetch<unknown>(`food_delivery_zones?id=eq.${encode(id)}`,{method:'DELETE'});},

  async saveProduct(product: Product): Promise<Product> {
    if(isDemoMode){const db=readDemo();const existing=db.products.find((item)=>item.id===product.id);const activeCount=db.products.filter((item)=>item.active&&item.id!==product.id).length;const limit=db.planUsage.plan.productLimit;if(product.active&&limit!=null&&activeCount>=limit)throw new Error(`Seu plano permite até ${limit} produtos ativos.`);db.products=existing?db.products.map((item)=>item.id===product.id?clone(product):item):[clone(product),...db.products];writeDemo(db);return product;}
    const payload={id:product.id,store_id:product.storeId,category_id:product.categoryId,name:product.name,slug:product.slug||slugify(product.name),description:product.description,price:product.price,promotional_price:product.promotionalPrice??null,active:product.active,featured:product.featured,made_to_order:false,production_days:0,stock_status:product.availabilityStatus==='available'?'available':'unavailable',internal_code:product.internalCode||null,availability_status:product.availabilityStatus,track_stock:product.trackStock,stock_quantity:product.trackStock?product.stockQuantity??0:null,preparation_time_minutes:product.preparationTimeMinutes,sort_order:product.sortOrder};
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

  async deleteProduct(id:string){
    if(isDemoMode){const db=readDemo();db.products=db.products.filter((product)=>product.id!==id);writeDemo(db);return;}
    const images=await restFetch<ProductImageRow[]>(`food_product_images?select=*&product_id=eq.${encode(id)}`); await restFetch<unknown>(`food_products?id=eq.${encode(id)}`,{method:'DELETE'});
    const paths=images.map((image)=>image.storage_path).filter((path):path is string=>Boolean(path)); if(paths.length){try{await storageDelete('food-product-images',paths)}catch(error){console.warn('Produto removido, mas houve falha ao limpar imagens.',error)}}
  },

  async uploadProductImages(storeId:string,productId:string,files:File[],current:ProductImage[]):Promise<ProductImage[]>{
    const maxSize=5*1024*1024;const allowed=new Set(['image/jpeg','image/png','image/webp']);for(const file of files){if(!allowed.has(file.type))throw new Error(`Formato não permitido: ${file.name}`);if(file.size>maxSize)throw new Error(`${file.name} excede 5 MB.`);}
    if(isDemoMode){const readFile=(file:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});const next=[...current];for(const file of files){const url=await readFile(file);next.push({id:createId(),productId,url,altText:file.name,sortOrder:next.length,isPrimary:next.length===0});}const db=readDemo();db.products=db.products.map((product)=>product.id===productId?{...product,images:next,imageUrl:(next.find((image)=>image.isPrimary)||next[0])?.url||product.imageUrl,gallery:next.map((image)=>image.url)}:product);writeDemo(db);return next;}
    const added:ProductImage[]=[];for(const [index,file] of files.entries()){const ext=(file.name.split('.').pop()||'webp').toLowerCase().replace(/[^a-z0-9]/g,'');const path=`stores/${storeId}/products/${productId}/${createId()}.${ext}`;const uploaded=await storageUpload('food-product-images',path,file);const row={id:createId(),product_id:productId,url:uploaded.url,storage_path:uploaded.path,alt_text:file.name,sort_order:current.length+index,is_primary:current.length===0&&index===0};const result=await restFetch<ProductImageRow[]>('food_product_images?select=*',{method:'POST',body:row,prefer:'return=representation'});const saved=result[0];added.push({id:saved.id,productId:saved.product_id,url:saved.url,storagePath:saved.storage_path||undefined,altText:saved.alt_text||undefined,sortOrder:saved.sort_order,isPrimary:saved.is_primary});}return[...current,...added];
  },
  async deleteProductImage(image:ProductImage){if(isDemoMode){const db=readDemo();db.products=db.products.map((product)=>{if(product.id!==image.productId)return product;let next=product.images.filter((item)=>item.id!==image.id);if(image.isPrimary&&next.length&&!next.some((item)=>item.isPrimary))next=next.map((item,index)=>({...item,isPrimary:index===0}));const primary=next.find((item)=>item.isPrimary)||next[0];return{...product,images:next,gallery:next.map((item)=>item.url),imageUrl:primary?.url||'/assets/placeholder-food.svg'};});writeDemo(db);return;}await restFetch<unknown>(`food_product_images?id=eq.${encode(image.id)}`,{method:'DELETE'});if(image.isPrimary){const remaining=await restFetch<ProductImageRow[]>(`food_product_images?select=*&product_id=eq.${encode(image.productId)}&order=sort_order.asc&limit=1`);if(remaining[0])await restFetch<unknown>(`food_product_images?id=eq.${encode(remaining[0].id)}`,{method:'PATCH',body:{is_primary:true}});}if(image.storagePath)await storageDelete('food-product-images',[image.storagePath]);},
  async setPrimaryImage(productId:string,imageId:string){if(isDemoMode){const db=readDemo();db.products=db.products.map((product)=>product.id===productId?{...product,images:product.images.map((image)=>({...image,isPrimary:image.id===imageId})),imageUrl:product.images.find((image)=>image.id===imageId)?.url||product.imageUrl}:product);writeDemo(db);return;}await restFetch<unknown>(`food_product_images?product_id=eq.${encode(productId)}`,{method:'PATCH',body:{is_primary:false}});await restFetch<unknown>(`food_product_images?id=eq.${encode(imageId)}`,{method:'PATCH',body:{is_primary:true}});},
  async uploadStoreAsset(storeId:string,file:File,kind:'logo'|'cover'):Promise<{url:string;path?:string}>{const maxSize=5*1024*1024;const allowed=new Set(['image/jpeg','image/png','image/webp']);if(!allowed.has(file.type))throw new Error('Use uma imagem JPG, PNG ou WEBP.');if(file.size>maxSize)throw new Error('A imagem excede 5 MB.');if(isDemoMode){const url=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});return{url};}const ext=(file.name.split('.').pop()||'webp').toLowerCase().replace(/[^a-z0-9]/g,'');const path=`stores/${storeId}/${kind}/${createId()}.${ext}`;return storageUpload('food-store-assets',path,file);},

  async createOrder(store:StoreSettings,items:CartItem[],form:CheckoutData,subtotal:number,security:CheckoutSecurityContext={}):Promise<CreateOrderResult>{
    const deliveryAddress=form.fulfillment==='delivery'?[`${form.street}${form.addressNumber?`, ${form.addressNumber}`:''}`,form.complement,`${form.neighborhood}${form.deliveryCity?` - ${form.deliveryCity}`:''}${form.deliveryState?`/${form.deliveryState}`:''}`,form.zipCode?`CEP ${form.zipCode}`:'',form.referencePoint?`Referência: ${form.referencePoint}`:''].filter(Boolean).join(' | '):null;
    const payload={
      store_id:store.id,customer_name:form.customerName,customer_phone:form.customerPhone||null,customer_email:form.customerEmail||null,
      delivery_type:form.fulfillment,delivery_address:deliveryAddress,delivery_zip_code:form.fulfillment==='delivery'?form.zipCode||null:null,
      delivery_street:form.fulfillment==='delivery'?form.street||null:null,delivery_number:form.fulfillment==='delivery'?form.addressNumber||null:null,
      delivery_complement:form.fulfillment==='delivery'?form.complement||null:null,delivery_neighborhood:form.fulfillment==='delivery'?form.neighborhood||null:null,
      delivery_zone_id:form.fulfillment==='delivery'?form.deliveryZoneId||null:null,delivery_city:form.fulfillment==='delivery'?form.deliveryCity||null:null,
      delivery_state:form.fulfillment==='delivery'?form.deliveryState||null:null,reference_point:form.fulfillment==='delivery'?form.referencePoint||null:null,
      notes:form.notes||null,payment_method:form.paymentMethod,needs_change:form.paymentMethod==='cash'&&form.needsChange,change_for:form.paymentMethod==='cash'&&form.needsChange?form.changeFor:null,
      scheduled_for:form.scheduledFor||null,review_confirmed:form.reviewConfirmed,
      items:items.map((item)=>({product_id:item.productId,quantity:item.quantity,options:item.options.map((option)=>({group_id:option.groupId,item_id:option.itemId,quantity:option.quantity}))})),
    };
    if(isDemoMode){
      const db=readDemo();if(subtotal<store.minimumOrder)throw new Error(`Pedido mínimo de R$ ${store.minimumOrder.toFixed(2).replace('.',',')}.`);if(!form.reviewConfirmed)throw new Error('Confirme que revisou os dados do pedido.');
      const selectedZone=form.fulfillment==='delivery'?db.deliveryZones.find((zone)=>zone.id===form.deliveryZoneId&&zone.active):undefined;if(form.fulfillment==='delivery'&&!selectedZone)throw new Error('Selecione um bairro/área de entrega disponível.');
      if(form.paymentMethod==='cash'&&form.needsChange&&(!form.changeFor||form.changeFor<=subtotal+(selectedZone?.fee??0)))throw new Error('O valor para troco deve ser maior que o total do pedido.');
      const id=createId();const orderNumber=Math.max(28623,...db.orders.map((order)=>order.orderNumber||0))+1;const deliveryFee=selectedZone?.fee??0;const total=roundMoney(subtotal+deliveryFee);const extraPrep=items.reduce((max,item)=>Math.max(max,db.products.find((product)=>product.id===item.productId)?.preparationTimeMinutes||0),0);const prep=Math.max(store.averagePreparationMin,store.averagePreparationMax)+extraPrep;
      db.orders.unshift({id,orderNumber,storeId:store.id,customerName:form.customerName,customerPhone:form.customerPhone||undefined,customerEmail:form.customerEmail||undefined,deliveryType:form.fulfillment,deliveryAddress:deliveryAddress||undefined,deliveryZipCode:form.zipCode||undefined,deliveryStreet:form.street||undefined,deliveryNumber:form.addressNumber||undefined,deliveryComplement:form.complement||undefined,deliveryNeighborhood:selectedZone?.name||form.neighborhood||undefined,deliveryZoneId:selectedZone?.id,deliveryZoneName:selectedZone?.name,deliveryFee,deliveryCity:form.deliveryCity||undefined,deliveryState:form.deliveryState||undefined,referencePoint:form.referencePoint||undefined,notes:form.notes||undefined,paymentMethod:form.paymentMethod,subtotal:roundMoney(subtotal),total,status:'received',needsChange:form.paymentMethod==='cash'&&form.needsChange,changeFor:form.changeFor||undefined,changeAmount:form.changeFor?roundMoney(form.changeFor-total):undefined,scheduledFor:form.scheduledFor||undefined,preparationEstimateMinutes:prep,source:'site',createdAt:new Date().toISOString()});writeDemo(db);return{orderId:id,orderNumber,total};
    }
    const created=await invokePublicFunction<{orderId:string;orderNumber:number|string;total:number|string}>('food-public-checkout',{payload,turnstileToken:security.turnstileToken||'',analyticsSessionId:security.analyticsSessionId||'',requestId:security.requestId||''});
    if(!created?.orderId)throw new Error('O pedido foi registrado, mas o identificador não foi retornado.');return{orderId:created.orderId,orderNumber:toNumber(created.orderNumber),total:toNumber(created.total)};
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

  async markOrderWhatsAppClicked(orderId:string):Promise<void>{
    if(isDemoMode){const db=readDemo();db.orders=db.orders.map((order)=>order.id===orderId?{...order,whatsappClickedAt:order.whatsappClickedAt||new Date().toISOString()}:order);writeDemo(db);return;}
    await restFetch<unknown>('rpc/food_mark_public_order_whatsapp_clicked',{method:'POST',body:{p_order_id:orderId},keepalive:true});
  },
};
