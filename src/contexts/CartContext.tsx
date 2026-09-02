import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CartItem, Product, SelectedOption } from '../types';
import { roundMoney } from '../utils/format';
import { useStore } from './StoreContext';

const cartKeyFor = (storeId: string) => `foodservice_cart_v1:${storeId}`;
const readCart = (key: string): CartItem[] => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<CartItem & { food_addons?: unknown; variation?: unknown }>;
    // Carrinhos da versão FloriWeb são descartados propositalmente: o contrato de opções mudou.
    return parsed.filter((item) => Array.isArray(item.options));
  } catch {
    return [];
  }
};

type CartContextValue = {
  items: CartItem[];
  totalItems: number;
  subtotal: number;
  addItem: (product: Product, quantity: number, options?: SelectedOption[]) => void;
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

const normalizedOptionKey = (options: SelectedOption[]) => options
  .map((option) => `${option.groupId}:${option.itemId}:${option.quantity}`)
  .sort()
  .join('|');

export function CartProvider({ children }: { children: ReactNode }) {
  const { settings } = useStore();
  const cartKey = cartKeyFor(settings.id || settings.slug || 'default');
  const [state, setState] = useState<{ key: string; items: CartItem[] }>(() => ({ key: cartKey, items: readCart(cartKey) }));
  const items = state.key === cartKey ? state.items : readCart(cartKey);

  useEffect(() => {
    if (state.key !== cartKey) setState({ key: cartKey, items: readCart(cartKey) });
  }, [cartKey, state.key]);

  useEffect(() => {
    if (state.key !== cartKey) return;
    try { localStorage.setItem(cartKey, JSON.stringify(state.items)); } catch { /* armazenamento indisponível */ }
  }, [state, cartKey]);

  const setItems = (updater: (current: CartItem[]) => CartItem[]) => setState((current) => {
    const base = current.key === cartKey ? current.items : readCart(cartKey);
    return { key: cartKey, items: updater(base) };
  });

  const value = useMemo<CartContextValue>(() => ({
    items,
    totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: calculateCartSubtotal(items),
    addItem: (product, quantity, options = []) => {
      const base = product.promotionalPrice ?? product.price;
      const id = `${product.id}|${normalizedOptionKey(options) || 'base'}`;
      const normalizedOptions = options
        .map((option) => ({ ...option, quantity: Math.max(1, option.quantity || 1) }))
        .sort((a, b) => a.groupName.localeCompare(b.groupName) || a.itemName.localeCompare(b.itemName));
      setItems((current) => {
        const existing = current.find((item) => item.id === id);
        if (existing) return current.map((item) => item.id === id ? { ...item, quantity: item.quantity + quantity } : item);
        return [...current, {
          id,
          productId: product.id,
          productName: product.name,
          imageUrl: product.imageUrl,
          unitPrice: roundMoney(base),
          quantity,
          options: normalizedOptions,
        }];
      });
    },
    updateQuantity: (id, quantity) => setItems((current) => current.map((item) => item.id === id ? { ...item, quantity: Math.max(1, quantity) } : item)),
    removeItem: (id) => setItems((current) => current.filter((item) => item.id !== id)),
    clear: () => setItems(() => []),
    validateAgainstProducts: (products) => setItems((current) => current.flatMap((item) => {
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
      const unitPrice = roundMoney(product.promotionalPrice ?? product.price);
      return [{ ...item, productName: product.name, imageUrl: product.imageUrl, unitPrice, options: nextOptions }];
    })),
  }), [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => {
  const value = useContext(CartContext);
  if (!value) throw new Error('CartContext indisponível.');
  return value;
};
