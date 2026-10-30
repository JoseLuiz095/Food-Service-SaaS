import { restFetch } from '../lib/supabaseRest';

export type FitnessOfferKind = 'workout' | 'assessment' | 'combo' | 'nutrition_consult' | 'nutrition_plan';
export type FitnessOffer = {
  id: string; kind: FitnessOfferKind; name: string; description: string; price_cents: number;
  workout_id: string | null; service_id: string | null; professional_user_id: string;
  professional_name: string; professional_council: string; published: boolean;
};
export type FitnessOfferOrder = {
  id: string; offer_id?: string; offer_name: string; price_cents: number;
  state: 'pending' | 'paid' | 'cancelled' | 'refunded'; created_at?: string;
  client_id?: string; student_name?: string;
};
export type FitnessOfferInput = Omit<FitnessOffer, 'id' | 'professional_name' | 'professional_council'> & { id?: string | null };

export const fitnessOffersApi = {
  list: (store: string, admin = false) => restFetch<FitnessOffer[]>('rpc/food_fitness_offers_v1', {
    method: 'POST', body: { p_store: store, p_admin: admin },
  }),
  save: (store: string, item: FitnessOfferInput) => restFetch<{ id: string; published: boolean }>('rpc/food_fitness_offer_save_v1', {
    method: 'POST', body: {
      p_store: store, p_id: item.id || null, p_kind: item.kind, p_name: item.name,
      p_description: item.description, p_price_cents: item.price_cents,
      p_workout: item.workout_id, p_service: item.service_id,
      p_professional: item.professional_user_id, p_published: item.published,
    },
  }),
  buy: (store: string, offer: string, request: string, token: string) => restFetch<FitnessOfferOrder>('rpc/food_fitness_order_v1', {
    method: 'POST', body: { p_store: store, p_offer: offer, p_request: request }, token,
  }),
  mine: (store: string, token: string) => restFetch<FitnessOfferOrder[]>('rpc/food_fitness_my_orders_v1', {
    method: 'POST', body: { p_store: store }, token,
  }),
  adminOrders: (store: string) => restFetch<FitnessOfferOrder[]>('rpc/food_fitness_admin_orders_v1', {
    method: 'POST', body: { p_store: store },
  }),
  confirm: (store: string, order: string, action: 'confirm' | 'refund') => restFetch<{ id: string; state: string }>('rpc/food_fitness_confirm_order_v1', {
    method: 'POST', body: { p_store: store, p_order: order, p_action: action },
  }),
  authorize: (store: string, professional: string, purpose: 'training' | 'nutrition', token: string) =>
    restFetch<{ active: boolean }>('rpc/food_fitness_student_authorize_professional', {
      method: 'POST', body: { p_store: store, p_professional: professional, p_purpose: purpose, p_enabled: true }, token,
    }),
};
