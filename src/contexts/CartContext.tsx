import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CartItem, Product, SelectedOption } from '../types';
import { roundMoney } from '../utils/format';
import { useStore } from './StoreContext';

const cartKeyFor = (storeId: string) => `foodservice_cart_v1:${storeId}`;
const readPickupPoint = (key: string) => {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
};
// Mesmo contrato de quantidade da RPC de pedidos, para todas as lojas.
export const MAX_CART_ITEM_QUANTITY = 99;
const boundedQuantity = (quantity: number) => Math.max(1, Math.min(MAX_CART_ITEM_QUANTITY, Math.trunc(Number(quantity)) || 1));
const readCart = (key: string): CartItem[] => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<CartItem & { food_addons?: unknown; variation?: unknown }>;
    // Carrinhos da versão FloriWeb são descartados propositalmente: o contrato de opções mudou.
    return parsed.filter((item) => Array.isArray(item.options)).map(item => ({ ...item, quantity: boundedQuantity(item.quantity) }));
  } catch {
    return [];
  }
};

type CartContextValue = {
  items: CartItem[];
  pickupLocationId: string;
  setPickupLocationId: (id: string) => void;
  totalItems: number;
  subtotal: number;
  addItem: (product: Product, quantity: number, options?: SelectedOption[], metadata?: { partyPackageWeightGrams?: number }) => void;
  updateQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  clear: () => void;
  validateAgainstProducts: (products: Product[]) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export const cartItemOptionsTotal = (item: CartItem) => roundMoney(
  item.options.reduce((sum, option) => sum + option.priceDelta * Math.max(1, option.quantity), 0),
);

export const cartItemUnitTotal = (item: CartItem) => roundMoney(item.unitPrice + cartItemOptionsTotal(item));
export const calculateCartSubtotal = (items: CartItem[]) => roundMoney(items.reduce((sum, item) => sum + cartItemUnitTotal(item) * item.quantity, 0));

const normalizedOptionKey = (options: SelectedOption[], partyPackageWeightGrams?: number) => options
  .map((option) => `${option.groupId}:${option.itemId}:${option.quantity}`)
  .sort()
  .concat(partyPackageWeightGrams ? [`party-weight:${partyPackageWeightGrams}`] : [])
  .join('|');

export const cartItemIdFor = (productId: string, options: SelectedOption[] = [], partyWeight?: number) =>
  `${productId}|${normalizedOptionKey(options, partyWeight) || 'base'}`;

export function CartProvider({ children }: { children: ReactNode }) {
  const { settings } = useStore();
  const cartKey = cartKeyFor(settings.id || settings.slug || 'default');
  const [state, setState] = useState<{ key: string; items: CartItem[] }>(() => ({ key: cartKey, items: readCart(cartKey) }));
  const items = state.key === cartKey ? state.items : readCart(cartKey);
  const pointKey = `foodservice_pickup_point_v1:${settings.id || settings.slug || 'default'}`;
  const [pointState, setPointState] = useState<{ key: string; id: string }>(() => ({ key: pointKey, id: readPickupPoint(pointKey) }));
  const pickupLocationId = pointState.key === pointKey ? pointState.id : readPickupPoint(pointKey);

  useEffect(() => {
    if (state.key !== cartKey) setState({ key: cartKey, items: readCart(cartKey) });
  }, [cartKey, state.key]);

  useEffect(() => {
    if (state.key !== cartKey) return;
    try { localStorage.setItem(cartKey, JSON.stringify(state.items)); } catch { /* armazenamento indisponível */ }
  }, [state, cartKey]);
  useEffect(() => {
    if (pointState.key !== pointKey) setPointState({ key: pointKey, id: readPickupPoint(pointKey) });
  }, [pointKey, pointState.key]);

  const setItems = (updater: (current: CartItem[]) => CartItem[]) => setState((current) => {
    const base = current.key === cartKey ? current.items : readCart(cartKey);
    const next = updater(base);
    if (current.key === cartKey && next === current.items) return current;
    return { key: cartKey, items: next };
  });

  const value = useMemo<CartContextValue>(() => ({
    items,
    pickupLocationId,
    setPickupLocationId: (id) => {
      try { if (id) localStorage.setItem(pointKey, id); else localStorage.removeItem(pointKey); } catch { /* armazenamento indisponível */ }
      setPointState({ key: pointKey, id });
    },
    totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: calculateCartSubtotal(items),
    addItem: (product, quantity, options = [], metadata = {}) => {
      const partyConfig = product.partyOrderConfig?.enabled ? product.partyOrderConfig : undefined;
      const partyWeight = partyConfig ? Math.max(1, Math.trunc(Number(metadata.partyPackageWeightGrams || partyConfig.packageWeightGrams))) : undefined;
      const base = partyConfig?.pricePerGram ? partyConfig.pricePerGram * (partyWeight || partyConfig.packageWeightGrams) : (product.promotionalPrice ?? product.price);
      const id = cartItemIdFor(product.id, options, partyWeight);
      const normalizedOptions = options
        .map((option) => ({ ...option, quantity: Math.max(1, option.quantity || 1) }))
        .sort((a, b) => a.groupName.localeCompare(b.groupName) || a.itemName.localeCompare(b.itemName));
      setItems((current) => {
        const existing = current.find((item) => item.id === id);
        if (existing) return current.map((item) => item.id === id ? { ...item, quantity: boundedQuantity(item.quantity + boundedQuantity(quantity)) } : item);
        return [...current, {
          id,
          productId: product.id,
          productName: product.name,
          imageUrl: product.imageUrl,
          visualEmoji: product.visualEmoji,
          unitPrice: roundMoney(base),
          quantity: boundedQuantity(quantity),
          options: normalizedOptions,
           partyPackageWeightGrams: partyWeight,
        }];
      });
    },
    updateQuantity: (id, quantity) => setItems((current) => current.map((item) => item.id === id ? { ...item, quantity: boundedQuantity(quantity) } : item)),
    removeItem: (id) => setItems((current) => current.filter((item) => item.id !== id)),
    clear: () => setItems(() => []),
    validateAgainstProducts: (products) => setItems((current) => {
      const next = current.flatMap((item) => {
      const product = products.find((candidate) => candidate.id === item.productId && candidate.active && candidate.stockStatus !== 'unavailable' && candidate.availabilityStatus === 'available');
      if (!product) return [];
      const optionIndex = new Map(product.optionGroups.flatMap((group) => group.items.map((option) => [option.id, { group, option }] as const)));
      const nextOptions: SelectedOption[] = [];
      for (const selected of item.options) {
        const currentOption = optionIndex.get(selected.itemId);
        if (!currentOption || !currentOption.group.active || !currentOption.option.active) return [];
        nextOptions.push({
          groupId: currentOption.group.id,
          groupName: currentOption.group.name,
          groupKind: currentOption.group.kind,
          itemId: currentOption.option.id,
          itemName: currentOption.option.name,
          priceDelta: currentOption.option.priceDelta,
          quantity: Math.max(1, selected.quantity || 1),
        });
      }
       const partyConfig = product.partyOrderConfig?.enabled ? product.partyOrderConfig : undefined;
       const partyWeight = partyConfig ? Math.max(1, Math.trunc(Number(item.partyPackageWeightGrams || partyConfig.packageWeightGrams))) : undefined;
       const unitPrice = roundMoney(partyConfig?.pricePerGram ? partyConfig.pricePerGram * (partyWeight || partyConfig.packageWeightGrams) : (product.promotionalPrice ?? product.price));
        const unchanged = item.productName === product.name
          && item.imageUrl === product.imageUrl
          && item.visualEmoji === product.visualEmoji
          && item.unitPrice === unitPrice
           && item.partyPackageWeightGrams === partyWeight
          && JSON.stringify(item.options) === JSON.stringify(nextOptions);
       return [unchanged ? item : { ...item, productName: product.name, imageUrl: product.imageUrl, visualEmoji: product.visualEmoji, unitPrice, options: nextOptions, partyPackageWeightGrams: partyWeight }];
      });
      return next.length === current.length && next.every((item, index) => item === current[index]) ? current : next;
    }),
  }), [items, pickupLocationId, pointKey]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => {
  const value = useContext(CartContext);
  if (!value) throw new Error('CartContext indisponível.');
  return value;
};
