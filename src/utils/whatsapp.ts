import type { CartItem, CheckoutData, OrderConfirmation, StoreSettings } from '../types';
import { currency, sanitizeWhatsAppNumber } from './format';
import { cartItemUnitTotal } from '../contexts/CartContext';
import { formatOrderNumber } from './orderConfirmation';

export const buildWhatsAppMessage = (
  items: CartItem[],
  checkout: CheckoutData,
  store: StoreSettings,
  orderNumber?: number,
) => {
  const lines: string[] = [
    `Olá, ${store.name}! Meu pedido foi registrado pelo site:`,
    '',
    orderNumber ? `*PEDIDO #${formatOrderNumber(orderNumber)}*` : '*PEDIDO*',
  ];

  items.forEach((item, index) => {
    lines.push('', `${index + 1}. *${item.quantity}x ${item.productName}*`);
    const groupIds = [...new Set(item.options.map((option) => option.groupId))];
    groupIds.forEach((groupId) => {
      const selected = item.options.filter((option) => option.groupId === groupId);
      if (!selected.length) return;
      lines.push(`   ${selected[0].groupName}: ${selected.map((option) => option.itemName).join(', ')}`);
    });
    lines.push(`   ${currency.format(cartItemUnitTotal(item) * item.quantity)}`);
  });

  const productsTotal = items.reduce((sum, item) => sum + cartItemUnitTotal(item) * item.quantity, 0);
  const deliveryFee = checkout.fulfillment === 'delivery' ? checkout.deliveryFee : 0;
  const total = productsTotal + deliveryFee;
  lines.push('', `Subtotal: ${currency.format(productsTotal)}`);
  if (checkout.fulfillment === 'delivery') lines.push(`Taxa de entrega (${checkout.neighborhood}): ${deliveryFee === 0 ? 'Grátis' : currency.format(deliveryFee)}`);
  lines.push(`*TOTAL: ${currency.format(total)}*`, '', '*DADOS DO PEDIDO*', `Cliente: ${checkout.customerName}`, `Telefone: ${checkout.customerPhone}`);
  lines.push(`Recebimento: ${checkout.fulfillment === 'delivery' ? 'Delivery' : 'Retirada'}`);

  if (checkout.fulfillment === 'delivery') {
    const address = [
      [checkout.street, checkout.addressNumber].filter(Boolean).join(', '),
      checkout.complement,
      [checkout.neighborhood, checkout.deliveryCity, checkout.deliveryState].filter(Boolean).join(' - '),
      checkout.zipCode ? `CEP ${checkout.zipCode}` : '',
    ].filter(Boolean).join(' | ');
    if (address) lines.push(`Endereço: ${address}`);
    if (checkout.referencePoint) lines.push(`Referência: ${checkout.referencePoint}`);
  }

  if (checkout.scheduledFor) lines.push(`Agendado para: ${new Date(checkout.scheduledFor).toLocaleString('pt-BR')}`);
  if (checkout.notes) lines.push('', '*OBSERVAÇÕES*', checkout.notes);

  lines.push('', '*PAGAMENTO*');
  if (checkout.paymentMethod === 'pix') {
    lines.push(store.pixReceiptMode === 'copy_paste' ? 'PIX Copia e Cola disponível na confirmação.' : `PIX — ${store.pixKeyType}: ${store.pixKey}`);
  } else if (checkout.paymentMethod === 'card') {
    lines.push(checkout.fulfillment === 'delivery' ? 'Cartão na entrega.' : 'Cartão na retirada.');
  } else if (checkout.paymentMethod === 'cash') {
    lines.push('Dinheiro.');
    if (checkout.needsChange && checkout.changeFor) lines.push(`Troco para: ${currency.format(checkout.changeFor)}`);
  } else {
    lines.push('Pagamento a confirmar com a loja.');
  }

  lines.push('', 'O pedido já está salvo no sistema. Esta mensagem serve apenas para facilitar o contato.');
  return lines.join('\n');
};

export const buildPostOrderWhatsAppMessage = (confirmation: OrderConfirmation) => {
  if (confirmation.paymentMethod === 'pix') {
    return [confirmation.orderMessage, '', '*PAGAMENTO PIX*', `Pedido #${formatOrderNumber(confirmation.orderNumber)} · ${currency.format(confirmation.total)}`, 'Se necessário, enviarei o comprovante nesta conversa.'].join('\n');
  }
  if (confirmation.paymentMethod === 'card') {
    return [confirmation.orderMessage, '', '*PAGAMENTO POR CARTÃO*', `Pedido #${formatOrderNumber(confirmation.orderNumber)} · ${currency.format(confirmation.total)}`, 'Pagamento por cartão na entrega/retirada.'].join('\n');
  }
  if (confirmation.paymentMethod === 'cash') {
    return [confirmation.orderMessage, '', '*PAGAMENTO EM DINHEIRO*', `Pedido #${formatOrderNumber(confirmation.orderNumber)} · ${currency.format(confirmation.total)}`, confirmation.changeAmount != null ? `Troco calculado: ${currency.format(confirmation.changeAmount)}` : 'Pagamento em dinheiro.'].join('\n');
  }
  return confirmation.orderMessage;
};

export const getWhatsAppUrl = (number: string, message: string) =>
  `https://wa.me/${sanitizeWhatsAppNumber(number)}?text=${encodeURIComponent(message)}`;

export const openWhatsApp = (number: string, message: string) =>
  window.open(getWhatsAppUrl(number, message), '_blank', 'noopener,noreferrer');
