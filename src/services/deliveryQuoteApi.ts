import { invokePublicFunction } from '../lib/supabaseRest';

export type DeliveryCoordinates = { lat: number; lng: number };
export type NinetyNineQuoteInput = {
  storeId: string;
  origin: DeliveryCoordinates;
  destination: DeliveryCoordinates;
  category?: string;
};
export type NinetyNineQuote = {
  provider: '99';
  available: boolean;
  estimated_fee: number;
  currency: 'BRL';
  expires_in_seconds: number;
};

/**
 * A cotação passa pela Edge Function para que a chave da 99 nunca chegue ao
 * navegador. A vitrine pode tratar 503/502 como fallback para a taxa da zona.
 */
export const requestNinetyNineQuote = (input: NinetyNineQuoteInput) => invokePublicFunction<NinetyNineQuote>('food-delivery-quote-99', {
  store_id: input.storeId,
  origin: input.origin,
  destination: input.destination,
  category: input.category || 'delivery-moto99',
});
