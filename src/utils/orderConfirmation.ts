import type { OrderConfirmation } from '../types';

const PREFIX = 'foodservice_order_confirmation_v1_';

export const saveOrderConfirmation = (confirmation: OrderConfirmation) => {
  try {
    sessionStorage.setItem(`${PREFIX}${confirmation.orderId}`, JSON.stringify(confirmation));
  } catch {
    // A navegação ainda funciona usando state do React Router.
  }
};

export const readOrderConfirmation = (orderId: string): OrderConfirmation | null => {
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${orderId}`);
    return raw ? JSON.parse(raw) as OrderConfirmation : null;
  } catch {
    return null;
  }
};

export const formatOrderNumber = (orderNumber: number) => String(orderNumber).padStart(5, '0');
