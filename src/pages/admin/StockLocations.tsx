import ReceiptContactsSettings from '../../components/admin/ReceiptContactsSettings';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeftRight, Boxes, Copy, Download, LoaderCircle, MapPin, Plus, RefreshCw, Search, Warehouse } from 'lucide-react';
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
  const { settings, products, dataMode } = useStore();
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
  const [batchQuantities, setBatchQuantities] = useState<Record<string, string>>({});
  const [transferSearch, setTransferSearch] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [onlySelected, setOnlySelected] = useState(false);
  const [transferResult, setTransferResult] = useState<{ products: number; units: number; from: string; to: string } | null>(null);
  const [transferError, setTransferError] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [transferOpen, setTransferOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [locationView, setLocationView] = useState<'all' | 'vehicle'>('all');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [salesToday, setSalesToday] = useState<Array<{ product_id: string; net_sold: number }> | null>(null);
  const transferSectionRef = useRef<HTMLElement>(null);
  const balanceSectionRef = useRef<HTMLElement>(null);
  const fromIdRef = useRef('');
  const previousStoreId = useRef(settings.id);
  const activeStoreId = useRef(settings.id);
  activeStoreId.current = settings.id;
  const adjustSectionRef = useRef<HTMLElement>(null);
  const adjustmentKeys = useRef(new Map<string, string>());
  const batchKeys = useRef(new Map<string, string>());
  const batchInFlight = useRef(false);
  useEffect(() => { fromIdRef.current = fromId; }, [fromId]);
  useEffect(() => {
    if (previousStoreId.current !== settings.id) {
      previousStoreId.current = settings.id;
      fromIdRef.current = '';
      setFromId(''); setToId(''); setLocations([]); setBalances([]); setLoading(true);
      setSelectedLocationId(''); setProductId(''); setLocationId(''); setPickupStockId(''); setPickupPoints([]);
      setProductQuery(''); setTransferOpen(false); setAdjustOpen(false); setQuantity('');
      adjustmentKeys.current.clear();
    }
    setBatchQuantities({});
    setTransferResult(null);
    setTransferError('');
    batchKeys.current.clear();
  }, [settings.id]);
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
  const locationStock = useMemo(() => new Map(balances.filter((row) => row.location_id === fromId).map((row) => [row.product_id, row])), [balances, fromId]);
  const destinationStock = useMemo(() => new Map(balances.filter((row) => row.location_id === toId).map((row) => [row.product_id, row])), [balances, toId]);
  const availableAtOrigin = (productId: string) => {
    const balance = locationStock.get(productId);
    return Math.max(0, (balance?.stock_quantity || 0) - (balance?.stock_reserved_quantity || 0));
  };
  const transferRows = trackedProducts.map((product) => {
    const raw = batchQuantities[product.id]?.trim() || '';
    const quantity = Number(raw);
    const available = availableAtOrigin(product.id);
    const invalid = Boolean(raw && (quantity < 0 || !Number.isInteger(quantity) || quantity > available));
    return { product, raw, quantity, available, invalid };
  });
  const batchItems = transferRows.filter((row) => row.raw && row.quantity > 0 && !row.invalid).map((row) => ({ product_id: row.product.id, quantity: row.quantity }));
  const unitsToTransfer = batchItems.reduce((sum, item) => sum + item.quantity, 0);
  const invalidTransferRows = transferRows.filter((row) => row.invalid);
  const visibleTransferRows = transferRows.filter((row) =>
    (!onlySelected || Boolean(row.raw && row.quantity !== 0)) &&
    (!onlyAvailable || row.available > 0 || Boolean(row.raw)) &&
    row.product.name.toLocaleLowerCase('pt-BR').includes(transferSearch.trim().toLocaleLowerCase('pt-BR')));
  const canBatchTransfer = Boolean(fromId && toId && fromId !== toId && activeLocations.some((item) => item.id === fromId) && activeLocations.some((item) => item.id === toId) && batchItems.length && batchItems.length <= 50 && !invalidTransferRows.length);
  const refresh = useCallback(async () => {
    setError('');
    try {
      const [nextLocations, nextBalances] = await stockLocationsApi.list(settings.id);
      if (activeStoreId.current !== settings.id) return;
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
      if (activeStoreId.current !== settings.id) return;
      setPickupPoints(points);
      setPickupStockId((current) => current || nextLocations.find((item) => item.is_default)?.id || '');
      setLocationId((current) => current || nextLocations.find((item) => item.is_default)?.id || nextLocations[0]?.id || '');
      let lastPair: { from?: string; to?: string } = {};
      try { lastPair = JSON.parse(localStorage.getItem(`food_stock_transfer_pair:${settings.id}`) || '{}') as typeof lastPair; } catch { /* preferência opcional */ }
      const active = nextLocations.filter((item) => item.active);
      const fallbackFrom = active.find((item) => item.is_default)?.id || active[0]?.id || '';
      const nextFrom = active.some((item) => item.id === fromIdRef.current) ? fromIdRef.current : active.some((item) => item.id === lastPair.from) ? lastPair.from || '' : fallbackFrom;
      setFromId(nextFrom);
      setToId((current) => active.some((item) => item.id === current) && current !== nextFrom ? current : active.some((item) => item.id === lastPair.to) && lastPair.to !== nextFrom ? lastPair.to || '' : active.find((item) => item.id !== nextFrom)?.id || '');
      setProductId((current) => current || trackedProducts[0]?.id || '');
    } catch (cause) {
      if (activeStoreId.current !== settings.id) return;
      const message = cause instanceof Error ? cause.message : 'Não foi possível carregar os locais de estoque.';
      setError(message);
    } finally { if (activeStoreId.current === settings.id) setLoading(false); }
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
    setTransferOpen(true);
    setFromId(location.id);
    setToId((current) => destinationId && destinationId !== location.id ? destinationId : current && current !== location.id && activeLocations.some((item) => item.id === current) ? current : activeLocations.find((item) => item.id !== location.id)?.id || '');
    setBatchQuantities((current) => ({ ...current, [product.id]: current[product.id] || '' }));
    setTransferResult(null);
    setTransferError('');
    setOnlySelected(false);
    setTransferSearch('');
    requestAnimationFrame(() => transferSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    requestAnimationFrame(() => document.getElementById(`stock-transfer-${product.id}`)?.focus({ preventScroll: true }));
  };
  const startQuickAdjust = (product: Product, location: StockLocation, mode: 'add' | 'remove' | 'set') => {
    setAdjustOpen(true);
    setProductId(product.id);
    setLocationId(location.id);
    setAdjustMode(mode);
    setQuantity('');
    requestAnimationFrame(() => adjustSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
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
    const product = trackedProducts.find((item) => item.id === productId);
    const location = activeLocations.find((item) => item.id === locationId);
    if (!product || !location || saving) return;
    const balance = balances.find((item) => item.product_id === productId && item.location_id === locationId);
    const before = balance?.stock_quantity || 0;
    const after = adjustMode === 'set' ? value : before + (adjustMode === 'add' ? value : -value);
    if (after < 0) { showToast('O estoque físico não pode ser negativo.', 'error'); return; }
    if (!window.confirm(`Confirmar ajuste de estoque?\nLocal: ${location.name}\nProduto: ${product.name}\n${adjustMode === 'set' ? 'Definir físico' : adjustMode === 'add' ? 'Adicionar' : 'Remover'}: ${value} unidade(s)\nFísico: ${before} → ${after}\nReservado: ${-(balance?.stock_reserved_quantity || 0)} (preservado)\nO servidor revalida o saldo antes de salvar.`)) return;
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
  const submitBatchTransfer = async (event: FormEvent) => {
    event.preventDefault();
    if (!canBatchTransfer || batchInFlight.current) return;
    if (!window.confirm(`Confirmar transferência?\nOrigem: ${activeLocations.find((item) => item.id === fromId)?.name}\nDestino: ${activeLocations.find((item) => item.id === toId)?.name}\n${batchItems.map((item) => `${trackedProducts.find((product) => product.id === item.product_id)?.name}: ${item.quantity} unidade(s)`).join('\n')}\nTotal: ${unitsToTransfer} unidade(s). As reservas permanecem na origem.`)) return;
    batchInFlight.current = true;
    setTransferError('');
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
      try { localStorage.setItem(`food_stock_transfer_pair:${settings.id}`, JSON.stringify({ from: fromId, to: toId })); } catch { /* preferência opcional */ }
      setTransferResult({ products: batchItems.length, units: unitsToTransfer, from: activeLocations.find((item) => item.id === fromId)?.name || 'Origem', to: activeLocations.find((item) => item.id === toId)?.name || 'Destino' });
      showToast('Transferência concluída.', 'success');
      await refresh();
    } catch (cause) {
      const missingRpc = cause instanceof SupabaseHttpError && /PGRST202|schema cache|Could not find the function/i.test(`${cause.message} ${cause.details || ''}`);
      const message = missingRpc
        ? 'Transferência indisponível neste ambiente. Seus dados foram mantidos para tentar novamente após a atualização.'
        : cause instanceof TypeError
          ? 'A conexão foi interrompida. Seus dados foram mantidos; tente novamente para confirmar a mesma operação.'
          : cause instanceof Error ? cause.message : 'Não foi possível transferir. Seus dados foram mantidos.';
      setTransferError(message);
      showToast(message, 'error');
    } finally { batchInFlight.current = false; setSaving(false); }
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
  if(multiLocation === false) return <section className="admin-page"><header className="page-header"><div><span className="eyebrow">ESTOQUE OPCIONAL</span><h1>Múltiplos locais</h1><p>Sua loja começa com um estoque principal. Use Produtos e insumos nesta mesma área para adicionar, remover ou definir quantidades.</p></div></header><section className="admin-card"><h2>Precisa separar estoques?</h2><p>Ative quando quiser controlar depósitos, pontos de retirada e transferências. Os saldos atuais continuam no local principal.</p><button type="button" className="primary-button" disabled={changingMode} onClick={()=>void (async()=>{setChangingMode(true);try{await stockModeApi.set(settings.id,true);await reloadMode();showToast('Múltiplos locais ativados.','success');}catch(cause){showToast(cause instanceof Error?cause.message:'Não foi possível ativar.','error');}finally{setChangingMode(false);}})()}>{changingMode?'Ativando...':'Ativar múltiplos locais'}</button></section></section>;
  if (error && !locations.length) return <ErrorState message={error || "Locais indisponíveis."} onRetry={() => void refresh()} />;
  return <section className="admin-page stock-locations-page">
    {modeError&&<div role="alert" className="inline-alert inline-alert-error">A configuração opcional ainda não foi implantada neste ambiente. {modeError}</div>}

    <header className="page-header"><div><span className="eyebrow">ESTOQUE</span><h1>Estoque e locais</h1><p>Consulte saldos, ajuste quantidades e transfira produtos com registro de operação.</p></div>
      <button className="secondary-button" onClick={() => void refresh()} disabled={saving}><RefreshCw size={16}/> Atualizar</button></header>
    {error && <div className="inline-alert inline-alert-error">{error}</div>}
    <section className="admin-card stock-location-workspace" ref={balanceSectionRef} aria-label="Visão dos locais">
      <div className="stock-location-tabs" role="group" aria-label="Tipo de local">
        <button type="button" className={locationView === 'all' ? 'is-active' : ''} aria-pressed={locationView === 'all'} onClick={() => { setLocationView('all'); setSelectedLocationId(''); }}>Meus locais</button>
        <button type="button" className={locationView === 'vehicle' ? 'is-active' : ''} aria-pressed={locationView === 'vehicle'} onClick={() => { setLocationView('vehicle'); setSelectedLocationId(''); }}>Minha carga</button>
      </div>
      <div className="stock-location-workspace__heading"><div><h2>{locationView === 'vehicle' ? 'Carga móvel' : 'Estoque por local'}</h2><p>{locationView === 'vehicle' ? 'Selecione uma carga móvel para consultar os saldos. Os locais ainda não são vinculados a usuários.' : 'Escolha o local antes de consultar ou movimentar produtos.'}</p></div>
        {visibleLocations.length > 0 && <label>Local<select className="stock-location-picker" value={selectedLocation?.id || ''} onChange={(event) => setSelectedLocationId(event.target.value)}>{visibleLocations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}</div>
      {!selectedLocation ? <p className="stock-location-empty">{locationView === 'vehicle' ? 'Nenhuma carga móvel ativa cadastrada.' : 'Nenhum local ativo cadastrado.'}</p> : <>
        <div className="stock-location-current" role="status"><MapPin size={18}/><div><strong>{selectedLocation.name}</strong><small>{pickupPoints.filter((point) => point.stock_location_id === selectedLocation.id).map((point) => point.name).join(' · ') || (selectedLocation.is_default ? 'Estoque principal da loja' : 'Local de estoque')}{!selectedLocation.active ? ' · Inativo' : ''}</small></div></div>
        <div className="stock-location-summary"><span><strong>{selectedBalances.reduce((sum, item) => sum + item.stock_quantity - item.stock_reserved_quantity, 0)}</strong> disponíveis</span><span><strong>{selectedBalances.reduce((sum, item) => sum - item.stock_reserved_quantity, 0)}</strong> reservadas</span><span><strong>{selectedBalances.reduce((sum, item) => sum + item.stock_quantity, 0)}</strong> total físico</span></div>
        <label className="stock-location-search">Buscar no local<input type="search" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Nome do produto"/></label>
        <div className="stock-location-list">{trackedProducts.filter((product) => product.name.toLocaleLowerCase('pt-BR').includes(productQuery.trim().toLocaleLowerCase('pt-BR'))).map((product) => {
          const balance = balanceFor(product, selectedLocation);
          const physical = balance?.stock_quantity || 0;
          const reserved = balance?.stock_reserved_quantity || 0;
          const available = physical - reserved;
          const home = activeLocations.find((item) => item.is_default);
          return <article key={product.id} className="stock-location-product">
            <div className="stock-location-product__overview"><strong>{product.name}</strong><span className={available < 0 ? 'stock-location-shortage' : available === 0 ? 'stock-location-unavailable' : ''}>{available} {available === 1 ? 'disponível' : 'disponíveis'}</span></div>
            {available < 0 && <p className="stock-location-inconsistency" role="alert">Repor {-available} unidade(s) para atender às reservas.</p>}
            <details className="stock-location-product__details"><summary>Detalhes e ações</summary><p>{physical} total físico · {-reserved} reservado(s)</p>
              {locationView === 'vehicle' && <p>{salesToday === null ? 'Vendas de hoje: consultando ou indisponíveis' : `Vendido hoje: ${salesToday.find((row) => row.product_id === product.id)?.net_sold || 0}`}</p>}
              <div className="stock-location-product__action"><button type="button" className="secondary-button" disabled={saving} onClick={() => startQuickAdjust(product, selectedLocation, 'add')}>Adicionar</button><button type="button" className="secondary-button" disabled={saving || physical < 1} onClick={() => startQuickAdjust(product, selectedLocation, 'remove')}>Remover</button><button type="button" className="secondary-button" disabled={saving} onClick={() => startQuickAdjust(product, selectedLocation, 'set')}>Definir</button>{locationView === 'vehicle' && home && home.id !== selectedLocation.id && <button type="button" className="secondary-button" disabled={saving} onClick={() => startQuickTransfer(product, home, selectedLocation.id)}>Repor</button>}<button type="button" className="secondary-button" disabled={saving || available < 1 || activeLocations.length < 2} onClick={() => startQuickTransfer(product, selectedLocation, home?.id)}>{locationView === 'vehicle' && home && home.id !== selectedLocation.id ? 'Devolver' : 'Transferir'}</button></div>
              <details className="stock-location-product__other"><summary>Este produto em outros locais</summary><ul>{locations.filter((location) => location.id !== selectedLocation.id).map((location) => { const other = balanceFor(product, location); return <li key={location.id}><strong>{location.name}{!location.active ? ' (inativo)' : ''}</strong><span>{(other?.stock_quantity || 0) - (other?.stock_reserved_quantity || 0)} disponíveis · {-(other?.stock_reserved_quantity || 0)} reservado(s) · {other?.stock_quantity || 0} físico</span></li>; })}</ul></details>
            </details>
          </article>;
        })}</div>
        {trackedProducts.length > 0 && !trackedProducts.some((product) => product.name.toLocaleLowerCase('pt-BR').includes(productQuery.trim().toLocaleLowerCase('pt-BR'))) && <p className="stock-location-empty">Nenhum produto encontrado. Tente outro nome.</p>}
        {!trackedProducts.length && <p className="stock-location-empty">Ative o controle de estoque em um produto para ver os saldos.</p>}
      </>}
    </section>
    {trackedProducts.length > 0 && <section className="admin-card stock-transfer-panel" ref={transferSectionRef} aria-labelledby="stock-transfer-heading">
      <details open={transferOpen} onToggle={(event) => setTransferOpen(event.currentTarget.open)}><summary className="stock-operation-heading"><div className="stock-transfer-panel__heading"><div><span className="eyebrow">MOVIMENTAÇÃO</span><h2 id="stock-transfer-heading">Transferir estoque</h2><p>{activeLocations.find((item) => item.id === fromId)?.name || 'Origem'} → {activeLocations.find((item) => item.id === toId)?.name || 'Destino'}</p></div></div>
      </summary>
      {transferResult && <div className="stock-transfer-success" role="status"><strong>Transferência concluída</strong><span>{transferResult.units} {transferResult.units === 1 ? 'unidade transferida' : 'unidades transferidas'} em {transferResult.products} {transferResult.products === 1 ? 'produto' : 'produtos'}, de {transferResult.from} para {transferResult.to}.</span><button type="button" onClick={() => balanceSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Ver saldos atualizados</button><button type="button" onClick={() => { setTransferResult(null); transferSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>Realizar outra transferência</button></div>}
      <form className="stock-transfer-form" onSubmit={submitBatchTransfer}>
        <div className="stock-transfer-route">
          <label>Origem<select value={fromId} onChange={(event) => { const next = event.target.value; setFromId(next); setTransferResult(null); if (toId === next) setToId(activeLocations.find((item) => item.id !== next)?.id || ''); }} disabled={saving}>{activeLocations.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <button type="button" className="stock-transfer-swap" aria-label="Inverter origem e destino" title="Inverter locais" onClick={() => { setFromId(toId); setToId(fromId); setTransferResult(null); }} disabled={saving || !fromId || !toId}><ArrowLeftRight size={18}/></button>
          <label>Destino<select value={toId} onChange={(event) => { setToId(event.target.value); setTransferResult(null); }} disabled={saving}>{activeLocations.filter((item) => item.id !== fromId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        </div>
        {activeLocations.length < 2 && <p className="stock-transfer-empty">Cadastre outro local ativo para fazer transferências.</p>}
        <div className="stock-transfer-tools">
          <label className="stock-transfer-search"><Search size={17}/><span className="sr-only">Buscar produtos</span><input type="search" value={transferSearch} placeholder="Buscar produtos" aria-label="Buscar produtos" onChange={(event) => setTransferSearch(event.target.value)}/></label>
          <label className="stock-transfer-check"><input type="checkbox" checked={onlyAvailable} onChange={(event) => setOnlyAvailable(event.target.checked)}/> Disponíveis</label>
          <label className="stock-transfer-check"><input type="checkbox" checked={onlySelected} onChange={(event) => setOnlySelected(event.target.checked)}/> Selecionados</label>
          <button type="button" className="stock-transfer-clear" disabled={saving || !Object.values(batchQuantities).some((value) => value.trim())} onClick={() => { setBatchQuantities({}); setTransferResult(null); }}>Limpar</button>
        </div>
        <div className="stock-transfer-list" role="group" aria-label="Produtos para transferência">
          {visibleTransferRows.length === 0 ? <p className="stock-transfer-empty">{trackedProducts.length === 0 ? 'Nenhum produto com controle de estoque ativo.' : onlySelected ? 'Nenhum produto selecionado.' : 'Nenhum produto encontrado neste local.'}</p> : visibleTransferRows.map(({ product, raw, quantity: selectedQuantity, available, invalid }) => <div className={`stock-transfer-row${selectedQuantity > 0 ? ' is-selected' : ''}`} key={product.id}>
            <label className="stock-transfer-row__name" htmlFor={`stock-transfer-${product.id}`}><strong>{product.name}</strong><small>{available} {available === 1 ? 'disponível' : 'disponíveis'} na origem</small>{invalid && <small className="stock-transfer-row__error">Disponível: {available}. Ajuste a quantidade.</small>}</label>
            <span className="stock-transfer-row__controls"><input id={`stock-transfer-${product.id}`} type="number" min="0" max={available} step="1" inputMode="numeric" value={raw} aria-label={`Quantidade de ${product.name} para transferência`} aria-invalid={invalid} onChange={(event) => { setBatchQuantities((current) => ({ ...current, [product.id]: event.target.value })); setTransferResult(null); }} placeholder="0" disabled={saving || (available < 1 && !raw)}/><button type="button" className="stock-transfer-max" onClick={() => { setBatchQuantities((current) => ({ ...current, [product.id]: String(available) })); setTransferResult(null); }} disabled={saving || available < 1} aria-label={`Usar máximo disponível de ${product.name}`}>Máx.</button></span>
          </div>)}
        </div>
        <details className="stock-transfer-preview"><summary>Mais opções</summary><div><strong>Prévia dos saldos</strong>{batchItems.length ? batchItems.map((item) => { const product = trackedProducts.find((row) => row.id === item.product_id); const source = locationStock.get(item.product_id)?.stock_quantity || 0; const destination = destinationStock.get(item.product_id)?.stock_quantity || 0; return <p key={item.product_id}><strong>{product?.name}</strong><span>{activeLocations.find((row) => row.id === fromId)?.name}: {source} → {source - item.quantity}</span><span>{activeLocations.find((row) => row.id === toId)?.name}: {destination} → {destination + item.quantity}</span></p>; }) : <p>Informe uma quantidade para conferir os saldos.</p>}</div></details>
        {transferError && <p className="stock-transfer-error" role="alert">{transferError}</p>}
        <div className="stock-transfer-footer"><p role="status"><strong>{batchItems.length} {batchItems.length === 1 ? 'produto' : 'produtos'}</strong> · {unitsToTransfer} {unitsToTransfer === 1 ? 'unidade' : 'unidades'}</p>{invalidTransferRows.length > 0 && <small role="alert">Revise {invalidTransferRows.length} {invalidTransferRows.length === 1 ? 'quantidade' : 'quantidades'} antes de transferir.</small>}{batchItems.length > 50 && <small role="alert">Selecione até 50 produtos por transferência.</small>}<button className="primary-button" disabled={saving || !canBatchTransfer}><ArrowLeftRight size={17}/> {saving ? 'Transferindo…' : `Transferir ${unitsToTransfer} ${unitsToTransfer === 1 ? 'unidade' : 'unidades'}`}</button></div>
      </form>
      </details>
    </section>}
    <details className="stock-location-settings"><summary className="admin-card stock-operation-heading"><strong>Gerenciar locais e pontos de retirada</strong><small>Cadastro, links, QR Codes e preferência de estoque</small></summary>
    <section className="admin-card">
      <div className="section-heading"><div><h2>Locais cadastrados</h2><p>O estoque existente foi preservado no local principal.</p></div><Warehouse size={20}/></div>
      <div className="stock-location-grid">{locations.map((location) => <article className="stock-location-card stock-location-card--manage" key={location.id}>
        <div className="stock-location-card__icon"><MapPin size={18}/></div><div><strong>{location.name}</strong><p>{location.is_default ? 'Principal' : location.location_type === 'vehicle' ? 'Carga móvel' : location.location_type === 'pickup' ? 'Retirada' : 'Local secundário'}{!location.active ? ' · Inativo' : ''}</p><p>{balances.filter((balance) => balance.location_id === location.id && balance.stock_quantity > 0).length} produtos · {balances.filter((balance) => balance.location_id === location.id).reduce((sum, balance) => sum + balance.stock_quantity - balance.stock_reserved_quantity, 0)} disponíveis</p><button type="button" className="stock-location-manage-button" disabled={saving} onClick={() => { setEditingLocationId(editingLocationId === location.id ? '' : location.id); setEditingLocationName(location.name); }}>Gerenciar</button></div>
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
    {multiLocation===true&&<section className="admin-card"><h2>Voltar ao estoque simples</h2><p>Você pode ocultar estes controles quando não houver saldo ou reservas em locais secundários e nenhum ponto ativo associado a eles. Nenhum local ou histórico será excluído.</p><button type="button" className="secondary-button" disabled={changingMode||saving} onClick={()=>void (async()=>{setChangingMode(true);try{await stockModeApi.set(settings.id,false);await reloadMode();showToast('Estoque simples ativado.','success');}catch(cause){showToast(cause instanceof Error?cause.message:'Transfira os saldos antes de simplificar.','error');}finally{setChangingMode(false);}})()}>Usar estoque simples</button></section>}
    </details>
    <details className="admin-card stock-location-matrix"><summary className="stock-operation-heading"><strong>Comparar todos os locais</strong><small>Visão detalhada por produto e local</small></summary>
      <div className="section-heading"><div><h2>Saldo por produto e local</h2><p>O saldo geral continua sincronizado com a soma dos locais.</p></div><Boxes size={20}/></div>
      {!trackedProducts.length ? <p className="empty-state">Ative o controle de estoque em um produto para começar.</p> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Produto</th>{locations.map((location) => <th key={location.id}>{location.name}</th>)}</tr></thead><tbody>
        {trackedProducts.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><small>Geral: {balances.filter((item) => item.product_id === product.id).reduce((sum, item) => sum + item.stock_quantity, 0)}</small></td>{locations.map((location) => { const balance = balanceFor(product, location); return <td key={location.id}>{balance ? <><strong>{balance.stock_quantity}</strong><small>Disponível: {balance.stock_quantity-balance.stock_reserved_quantity}</small></> : <span>0</span>}</td>; })}</tr>)}
      </tbody></table></div>}
    </details>
    <div className="stock-location-actions">
      <section className="admin-card" ref={adjustSectionRef}><details open={adjustOpen} onToggle={(event) => setAdjustOpen(event.currentTarget.open)}><summary className="stock-operation-heading"><strong>Ajustar saldo</strong><small>Adicionar, remover ou definir a quantidade em um local</small></summary><p>Escolha a ação e o local. O histórico é registrado automaticamente.</p>
        <form className="stock-location-form" onSubmit={submitAdjustment}>
          <label>Produto<select value={productId} onChange={(event) => setProductId(event.target.value)}>{trackedProducts.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label>
          <label>Local<select value={locationId} onChange={(event) => setLocationId(event.target.value)}>{locations.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>Ação<select value={adjustMode} onChange={(event) => { setAdjustMode(event.target.value as 'add' | 'remove' | 'set'); setQuantity(''); }}><option value="add">Adicionar</option><option value="remove">Remover</option><option value="set">Definir quantidade física</option></select></label>
          <label>Quantidade<input inputMode="numeric" type="number" min={adjustMode === 'set' ? 0 : 1} step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required/></label>
          <button className="primary-button" disabled={saving || !selectedProduct || !quantity.trim()}>{saving ? <LoaderCircle size={16} className="spin"/> : null} Salvar no local selecionado</button>
        </form>
      </details></section>
    </div>
    <ReceiptContactsSettings key={settings.id} storeId={settings.id} demo={dataMode==='demo'}/>
  </section>;
}
