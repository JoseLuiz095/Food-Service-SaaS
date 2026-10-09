import type { CheckoutData } from '../types';

type Fulfillment = CheckoutData['fulfillment'];

const keyFor = (storeId: string) => `foodweb_fulfillment_preference_v1:${storeId}`;

/**
 * Guarda somente a intenção de entrega/retirada escolhida na vitrine.
 * O checkout continua validando se a modalidade está disponível na loja.
 */
export function saveFulfillmentPreference(storeId: string, fulfillment: Fulfillment) {
  if (!storeId || typeof window === 'undefined') return;
  try { localStorage.setItem(keyFor(storeId), fulfillment); } catch { /* armazenamento indisponível */ }
}

export function loadFulfillmentPreference(storeId: string): Fulfillment | null {
  if (!storeId || typeof window === 'undefined') return null;
  try {
    const value = localStorage.getItem(keyFor(storeId));
    return value === 'delivery' || value === 'pickup' ? value : null;
  } catch { return null; }
}
