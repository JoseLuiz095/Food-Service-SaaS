import type { CartItem, Order, OrderStatus } from '../types';
import { formatOrderNumber } from './orderConfirmation';

export type RecentOrderSnapshot = {
  items: CartItem[];
  customerName: string;
  customerPhone: string;
  createdAt: string;
};

const recentOrderKey = (storeId: string) => `foodweb_recent_order_v1:${storeId}`;

export function saveRecentOrder(storeId: string, items: CartItem[], customerName: string, customerPhone: string) {
  if (!storeId || !items.length) return;
  const snapshot: RecentOrderSnapshot = {
    items,
    customerName,
    customerPhone,
    createdAt: new Date().toISOString(),
  };
  try { localStorage.setItem(recentOrderKey(storeId), JSON.stringify(snapshot)); } catch { /* armazenamento indisponível */ }
}

export function loadRecentOrder(storeId: string): RecentOrderSnapshot | null {
  if (!storeId) return null;
  try {
    const raw = localStorage.getItem(recentOrderKey(storeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RecentOrderSnapshot;
    if (!Array.isArray(parsed.items) || !parsed.items.length) return null;
    return parsed;
  } catch { return null; }
}

export function normalizeWhatsappPhone(phone?: string) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function openCustomerWhatsapp(phone: string | undefined, message: string) {
  const normalized = normalizeWhatsappPhone(phone);
  if (!normalized) return false;
  window.open(`https://wa.me/${normalized}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  return true;
}

const statusMessage: Partial<Record<OrderStatus, string>> = {
  received: 'recebemos seu pedido e ele entrou na nossa fila.',
  confirmed: 'seu pedido foi confirmado e já está na nossa operação.',
  preparing: 'seu pedido está em preparação.',
  ready: 'seu pedido está pronto.',
  out_for_delivery: 'seu pedido saiu para entrega.',
  delivered: 'seu pedido foi entregue. Obrigado pela preferência!',
  picked_up: 'seu pedido foi retirado. Obrigado pela preferência!',
  cancelled: 'seu pedido foi cancelado. Se precisar, fale com a gente por aqui.',
};

export function buildOrderStatusMessage(storeName: string, order: Order) {
  const number = order.orderNumber ? `#${formatOrderNumber(order.orderNumber)}` : `#${order.id.slice(0, 8)}`;
  const sentence = statusMessage[order.status] || 'temos uma atualização sobre seu pedido.';
  return `Olá, ${order.customerName}! 👋\n\nAtualização do pedido ${number} na ${storeName}: ${sentence}\n\nSe precisar falar com a loja, responda esta mensagem.`;
}

export function buildSalesRecoveryMessage(storeName: string, order: Order) {
  const number = order.orderNumber ? `#${formatOrderNumber(order.orderNumber)}` : `#${order.id.slice(0, 8)}`;
  return `Olá, ${order.customerName}! 👋\n\nVimos que o pedido ${number} na ${storeName} foi registrado, mas a conversa no WhatsApp não foi concluída.\n\nSe ainda quiser finalizar o pedido, responda esta mensagem e seguimos por aqui.`;
}

export function buildComeBackMessage(storeName: string, customerName: string) {
  return `Olá, ${customerName}! 👋\n\nPassando para lembrar que a ${storeName} continua por aqui quando bater aquela vontade de pedir novamente. 😊\n\nSe quiser, responda esta mensagem e ajudamos com seu próximo pedido.`;
}
