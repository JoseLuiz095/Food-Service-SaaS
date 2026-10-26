import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeftRight, Boxes, Copy, Download, LoaderCircle, MapPin, Plus, RefreshCw, Warehouse } from 'lucide-react';
import QRCode from 'qrcode';
import { ErrorState, LoadingState } from '../../components/ui/AsyncState';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import { restFetch, SupabaseHttpError } from '../../lib/supabaseRest';
import { useStockMode } from '../../hooks/useStockMode';
import { stockModeApi } from '../../services/stockModeApi';
import { stockLocationsApi, type ProductLocationStock, type StockLocation } from '../../services/stockLocationsApi';
import type { Product } from '../../types';
import { publicStorefrontUrl } from '../../utils/storefrontRoute';
import './stock-locations.css';

const operationId = () => crypto.randomUUID();

export default function StockLocationsAdmin() {
  const { settings, products } = useStore();
  const { showToast } = useToast();
  const {enabled:multiLocation,loading:modeLoading,error:modeError,reload:reloadMode}=useStockMode(settings.id);
  const [changingMode,setChangingMode]=useState(false);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [balances, setBalances] = useState<ProductLocationStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<StockLocation['location_type']>('warehouse');
  const [editingLocationId, setEditingLocationId] = useState('');
  const [editingLocationName, setEditingLocationName] = useState('');
  const [productId, setProductId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [adjustMode, setAdjustMode] = useState<'add' | 'remove' | 'set'>('set');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [transferQty, setTransferQty] = useState('');
  const [batchQuantities, setBatchQuantities] = useState<Record<string, string>>({});
  const [locationView, setLocationView] = useState<'all' | 'vehicle'>('all');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [salesToday, setSalesToday] = useState<Array<{ product_id: string; net_sold: number }> | null>(null);
  const transferSectionRef = useRef<HTMLElement>(null);
  const adjustSectionRef = useRef<HTMLElement>(null);
  const adjustmentKeys = useRef(new Map<string, string>());
  const transferKeys = useRef(new Map<string, string>());
  const batchKeys = useRef(new Map<string, string>());
  const [pickupPoints, setPickupPoints] = useState<Array<{ id: string; name: string; short_code: string; stock_location_id: string }>>([]);
  const [pickupName, setPickupName] = useState('');
  const [pickupCode, setPickupCode] = useState('');
  const [pickupStockId, setPickupStockId] = useState('');
  const [pointQrs, setPointQrs] = useState<Record<string, string>>({});
  const pointLink = (code: string) => {
    const url = new URL(publicStorefrontUrl(settings.slug));
    url.searchParams.set('ponto', code);
    return url.toString();
  };
  useEffect(() => {
    let active = true;
    void Promise.all(pickupPoints.map(async (point) => [point.id, await QRCode.toDataURL(pointLink(point.short_code), { errorCorrectionLevel: 'M', margin: 2, width: 240 })] as const))
      .then((entries) => { if (active) setPointQrs(Object.fromEntries(entries)); })
      .catch(() => { if (active) setPointQrs({}); });
    return () => { active = false; };
  }, [pickupPoints, settings.slug]);

  const trackedProducts = useMemo(() => products.filter((product) => product.trackStock && product.active), [products]);
  const activeLocations = useMemo(() => locations.filter((item) => item.active), [locations]);
  const visibleLocations = useMemo(() => activeLocations.filter((item) => locationView === 'all' || item.location_type === 'vehicle'), [activeLocations, locationView]);
  const selectedLocation = visibleLocations.find((item) => item.id === selectedLocationId) || visibleLocations[0];
  useEffect(() => {
    if (!selectedLocationId) return;
    try { localStorage.setItem(`food_stock_location:${settings.id}`, selectedLocationId); } catch { /* armazenamento opcional */ }
  }, [settings.id, selectedLocationId]);
  useEffect(() => {
    if (locationView !== 'vehicle' || !selectedLocation?.id) { setSalesToday(null); return; }
    let active = true;
    setSalesToday(null);
    void restFetch<Array<{ product_id: string; net_sold: number }>>('rpc/food_get_location_sales_today_v1', {
      method: 'POST', body: { p_store_id: settings.id, p_location_id: selectedLocation.id },
    }).then((rows) => { if (active) setSalesToday(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (active) setSalesToday(null); });
    return () => { active = false; };
  }, [settings.id, locationView, selectedLocation?.id]);
  const selectedBalances = useMemo(() => selectedLocation ? balances.filter((item) => item.location_id === selectedLocation.id) : [], [balances, selectedLocation]);
  const transferBalance = balances.find((item) => item.product_id === productId && item.location_id === fromId);
  const transferAvailable = Math.max(0, (transferBalance?.stock_quantity || 0) - (transferBalance?.stock_reserved_quantity || 0));
  const parsedTransferQty = Number(transferQty);
  const canTransfer = Boolean(productId && fromId && toId && fromId !== toId && activeLocations.some((item) => item.id === fromId) && activeLocations.some((item) => item.id === toId) && transferQty.trim() && Number.isInteger(parsedTransferQty) && parsedTransferQty > 0 && parsedTransferQty <= transferAvailable);
  const batchItems = trackedProducts.map((product) => ({ product_id: product.id, quantity: Number(batchQuantities[product.id]) })).filter((item) => batchQuantities[item.product_id]?.trim());
  const canBatchTransfer = Boolean(fromId && toId && fromId !== toId && activeLocations.some((item) => item.id === fromId) && activeLocations.some((item) => item.id === toId) && batchItems.length && batchItems.length <= 50 && batchItems.every((item) => {
    const balance = balances.find((row) => row.product_id === item.product_id && row.location_id === fromId);
    return Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= Math.max(0, (balance?.stock_quantity || 0) - (balance?.stock_reserved_quantity || 0));
  }));
  const refresh = useCallback(async () => {
    setError('');
    try {
      const [nextLocations, nextBalances] = await stockLocationsApi.list(settings.id);
      setLocations(nextLocations);
      setBalances(nextBalances);
      setSelectedLocationId((current) => {
        if (nextLocations.some((item) => item.id === current && item.active)) return current;
        try {
          const remembered = localStorage.getItem(`food_stock_location:${settings.id}`);
          if (nextLocations.some((item) => item.id === remembered && item.active)) return remembered || '';
        } catch { /* armazenamento opcional */ }
        return nextLocations.find((item) => item.is_default && item.active)?.id || nextLocations.find((item) => item.active)?.id || '';
      });
      const points = await restFetch<Array<{ id: string; name: string; short_code: string; stock_location_id: string }>>(`food_pickup_locations?store_id=eq.${encodeURIComponent(settings.id)}&select=id,name,short_code,stock_location_id&order=name.asc`);
      setPickupPoints(points);
      setPickupStockId((current) => current || nextLocations.find((item) => item.is_default)?.id || '');
      setLocationId((current) => current || nextLocations.find((item) => item.is_default)?.id || nextLocations[0]?.id || '');
      setFromId((current) => current || nextLocations.find((item) => item.is_default)?.id || nextLocations[0]?.id || '');
      setToId((current) => current && nextLocations.some((item) => item.id === current && item.active) ? current : nextLocations.find((item) => item.active && item.id !== nextLocations.find((candidate) => candidate.is_default)?.id)?.id || '');
      setProductId((current) => current || trackedProducts[0]?.id || '');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Não foi possível carregar os locais de estoque.';
      setError(message);
    } finally { setLoading(false); }
  }, [settings.id, trackedProducts]);
  useEffect(() => {
    if (multiLocation === false) { setLoading(false); return; }
    if (modeLoading) return;
    setLoading(true);
    void refresh();
  }, [refresh, multiLocation, modeLoading]);

  const balanceFor = (product: Product, location: StockLocation) =>
    balances.find((item) => item.product_id === product.id && item.location_id === location.id);
  const selectedProduct = trackedProducts.find((product) => product.id === productId);
  const startQuickTransfer = (product: Product, location: StockLocation, destinationId?: string) => {
    setProductId(product.id);
    setFromId(location.id);
    setToId((current) => destinationId && destinationId !== location.id ? destinationId : current && current !== location.id && activeLocations.some((item) => item.id === current) ? current : activeLocations.find((item) => item.id !== location.id)?.id || '');
    setTransferQty('');
    setBatchQuantities({});
    transferSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const startQuickAdjust = (product: Product, location: StockLocation, mode: 'add' | 'remove' | 'set') => {
    setProductId(product.id);
    setLocationId(location.id);
    setAdjustMode(mode);
    setQuantity('');
    adjustSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
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
  const updateLocation = async (location: StockLocation, changes: { name?: string; active?: boolean }) => {
    setSaving(true);
    try {
      await restFetch(`food_stock_locations?id=eq.${encodeURIComponent(location.id)}&store_id=eq.${encodeURIComponent(settings.id)}`, {
        method: 'PATCH', body: { ...changes, updated_at: new Date().toISOString() },
      });
      setEditingLocationId('');
      showToast(changes.active === false ? 'Local desativado.' : changes.active === true ? 'Local ativado.' : 'Local renomeado.', 'success');
      await refresh();
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Não foi possível alterar o local.', 'error');
    } finally { setSaving(false); }
  };
  const submitAdjustment = async (event: FormEvent) => {
    event.preventDefault();
    const value = Number(quantity);
    if (!productId || !locationId || !Number.isInteger(value) || value < 0 || (adjustMode !== 'set' && value === 0)) return;
    const intent = [settings.id, productId, locationId, adjustMode, value].join(':');
    const key = adjustmentKeys.current.get(intent) || operationId();
    adjustmentKeys.current.set(intent, key);
    setSaving(true);
    try {
      await restFetch('rpc/food_change_location_stock_v1', { method: 'POST', body: {
        p_store_id: settings.id, p_product_id: productId, p_location_id: locationId,
        p_mode: adjustMode, p_quantity: value, p_idempotency_key: key,
      } });
      adjustmentKeys.current.delete(intent);
      showToast('Saldo por local atualizado.', 'success');
      setQuantity('');
      await refresh();
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Falha ao ajustar o saldo.', 'error');
    } finally { setSaving(false); }
  };
  const submitTransfer = async (event: FormEvent) => {
    event.preventDefault();
    const value = Number(transferQty);
    if (!canTransfer) return;
    const intent = [settings.id, productId, fromId, toId, value].join(':');
    const key = transferKeys.current.get(intent) || operationId();
    transferKeys.current.set(intent, key);
    setSaving(true);
    try {
      await stockLocationsApi.transfer({ storeId: settings.id, productId, fromLocationId: fromId, toLocationId: toId, quantity: value, reason: 'Transferência interna', idempotencyKey: key });
      transferKeys.current.delete(intent);
      showToast('Transferência registrada.', 'success');
      setTransferQty('');
      await refresh();
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Falha ao transferir o estoque.', 'error');
    } finally { setSaving(false); }
  };

  const submitBatchTransfer = async (event: FormEvent) => {
    event.preventDefault();
    if (!canBatchTransfer) return;
    const intent = JSON.stringify({ storeId: settings.id, fromId, toId, items: batchItems });
    const key = batchKeys.current.get(intent) || operationId();
    batchKeys.current.set(intent, key);
    setSaving(true);
    try {
      const send = () => restFetch<{ items: Array<{ product_id: string; from_stock: number; to_stock: number }>; replayed?: boolean }>('rpc/food_transfer_location_stock_batch_v1', {
        method: 'POST', body: { p_store_id: settings.id, p_from_location_id: fromId, p_to_location_id: toId, p_items: batchItems, p_idempotency_key: key },
      });
      try { await send(); }
      catch (cause) {
        if (!(cause instanceof SupabaseHttpError) || (cause.details !== '40P01' && !/deadlock/i.test(cause.message))) throw cause;
        await send(); // A transação abortada não deixa saldos parciais; a chave é a mesma.
      }
      batchKeys.current.delete(intent);
      setBatchQuantities({});
      showToast(`${batchItems.length} produto${batchItems.length === 1 ? '' : 's'} transferido${batchItems.length === 1 ? '' : 's'}.`, 'success');
      await refresh();
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Falha na transferência em lote.', 'error');
    } finally { setSaving(false); }
  };

  const submitPickupPoint = async (event: FormEvent) => {
    event.preventDefault();
    if (!pickupName.trim() || !pickupStockId || !/^[A-Z0-9-]{3,16}$/.test(pickupCode)) return;
    setSaving(true);
    try {
      await restFetch('food_pickup_locations', { method: 'POST', body: { store_id: settings.id, name: pickupName.trim(), short_code: pickupCode, stock_location_id: pickupStockId, active: true, is_public: true } });
      setPickupName(''); setPickupCode('');
      showToast('Ponto de retirada publicado.', 'success');
      await refresh();
    } catch (cause) { showToast(cause instanceof Error ? cause.message : 'Não foi possível publicar o ponto.', 'error'); }
    finally { setSaving(false); }
  };

  if (modeLoading || (multiLocation !== false && loading)) return <LoadingState label="Carregando locais de estoque..." />;
  if(multiLocation === false) return <main className="admin-page"><header className="page-header"><div><span className="eyebrow">ESTOQUE OPCIONAL</span><h1>Múltiplos locais</h1><p>Sua loja começa com um estoque principal. Use a tela Estoque para adicionar, remover ou definir quantidades.</p></div></header><section className="admin-card"><h2>Precisa separar estoques?</h2><p>Ative quando quiser controlar depósitos, pontos de retirada e transferências. Os saldos atuais continuam no local principal.</p><button type="button" className="primary-button" disabled={changingMode} onClick={()=>void (async()=>{setChangingMode(true);try{await stockModeApi.set(settings.id,true);await reloadMode();showToast('Múltiplos locais ativados.','success');}catch(cause){showToast(cause instanceof Error?cause.message:'Não foi possível ativar.','error');}finally{setChangingMode(false);}})()}>{changingMode?'Ativando...':'Ativar múltiplos locais'}</button></section></main>;
  if (error && !locations.length) return <ErrorState message={error || "Locais indisponíveis."} onRetry={() => void refresh()} />;
  return <main className="admin-page">
    {modeError&&<div role="alert" className="inline-alert inline-alert-error">A configuração opcional ainda não foi implantada neste ambiente. {modeError}</div>}

    <header className="page-header"><div><span className="eyebrow">ESTOQUE</span><h1>Locais de estoque</h1><p>Consulte saldos, ajuste quantidades e transfira produtos com registro de operação.</p></div>
      <button className="secondary-button" onClick={() => void refresh()} disabled={saving}><RefreshCw size={16}/> Atualizar</button></header>
    {error && <div className="inline-alert inline-alert-error">{error}</div>}
    {multiLocation===true&&<section className="admin-card"><h2>Voltar ao estoque simples</h2><p>Você pode ocultar estes controles quando não houver saldo ou reservas em locais secundários e nenhum ponto ativo associado a eles. Nenhum local ou histórico será excluído.</p><button type="button" className="secondary-button" disabled={changingMode||saving} onClick={()=>void (async()=>{setChangingMode(true);try{await stockModeApi.set(settings.id,false);await reloadMode();showToast('Estoque simples ativado.','success');}catch(cause){showToast(cause instanceof Error?cause.message:'Transfira os saldos antes de simplificar.','error');}finally{setChangingMode(false);}})()}>Usar estoque simples</button></section>}
    <section className="admin-card stock-location-workspace" aria-label="Visão dos locais">
      <div className="stock-location-tabs" role="group" aria-label="Tipo de local">
        <button type="button" className={locationView === 'all' ? 'is-active' : ''} aria-pressed={locationView === 'all'} onClick={() => { setLocationView('all'); setSelectedLocationId(''); }}>Meus locais</button>
        <button type="button" className={locationView === 'vehicle' ? 'is-active' : ''} aria-pressed={locationView === 'vehicle'} onClick={() => { setLocationView('vehicle'); setSelectedLocationId(''); }}>Minha carga</button>
      </div>
      <div className="stock-location-workspace__heading"><div><h2>{locationView === 'vehicle' ? 'Carga móvel' : 'Estoque por local'}</h2><p>{locationView === 'vehicle' ? 'Selecione uma carga móvel para consultar os saldos. Os locais ainda não são vinculados a usuários.' : 'Escolha um local para ver os saldos e iniciar uma transferência.'}</p></div>
        {visibleLocations.length > 0 && <label>Local<select value={selectedLocation?.id || ''} onChange={(event) => setSelectedLocationId(event.target.value)}>{visibleLocations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}</div>
      {!selectedLocation ? <p className="stock-location-empty">{locationView === 'vehicle' ? 'Nenhuma carga móvel ativa cadastrada.' : 'Nenhum local ativo cadastrado.'}</p> : <>
        <div className="stock-location-summary"><span><strong>{selectedBalances.reduce((sum, item) => sum + item.stock_quantity, 0)}</strong> unidades físicas</span><span><strong>{selectedBalances.reduce((sum, item) => sum + Math.max(0, item.stock_quantity - item.stock_reserved_quantity), 0)}</strong> disponíveis</span><span><strong>{selectedBalances.filter((item) => item.stock_quantity > 0).length}</strong> produtos com saldo</span></div>
        <div className="stock-location-list">{trackedProducts.map((product) => { const balance = balanceFor(product, selectedLocation); const available = Math.max(0, (balance?.stock_quantity || 0) - (balance?.stock_reserved_quantity || 0)); const home = activeLocations.find((item) => item.is_default); return <article key={product.id} className="stock-location-product"><div><strong>{product.name}</strong><small>{balance?.stock_quantity || 0} físico · {balance?.stock_reserved_quantity || 0} reservado</small>{locationView === 'vehicle' && <small>{salesToday === null ? 'Vendas de hoje: consultando ou indisponíveis' : `Vendido hoje: ${salesToday.find((row) => row.product_id === product.id)?.net_sold || 0}`}</small>}</div><div className="stock-location-product__action"><span>{available} {available === 1 ? 'disponível' : 'disponíveis'}</span><button type="button" className="secondary-button" disabled={saving} onClick={() => startQuickAdjust(product, selectedLocation, 'add')}>Adicionar</button><button type="button" className="secondary-button" disabled={saving || available < 1} onClick={() => startQuickAdjust(product, selectedLocation, 'remove')}>Remover</button><button type="button" className="secondary-button" disabled={saving} onClick={() => startQuickAdjust(product, selectedLocation, 'set')}>Definir</button>{locationView === 'vehicle' && home && <button type="button" className="secondary-button" disabled={saving} onClick={() => startQuickTransfer(product, home, selectedLocation.id)}>Repor</button>}<button type="button" className="secondary-button" disabled={saving || available < 1 || activeLocations.length < 2} onClick={() => startQuickTransfer(product, selectedLocation, home?.id)}>{locationView === 'vehicle' && home ? 'Devolver' : 'Transferir'}</button></div></article>; })}</div>
        {!trackedProducts.length && <p className="stock-location-empty">Ative o controle de estoque em um produto para ver os saldos.</p>}
      </>}
    </section>
    <section className="admin-card">
      <div className="section-heading"><div><h2>Locais cadastrados</h2><p>O estoque existente foi preservado no local principal.</p></div><Warehouse size={20}/></div>
      <div className="stock-location-grid">{locations.map((location) => <article className="stock-location-card stock-location-card--manage" key={location.id}>
        <div className="stock-location-card__icon"><MapPin size={18}/></div><div><strong>{location.name}</strong><p>{location.is_default ? 'Principal' : location.location_type === 'vehicle' ? 'Carga móvel' : location.location_type === 'pickup' ? 'Retirada' : 'Local secundário'}{!location.active ? ' · Inativo' : ''}</p><p>{balances.filter((balance) => balance.location_id === location.id && balance.stock_quantity > 0).length} produtos · {balances.filter((balance) => balance.location_id === location.id).reduce((sum, balance) => sum + Math.max(0, balance.stock_quantity - balance.stock_reserved_quantity), 0)} disponíveis</p><button type="button" className="stock-location-manage-button" disabled={saving} onClick={() => { setEditingLocationId(editingLocationId === location.id ? '' : location.id); setEditingLocationName(location.name); }}>Gerenciar</button></div>
        {editingLocationId === location.id && <div className="stock-location-manage"><label>Nome<input value={editingLocationName} maxLength={80} onChange={(event) => setEditingLocationName(event.target.value)}/></label><button type="button" disabled={saving || !editingLocationName.trim() || editingLocationName.trim() === location.name} onClick={() => void updateLocation(location, { name: editingLocationName.trim() })}>Salvar nome</button>{!location.is_default && <button type="button" disabled={saving} onClick={() => void updateLocation(location, { active: !location.active })}>{location.active ? 'Desativar' : 'Ativar'}</button>}</div>}
      </article>)}</div>
      <form className="stock-location-create" onSubmit={submitLocation}>
        <label>Nome do local<input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={80} placeholder="Ex.: Loja Centro, Veículo 1" required/></label>
        <label>Tipo<select value={newType} onChange={(event) => setNewType(event.target.value as StockLocation['location_type'])}><option value="warehouse">Depósito</option><option value="store">Loja</option><option value="vehicle">Carga móvel</option><option value="pickup">Retirada</option></select></label>
        <button className="primary-button" disabled={saving || !newName.trim()}><Plus size={16}/> Adicionar local</button>
      </form>
    </section>
    <section className="admin-card"><h2>Pontos públicos de retirada</h2><p>Associe cada ponto ao seu estoque. O cliente escolhe este ponto ao finalizar a compra.</p>
      <div className="stock-location-grid">{pickupPoints.map((point) => <article className="stock-location-card stock-location-card--pickup" key={point.id}><MapPin size={18}/><div><strong>{point.name}</strong><p>{point.short_code} · {locations.find((location) => location.id === point.stock_location_id)?.name || 'Sem estoque'}</p><div className="stock-location-point-actions"><button type="button" className="secondary-button" onClick={() => void navigator.clipboard.writeText(pointLink(point.short_code)).then(() => showToast('Link deste ponto copiado.', 'success')).catch(() => showToast('Não foi possível copiar o link.', 'error'))}><Copy size={15}/> Copiar link</button>{pointQrs[point.id] && <a className="secondary-button" href={pointQrs[point.id]} download={`${point.short_code.toLowerCase()}-qr.png`}><Download size={15}/> Baixar QR</a>}</div></div>{pointQrs[point.id] && <img className="stock-location-point-qr" src={pointQrs[point.id]} alt={`QR Code do ponto ${point.name}`}/>}</article>)}</div>
      <form className="stock-location-create" onSubmit={submitPickupPoint}>
        <label>Nome do ponto<input required maxLength={80} value={pickupName} onChange={(event) => setPickupName(event.target.value)} placeholder="Ex.: Vendas com Ana"/></label>
        <label>Código QR<input required minLength={3} maxLength={16} value={pickupCode} onChange={(event) => setPickupCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} placeholder="ANA-01"/></label>
        <label>Estoque de origem<select required value={pickupStockId} onChange={(event) => setPickupStockId(event.target.value)}>{locations.filter((location) => location.active).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <button className="primary-button" disabled={saving || !pickupName.trim() || !pickupStockId || pickupCode.length < 3}><Plus size={16}/>Publicar ponto</button>
      </form>
    </section>
    <section className="admin-card">
      <div className="section-heading"><div><h2>Saldo por produto e local</h2><p>O saldo geral continua sincronizado com a soma dos locais.</p></div><Boxes size={20}/></div>
      {!trackedProducts.length ? <p className="empty-state">Ative o controle de estoque em um produto para começar.</p> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Produto</th>{locations.map((location) => <th key={location.id}>{location.name}</th>)}</tr></thead><tbody>
        {trackedProducts.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><small>Geral: {balances.filter((item) => item.product_id === product.id).reduce((sum, item) => sum + item.stock_quantity, 0)}</small></td>{locations.map((location) => { const balance = balanceFor(product, location); return <td key={location.id}>{balance ? <><strong>{balance.stock_quantity}</strong><small>Disponível: {Math.max(0,balance.stock_quantity-balance.stock_reserved_quantity)}</small></> : <span>0</span>}</td>; })}</tr>)}
      </tbody></table></div>}
    </section>
    <div className="stock-location-actions">
      <section className="admin-card" ref={adjustSectionRef}><h2>Ajustar saldo</h2><p>Escolha a ação e o local. O histórico é registrado automaticamente.</p>
        <form className="stock-location-form" onSubmit={submitAdjustment}>
          <label>Produto<select value={productId} onChange={(event) => setProductId(event.target.value)}>{trackedProducts.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label>
          <label>Local<select value={locationId} onChange={(event) => setLocationId(event.target.value)}>{locations.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>Ação<select value={adjustMode} onChange={(event) => { setAdjustMode(event.target.value as 'add' | 'remove' | 'set'); setQuantity(''); }}><option value="add">Adicionar</option><option value="remove">Remover</option><option value="set">Definir quantidade física</option></select></label>
          <label>Quantidade<input type="number" min={adjustMode === 'set' ? 0 : 1} step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required/></label>
          <button className="primary-button" disabled={saving || !selectedProduct || !quantity.trim()}>{saving ? <LoaderCircle size={16} className="spin"/> : null} Salvar no local selecionado</button>
        </form>
      </section>
      <section className="admin-card" ref={transferSectionRef}><h2>Transferir produtos</h2><p>Quantidade reservada não pode sair da origem.</p>
        <form className="stock-location-form" onSubmit={submitTransfer}>
          <label>Produto<select value={productId} onChange={(event) => setProductId(event.target.value)}>{trackedProducts.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label>
          <label>Origem<select value={fromId} onChange={(event) => { const next = event.target.value; setFromId(next); setBatchQuantities({}); if (toId === next) setToId(activeLocations.find((item) => item.id !== next)?.id || ''); }}>{activeLocations.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>Destino<select value={toId} onChange={(event) => setToId(event.target.value)}>{activeLocations.filter((item) => item.id !== fromId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>Quantidade<input type="number" min="1" max={transferAvailable} step="1" value={transferQty} onChange={(event) => setTransferQty(event.target.value)} required/><small>Disponível na origem: {transferAvailable}</small></label>
          <button className="primary-button" disabled={saving || !selectedProduct || !canTransfer}><ArrowLeftRight size={16}/> {saving ? 'Transferindo…' : 'Transferir'}</button>
        </form>
        <form className="stock-location-batch" onSubmit={submitBatchTransfer}>
          <h3>Transferência em lote</h3><p>Use a mesma origem e destino acima. Informe até 50 produtos para enviar de uma vez.</p>
          <div className="stock-location-batch__items">{trackedProducts.map((product) => { const balance = balances.find((item) => item.product_id === product.id && item.location_id === fromId); const available = Math.max(0, (balance?.stock_quantity || 0) - (balance?.stock_reserved_quantity || 0)); return <label key={product.id}><span>{product.name}<small>{available} {available === 1 ? 'disponível' : 'disponíveis'}</small></span><input type="number" min="0" max={available} step="1" inputMode="numeric" aria-label={`Quantidade de ${product.name} para transferência em lote`} value={batchQuantities[product.id] || ''} onChange={(event) => setBatchQuantities((current) => ({ ...current, [product.id]: event.target.value }))} placeholder="0" disabled={saving || available < 1}/></label>; })}</div>
          <button className="primary-button" disabled={saving || !canBatchTransfer}><ArrowLeftRight size={16}/> {saving ? 'Transferindo…' : `Transferir ${batchItems.length} em lote`}</button>
        </form>
      </section>
    </div>
  </main>;
}
