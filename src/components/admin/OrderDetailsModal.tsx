import { restFetch } from '../../lib/supabaseRest';
import { CreditCard, MapPin, Pencil, Save, Store, Truck, X, Minus, Plus, Trash2, Ban, History } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useModalAccessibility } from '../useModalAccessibility';
import type { Order, OrderDetailsUpdate, OrderItem, Product, StoreSettings } from '../../types';
import './order-details-mobile.css';
import { currency, formatDateTimeBR } from '../../utils/format';
import { formatOrderNumber } from '../../utils/orderConfirmation';

type OrderDetailsModalProps = {
  order: Order;
  products: Product[];
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

type DraftItem = OrderItem & { replacementProductId?: string };

export function OrderDetailsModal({ order, products, settings, onClose, onSave, onCancelOrder, saving }: OrderDetailsModalProps) {
  const [editing, setEditing] = useState(false);
  const [points,setPoints]=useState<Array<{id:string;name:string;stock_location_id:string}>>([]);
  const [pointsError,setPointsError]=useState('');
  const [auditOpen,setAuditOpen]=useState(false);
  const [auditLoading,setAuditLoading]=useState(false);
  const [auditError,setAuditError]=useState('');
  const [audit,setAudit]=useState<{items:Array<{product_id:string;product_name:string;quantity:number;inventory_reserved_quantity:number}>;movements:Array<{product_id:string;location_id:string;event_type:string;quantity:number;created_at:string}>;locations:Array<{id:string;name:string}>}|null>(null);
  useEffect(()=>{
    if(!auditOpen)return;
    let active=true;setAuditLoading(true);setAuditError('');
    void Promise.all([
      restFetch<Array<{product_id:string;product_name:string;quantity:number;inventory_reserved_quantity:number}>>(`food_order_items?order_id=eq.${encodeURIComponent(order.id)}&select=product_id,product_name,quantity,inventory_reserved_quantity`),
      restFetch<Array<{product_id:string;location_id:string;event_type:string;quantity:number;created_at:string}>>(`food_order_stock_movements?store_id=eq.${encodeURIComponent(order.storeId)}&order_id=eq.${encodeURIComponent(order.id)}&select=product_id,location_id,event_type,quantity,created_at&order=created_at.desc`),
      restFetch<Array<{id:string;name:string}>>(`food_stock_locations?store_id=eq.${encodeURIComponent(order.storeId)}&select=id,name`),
    ]).then(([items,movements,locations])=>{if(active)setAudit({items,movements,locations});})
      .catch(()=>{if(active)setAuditError('Não foi possível carregar as movimentações.');})
      .finally(()=>{if(active)setAuditLoading(false);});
    return()=>{active=false};
  },[auditOpen,order.id,order.storeId,order.inventoryStatus]);
  useEffect(()=>{let active=true;void restFetch<Array<{id:string;name:string;stock_location_id:string}>>(`food_pickup_locations?store_id=eq.${encodeURIComponent(order.storeId)}&active=eq.true&select=id,name,stock_location_id`).then(rows=>{if(active)setPoints(rows.filter(p=>p.stock_location_id));}).catch(()=>{if(active)setPointsError('Não foi possível carregar os pontos. Tente reabrir o detalhe.');});return()=>{active=false};},[order.storeId]);
  const [cancelling, setCancelling] = useState(false);
  const dialogRef=useRef<HTMLElement>(null);
  useModalAccessibility(true,dialogRef,onClose,!saving&&!cancelling);
  const [draftItems, setDraftItems] = useState<DraftItem[]>(() => order.items || []);
  const [locationStock,setLocationStock]=useState<Record<string,number>>({});
  useEffect(()=>{
    if(!editing || !order.stockLocationId)return;
    let active=true;
    void restFetch<Array<{product_id:string;stock_quantity:number;stock_reserved_quantity:number}>>(
      `food_product_location_stock?store_id=eq.${encodeURIComponent(order.storeId)}&location_id=eq.${encodeURIComponent(order.stockLocationId)}&select=product_id,stock_quantity,stock_reserved_quantity`
    ).then(rows=>{if(active)setLocationStock(Object.fromEntries(rows.map(row=>[row.product_id,Math.max(0,row.stock_quantity-row.stock_reserved_quantity)])));})
      .catch(()=>{if(active)setLocationStock({});});
    return()=>{active=false};
  },[editing,order.storeId,order.stockLocationId]);
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
  const canEditItems = order.paymentStatus !== 'paid' && order.inventoryStatus !== 'committed' && order.status !== 'cancelled' && Boolean(order.items?.length);
  const replacementProducts = products.filter(product => product.storeId===order.storeId && product.active && product.availabilityStatus==='available' && product.stockStatus!=='unavailable' && !product.optionGroups.some(group=>group.active && group.minChoices>0));
  const itemsChanged = canEditItems && (draftItems.length !== order.items?.length || draftItems.some(item=>{
    const original=order.items?.find(current=>current.id===item.id);
    return !original || item.quantity!==original.quantity || Boolean(item.replacementProductId);
  }));
  const draftSubtotal=draftItems.reduce((sum,item)=>sum+item.itemTotal,0);
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
        items: itemsChanged ? draftItems.map((item) => item.replacementProductId
          ? {productId:item.replacementProductId,quantity:item.quantity}
          : {itemId:item.id,quantity:item.quantity}) : undefined,
      });
      setEditing(false);
    } catch {
      // O painel exibe o erro por toast e mantém o formulário aberto para correção.
    }
  };

  const changeItemQuantity = (itemId: string, quantity: number) => setDraftItems((current) => current.map((item) => {
    if(item.id!==itemId)return item;
    const next=Math.max(1,Math.min(99,quantity));
    return {...item,quantity:next,itemTotal:Math.round((item.itemTotal/item.quantity)*next*100)/100};
  }));
  const replaceItem = (itemId:string, productId:string) => setDraftItems(current=>current.map(item=>{
    if(item.id!==itemId)return item;
    const original=order.items?.find(row=>row.id===itemId);
    if(!original)return item;
    if(productId===original.productId)return {...original,quantity:item.quantity,itemTotal:Math.round((original.itemTotal/original.quantity)*item.quantity*100)/100};
    const replacement=replacementProducts.find(product=>product.id===productId);
    if(!replacement)return item;
    const unitPrice=replacement.promotionalPrice??replacement.price;
    return {...item,replacementProductId:productId,productId,productName:replacement.name,unitPrice,
      variantName:undefined,variantPriceDelta:0,options:[],itemTotal:Math.round(unitPrice*item.quantity*100)/100};
  }));
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

      <section className="order-details-modal__section order-stock-audit">
        <button type="button" className="order-stock-audit__toggle" aria-expanded={auditOpen} onClick={()=>setAuditOpen(value=>!value)}><History size={17}/> Estoque deste pedido <span>{auditOpen?'Ocultar':'Ver movimentos'}</span></button>
        {auditOpen&&<div className="order-stock-audit__body">
          <p>Local de saída: <strong>{audit?.locations.find(location=>location.id===order.stockLocationId)?.name||'Estoque principal da loja'}</strong>. A baixa ocorre ao concluir a entrega ou retirada.</p>
          {auditLoading?<p>Consultando movimentações…</p>:auditError?<p role="alert">{auditError} <button type="button" onClick={()=>{setAuditOpen(false);setTimeout(()=>setAuditOpen(true),0);}}>Tentar novamente</button></p>:<>
            {audit?.items.map((item,index)=><p key={index}><strong>{item.product_name}</strong> · {item.quantity} pedido(s) · {item.inventory_reserved_quantity} reservado(s)</p>)}
            {audit?.movements.length?<ul>{audit.movements.map((movement,index)=><li key={index}><strong>{movement.event_type==='sale'?'Saída':movement.event_type==='return'?'Devolução':movement.event_type}</strong> {movement.event_type==='sale'?'-':'+'}{movement.quantity} {audit.items.find(item=>item.product_id===movement.product_id)?.product_name||'produto'} · {audit.locations.find(location=>location.id===movement.location_id)?.name||'Local não encontrado'} · {formatDateTimeBR(movement.created_at)}</li>)}</ul>:<small>Sem saída física registrada. Reservas são exibidas pelo saldo atual dos itens; alterações anteriores de reserva não possuem histórico individual.</small>}
          </>}
        </div>}
      </section>

      {editing ? <section className="order-details-modal__section">
        <div className="order-details-modal__section-title"><Pencil size={17} /><h3>Editar dados operacionais</h3></div>
        <p className="order-details-modal__hint">Enquanto o pedido não foi recebido nem teve baixa física, troque o sabor ou ajuste quantidades aqui. A reserva antiga é liberada e o novo produto é reservado no local do pedido ao salvar.</p>
        {canEditItems && <div className="order-details-modal__edit-items"><strong className="order-details-modal__edit-label">Produtos do pedido</strong>{draftItems.map((item) => <article className="order-details-modal__edit-item" key={item.id}><div><strong>{item.productName}</strong>{item.replacementProductId && <small>Substitui {order.items?.find(original=>original.id===item.id)?.productName}</small>}{item.variantName && <small>{item.variantName}</small>}{item.options.length > 0 && <small>{item.options.map((option) => `${option.quantity > 1 ? `${option.quantity}x ` : ''}${option.optionName}`).join(' · ')}</small>}<label className="order-details-modal__replace">Trocar por outro produto<select aria-label={`Trocar ${order.items?.find(original=>original.id===item.id)?.productName||item.productName}`} value={item.replacementProductId||order.items?.find(original=>original.id===item.id)?.productId||''} onChange={event=>replaceItem(item.id,event.target.value)}><option value={order.items?.find(original=>original.id===item.id)?.productId||''}>Manter produto atual</option>{replacementProducts.filter(product=>product.id!==order.items?.find(original=>original.id===item.id)?.productId).map(product=><option key={product.id} value={product.id}>{product.name} · {currency.format(product.promotionalPrice??product.price)}{product.trackStock&&order.stockLocationId&&locationStock[product.id]!==undefined?` · ${locationStock[product.id]} disponível no local`:''}</option>)}</select></label></div><div className="order-details-modal__edit-item-actions"><div className="order-details-modal__quantity"><button type="button" onClick={() => changeItemQuantity(item.id, item.quantity - 1)} disabled={item.quantity <= 1} aria-label={`Diminuir ${item.productName}`}><Minus size={14}/></button><strong>{item.quantity}</strong><button type="button" onClick={() => changeItemQuantity(item.id, item.quantity + 1)} disabled={item.quantity >= 99} aria-label={`Aumentar ${item.productName}`}><Plus size={14}/></button></div><button type="button" className="order-details-modal__remove-item" onClick={() => removeItem(item.id)} disabled={draftItems.length <= 1} aria-label={`Remover ${item.productName}`}><Trash2 size={14}/></button></div></article>)}{draftItems.length === 0 && <p className="order-details-modal__empty">Mantenha pelo menos um produto no pedido.</p>}{itemsChanged&&<p className="order-details-modal__preview">Novo total estimado: <strong>{currency.format(draftSubtotal+(order.deliveryFee||0))}</strong>. Confira com o cliente antes de salvar.</p>}<small className="order-details-modal__hint">O servidor confirma preço e saldo do local. Produtos com escolhas obrigatórias não aparecem para troca.</small></div>}
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
