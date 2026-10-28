import type { CartItem, Product } from '../types';

/** Limit one line without counting stock belonging to a different pickup point.
 * Undefined means official storefront; null means point stock is still unknown.
 * Empty official stock keeps the existing made-to-order flow available. */
export function cartLineLimit(product: Product, items: CartItem[], lineId: string, pointAvailable?: number | null): number {
  if (!product.trackStock) return 99;
  if (pointAvailable === null) return 0;
  const stock = pointAvailable === undefined
    ? Math.max(0, Number(product.stockQuantity || 0) - Number(product.stockReservedQuantity || 0))
    : Math.max(0, Number(pointAvailable) || 0);
  if (pointAvailable === undefined && stock === 0) return 99;
  const elsewhereInCart = items.filter(item => item.productId === product.id && item.id !== lineId)
    .reduce((sum, item) => sum + item.quantity, 0);
  return Math.min(99, Math.max(0, Math.floor(stock - elsewhereInCart)));
}

export function canAddWithoutOptions(product: Product): boolean {
  return !product.partyOrderConfig?.enabled && !product.optionGroups.some(group =>
    (group.active && group.minChoices > 0) || group.name === '__foodweb_party_order_config__');
}
