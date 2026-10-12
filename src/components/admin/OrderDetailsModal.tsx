import { CreditCard, MapPin, Pencil, Save, Store, Truck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Order, OrderDetailsUpdate, StoreSettings } from '../../types';
import { currency, formatDateTimeBR } from '../../utils/format';
import { formatOrderNumber } from '../../utils/orderConfirmation';

type OrderDetailsModalProps = {
  order: Order;
  settings: StoreSettings;
  onClose: () => void;
  onSave: (input: OrderDetailsUpdate) => Promise<void>;
  saving: boolean;
};

const toLocalDateTimeInput = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export function OrderDetailsModal({ order, settings, onClose, onSave, saving }: OrderDetailsModalProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<OrderDetailsUpdate>({
    customerName: order.customerName,
    customerPhone: order.customerPhone || '',
    scheduledFor: toLocalDateTimeInput(order.scheduledFor),
    notes: order.notes || '',
  });
  const canEdit = order.paymentStatus !== 'paid' && order.status !== 'cancelled';
  const address = [
    order.deliveryStreet && `${order.deliveryStreet}${order.deliveryNumber ? `, ${order.deliveryNumber}` : ''}`,
    order.deliveryComplement,
    order.deliveryNeighborhood,
    order.deliveryCity && order.deliveryState ? `${order.deliveryCity}/${order.deliveryState}` : order.deliveryCity || order.deliveryState,
    order.deliveryZipCode && `CEP ${order.deliveryZipCode}`,
  ].filter(Boolean).join(' · ');

  useEffect(() => {
    setEditing(false);
    setDraft({
      customerName: order.customerName,
      customerPhone: order.customerPhone || '',
      scheduledFor: toLocalDateTimeInput(order.scheduledFor),
      notes: order.notes || '',
    });
  }, [order]);

  const submit = async () => {
    await onSave({
      customerName: draft.customerName.trim(),
      customerPhone: draft.customerPhone?.trim() || undefined,
      scheduledFor: draft.scheduledFor || undefined,
      notes: draft.notes?.trim() || undefined,
    });
    setEditing(false);
  };

  return <div className="modal-overlay order-details-modal-overlay" role="presentation">
    <section className="master-modal master-modal--wide order-details-modal" role="dialog" aria-modal="true" aria-labelledby="order-details-title">
      <button type="button" className="modal-close" aria-label="Fechar detalhes do pedido" onClick={onClose} disabled={saving}><X /></button>
      <div className="order-details-modal__header">
        <div>
          <span className="eyebrow">CONFERÊNCIA DO PEDIDO</span>
          <h2 id="order-details-title">Pedido #{formatOrderNumber(order.orderNumber)}</h2>
          <p>{order.customerName} · criado em {formatDateTimeBR(order.createdAt)}</p>
        </div>
        <span className={`order-details-modal__payment-status ${order.paymentStatus === 'paid' ? 'is-paid' : ''}`}>{order.paymentStatus === 'paid' ? 'Recebido' : 'A receber'}</span>
      </div>

      <section className="order-details-modal__section">
        <div className="order-details-modal__section-title"><Store size={17} /><h3>Produtos solicitados</h3></div>
        {order.items?.length ? <div className="order-details-modal__items">{order.items.map((item) => <article className="order-details-modal__item" key={item.id}>
          <div><strong>{item.quantity}x {item.productName}</strong>{item.variantName && <small>{item.variantName}</small>}{item.options.length > 0 && <ul>{item.options.map((option) => <li key={option.id}>{option.quantity > 1 ? `${option.quantity}x ` : ''}{option.groupName}: {option.optionName}{option.priceDelta ? ` · ${option.priceDelta > 0 ? '+' : ''}${currency.format(option.priceDelta)}` : ''}</li>)}</ul>}</div>
          <strong>{currency.format(item.itemTotal)}</strong>
        </article>)}</div> : <p className="order-details-modal__empty">Este pedido não possui itens detalhados disponíveis.</p>}
        <div className="order-details-modal__summary"><span>Subtotal<strong>{currency.format(order.subtotal)}</strong></span>{order.deliveryFee ? <span>Entrega<strong>{currency.format(order.deliveryFee)}</strong></span> : null}<span className="is-total">Total<strong>{currency.format(order.total)}</strong></span></div>
      </section>

      <section className="order-details-modal__section order-details-modal__facts">
        <div className="order-details-modal__fact"><span><CreditCard size={16} />Pagamento</span><strong>{paymentLabel(order)}</strong></div>
        <div className="order-details-modal__fact"><span>{order.deliveryType === 'delivery' ? <Truck size={16} /> : <Store size={16} />}Forma de recebimento</span><strong>{order.deliveryType === 'delivery' ? 'Delivery' : 'Retirada'}{order.deliveryZoneName ? ` · ${order.deliveryZoneName}` : ''}</strong></div>
        <div className="order-details-modal__fact"><span>{order.deliveryType === 'delivery' ? <MapPin size={16} /> : <Store size={16} />}Local / horário</span><strong>{order.scheduledFor ? formatDateTimeBR(order.scheduledFor) : 'Sem horário agendado'}</strong>{order.deliveryType === 'delivery' ? <small>{address || order.deliveryAddress || 'Endereço não informado'}{order.referencePoint ? ` · Ref.: ${order.referencePoint}` : ''}</small> : settings.pickupInstructions ? <small>{settings.pickupInstructions}</small> : null}</div>
      </section>

      {editing ? <section className="order-details-modal__section">
        <div className="order-details-modal__section-title"><Pencil size={17} /><h3>Editar dados operacionais</h3></div>
        <p className="order-details-modal__hint">Produtos, estoque, taxa de entrega e valor permanecem protegidos. Edite somente o que precisa ser confirmado com o cliente.</p>
        <div className="order-details-modal__edit-grid">
          <label>Cliente<input required value={draft.customerName} onChange={(event) => setDraft((current) => ({ ...current, customerName: event.target.value }))} /></label>
          <label>Telefone<input value={draft.customerPhone || ''} onChange={(event) => setDraft((current) => ({ ...current, customerPhone: event.target.value }))} /></label>
          <label>Agendamento<input type="datetime-local" value={draft.scheduledFor || ''} onChange={(event) => setDraft((current) => ({ ...current, scheduledFor: event.target.value }))} /></label>
          <label className="full">Observação<textarea rows={3} maxLength={500} value={draft.notes || ''} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} /></label>
        </div>
      </section> : <section className="order-details-modal__section">
        <div className="order-details-modal__section-title"><Pencil size={17} /><h3>Observações</h3></div>
        <p className="order-details-modal__notes">{order.notes || 'Nenhuma observação registrada.'}</p>
      </section>}

      <div className="master-modal-actions order-details-modal__actions">
        {editing ? <><button type="button" className="secondary-button" onClick={() => setEditing(false)} disabled={saving}>Cancelar</button><button type="button" className="primary-button" onClick={() => void submit()} disabled={saving || !draft.customerName.trim()}><Save size={16} />{saving ? 'Salvando...' : 'Salvar alterações'}</button></> : <><button type="button" className="secondary-button" onClick={onClose}>Fechar</button>{canEdit && <button type="button" className="primary-button" onClick={() => setEditing(true)}><Pencil size={16} />Editar dados</button>}</>}
      </div>
    </section>
  </div>;
}

function paymentLabel(order: Order) {
  return { confirm: 'Combinar com a loja', pix: 'PIX', card: 'Cartão', cash: 'Dinheiro' }[order.paymentMethod];
}