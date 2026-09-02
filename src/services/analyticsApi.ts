import { appConfig, isDemoMode } from '../lib/config';
import { restFetch } from '../lib/supabaseRest';
import type { AnalyticsProductStat, AnalyticsReport, PublicAnalyticsEventName } from '../types';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const sessionKeyFor = (storeId: string) => `foodservice_analytics_session_v1:${storeId}`;

const createUuid = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
};

export const getAnalyticsSessionId = (storeId: string): string => {
  if (!storeId) return createUuid();
  const key = sessionKeyFor(storeId);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as { id?: string; createdAt?: number };
      if (parsed.id && parsed.createdAt && Date.now() - parsed.createdAt < SESSION_TTL_MS) return parsed.id;
    }
  } catch { /* storage indisponivel */ }

  const id = createUuid();
  try { localStorage.setItem(key, JSON.stringify({ id, createdAt: Date.now() })); } catch { /* storage indisponivel */ }
  return id;
};

export const trackPublicEvent = async (
  storeId: string,
  eventName: PublicAnalyticsEventName,
  productId?: string,
): Promise<void> => {
  if (!appConfig.analyticsEnabled || isDemoMode || !storeId) return;
  const sessionId = getAnalyticsSessionId(storeId);
  try {
    await restFetch<unknown>('rpc/food_track_public_event_v1', {
      method: 'POST',
      body: {
        p_store_id: storeId,
        p_session_id: sessionId,
        p_event_name: eventName,
        p_product_id: productId || null,
      },
    });
  } catch (error) {
    // Telemetria nunca deve interromper compra/catalogo.
    console.warn('Falha ao registrar telemetria comercial:', error);
  }
};

const numberValue = (value: unknown) => Number(value || 0);
const productStats = (value: unknown): AnalyticsProductStat[] => Array.isArray(value) ? value.map((item) => {
  const row = item as Record<string, unknown>;
  return {
    productId: String(row.productId || ''),
    name: String(row.name || 'Produto'),
    views: numberValue(row.views),
    addToCartSessions: numberValue(row.addToCartSessions),
    soldUnits: numberValue(row.soldUnits),
  };
}) : [];

export const loadAnalyticsReport = async (storeId: string, from?: string, to?: string): Promise<AnalyticsReport> => {
  if (isDemoMode) return {
    from: from || new Date(Date.now() - 30 * 86400000).toISOString(),
    to: to || new Date().toISOString(),
    storefrontSessions: 0,
    productViews: 0,
    productViewSessions: 0,
    addToCartSessions: 0,
    checkoutSessions: 0,
    orderSessions: 0,
    orders: 0,
    whatsappClicks: 0,
    conversionRate: 0,
    cartAbandonmentRate: 0,
    checkoutAbandonmentRate: 0,
    whatsappRate: 0,
    revenue: 0,
    averageTicket: 0,
    topProducts: [],
    viewedNotSold: [],
  };

  const payload = await restFetch<Record<string, unknown>>('rpc/food_get_store_analytics_v1', {
    method: 'POST',
    body: {
      p_store_id: storeId,
      p_from: from || null,
      p_to: to || null,
    },
  });

  return {
    from: String(payload.from || from || ''),
    to: String(payload.to || to || ''),
    storefrontSessions: numberValue(payload.storefrontSessions),
    productViews: numberValue(payload.productViews),
    productViewSessions: numberValue(payload.productViewSessions),
    addToCartSessions: numberValue(payload.addToCartSessions),
    checkoutSessions: numberValue(payload.checkoutSessions),
    orderSessions: numberValue(payload.orderSessions),
    orders: numberValue(payload.orders),
    whatsappClicks: numberValue(payload.whatsappClicks),
    conversionRate: numberValue(payload.conversionRate),
    cartAbandonmentRate: numberValue(payload.cartAbandonmentRate),
    checkoutAbandonmentRate: numberValue(payload.checkoutAbandonmentRate),
    whatsappRate: numberValue(payload.whatsappRate),
    revenue: numberValue(payload.revenue),
    averageTicket: numberValue(payload.averageTicket),
    topProducts: productStats(payload.topProducts),
    viewedNotSold: productStats(payload.viewedNotSold),
  };
};
