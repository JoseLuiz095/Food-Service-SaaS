import { restFetch } from '../lib/supabaseRest';
import { getSupabaseClient } from '../lib/supabase';
import { appConfig } from '../lib/config';
import { disabledModules } from './types';
import type { ModuleSettings, Offer, ComboItem, ComboVersion, ModuleOrder, ModuleOrderItem, OrderPart,
  Receivable, Refund, CustomRequest, CustomFile, RentalAsset, RentalReservation, PublicCatalog, CustomerOrder } from './types';

const rows = <T,>(table: string, storeId: string, column = 'store_id') =>
  restFetch<T[]>(`${table}?select=*&${column}=eq.${encodeURIComponent(storeId)}&limit=200`);

export const modulesApi = {
  async settings(storeId: string): Promise<ModuleSettings> {
    const data = await rows<ModuleSettings>('food_module_settings', storeId);
    return data[0] || disabledModules(storeId);
  },
  command: (storeId: string, action: string, data: unknown) => restFetch<{ id: string; already_paid?: boolean }>('rpc/food_modules_command',
    { method: 'POST', body: { p_store: storeId, p_action: action, p_data: data } }),
  offers: (storeId: string) => rows<Offer>('food_module_offers', storeId),
  versions: (storeId: string) => rows<ComboVersion>('food_combo_versions', storeId, 'seller_store_id'),
  approvals: (storeId: string) => rows<ComboItem>('food_combo_items', storeId),
  directory: () => restFetch<Offer[]>('rpc/food_modules_directory', { method: 'POST', body: {} }),
  parts: (storeId: string) => rows<OrderPart>('food_module_order_parts', storeId),
  orders: (storeId: string) => rows<ModuleOrder>('food_module_orders', storeId, 'seller_store_id'),
  orderItems: (storeId: string) => rows<ModuleOrderItem>('food_module_order_items', storeId),
  receivables: (storeId: string) => rows<Receivable>('food_module_receivables', storeId),
  refunds: (storeId: string) => rows<Refund>('food_module_refunds', storeId),
  customs: (storeId: string) => rows<CustomRequest>('food_custom_requests', storeId),
  files: (storeId: string) => rows<CustomFile>('food_custom_files', storeId),
  assets: (storeId: string) => rows<RentalAsset>('food_rental_assets', storeId),
  reservations: (storeId: string) => rows<RentalReservation>('food_rental_reservations', storeId),
  async upload(request: CustomRequest, file: File) {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !['png','jpg','jpeg','webp','pdf','stl','obj','3mf'].includes(extension)) throw new Error('Use foto, PDF, STL, OBJ ou 3MF.');
    if (file.size < 1 || file.size > 25 * 1024 * 1024) throw new Error('O arquivo deve ter até 25 MiB.');
    const path = `${request.organization_id}/${request.store_id}/${request.id}/${crypto.randomUUID()}.${extension}`;
    const { error } = await getSupabaseClient().storage.from('food-custom-files').upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
    if (error) throw error;
    await this.command(request.store_id, 'file_register', { request_id: request.id, storage_path: path, name: file.name, size_bytes: file.size });
  },
  async fileUrl(path: string) {
    const { data, error } = await getSupabaseClient().storage.from('food-custom-files').createSignedUrl(path, 60);
    if (error) throw error;
    return data.signedUrl;
  },
  catalog: (sellerId: string) => restFetch<PublicCatalog>('rpc/food_modules_catalog', { method: 'POST', body: { p_seller: sellerId } }),
  async customer(action: 'create' | 'get' | 'remove' | 'freeze', data: unknown, turnstileToken?: string): Promise<CustomerOrder> {
    const response = await fetch(`${appConfig.supabaseUrl}/functions/v1/food-modules-public`, {
      method: 'POST', headers: { apikey: appConfig.supabaseAnonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, data, turnstileToken }),
    });
    const result = await response.json() as CustomerOrder & { error?: string };
    if (!response.ok) throw new Error(result.error || 'Não foi possível processar a solicitação.');
    return result;
  },
};
