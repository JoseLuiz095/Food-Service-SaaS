import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { StorefrontUnavailableError, storeApi } from '../services/storeApi';
import { seedAddons, seedCategories, seedDeliveryZones, seedPlan, seedProducts, seedSettings } from '../data/seed';
import type { Addon, Category, DeliveryZone, ManualOrderInput, Order, OrderDetailsUpdate, PlanUsage, Product, ProductImage, StoreSettings } from '../types';
import { useAuth } from './AuthContext';
import { storeBasePathFromPath, storeSlugFromPath } from '../utils/storefrontRoute';
import { isFoodWebMarketingRoot } from '../lib/config';

type StoreContextValue = {
  products: Product[];
  categories: Category[];
  addons: Addon[];
  deliveryZones: DeliveryZone[];
  settings: StoreSettings;
  orders: Order[];
  planUsage: PlanUsage;
  loading: boolean;
  error: string;
  storeUnavailable: boolean;
  unavailableStoreName: string;
  dataMode: 'demo' | 'supabase';
  storeBasePath: string;
  publicStoreSlug: string | null;
  reloadPublic: () => Promise<void>;
  reloadAdmin: (options?: { silent?: boolean; force?: boolean }) => Promise<void>;
  reloadOrders: (options?: { silent?: boolean }) => Promise<void>;
  saveProduct: (product: Product) => Promise<void>;
  updateProductStock: (productId: string, input: { stockQuantity: number; stockStatus: Product['stockStatus']; availabilityStatus: Product['availabilityStatus'] }) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  saveCategory: (category: Category) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  saveAddon: (addon: Addon) => Promise<void>;
  deleteAddon: (id: string) => Promise<void>;
  saveDeliveryZones: (zones: DeliveryZone[]) => Promise<void>;
  deleteDeliveryZone: (id: string) => Promise<void>;
  saveSettings: (settings: StoreSettings) => Promise<void>;
  uploadProductImages: (productId: string, files: File[], current: ProductImage[]) => Promise<ProductImage[]>;
  deleteProductImage: (image: ProductImage) => Promise<void>;
  setPrimaryImage: (productId: string, imageId: string) => Promise<void>;
  uploadStoreAsset: (file: File, kind: 'logo' | 'cover') => Promise<{ url: string; path?: string }>;
  uploadAddonImage: (addonId: string, file: File) => Promise<{ url: string; path?: string }>;
  resetDemo: () => Promise<void>;
  registerOrder: typeof storeApi.createOrder;
  createManualOrder: (input: ManualOrderInput) => Promise<Awaited<ReturnType<typeof storeApi.createManualOrder>>>;
  updateManualOrder: (orderId: string, input: Omit<ManualOrderInput, 'items'>) => Promise<void>;
  updateOrderDetails: (orderId: string, input: OrderDetailsUpdate) => Promise<void>;
  markOrderWhatsAppClicked: typeof storeApi.markOrderWhatsAppClicked;
  confirmOrderPayment: typeof storeApi.confirmOrderPayment;
  updateOrderStatus: (orderId: string, status: Order['status']) => Promise<void>;
  updateOrderStatuses: (updates: Array<{ orderId: string; status: Order['status'] }>) => Promise<void>;
};

const defaultPlanUsage: PlanUsage = { plan: seedPlan, productCount: seedProducts.length, activeProductCount: seedProducts.filter((product) => product.active).length, canCreateProduct: true, canActivateProduct: true };
const StoreContext = createContext<StoreContextValue | null>(null);

