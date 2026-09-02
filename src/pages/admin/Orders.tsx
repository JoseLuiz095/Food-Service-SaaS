import { RefreshCw, Search, ShoppingBag } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorState, LoadingState } from '../../components/ui/AsyncState';
import { useStore } from '../../contexts/StoreContext';
import { currency, formatDateTimeBR } from '../../utils/format';
import type { OrderStatus, PaymentMethod } from '../../types';
import { formatOrderNumber } from '../../utils/orderConfirmation';

const statusOptions: Array<{ value: OrderStatus; label: string }> = [
  { value: 'received', label: 'Recebido' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'preparing', label: 'Em preparação' },
  { value: 'ready', label: 'Pronto' },
  { value: 'out_for_delivery', label: 'Saiu para entrega' },
  { value: 'delivered', label: 'Entregue' },
  { value: 'picked_up', label: 'Retirado' },
  { value: 'cancelled', label: 'Cancelado' },
];

const statusLabel = Object.fromEntries(statusOptions.map((item) => [item.value, item.label])) as Record<OrderStatus, string>;
const paymentLabel: Record<PaymentMethod, string> = { confirm: 'Combinar com a loja', pix: 'PIX', card: 'Cartão', cash: 'Dinheiro' };

export default function OrdersAdmin() {
  const { orders, loading, error, reloadAdmin, updateOrderStatus } = useStore();
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const refreshingRef = useRef(false);

  const filtered = useMemo(() => {
    const term = query.toLowerCase().trim();
    if (!term) return orders;
    return orders.filter((order) => `${order.customerName} ${order.customerPhone ?? ''} ${order.id} ${order.orderNumber}`.toLowerCase().includes(term));
  }, [orders, query]);

  const refreshOrders = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await reloadAdmin({ silent: true });
      setLastUpdatedAt(new Date());
    } catch (refreshError) {
      console.error('Não foi possível atualizar os pedidos em segundo plano:', refreshError);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [reloadAdmin]);

  const changeStatus = async (orderId: string, status: OrderStatus) => {
    setUpdatingId(orderId);
    try {
      await updateOrderStatus(orderId, status);
      setLastUpdatedAt(new Date());
    } catch (statusError) {
      window.alert(statusError instanceof Error ? statusError.message : 'Não foi possível atualizar o pedido.');
    } finally {
      setUpdatingId(null);
    }
  };

  useEffect(() => {
    if (!loading && !lastUpdatedAt) setLastUpdatedAt(new Date());
  }, [loading, lastUpdatedAt]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshOrders();
    }, 15000);
    const onFocus = () => void refreshOrders();
    const onVisibility = () => { if (document.visibilityState === 'visible') void refreshOrders(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshOrders]);

  if (loading) return <LoadingState label="Carregando pedidos..." />;
  if (error) return <ErrorState message={error} onRetry={() => void reloadAdmin()} />;

  return (
    <>
      <div className="admin-page-title">
        <div>
          <span className="eyebrow">OPERAÇÃO</span>
          <h1>Pedidos</h1>
          <p>Pedidos são gravados antes do WhatsApp e podem ser acompanhados do recebimento até a entrega ou retirada.</p>
        </div>
      </div>

      <section className="admin-card no-padding">
        <div className="table-toolbar orders-toolbar">
          <div className="admin-search">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pedido, cliente ou telefone..." />
          </div>
          <div className="orders-toolbar__sync" aria-live="polite">
            <span>{filtered.length} pedido{filtered.length === 1 ? '' : 's'}</span>
            <small>{lastUpdatedAt ? `Atualizado às ${lastUpdatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Atualização automática ativa'}</small>
            <button type="button" className="secondary-button compact-button" onClick={() => void refreshOrders()} disabled={refreshing} aria-busy={refreshing}>
              <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
              {refreshing ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="admin-empty">
            <ShoppingBag size={32} />
            <strong>Nenhum pedido registrado</strong>
            <span>Quando o cliente finalizar o checkout, o pedido aparecerá aqui imediatamente, mesmo que ele não abra o WhatsApp.</span>
          </div>
        ) : (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Recebimento</th>
                  <th>Pagamento</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Criado em</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <strong>#{order.orderNumber ? formatOrderNumber(order.orderNumber) : order.id.slice(0, 8)}</strong>
                      {order.whatsappClickedAt ? <small className="order-fee-note">WhatsApp aberto</small> : null}
                    </td>
                    <td>
                      <div className="order-customer">
                        <strong>{order.customerName}</strong>
                        <span>{order.customerPhone || 'Sem telefone informado'}</span>
                      </div>
                    </td>
                    <td>
                      <div className="order-customer">
                        <strong>{order.deliveryType === 'delivery' ? 'Delivery' : 'Retirada'}</strong>
                        {order.deliveryType === 'delivery' && order.deliveryZoneName ? <span>{order.deliveryZoneName}{order.deliveryFee ? ` · ${currency.format(order.deliveryFee)}` : ''}</span> : null}
                        {order.scheduledFor ? <span>Agendado: {formatDateTimeBR(order.scheduledFor)}</span> : null}
                        {order.preparationEstimateMinutes ? <span>Estimativa: até {order.preparationEstimateMinutes} min</span> : null}
                      </div>
                    </td>
                    <td>
                      <div className="order-customer">
                        <strong>{paymentLabel[order.paymentMethod]}</strong>
                        {order.paymentMethod === 'cash' && order.needsChange && order.changeFor ? <span>Troco para {currency.format(order.changeFor)}</span> : null}
                      </div>
                    </td>
                    <td>
                      <strong>{currency.format(order.total)}</strong>
                      {order.deliveryFee ? <small className="order-fee-note">inclui {currency.format(order.deliveryFee)} de entrega</small> : null}
                    </td>
                    <td>
                      <label className={`order-status-control order-status-control--${order.status}`}>
                        <span>{statusLabel[order.status]}</span>
                        <select
                          value={order.status}
                          disabled={updatingId === order.id}
                          onChange={(event) => void changeStatus(order.id, event.target.value as OrderStatus)}
                          aria-label={`Status do pedido ${order.orderNumber || order.id}`}
                        >
                          {statusOptions
                            .filter((option) => order.deliveryType === 'delivery' ? option.value !== 'picked_up' : option.value !== 'out_for_delivery' && option.value !== 'delivered')
                            .map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                    </td>
                    <td>{formatDateTimeBR(order.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
