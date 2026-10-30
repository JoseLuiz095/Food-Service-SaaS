import { InfoHint } from '../../components/ui/InfoHint';
import { useState } from 'react';
import { moduleMoney } from '../calculator';
import type { ModuleOrder, ModuleOrderItem, OrderPart, Receivable, Refund } from '../types';
import type { ModuleCommand } from './OffersPanel';

export default function ModuleOrdersPanel({ orders, parts, items, receivables, refunds, command, busy, master, storeId, onDetail }: {
  orders: ModuleOrder[]; parts: OrderPart[]; items: ModuleOrderItem[]; receivables: Receivable[]; refunds: Refund[];
  command: ModuleCommand; busy: boolean; master: boolean; storeId: string; onDetail: (orderId: string) => Promise<void>;
}) {
  const [references, setReferences] = useState<Record<string,string>>({});
  const [amounts, setAmounts] = useState<Record<string,string>>({});
  const [cancelling, setCancelling] = useState<string>();
  const orderIds = [...new Set([...orders.map(o => o.id), ...parts.map(p => p.order_id)])];
  return <section className="module-card"><h2>Pedidos dos módulos</h2><InfoHint label="Sobre Pedidos dos módulos">Um código para o cliente. Cada loja recebe acesso aos próprios itens e valores. O vendedor confere a cobrança única; o Master consulta a composição completa.</InfoHint>
    {orderIds.map(id => { const order = orders.find(o => o.id === id); const orderParts = parts.filter(p => p.order_id === id); const code = order?.code || orderParts[0]?.code; return <article className="module-card" key={id}>
      <h3>FW-E{code} {order ? `· ${order.status}` : ''}</h3>
      {master && <button className="button" disabled={busy} onClick={() => void onDetail(id)}>Consultar composição completa</button>}
      {order && <p>{order.customer_name} · Cobrança: {moduleMoney(order.charged_cents)} · Pago: {moduleMoney(order.paid_cents)} · Total vigente: {moduleMoney(order.total_cents)}</p>}
      {orderParts.map(p => <div className="module-row" key={p.id}><div><strong>Parte {p.store_id === storeId ? 'desta loja' : p.store_id.slice(0,8)} · {moduleMoney(p.total_cents)}</strong><p>{p.status} · Urgência: {p.urgency}</p>
        {items.filter(i => i.part_id === p.id).map(i => <p key={i.id}>{i.quantity} × {i.snapshot.name} · {moduleMoney(i.total_cents)} · {i.status}</p>)}</div>
        {p.store_id === storeId && p.urgency === 'pending' && <div className="module-actions"><button className="button" disabled={busy} onClick={() => void command('urgency', { order_id: id, accept: true })}>Aceitar urgência</button><button className="button" disabled={busy} onClick={() => void command('urgency', { order_id: id, accept: false })}>Recusar urgência</button></div>}
      </div>)}
      {order?.status === 'payment_pending' && order.seller_store_id === storeId && <form onSubmit={e => { e.preventDefault(); void command('payment', { order_id: id, amount_cents: Math.round(Number(amounts[id]) * 100), reference: references[id] }); }}>
        <p>Confira o crédito no banco antes de confirmar. Este botão não consulta o banco automaticamente.</p><div className="module-grid"><label>Valor efetivamente recebido (R$)<input required type="number" min="0.01" step="0.01" value={amounts[id] || ''} onChange={e => setAmounts({ ...amounts, [id]: e.target.value })} /></label><label>Referência bancária<input minLength={3} required value={references[id] || ''} onChange={e => setReferences({ ...references, [id]: e.target.value })} /></label></div><button className="button button-primary" disabled={busy}>Confirmar recebimento conferido</button>
      </form>}
      {(orderParts.some(p => p.store_id === storeId && p.status === 'active') || master) && <div className="module-actions">{cancelling !== id ? <button className="button" onClick={() => setCancelling(id)}>Cancelar {master ? 'pedido ou parte' : 'minha parte'}</button> : <><span>Cancelamento libera reservas e registra reembolso quando pago.</span><button className="button" disabled={busy} onClick={() => void command('cancel', { order_id: id }).then(ok => ok && setCancelling(undefined))}>Confirmar minha parte</button>{master && <button className="button" disabled={busy} onClick={() => void command('cancel', { order_id: id, all: true }).then(ok => ok && setCancelling(undefined))}>Confirmar pedido completo</button>}<button className="button" onClick={() => setCancelling(undefined)}>Voltar</button></>}</div>}
    </article>; })}
    <h3>A receber entre lojas</h3>{receivables.map(r => { const part = parts.find(p => p.id === r.part_id); return <div className="module-row" key={r.part_id}><div><strong>FW-E{part?.code} · {moduleMoney(r.amount_cents)}</strong><p>{r.status} · Repassado: {moduleMoney(r.settled_cents)}</p></div>{master && r.status === 'pending' && part && <form className="module-inline" onSubmit={e => { e.preventDefault(); void command('settle', { order_id: part.order_id, part_id: r.part_id, reference: references[r.part_id] }); }}><label>Referência do repasse<input required minLength={3} value={references[r.part_id] || ''} onChange={e => setReferences({ ...references, [r.part_id]: e.target.value })} /></label><button className="button" disabled={busy}>Registrar repasse feito</button></form>}</div>; })}
    <h3>Reembolsos</h3>{refunds.map(r => <div className="module-row" key={r.id}><span>{moduleMoney(r.amount_cents)} · {r.status}</span>{r.status === 'pending' && (master || orders.find(o => o.id === r.order_id)?.seller_store_id === storeId) && <form className="module-inline" onSubmit={e => { e.preventDefault(); void command('refund', { order_id: r.order_id, refund_id: r.id, reference: references[r.id] }); }}><label>Referência do reembolso<input required minLength={3} value={references[r.id] || ''} onChange={e => setReferences({ ...references, [r.id]: e.target.value })} /></label><button className="button" disabled={busy}>Registrar reembolso feito</button></form>}</div>)}
  </section>;
}
