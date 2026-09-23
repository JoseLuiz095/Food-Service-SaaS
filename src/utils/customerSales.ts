import type { CartItem, CustomerMessageTemplates, Order, OrderStatus } from '../types';
import { formatOrderNumber } from './orderConfirmation';

export type RecentOrderSnapshot = {
  items: CartItem[];
  customerName: string;
  customerPhone: string;
  createdAt: string;
};

const recentOrderKey = (storeId: string) => `foodweb_recent_order_v1:${storeId}`;

export const DEFAULT_CUSTOMER_MESSAGE_TEMPLATES: CustomerMessageTemplates = {
  received: 'Olá, {cliente}! Recebemos seu pedido {pedido} na {loja}. Total: {total}. Previsão: {previsao}.',
  confirmed: 'Olá, {cliente}! Seu pedido {pedido} foi confirmado pela {loja} e já entrou na operação. Previsão: {previsao}.',
  preparing: 'Olá, {cliente}! Seu pedido {pedido} já está em preparação na {loja}. Previsão: {previsao}.',
  ready: 'Olá, {cliente}! Seu pedido {pedido} está pronto. {previsao}',
  outForDelivery: 'Olá, {cliente}! Seu pedido {pedido} saiu para entrega. Se precisar, responda esta mensagem.',
  delivered: 'Olá, {cliente}! O pedido {pedido} foi entregue. Obrigado por comprar com a {loja}!',
  pickedUp: 'Olá, {cliente}! O pedido {pedido} foi retirado. Obrigado por comprar com a {loja}!',
  cancelled: 'Olá, {cliente}. O pedido {pedido} foi cancelado. Se precisar de ajuda, responda esta mensagem.',
  salesRecovery: 'Olá, {cliente}! Vimos que o pedido {pedido} na {loja}, no total de {total}, foi registrado mas o atendimento não foi concluído. Se ainda quiser finalizar, responda esta mensagem.',
  comeBack: 'Olá, {cliente}! Já faz um tempo desde seu último pedido na {loja}. Quando quiser pedir novamente, responda esta mensagem e ajudamos por aqui.',
};

export function normalizeCustomerMessageTemplates(value: unknown): CustomerMessageTemplates {
  const raw = value && typeof value === 'object' ? value as Partial<CustomerMessageTemplates> : {};
  return { ...DEFAULT_CUSTOMER_MESSAGE_TEMPLATES, ...Object.fromEntries(Object.entries(raw).filter(([,v]) => typeof v === 'string' && v.trim())) } as CustomerMessageTemplates;
}

export function saveRecentOrder(storeId: string, items: CartItem[], customerName: string, customerPhone: string) {
  if (!storeId || !items.length) return;
  const snapshot: RecentOrderSnapshot = { items, customerName, customerPhone, createdAt: new Date().toISOString() };
  try { localStorage.setItem(recentOrderKey(storeId), JSON.stringify(snapshot)); } catch { /* armazenamento indisponível */ }
}

export function loadRecentOrder(storeId: string, maxAgeDays = 180): RecentOrderSnapshot | null {
  if (!storeId) return null;
  try {
    const raw = localStorage.getItem(recentOrderKey(storeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RecentOrderSnapshot;
    if (!Array.isArray(parsed.items) || !parsed.items.length) return null;
    const age = Date.now() - new Date(parsed.createdAt).getTime();
    if (!Number.isFinite(age) || age > Math.max(1, maxAgeDays) * 86_400_000) return null;
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

const templateKeyByStatus: Record<OrderStatus, keyof CustomerMessageTemplates> = {
  received: 'received', confirmed: 'confirmed', preparing: 'preparing', ready: 'ready', out_for_delivery: 'outForDelivery', delivered: 'delivered', picked_up: 'pickedUp', cancelled: 'cancelled',
};

function renderTemplate(template: string, variables: Record<string,string>) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => variables[key] ?? match);
}

function orderVariables(storeName: string, order: Order) {
  const number = order.orderNumber ? `#${formatOrderNumber(order.orderNumber)}` : `#${order.id.slice(0, 8)}`;
  const previsao = order.preparationEstimateMinutes ? `até ${order.preparationEstimateMinutes} min` : (order.scheduledFor ? new Date(order.scheduledFor).toLocaleString('pt-BR') : 'a confirmar');
  return { cliente: order.customerName, pedido: number, loja: storeName, total: order.total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}), previsao, status: order.status };
}

export function buildOrderStatusMessage(storeName: string, order: Order, templates?: CustomerMessageTemplates) {
  const resolved=templates??DEFAULT_CUSTOMER_MESSAGE_TEMPLATES; return renderTemplate(resolved[templateKeyByStatus[order.status]], orderVariables(storeName, order));
}

export function buildSalesRecoveryMessage(storeName: string, order: Order, templates?: CustomerMessageTemplates) {
  return renderTemplate((templates??DEFAULT_CUSTOMER_MESSAGE_TEMPLATES).salesRecovery, orderVariables(storeName, order));
}

export function buildComeBackMessage(storeName: string, customerName: string, templates?: CustomerMessageTemplates) {
  return renderTemplate((templates??DEFAULT_CUSTOMER_MESSAGE_TEMPLATES).comeBack, { cliente: customerName, pedido: '', loja: storeName, total: '', previsao: '', status: '' });
}
