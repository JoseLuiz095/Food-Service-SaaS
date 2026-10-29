import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { StorefrontUnavailableError, storeApi, type ProductCommercialUpdate } from '../services/storeApi';
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
  saveProduct: (product: Product, options?: { isNew?: boolean }) => Promise<void>;
  updateProductCommercial: (productId: string, input: ProductCommercialUpdate) => Promise<void>;
  updateProductStock: (productId: string, input: { mode: 'set' | 'add' | 'remove'; quantity: number; reason: string; idempotencyKey?: string }) => Promise<void>;
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
const emptyPlanUsage: PlanUsage = { ...defaultPlanUsage, plan: { ...seedPlan, id: '', name: 'Carregando…' }, productCount: 0, activeProductCount: 0, canCreateProduct: false, canActivateProduct: false };
const emptySettings: StoreSettings = { ...seedSettings, id: '', slug: '', name: '', description: '', logoUrl: '', heroUrl: '', whatsapp: '', pixKey: '', pixCopyPaste: '', address: '', city: '', state: '', zipCode: '' };
const StoreContext = createContext<StoreContextValue | null>(null);

const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
const shouldRetryAdminLoad = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /Loja não encontrada ou sem permissão|Sessão expirada|Failed to fetch|NetworkError|fetch failed/i.test(message);
};
const SYNC_KEY = 'foodservice_store_sync_v1';
const SYNC_SENDER_ID = Math.random().toString(36).slice(2);
const ADMIN_SNAPSHOT_CACHE_MS = 30_000;
const notifyStoreChange = () => {
  // Evita que a própria sessão continue exibindo uma vitrine pública antiga
  // depois de salvar produtos, configurações ou imagens no painel.
  storeApi.invalidatePublicCache();
  try { localStorage.setItem(SYNC_KEY, String(Date.now())); } catch { /* sem storage */ }
  try { const channel = new BroadcastChannel('foodservice-store-sync'); channel.postMessage({ type: 'store-change', sender: SYNC_SENDER_ID, at: Date.now() }); channel.close(); } catch { /* browser sem BroadcastChannel */ }
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const { membership, user, loading: authLoading } = useAuth();
  const location = useLocation();
  const publicStoreSlug = storeSlugFromPath(location.pathname);
  const storeBasePath = storeBasePathFromPath(location.pathname);
  const isAdminRoute = location.pathname === '/admin' || location.pathname.startsWith('/admin/');
  const isInactiveRoute = location.pathname.startsWith('/admin-master')
    || isFoodWebMarketingRoot(location.pathname, window.location.hostname)
    || /^\/(?:cadastro|modulos)(?:\/|$)/.test(location.pathname);
  const adminScope = `admin:${user?.id || ''}:${membership?.storeId || ''}`;
  const publicScope = `public:${window.location.hostname}:${publicStoreSlug || ''}`;
  const dataScope = isInactiveRoute ? 'inactive' : isAdminRoute ? adminScope : publicScope;
  // A resposta de uma tela/loja anterior não pode atualizar o contexto atual,
  // inclusive entre o render da troca de tenant e a execução dos efeitos.
  const activeScopeRef = useRef(dataScope);
  activeScopeRef.current = dataScope;
  const [snapshotScope, setSnapshotScope] = useState('');
  const snapshotScopeRef = useRef('');
  const [loadScope, setLoadScope] = useState('');
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
  const ordersRequestRef = useRef<{ scope: string; promise: Promise<void> } | null>(null);
  const adminSnapshotRef = useRef<{ storeId: string; userId: string; loadedAt: number } | null>(null);

  const applySnapshot = useCallback((snapshot: Awaited<ReturnType<typeof storeApi.loadPublic>>, scope: string) => {
    snapshotScopeRef.current = scope;
    setSnapshotScope(scope);
    setSettings(snapshot.settings); setCategories(snapshot.categories); setProducts(snapshot.products); setAddons(snapshot.addons); setDeliveryZones(snapshot.deliveryZones); setOrders(snapshot.orders); setPlanUsage(snapshot.planUsage);
  }, []);

  const reloadPublic = useCallback(async () => {
    if (activeScopeRef.current !== publicScope) return;
    const requestVersion = ++loadVersionRef.current;
    const isCurrent = () => requestVersion === loadVersionRef.current && activeScopeRef.current === publicScope;
    ++ordersLoadVersionRef.current;
    setLoadScope(publicScope);
    setLoading(true); setError(''); setStoreUnavailable(false); setUnavailableStoreName('');
    try {
      const snapshot = await storeApi.loadPublic(publicStoreSlug, window.location.hostname);
      if (!isCurrent()) return;
      applySnapshot(snapshot, publicScope);
    }
    catch (e) {
      if (!isCurrent()) return;
      if (e instanceof StorefrontUnavailableError) {
        setStoreUnavailable(true);
        setUnavailableStoreName(e.storeName);
      } else {
        setError(e instanceof Error ? e.message : 'Não foi possível carregar a loja.');
      }
    }
    finally { if (isCurrent()) setLoading(false); }
  }, [applySnapshot, publicStoreSlug, publicScope]);

  const reloadAdmin = useCallback(async (options?: { silent?: boolean; force?: boolean }) => {
    if (!membership || !user || authLoading || activeScopeRef.current !== adminScope) return;
    const force = Boolean(options?.force);
    const cached = adminSnapshotRef.current;
    if (!force && snapshotScopeRef.current === adminScope && cached?.storeId === membership.storeId && cached.userId === user?.id && Date.now() - cached.loadedAt < ADMIN_SNAPSHOT_CACHE_MS) {
      setLoadScope(adminScope);
      if (!options?.silent) setLoading(false);
      return;
    }
    const requestVersion = ++loadVersionRef.current;
    const isCurrent = () => requestVersion === loadVersionRef.current && activeScopeRef.current === adminScope;
    ++ordersLoadVersionRef.current;
    setLoadScope(adminScope);
    const silent = Boolean(options?.silent);
    if (!silent) { setLoading(true); setError(''); }
    try {
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (!isCurrent()) return;
        try {
          const snapshot = await storeApi.loadAdmin(membership.storeId);
          if (!isCurrent()) return;
          applySnapshot(snapshot, adminScope);
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
      if (!isCurrent()) return;
      if (!silent) setError(e instanceof Error ? e.message : 'Não foi possível carregar o painel.');
      else throw e;
    }
    finally { if (!silent && isCurrent()) setLoading(false); }
  }, [membership, user, authLoading, adminScope, applySnapshot]);

  const reloadOrders = useCallback(async (options?: { silent?: boolean }) => {
    if (!membership || !user || authLoading || activeScopeRef.current !== adminScope) return;
    if (ordersRequestRef.current?.scope === adminScope) return ordersRequestRef.current.promise;
    const requestVersion = ++ordersLoadVersionRef.current;
    const isCurrent = () => requestVersion === ordersLoadVersionRef.current && activeScopeRef.current === adminScope;
    const request = (async () => {
      try {
        const nextOrders = await storeApi.loadAdminOrders(membership.storeId);
        if (!isCurrent()) return;
        setOrders(nextOrders);
      } catch (e) {
        if (!isCurrent()) return;
        if (options?.silent) throw e;
        setError(e instanceof Error ? e.message : 'Não foi possível atualizar os pedidos.');
      }
    })().finally(() => {
      if (ordersRequestRef.current?.promise === request) ordersRequestRef.current = null;
    });
    ordersRequestRef.current = { scope: adminScope, promise: request };
    return request;
  }, [membership, user, authLoading, adminScope]);

  useEffect(() => {
    const isMasterRoute = location.pathname.startsWith('/admin-master');
    const isStoreAdminRoute = location.pathname === '/admin' || location.pathname.startsWith('/admin/');
    const marketingRoot = typeof window !== 'undefined' && isFoodWebMarketingRoot(location.pathname, window.location.hostname);
    const isStandalonePublicRoute = /^\/(?:cadastro|modulos)(?:\/|$)/.test(location.pathname);
    if (isMasterRoute || marketingRoot || isStandalonePublicRoute) { adminSnapshotRef.current = null; setLoading(false); return; }
    if (authLoading) { setLoading(true); return; }
    if (isStoreAdminRoute) {
      if (user && membership) void reloadAdmin({ silent: snapshotScopeRef.current === adminScope }).catch(() => { /* Mantém o snapshot atual em erro de atualização. */ });
      else { adminSnapshotRef.current = null; setLoading(false); setError(''); }
      return;
    }
    void reloadPublic();
  }, [authLoading, user, membership, reloadAdmin, reloadPublic, location.pathname]);

  useEffect(() => {
    const refresh = () => {
      const isMasterRoute = location.pathname.startsWith('/admin-master');
      const isStoreAdminRoute = location.pathname === '/admin' || location.pathname.startsWith('/admin/');
      const marketingRoot = typeof window !== 'undefined' && isFoodWebMarketingRoot(location.pathname, window.location.hostname);
      const isStandalonePublicRoute = /^\/(?:cadastro|modulos)(?:\/|$)/.test(location.pathname);
      if (isMasterRoute || marketingRoot || isStandalonePublicRoute || authLoading) return;
      if (isStoreAdminRoute) {
        if (user && membership) void reloadAdmin({ force: true, silent: true }).catch(() => { /* Mantém a tela atual em falha de sincronização. */ });
        return;
      }
      void reloadPublic();
    };
    const onStorage = (event: StorageEvent) => { if (event.key === SYNC_KEY) refresh(); };
    window.addEventListener('storage', onStorage);
    let channel: BroadcastChannel | null = null;
    try { channel = new BroadcastChannel('foodservice-store-sync'); channel.onmessage = event => { if (event.data?.sender !== SYNC_SENDER_ID) refresh(); }; } catch { channel = null; }
    return () => { window.removeEventListener('storage', onStorage); channel?.close(); };
  }, [authLoading, user, membership, reloadAdmin, reloadPublic, location.pathname]);

  const assertAdminScope = useCallback((entityStoreId?: string) => {
    if (authLoading || !user || !membership || activeScopeRef.current !== adminScope
      || snapshotScope !== adminScope || settings.id !== membership.storeId
      || (entityStoreId !== undefined && entityStoreId !== membership.storeId)) {
      throw new Error('Aguarde o carregamento da loja selecionada antes de salvar. Se você trocou de negócio, abra o item novamente.');
    }
    return membership.storeId;
  }, [authLoading, user, membership, adminScope, snapshotScope, settings.id]);

  const runAdminMutation = useCallback(async <T,>(operation: () => Promise<T>, refresh: 'admin' | 'orders' | 'none' = 'admin') => {
    assertAdminScope();
    const result = await operation();
    notifyStoreChange();
    if (activeScopeRef.current === adminScope) {
      // Uma leitura iniciada antes da gravação não pode prevalecer nem ser
      // reaproveitada como se já contivesse o resultado recém-persistido.
      ++loadVersionRef.current;
      ++ordersLoadVersionRef.current;
      ordersRequestRef.current = null;
      adminSnapshotRef.current = null;
      setLoading(false);
      if (refresh === 'admin') await reloadAdmin({ force: true });
      else if (refresh === 'orders') await reloadOrders({ silent: true });
    }
    return result;
  }, [assertAdminScope, adminScope, reloadAdmin, reloadOrders]);

  const hasCurrentSnapshot = snapshotScope === dataScope && dataScope !== 'inactive';
  const hasCurrentLoad = loadScope === dataScope;
  const value = useMemo<StoreContextValue>(() => ({
    products: hasCurrentSnapshot ? products : [], categories: hasCurrentSnapshot ? categories : [], addons: hasCurrentSnapshot ? addons : [],
    deliveryZones: hasCurrentSnapshot ? deliveryZones : [], settings: hasCurrentSnapshot ? settings : emptySettings,
    orders: hasCurrentSnapshot ? orders : [], planUsage: hasCurrentSnapshot ? planUsage : emptyPlanUsage,
    loading: dataScope !== 'inactive' && (loading || !hasCurrentLoad), error: hasCurrentLoad ? error : '',
    storeUnavailable: hasCurrentLoad && storeUnavailable, unavailableStoreName: hasCurrentLoad ? unavailableStoreName : '',
    dataMode: storeApi.mode, storeBasePath, publicStoreSlug,
    reloadPublic,
    reloadAdmin,
    reloadOrders,
    saveProduct: async (product, options) => { assertAdminScope(product.storeId); await runAdminMutation(() => storeApi.saveProduct(product, options)); },
    updateProductCommercial: async (productId, input) => {
      const storeId = assertAdminScope();
      const current = products.find(product => product.id === productId && product.storeId === storeId);
      if (!current) throw new Error('Produto não encontrado na loja selecionada.');
      if (input.availabilityStatus === 'available' && current.stockStatus === 'unavailable') throw new Error('Este produto tem um bloqueio de estoque. Revise o saldo em Estoque e insumos antes de disponibilizá-lo.');
      const confirmed = await runAdminMutation(() => storeApi.updateProductCommercial(storeId, productId, input), 'none');
      if (activeScopeRef.current !== adminScope) return;
      setProducts(currentProducts => currentProducts.map(product => product.id === productId && product.storeId === storeId ? { ...product, ...confirmed } : product));
      if (confirmed.active !== undefined && confirmed.active !== current.active) {
        setPlanUsage(usage => { const activeProductCount = Math.max(0, usage.activeProductCount + (confirmed.active ? 1 : -1)); return { ...usage, activeProductCount, canActivateProduct: usage.plan.productLimit == null || activeProductCount < usage.plan.productLimit }; });
      }
    },
    updateProductStock: async (productId, input) => {
      const storeId = assertAdminScope();
      const updated = await storeApi.updateProductStock(storeId, productId, input);
      notifyStoreChange();
      if (activeScopeRef.current !== adminScope) return;
      ++loadVersionRef.current;
      adminSnapshotRef.current = null;
      setLoading(false); setError('');
      setProducts((current) => current.map((product) => product.id === productId ? { ...product, ...updated } : product));
    },
    deleteProduct: async (id) => { await runAdminMutation(() => storeApi.deleteProduct(id)); },
    saveCategory: async (category) => { assertAdminScope(category.storeId); await runAdminMutation(() => storeApi.saveCategory(category)); },
    deleteCategory: async (id) => { await runAdminMutation(() => storeApi.deleteCategory(id)); },
    saveAddon: async (addon) => { assertAdminScope(addon.storeId); await runAdminMutation(() => storeApi.saveAddon(addon)); },
    deleteAddon: async (id) => { await runAdminMutation(() => storeApi.deleteAddon(id)); },
    saveDeliveryZones: async (zones) => { assertAdminScope(); zones.forEach((zone) => assertAdminScope(zone.storeId)); await runAdminMutation(() => storeApi.saveDeliveryZones(zones)); },
    deleteDeliveryZone: async (id) => { await runAdminMutation(() => storeApi.deleteDeliveryZone(id)); },
    saveSettings: async (next) => { assertAdminScope(next.id); const saved = await runAdminMutation(() => storeApi.saveSettings(next), 'none'); if (activeScopeRef.current === adminScope) setSettings(saved); },
    uploadProductImages: async (productId, files, current) => { const storeId = assertAdminScope(); return runAdminMutation(() => storeApi.uploadProductImages(storeId, productId, files, current)); },
    deleteProductImage: async (image) => { await runAdminMutation(() => storeApi.deleteProductImage(image)); },
    setPrimaryImage: async (productId, imageId) => { await runAdminMutation(() => storeApi.setPrimaryImage(productId,imageId)); },
    uploadStoreAsset: async (file, kind) => { const storeId = assertAdminScope(); return runAdminMutation(() => storeApi.uploadStoreAsset(storeId,file,kind), 'none'); },
    uploadAddonImage: async (addonId, file) => { const storeId = assertAdminScope(); return runAdminMutation(() => storeApi.uploadAddonImage(storeId,addonId,file), 'none'); },
    resetDemo: async () => { assertAdminScope(); const next = await storeApi.resetDemo(); if (activeScopeRef.current === adminScope) applySnapshot(next, adminScope); },
    registerOrder: storeApi.createOrder,
    createManualOrder: async (input) => runAdminMutation(() => storeApi.createManualOrder(settings, products, input), 'orders'),
    updateManualOrder: async (orderId, input) => { await runAdminMutation(() => storeApi.updateManualOrder(orderId, input), 'orders'); },
    updateOrderDetails: async (orderId, input) => { const storeId = assertAdminScope(); await runAdminMutation(() => storeApi.updateOrderDetails(storeId, orderId, input), 'orders'); },
    markOrderWhatsAppClicked: storeApi.markOrderWhatsAppClicked,
    confirmOrderPayment: async (orderId) => runAdminMutation(() => storeApi.confirmOrderPayment(orderId), 'orders'),
    updateOrderStatus: async (orderId, status) => { await runAdminMutation(() => storeApi.updateOrderStatus(orderId, status), 'orders'); },
    updateOrderStatuses: async (updates) => { await runAdminMutation(() => storeApi.updateOrderStatuses(updates), 'orders'); },
  }), [products,categories,addons,deliveryZones,settings,orders,planUsage,loading,error,storeUnavailable,unavailableStoreName,reloadPublic,reloadAdmin,reloadOrders,applySnapshot,storeBasePath,publicStoreSlug,hasCurrentSnapshot,hasCurrentLoad,dataScope,adminScope,assertAdminScope,runAdminMutation]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore deve ser usado dentro de StoreProvider');
  return value;
};