const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
const shouldRetryAdminLoad = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /Loja não encontrada ou sem permissão|Sessão expirada|Failed to fetch|NetworkError|fetch failed/i.test(message);
};
const SYNC_KEY = 'foodservice_store_sync_v1';
const ADMIN_SNAPSHOT_CACHE_MS = 30_000;
const notifyStoreChange = () => {
  // Evita que a própria sessão continue exibindo uma vitrine pública antiga
  // depois de salvar produtos, configurações ou imagens no painel.
  storeApi.invalidatePublicCache();
  try { localStorage.setItem(SYNC_KEY, String(Date.now())); } catch { /* sem storage */ }
  try { const channel = new BroadcastChannel('foodservice-store-sync'); channel.postMessage({ type: 'store-change', at: Date.now() }); channel.close(); } catch { /* browser sem BroadcastChannel */ }
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const { membership, user, loading: authLoading } = useAuth();
  const location = useLocation();
  const publicStoreSlug = storeSlugFromPath(location.pathname);
  const storeBasePath = storeBasePathFromPath(location.pathname);
  const [products, setProducts] = useState<Product[]>(seedProducts);
  const [categories, setCategories] = useState<Category[]>(seedCategories);
  const [addons, setAddons] = useState<Addon[]>(seedAddons);
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>(seedDeliveryZones);
  const [settings, setSettings] = useState<StoreSettings>(seedSettings);
  const [orders, setOrders] = useState<Order[]>([]);
  const [planUsage, setPlanUsage] = useState<PlanUsage>(defaultPlanUsage);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [storeUnavailable, setStoreUnavailable] = useState(false);
  const [unavailableStoreName, setUnavailableStoreName] = useState('');
  const loadVersionRef = useRef(0);
  const ordersLoadVersionRef = useRef(0);
  const ordersRequestRef = useRef<Promise<void> | null>(null);
  const adminSnapshotRef = useRef<{ storeId: string; userId: string; loadedAt: number } | null>(null);

  const applySnapshot = useCallback((snapshot: Awaited<ReturnType<typeof storeApi.loadPublic>>) => {
    setSettings(snapshot.settings); setCategories(snapshot.categories); setProducts(snapshot.products); setAddons(snapshot.addons); setDeliveryZones(snapshot.deliveryZones); setOrders(snapshot.orders); setPlanUsage(snapshot.planUsage);
  }, []);

  const reloadPublic = useCallback(async () => {
    const requestVersion = ++loadVersionRef.current;
    ++ordersLoadVersionRef.current;
    setLoading(true); setError(''); setStoreUnavailable(false); setUnavailableStoreName('');
    try {
      const snapshot = await storeApi.loadPublic(publicStoreSlug, window.location.hostname);
      if (requestVersion !== loadVersionRef.current) return;
      applySnapshot(snapshot);
    }
    catch (e) {
      if (requestVersion !== loadVersionRef.current) return;
      if (e instanceof StorefrontUnavailableError) {
        setStoreUnavailable(true);
        setUnavailableStoreName(e.storeName);
      } else {
        setError(e instanceof Error ? e.message : 'Não foi possível carregar a loja.');
      }
    }
    finally { if (requestVersion === loadVersionRef.current) setLoading(false); }
  }, [applySnapshot, publicStoreSlug]);

  const reloadAdmin = useCallback(async (options?: { silent?: boolean; force?: boolean }) => {
    if (!membership) return;
    const force = Boolean(options?.force);
    const cached = adminSnapshotRef.current;
    if (!force && cached?.storeId === membership.storeId && cached.userId === user?.id && Date.now() - cached.loadedAt < ADMIN_SNAPSHOT_CACHE_MS) {
      if (!options?.silent) setLoading(false);
      return;
    }
    const requestVersion = ++loadVersionRef.current;
    ++ordersLoadVersionRef.current;
    const silent = Boolean(options?.silent);
    if (!silent) { setLoading(true); setError(''); }
    try {
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const snapshot = await storeApi.loadAdmin(membership.storeId);
          if (requestVersion !== loadVersionRef.current) return;
          applySnapshot(snapshot);
          adminSnapshotRef.current = { storeId: membership.storeId, userId: user?.id ?? '', loadedAt: Date.now() };
          return;
        } catch (error) {
          lastError = error;
          if (!shouldRetryAdminLoad(error) || attempt === 2) throw error;
          await wait(350 * (attempt + 1));
        }
      }
      if (lastError) throw lastError;
    }
    catch (e) {
      if (requestVersion !== loadVersionRef.current) return;
      if (!silent) setError(e instanceof Error ? e.message : 'Não foi possível carregar o painel.');
      else throw e;
    }
    finally { if (!silent && requestVersion === loadVersionRef.current) setLoading(false); }
  }, [membership, user, applySnapshot]);

  const reloadOrders = useCallback(async (options?: { silent?: boolean }) => {
    if (!membership) return;
    if (ordersRequestRef.current) return ordersRequestRef.current;
    const requestVersion = ++ordersLoadVersionRef.current;
    const request = (async () => {
      try {
        const nextOrders = await storeApi.loadAdminOrders(membership.storeId);
        if (requestVersion !== ordersLoadVersionRef.current) return;
        setOrders(nextOrders);
      } catch (e) {
        if (requestVersion !== ordersLoadVersionRef.current) return;
        if (options?.silent) throw e;
        setError(e instanceof Error ? e.message : 'Não foi possível atualizar os pedidos.');
      }
    })().finally(() => {
      if (ordersRequestRef.current === request) ordersRequestRef.current = null;
    });
    ordersRequestRef.current = request;
    return request;
  }, [membership]);

  useEffect(() => {
    const isMasterRoute = location.pathname.startsWith('/admin-master');
    const isStoreAdminRoute = location.pathname === '/admin' || location.pathname.startsWith('/admin/');
    const marketingRoot = typeof window !== 'undefined' && isFoodWebMarketingRoot(location.pathname, window.location.hostname);
    if (isMasterRoute || marketingRoot) { setLoading(false); return; }
    if (authLoading) { setLoading(true); return; }
    if (isStoreAdminRoute) {
      if (user && membership) void reloadAdmin();
      else { setLoading(false); setError(''); }
      return;
    }
    void reloadPublic();
  }, [authLoading, user, membership, reloadAdmin, reloadPublic, location.pathname]);

  useEffect(() => {
    const refresh = () => {
      const isMasterRoute = location.pathname.startsWith('/admin-master');
      const isStoreAdminRoute = location.pathname === '/admin' || location.pathname.startsWith('/admin/');
      const marketingRoot = typeof window !== 'undefined' && isFoodWebMarketingRoot(location.pathname, window.location.hostname);
      if (isMasterRoute || marketingRoot || authLoading) return;
      if (isStoreAdminRoute) {
        if (user && membership) void reloadAdmin({ force: true });
        return;
      }
      void reloadPublic();
    };
    const onStorage = (event: StorageEvent) => { if (event.key === SYNC_KEY) refresh(); };
    window.addEventListener('storage', onStorage);
    let channel: BroadcastChannel | null = null;
    try { channel = new BroadcastChannel('foodservice-store-sync'); channel.onmessage = refresh; } catch { channel = null; }
    return () => { window.removeEventListener('storage', onStorage); channel?.close(); };
  }, [authLoading, user, membership, reloadAdmin, reloadPublic, location.pathname]);

  const value = useMemo<StoreContextValue>(() => ({
    products, categories, addons, deliveryZones, settings, orders, planUsage, loading, error, storeUnavailable, unavailableStoreName, dataMode: storeApi.mode, storeBasePath, publicStoreSlug,
    reloadPublic,
    reloadAdmin,
    reloadOrders,
    saveProduct: async (product) => { await storeApi.saveProduct(product); await reloadAdmin({ force: true }); notifyStoreChange(); },
    updateProductStock: async (productId, input) => { await storeApi.updateProductStock(settings.id, productId, input); setProducts((current) => current.map((product) => product.id === productId ? { ...product, ...input } : product)); notifyStoreChange(); },
    deleteProduct: async (id) => { await storeApi.deleteProduct(id); await reloadAdmin({ force: true }); notifyStoreChange(); },
    saveCategory: async (category) => { await storeApi.saveCategory(category); await reloadAdmin({ force: true }); notifyStoreChange(); },
    deleteCategory: async (id) => { await storeApi.deleteCategory(id); await reloadAdmin({ force: true }); notifyStoreChange(); },
    saveAddon: async (addon) => { await storeApi.saveAddon(addon); await reloadAdmin({ force: true }); notifyStoreChange(); },
    deleteAddon: async (id) => { await storeApi.deleteAddon(id); await reloadAdmin({ force: true }); notifyStoreChange(); },
    saveDeliveryZones: async (zones) => { await storeApi.saveDeliveryZones(zones); await reloadAdmin({ force: true }); notifyStoreChange(); },
    deleteDeliveryZone: async (id) => { await storeApi.deleteDeliveryZone(id); await reloadAdmin({ force: true }); notifyStoreChange(); },
    saveSettings: async (next) => { const saved=await storeApi.saveSettings(next); setSettings(saved); notifyStoreChange(); },
    uploadProductImages: async (productId, files, current) => { const images=await storeApi.uploadProductImages(settings.id, productId, files, current); await reloadAdmin({ force: true }); notifyStoreChange(); return images; },
    deleteProductImage: async (image) => { await storeApi.deleteProductImage(image); await reloadAdmin({ force: true }); notifyStoreChange(); },
    setPrimaryImage: async (productId, imageId) => { await storeApi.setPrimaryImage(productId,imageId); await reloadAdmin({ force: true }); notifyStoreChange(); },
    uploadStoreAsset: async (file, kind) => storeApi.uploadStoreAsset(settings.id,file,kind),
    uploadAddonImage: async (addonId, file) => storeApi.uploadAddonImage(settings.id,addonId,file),
    resetDemo: async () => { applySnapshot(await storeApi.resetDemo()); },
    registerOrder: storeApi.createOrder,
    createManualOrder: async (input) => { const result = await storeApi.createManualOrder(settings, products, input); await reloadOrders({ silent: true }); notifyStoreChange(); return result; },
    updateManualOrder: async (orderId, input) => { await storeApi.updateManualOrder(orderId, input); await reloadOrders({ silent: true }); notifyStoreChange(); },
    updateOrderDetails: async (orderId, input) => { await storeApi.updateOrderDetails(settings.id, orderId, input); await reloadOrders({ silent: true }); notifyStoreChange(); },
    markOrderWhatsAppClicked: storeApi.markOrderWhatsAppClicked,
    confirmOrderPayment: async (orderId) => { const result=await storeApi.confirmOrderPayment(orderId); await reloadOrders({ silent: true }); notifyStoreChange(); return result; },
    updateOrderStatus: async (orderId, status) => { await storeApi.updateOrderStatus(orderId, status); await reloadOrders({ silent: true }); notifyStoreChange(); },
    updateOrderStatuses: async (updates) => { await storeApi.updateOrderStatuses(updates); await reloadOrders({ silent: true }); notifyStoreChange(); },
  }), [products,categories,addons,deliveryZones,settings,orders,planUsage,loading,error,storeUnavailable,unavailableStoreName,reloadPublic,reloadAdmin,reloadOrders,applySnapshot,storeBasePath,publicStoreSlug]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore deve ser usado dentro de StoreProvider');
  return value;
};
