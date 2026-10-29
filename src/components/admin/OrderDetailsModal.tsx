import { restFetch } from '../../lib/supabaseRest';
import { CreditCard, MapPin, Pencil, Save, Store, Truck, X, Minus, Plus, Trash2, Ban } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useModalAccessibility } from '../useModalAccessibility';
import type { Order, OrderDetailsUpdate, StoreSettings } from '../../types';
import './order-details-mobile.css';
import { currency, formatDateTimeBR } from '../../utils/format';
import { formatOrderNumber } from '../../utils/orderConfirmation';

type OrderDetailsModalProps = {
  order: Order;
  settings: StoreSettings;
  onClose: () => void;
  onSave: (input: OrderDetailsUpdate) => Promise<void>;
  onCancelOrder?: (orderId: string) => Promise<boolean>;
  saving: boolean;
};

const toLocalDateTimeInput = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export function OrderDetailsModal({ order, settings, onClose, onSave, onCancelOrder, saving }: OrderDetailsModalProps) {
  const [editing, setEditing] = useState(false);
  const [points,setPoints]=useState<Array<{id:string;name:string;stock_location_id:string}>>([]);
  const [pointsError,setPointsError]=useState('');
  useEffect(()=>{let active=true;void restFetch<Array<{id:string;name:string;stock_location_id:string}>>(`food_pickup_locations?store_id=eq.${encodeURIComponent(order.storeId)}&active=eq.true&select=id,name,stock_location_id`).then(rows=>{if(active)setPoints(rows.filter(p=>p.stock_location_id));}).catch(()=>{if(active)setPointsError('Não foi possível carregar os pontos. Tente reabrir o detalhe.');});return()=>{active=false};},[order.storeId]);
  const [cancelling, setCancelling] = useState(false);
  const dialogRef=useRef<HTMLElement>(null);
  useModalAccessibility(true,dialogRef,onClose,!saving&&!cancelling);
  const [draftItems, setDraftItems] = useState(() => order.items || []);
  const [draft, setDraft] = useState<OrderDetailsUpdate>({
    pickupLocationId: order.pickupLocationId,
    expectedPickupLocationId: order.pickupLocationId,
    customerName: order.customerName,
    customerPhone: order.customerPhone || '',
    scheduledFor: toLocalDateTimeInput(order.scheduledFor),
    notes: order.notes || '',
  });
  // O detalhe precisa continuar editável mesmo depois do recebimento ou do
  // encerramento: o histórico também pode receber correções operacionais
  // (telefone, observação ou agendamento) sem reabrir o pedido.
  const canEdit = true;
  const canEditItems = order.paymentStatus !== 'paid' && order.status !== 'cancelled' && Boolean(order.items?.length);
  const address = [
    order.deliveryStreet && `${order.deliveryStreet}${order.deliveryNumber ? `, ${order.deliveryNumber}` : ''}`,
    order.deliveryComplement,
    order.deliveryNeighborhood,
    order.deliveryCity && order.deliveryState ? `${order.deliveryCity}/${order.deliveryState}` : order.deliveryCity || order.deliveryState,
    order.deliveryZipCode && `CEP ${order.deliveryZipCode}`,
  ].filter(Boolean).join(' · ');

  useEffect(() => {
    if (editing) return;
    setDraftItems(order.items || []);
    setDraft({
      pickupLocationId: order.pickupLocationId,
    expectedPickupLocationId: order.pickupLocationId,
    customerName: order.customerName,
      customerPhone: order.customerPhone || '',
      scheduledFor: toLocalDateTimeInput(order.scheduledFor),
      notes: order.notes || '',
    });
  }, [order, editing]);

  const submit = async () => {
    try {
      await onSave({
        pickupLocationId: draft.pickupLocationId && draft.pickupLocationId !== draft.expectedPickupLocationId ? draft.pickupLocationId : undefined,
        expectedPickupLocationId: draft.expectedPickupLocationId,
        customerName: draft.customerName.trim(),
        customerPhone: draft.customerPhone?.trim() || undefined,
        scheduledFor: draft.scheduledFor || undefined,
        notes: draft.notes?.trim() || undefined,
        items: canEditItems ? draftItems.map((item) => ({ itemId: item.id, quantity: item.quantity })) : undefined,
      });
      setEditing(false);
    } catch {
      // O painel exibe o erro por toast e mantém o formulário aberto para correção.
    }
  };

  const changeItemQuantity = (itemId: string, quantity: number) => setDraftItems((current) => current.map((item) => item.id === itemId ? { ...item, quantity: Math.max(1, Math.min(99, quantity)) } : item));
  const removeItem = (itemId: string) => setDraftItems((current) => current.filter((item) => item.id !== itemId));
  const cancelOrder = async () => {
    if (!onCancelOrder || cancelling) return;
    if (!window.confirm(`Cancelar o pedido #${formatOrderNumber(order.orderNumber)}? O estoque reservado será liberado e esta ação ficará registrada no histórico.`)) return;
    setCancelling(true);
    try {
      if (await onCancelOrder(order.id)) onClose();
    } finally {
      setCancelling(false);
    }
  };

  return <div className="modal-overlay order-details-modal-overlay" role="presentation">
    <section ref={dialogRef} tabIndex={-1} className="master-modal master-modal--wide order-details-modal" role="dialog" aria-modal="true" aria-labelledby="order-details-title">
      <button type="button" className="modal-close" aria-label="Fechar detalhes do pedido" onClick={onClose} disabled={saving || cancelling}><X /></button>
      <div className="order-details-modal__header">
        <div>
          <span className="eyebrow">CONFERÊNCIA DO PEDIDO</span>
          <h2 id="order-details-title">Pedido #{formatOrderNumber(order.orderNumber)}</h2>
          <p>{order.customerName} · criado em {formatDateTimeBR(order.createdAt)}</p>
        </div>
        <span className={`order-details-modal__payment-status ${order.paymentStatus === 'paid' ? 'is-paid' : ''}`}>{order.paymentStatus === 'paid' ? order.paymentReportedByCustomer?'Pago informado pelo cliente':'Recebido' : 'A receber'}</span>
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
        <div className="order-details-modal__fact"><span>{order.deliveryType === 'delivery' ? <MapPin size={16} /> : <Store size={16} />}Local / horário</span><strong>{order.scheduledFor ? formatDateTimeBR(order.scheduledFor) : 'Sem horário agendado'}</strong>{order.deliveryType === 'delivery' ? <small>{address || order.deliveryAddress || 'Endereço não informado'}{order.referencePoint ? ` · Ref.: ${order.referencePoint}` : ''}</small> : order.pickupLocationId ? <small>{points.find(point=>point.id===order.pickupLocationId)?.name || 'Ponto de retirada vinculado ao pedido'}</small> : settings.pickupInstructions ? <small>{settings.pickupInstructions}</small> : null}</div>
      </section>

      {editing ? <section className="order-details-modal__section">
        <div className="order-details-modal__section-title"><Pencil size={17} /><h3>Editar dados operacionais</h3></div>
        <p className="order-details-modal__hint">Edite contato, agendamento e observações. Enquanto o pagamento estiver pendente, também é possível corrigir quantidades ou remover produtos; o sistema recalcula o total e a reserva de estoque.</p>
        {canEditItems && <div className="order-details-modal__edit-items"><strong className="order-details-modal__edit-label">Produtos do pedido</strong>{draftItems.map((item) => <article className="order-details-modal__edit-item" key={item.id}><div><strong>{item.productName}</strong>{item.variantName && <small>{item.variantName}</small>}{item.options.length > 0 && <small>{item.options.map((option) => `${option.quantity > 1 ? `${option.quantity}x ` : ''}${option.optionName}`).join(' · ')}</small>}</div><div className="order-details-modal__edit-item-actions"><div className="order-details-modal__quantity"><button type="button" onClick={() => changeItemQuantity(item.id, item.quantity - 1)} disabled={item.quantity <= 1} aria-label={`Diminuir ${item.productName}`}><Minus size={14}/></button><strong>{item.quantity}</strong><button type="button" onClick={() => changeItemQuantity(item.id, item.quantity + 1)} disabled={item.quantity >= 99} aria-label={`Aumentar ${item.productName}`}><Plus size={14}/></button></div><button type="button" className="order-details-modal__remove-item" onClick={() => removeItem(item.id)} disabled={draftItems.length <= 1} aria-label={`Remover ${item.productName}`}><Trash2 size={14}/></button></div></article>)}{draftItems.length === 0 && <p className="order-details-modal__empty">Mantenha pelo menos um produto no pedido.</p>}<small className="order-details-modal__hint">O preço é recalculado pelo servidor. Produtos com personalização obrigatória devem ser ajustados no pedido original.</small></div>}
        <div className="order-details-modal__edit-grid">
          {order.deliveryType==='pickup' && <label className="full">Ponto de retirada<select value={draft.pickupLocationId || ''} disabled={saving || ['cancelled','delivered','picked_up'].includes(order.status)} onChange={event=>setDraft(current=>({...current,pickupLocationId:event.target.value}))}><option value="">Manter local atual</option>{points.map(point=><option key={point.id} value={point.id}>{point.name}</option>)}</select><small>A reserva muda para o estoque vinculado ao ponto. A baixa física ocorre ao concluir a retirada. Saldo insuficiente impede a troca imediata.</small>{pointsError&&<small role="alert">{pointsError}</small>}</label>}
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
        {editing ? <><button type="button" className="secondary-button" onClick={() => setEditing(false)} disabled={saving}>Cancelar</button><button type="button" className="primary-button" onClick={() => void submit()} disabled={saving || !draft.customerName.trim() || (canEditItems && draftItems.length === 0)}><Save size={16} />{saving ? 'Salvando...' : 'Salvar alterações'}</button></> : <><button type="button" className="secondary-button" onClick={onClose}>Fechar</button>{order.paymentStatus !== 'paid' && order.status !== 'cancelled' && onCancelOrder && <button type="button" className="order-details-modal__cancel-button" onClick={() => void cancelOrder()} disabled={cancelling}><Ban size={16}/>{cancelling ? 'Cancelando...' : 'Cancelar pedido'}</button>}{canEdit && <button type="button" className="primary-button" onClick={() => setEditing(true)}><Pencil size={16} />Editar pedido</button>}</>}
      </div>
    </section>
  </div>;
}

function paymentLabel(order: Order) {
  return { confirm: 'Combinar com a loja', pix: 'PIX', card: 'Cartão', cash: 'Dinheiro' }[order.paymentMethod];
}
