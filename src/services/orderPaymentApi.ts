import { getSupabaseClient } from '../lib/supabase';
import { platformOrigin } from '../lib/brand';
export const paymentLinksEnabled = import.meta.env.VITE_PIX_PAYMENT_LINK_ENABLED === 'true';
export type OrderPayment = { status: 'pending' | 'paid' | 'cancelled'; storeName: string; orderNumber: number; total?: number; receiver?: string; pixPayload?: string; expiresAt?: string };
async function invoke(body: object) {
  const { data, error } = await getSupabaseClient().functions.invoke('food-order-payment', { body, timeout: 15000 });
  if (error) {
    let message = 'Não foi possível consultar o pagamento. Confira sua conexão e tente novamente.';
    try { const detail = await error.context?.json(); if (typeof detail?.error === 'string') message = detail.error; } catch { /* No server response. */ }
    throw new Error(message);
  }
  return data;
}
export async function createOrderPaymentLink(storeId: string, orderId: string) {
  const data = await invoke({ action: 'issue', storeId, orderId });
  if (!/^[\w-]+\.[\w-]+$/.test(data?.token || '') || data.token.length > 2048) throw new Error('O servidor não retornou um link válido.');
  // The encrypted capability stays in the fragment: never in HTTP paths, query strings or previews.
  return new URL(`/pagamento/pix#${data.token}`, platformOrigin()).href;
}
export async function resolveOrderPayment(token: string): Promise<OrderPayment> {
  const data = await invoke({ action: 'resolve', token });
  if (!['pending', 'paid', 'cancelled'].includes(data?.status) || typeof data.storeName !== 'string' || !Number.isSafeInteger(data.orderNumber)) throw new Error('Resposta de pagamento inválida.');
  if (data.status === 'pending' && (typeof data.pixPayload !== 'string' || !data.pixPayload.startsWith('000201') || !(data.total > 0) || !Number.isFinite(Date.parse(data.expiresAt)))) throw new Error('Dados do Pix indisponíveis. Fale com a loja.');
  return data;
}
