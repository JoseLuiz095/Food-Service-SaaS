import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { StorefrontUnavailableError, storeApi } from '../services/storeApi';
import { seedAddons, seedCategories, seedDeliveryZones, seedPlan, seedProducts, seedSettings } from '../data/seed';
import type { Addon, Category, DeliveryZone, Order, PlanUsage, Product, ProductImage, StoreSettings } from '../types';
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
  reloadAdmin: (options?: { silent?: boolean }) => Promise<void>;
  saveProduct: (product: Product) => Promise<void>;
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
  markOrderWhatsAppClicked: typeof storeApi.markOrderWhatsAppClicked;
  confirmOrderPayment: typeof storeApi.confirmOrderPayment;
  updateOrderStatus: (orderId: string, status: Order['status']) => Promise<void>;
};

const defaultPlanUsage: PlanUsage = { plan: seedPlan, productCount: seedProducts.length, activeProductCount: seedProducts.filter((product) => product.active).length, canCreateProduct: true, canActivateProduct: true };
const StoreContext = createContext<StoreContextValue | null>(null);

const SYNC_KEY = 'foodservice_store_sync_v1';
const notifyStoreChange = () => {
  try { localStorage.setItem(SYNC_KEY, String(Date.now())); } catch { /* sem storage */ }
  try { const channel = new BroadcastChannel('foodservice-store-sync'); channel.postMessage({ type: 'store-change', at: Date.now() }); channel.close(); } catch { /* browser sem BroadcastChannel */ }
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const { membership, user } = useAuth();
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

  const applySnapshot = useCallback((snapshot: Awaited<ReturnType<typeof storeApi.loadPublic>>) => {
    setSettings(snapshot.settings); setCategories(snapshot.categories); setProducts(snapshot.products); setAddons(snapshot.addons); setDeliveryZones(snapshot.deliveryZones); setOrders(snapshot.orders); setPlanUsage(snapshot.planUsage);
  }, []);

  const reloadPublic = useCallback(async () => {
    setLoading(true); setError(''); setStoreUnavailable(false); setUnavailableStoreName('');
    try { applySnapshot(await storeApi.loadPublic(publicStoreSlug, window.location.hostname)); }
    catch (e) {
      if (e instanceof StorefrontUnavailableError) {
        setStoreUnavailable(true);
        setUnavailableStoreName(e.storeName);
      } else {
        setError(e instanceof Error ? e.message : 'Não foi possível carregar a loja.');
      }
    }
    finally { setLoading(false); }
  }, [applySnapshot, publicStoreSlug]);

  const reloadAdmin = useCallback(async (options?: { silent?: boolean }) => {
    if (!membership) return;
    const silent = Boolean(options?.silent);
    if (!silent) { setLoading(true); setError(''); }
    try { applySnapshot(await storeApi.loadAdmin(membership.storeId)); }
    catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : 'Não foi possível carregar o painel.');
      else throw e;
    }
    finally { if (!silent) setLoading(false); }
  }, [membership, applySnapshot]);

  useEffect(() => {
    const isMasterRoute = location.pathname.startsWith('/admin-master');
    const isStoreAdminRoute = location.pathname === '/admin' || location.pathname.startsWith('/admin/');
    const marketingRoot = typeof window !== 'undefined' && isFoodWebMarketingRoot(location.pathname, window.location.hostname);
    if (isMasterRoute || marketingRoot) { setLoading(false); return; }
    if (isStoreAdminRoute && user && membership) void reloadAdmin(); else void reloadPublic();
  }, [user, membership, reloadAdmin, reloadPublic, location.pathname]);

  useEffect(() => {
    const refresh = () => {
      const isMasterRoute = location.pathname.startsWith('/admin-master');
      const isStoreAdminRoute = location.pathname === '/admin' || location.pathname.startsWith('/admin/');
      const marketingRoot = typeof window !== 'undefined' && isFoodWebMarketingRoot(location.pathname, window.location.hostname);
      if (isMasterRoute || marketingRoot) return;
      if (isStoreAdminRoute && user && membership) void reloadAdmin(); else void reloadPublic();
    };
    const onStorage = (event: StorageEvent) => { if (event.key === SYNC_KEY) refresh(); };
    window.addEventListener('storage', onStorage);
    let channel: BroadcastChannel | null = null;
    try { channel = new BroadcastChannel('foodservice-store-sync'); channel.onmessage = refresh; } catch { channel = null; }
    return () => { window.removeEventListener('storage', onStorage); channel?.close(); };
  }, [user, membership, reloadAdmin, reloadPublic, location.pathname]);

  const value = useMemo<StoreContextValue>(() => ({
    products, categories, addons, deliveryZones, settings, orders, planUsage, loading, error, storeUnavailable, unavailableStoreName, dataMode: storeApi.mode, storeBasePath, publicStoreSlug,
    reloadPublic,
    reloadAdmin,
    saveProduct: async (product) => { await storeApi.saveProduct(product); await reloadAdmin(); notifyStoreChange(); },
    deleteProduct: async (id) => { await storeApi.deleteProduct(id); await reloadAdmin(); notifyStoreChange(); },
    saveCategory: async (category) => { await storeApi.saveCategory(category); await reloadAdmin(); notifyStoreChange(); },
    deleteCategory: async (id) => { await storeApi.deleteCategory(id); await reloadAdmin(); notifyStoreChange(); },
    saveAddon: async (addon) => { await storeApi.saveAddon(addon); await reloadAdmin(); notifyStoreChange(); },
    deleteAddon: async (id) => { await storeApi.deleteAddon(id); await reloadAdmin(); notifyStoreChange(); },
    saveDeliveryZones: async (zones) => { await storeApi.saveDeliveryZones(zones); await reloadAdmin(); notifyStoreChange(); },
    deleteDeliveryZone: async (id) => { await storeApi.deleteDeliveryZone(id); await reloadAdmin(); notifyStoreChange(); },
    saveSettings: async (next) => { const saved=await storeApi.saveSettings(next); setSettings(saved); notifyStoreChange(); },
    uploadProductImages: async (productId, files, current) => { const images=await storeApi.uploadProductImages(settings.id, productId, files, current); await reloadAdmin(); notifyStoreChange(); return images; },
    deleteProductImage: async (image) => { await storeApi.deleteProductImage(image); await reloadAdmin(); notifyStoreChange(); },
    setPrimaryImage: async (productId, imageId) => { await storeApi.setPrimaryImage(productId,imageId); await reloadAdmin(); notifyStoreChange(); },
    uploadStoreAsset: async (file, kind) => storeApi.uploadStoreAsset(settings.id,file,kind),
    uploadAddonImage: async (addonId, file) => storeApi.uploadAddonImage(settings.id,addonId,file),
    resetDemo: async () => { applySnapshot(await storeApi.resetDemo()); },
    registerOrder: storeApi.createOrder,
    markOrderWhatsAppClicked: storeApi.markOrderWhatsAppClicked,
    confirmOrderPayment: async (orderId) => { const result=await storeApi.confirmOrderPayment(orderId); await reloadAdmin({ silent: true }); notifyStoreChange(); return result; },
    updateOrderStatus: async (orderId, status) => { await storeApi.updateOrderStatus(orderId, status); await reloadAdmin({ silent: true }); notifyStoreChange(); },
  }), [products,categories,addons,deliveryZones,settings,orders,planUsage,loading,error,storeUnavailable,unavailableStoreName,reloadPublic,reloadAdmin,applySnapshot,storeBasePath,publicStoreSlug]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore deve ser usado dentro de StoreProvider');
  return value;
};
