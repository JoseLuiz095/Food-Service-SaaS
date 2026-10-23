import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeftRight, Boxes, LoaderCircle, MapPin, Plus, RefreshCw, Warehouse } from 'lucide-react';
import { ErrorState, LoadingState } from '../../components/ui/AsyncState';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import { stockLocationsApi, type ProductLocationStock, type StockLocation } from '../../services/stockLocationsApi';
import type { Product } from '../../types';
import './stock-locations.css';

const operationId = () => crypto.randomUUID();

export default function StockLocationsAdmin() {
  const { settings, products } = useStore();
  const { showToast } = useToast();
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [balances, setBalances] = useState<ProductLocationStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<StockLocation['location_type']>('warehouse');
  const [productId, setProductId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [transferQty, setTransferQty] = useState('');

  const trackedProducts = useMemo(() => products.filter((product) => product.trackStock && product.active), [products]);
  const refresh = useCallback(async () => {
    setError('');
    try {
      const [nextLocations, nextBalances] = await stockLocationsApi.list(settings.id);
      setLocations(nextLocations);
      setBalances(nextBalances);
      setLocationId((current) => current || nextLocations.find((item) => item.is_default)?.id || nextLocations[0]?.id || '');
      setFromId((current) => current || nextLocations.find((item) => item.is_default)?.id || nextLocations[0]?.id || '');
      setToId((current) => current || nextLocations.find((item) => item.id !== nextLocations[0]?.id)?.id || '');
      setProductId((current) => current || trackedProducts[0]?.id || '');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Não foi possível carregar os locais de estoque.';
      setError(message);
    } finally { setLoading(false); }
  }, [settings.id, trackedProducts]);
  useEffect(() => { void refresh(); }, [refresh]);

  const balanceFor = (product: Product, location: StockLocation) =>
    balances.find((item) => item.product_id === product.id && item.location_id === location.id);
  const selectedProduct = trackedProducts.find((product) => product.id === productId);
  const submitLocation = async (event: FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await stockLocationsApi.create(settings.id, newName, newType);
      setNewName('');
      showToast('Local de estoque criado.', 'success');
      await refresh();
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Falha ao criar o local.', 'error');
    } finally { setSaving(false); }
  };
  const submitAdjustment = async (event: FormEvent) => {
    event.preventDefault();
    const value = Number(quantity);
    if (!productId || !locationId || !Number.isInteger(value) || value < 0 || !reason.trim()) return;
    setSaving(true);
    try {
      await stockLocationsApi.adjust({ storeId: settings.id, productId, locationId, quantity: value, reason: reason.trim(), idempotencyKey: operationId() });
      showToast('Saldo por local atualizado.', 'success');
      setQuantity(''); setReason('');
      await refresh();
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Falha ao ajustar o saldo.', 'error');
    } finally { setSaving(false); }
  };
  const submitTransfer = async (event: FormEvent) => {
    event.preventDefault();
    const value = Number(transferQty);
    if (!productId || !fromId || !toId || fromId === toId || !Number.isInteger(value) || value < 1 || !reason.trim()) return;
    setSaving(true);
    try {
      await stockLocationsApi.transfer({ storeId: settings.id, productId, fromLocationId: fromId, toLocationId: toId, quantity: value, reason: reason.trim(), idempotencyKey: operationId() });
      showToast('Transferência registrada.', 'success');
      setTransferQty(''); setReason('');
      await refresh();
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Falha ao transferir o estoque.', 'error');
    } finally { setSaving(false); }
  };

  if (loading) return <LoadingState label="Carregando locais de estoque..." />;
  if (error && !locations.length) return <ErrorState message={error || "Locais indisponíveis."} onRetry={() => void refresh()} />;
  return <main className="admin-page">
    <header className="page-header"><div><span className="eyebrow">ESTOQUE</span><h1>Locais de estoque</h1><p>Consulte saldos, ajuste quantidades e transfira produtos com registro de operação.</p></div>
      <button className="button button-secondary" onClick={() => void refresh()} disabled={saving}><RefreshCw size={16}/> Atualizar</button></header>
    {error && <div className="inline-alert inline-alert-error">{error}</div>}
    <section className="admin-card">
      <div className="section-heading"><div><h2>Locais cadastrados</h2><p>O estoque existente foi preservado no local principal.</p></div><Warehouse size={20}/></div>
      <div className="stock-location-grid">{locations.map((location) => <article className="stock-location-card" key={location.id}>
        <div className="stock-location-card__icon"><MapPin size={18}/></div><div><strong>{location.name}</strong><p>{location.is_default ? 'Principal' : location.location_type === 'vehicle' ? 'Carga móvel' : location.location_type === 'pickup' ? 'Retirada' : 'Local secundário'}{!location.active ? ' · Inativo' : ''}</p></div>
        <span>{balances.filter((balance) => balance.location_id === location.id).length} produtos</span>
      </article>)}</div>
      <form className="stock-location-create" onSubmit={submitLocation}>
        <label>Nome do local<input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={80} placeholder="Ex.: Loja Centro, Veículo 1" required/></label>
        <label>Tipo<select value={newType} onChange={(event) => setNewType(event.target.value as StockLocation['location_type'])}><option value="warehouse">Depósito</option><option value="store">Loja</option><option value="vehicle">Carga móvel</option><option value="pickup">Retirada</option></select></label>
        <button className="button button-primary" disabled={saving || !newName.trim()}><Plus size={16}/> Adicionar local</button>
      </form>
    </section>
    <section className="admin-card">
      <div className="section-heading"><div><h2>Saldo por produto e local</h2><p>O saldo geral continua sincronizado com a soma dos locais.</p></div><Boxes size={20}/></div>
      {!trackedProducts.length ? <p className="empty-state">Ative o controle de estoque em um produto para começar.</p> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Produto</th>{locations.map((location) => <th key={location.id}>{location.name}</th>)}</tr></thead><tbody>
        {trackedProducts.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><small>Geral: {balances.filter((item) => item.product_id === product.id).reduce((sum, item) => sum + item.stock_quantity, 0)}</small></td>{locations.map((location) => { const balance = balanceFor(product, location); return <td key={location.id}>{balance ? <><strong>{balance.stock_quantity}</strong><small>Disponível: {Math.max(0,balance.stock_quantity-balance.stock_reserved_quantity)}</small></> : <span>0</span>}</td>; })}</tr>)}
      </tbody></table></div>}
    </section>
    <div className="stock-location-actions">
      <section className="admin-card"><h2>Ajustar saldo</h2><p>Informe a contagem física do produto no local.</p>
        <form className="stock-location-form" onSubmit={submitAdjustment}>
          <label>Produto<select value={productId} onChange={(event) => setProductId(event.target.value)}>{trackedProducts.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label>
          <label>Local<select value={locationId} onChange={(event) => setLocationId(event.target.value)}>{locations.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>Novo saldo<input type="number" min="0" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required/></label>
          <label>Motivo<input maxLength={160} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: Contagem semanal" required/></label>
          <button className="button button-primary" disabled={saving || !selectedProduct}>{saving ? <LoaderCircle size={16} className="spin"/> : null} Salvar contagem</button>
        </form>
      </section>
      <section className="admin-card"><h2>Transferir produtos</h2><p>Quantidade reservada não pode sair da origem.</p>
        <form className="stock-location-form" onSubmit={submitTransfer}>
          <label>Produto<select value={productId} onChange={(event) => setProductId(event.target.value)}>{trackedProducts.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label>
          <label>Origem<select value={fromId} onChange={(event) => setFromId(event.target.value)}>{locations.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>Destino<select value={toId} onChange={(event) => setToId(event.target.value)}>{locations.filter((item) => item.active && item.id !== fromId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>Quantidade<input type="number" min="1" step="1" value={transferQty} onChange={(event) => setTransferQty(event.target.value)} required/></label>
          <label>Motivo<input maxLength={160} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: Reposição da unidade" required/></label>
          <button className="button button-primary" disabled={saving || !selectedProduct || !toId || fromId===toId}><ArrowLeftRight size={16}/> Transferir</button>
        </form>
      </section>
    </div>
  </main>;
}
