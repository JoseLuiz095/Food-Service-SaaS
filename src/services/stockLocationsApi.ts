import { restFetch } from '../lib/supabaseRest';

export type StockLocation = {
  id: string;
  store_id: string;
  name: string;
  location_type: 'warehouse' | 'store' | 'vehicle' | 'pickup';
  active: boolean;
  is_default: boolean;
};

export type ProductLocationStock = {
  product_id: string;
  location_id: string;
  stock_quantity: number;
  stock_reserved_quantity: number;
  updated_at: string;
};

const enc = (value: string) => encodeURIComponent(value);

export const stockLocationsApi = {
  list: (storeId: string) => Promise.all([
    restFetch<StockLocation[]>(`food_stock_locations?store_id=eq.${enc(storeId)}&select=id,store_id,name,location_type,active,is_default&order=is_default.desc,name.asc`),
    restFetch<ProductLocationStock[]>(`food_product_location_stock?store_id=eq.${enc(storeId)}&select=product_id,location_id,stock_quantity,stock_reserved_quantity,updated_at&order=updated_at.desc`),
  ]),
  create: async (storeId: string, name: string, type: StockLocation['location_type']) => {
    const rows = await restFetch<StockLocation[]>('food_stock_locations?select=id,store_id,name,location_type,active,is_default', {
      method: 'POST', prefer: 'return=representation',
      body: { store_id: storeId, name: name.trim(), location_type: type, active: true, is_default: false },
    });
    return rows[0];
  },
  adjust: (input: { storeId: string; productId: string; locationId: string; quantity: number; reason: string; idempotencyKey: string }) =>
    restFetch<{ stock_quantity: number; location_stock: number; replayed?: boolean }>('rpc/food_adjust_location_stock_v1', {
      method: 'POST', body: {
        p_store_id: input.storeId, p_product_id: input.productId, p_location_id: input.locationId,
        p_quantity: input.quantity, p_reason: input.reason, p_idempotency_key: input.idempotencyKey,
      },
    }),
  transfer: (input: { storeId: string; productId: string; fromLocationId: string; toLocationId: string; quantity: number; reason: string; idempotencyKey: string }) =>
    restFetch<{ from_stock: number; to_stock: number; replayed?: boolean }>('rpc/food_transfer_location_stock_v1', {
      method: 'POST', body: {
        p_store_id: input.storeId, p_product_id: input.productId, p_from_location_id: input.fromLocationId,
        p_to_location_id: input.toLocationId, p_quantity: input.quantity, p_reason: input.reason,
        p_idempotency_key: input.idempotencyKey,
      },
    }),
};
