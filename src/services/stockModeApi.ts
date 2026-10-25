import { restFetch } from '../lib/supabaseRest';

export const stockModeEvent = 'vendeweb:stock-mode-updated';
export const stockModeApi = {
  read: (storeId:string) => restFetch<{multi_location_enabled:boolean}>('rpc/food_stock_mode_v1',{method:'POST',body:{p_store_id:storeId,p_enabled:null}}),
  async set(storeId:string,enabled:boolean) {
    const mode=await restFetch<{multi_location_enabled:boolean}>('rpc/food_stock_mode_v1',{method:'POST',body:{p_store_id:storeId,p_enabled:enabled}});
    window.dispatchEvent(new Event(stockModeEvent));
    return mode;
  },
};
