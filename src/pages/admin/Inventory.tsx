import { AlertTriangle, Bell, Boxes, CheckCircle2, ClipboardList, Download, Edit3, Filter, Layers3, Minus, Package, Plus, RotateCcw, Search, ShoppingCart, Sparkles, Trash2, TrendingDown, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ErrorState, LoadingState } from '../../components/ui/AsyncState';
import { FloatingSaveBar } from '../../components/admin/FloatingSaveBar';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import { inventoryApi, inventoryLabels, inventoryUnitLabels } from '../../services/inventoryApi';
import { showPwaNotification } from '../../services/pwaNotifications';
import type { InventoryItem, InventoryItemType, InventoryMovement, InventoryUnit, Product, ProductRecipe, ProductRecipeItem } from '../../types';
import { currency } from '../../utils/format';
import { downloadCsv } from '../../utils/exportCsv';
import { createId } from '../../utils/id';

type InventoryFilter = 'all' | 'low' | 'zero';
type InventorySort = 'priority' | 'name' | 'value';
const kindOptions: Array<{ value: InventoryItemType; label: string }> = [
  { value: 'ingredient', label: 'Ingrediente' }, { value: 'packaging', label: 'Embalagem' },
  { value: 'operating', label: 'Material operacional' }, { value: 'other', label: 'Outro' },
];
const unitOptions: Array<{ value: InventoryUnit; label: string }> = [
  { value: 'un', label: 'Unidade' }, { value: 'pack', label: 'Pacote' }, { value: 'g', label: 'Gramas' },
  { value: 'kg', label: 'Quilos' }, { value: 'ml', label: 'Mililitros' }, { value: 'l', label: 'Litros' },
];
const stepForUnit = (unit: InventoryUnit) => unit === 'un' || unit === 'pack' ? 1 : unit === 'g' || unit === 'ml' ? 10 : 0.05;
const formatQuantity = (value: number, unit: InventoryUnit) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: unit === 'un' || unit === 'pack' ? 0 : 2 }).format(value)} ${inventoryUnitLabels[unit]}`;
const unitFamily = (unit: InventoryUnit) => unit === 'g' || unit === 'kg' ? 'mass' : unit === 'ml' || unit === 'l' ? 'volume' : unit === 'un' || unit === 'pack' ? unit : 'other';
const toBaseQuantity = (quantity: number, unit: InventoryUnit) => unit === 'g' || unit === 'ml' ? quantity / 1000 : quantity;
const fromBaseQuantity = (quantity: number, unit: InventoryUnit) => unit === 'g' || unit === 'ml' ? quantity * 1000 : quantity;
const convertQuantity = (quantity: number, from: InventoryUnit, to: InventoryUnit) => unitFamily(from) === unitFamily(to) ? fromBaseQuantity(toBaseQuantity(quantity, from), to) : null;
type BatchPurchaseLine = { inventoryItemId: string; quantity: string; totalCost: string };

function ProductStockCard({ product, onAdjust, onSet, busy }: { product: Product; onAdjust: (product: Product, delta: number, reason?: string) => void; onSet: (product: Product, quantity: number, reason: string) => void; busy: boolean }) {
  const quantity = Math.max(0, Number(product.stockQuantity || 0)); const reserved = Math.max(0, Number(product.stockReservedQuantity || 0)); const available = Math.max(0, quantity - reserved);
  const low = product.trackStock && available <= 3 && available > 0; const zero = product.trackStock && available <= 0;
  const [draft, setDraft] = useState(String(quantity)); const [reason, setReason] = useState('Conferência física'); const [adjustmentDraft, setAdjustmentDraft] = useState('1');
  useEffect(() => setDraft(String(quantity)), [quantity]);
  const adjustmentQuantity = Number(adjustmentDraft);
  const adjustBy = (direction: -1 | 1) => { if (Number.isInteger(adjustmentQuantity) && adjustmentQuantity > 0) onAdjust(product, direction * adjustmentQuantity, `Ajuste rápido: ${direction > 0 ? 'entrada' : 'saída'} de ${adjustmentQuantity} unidade(s)`); };
  const saveCount = (event: FormEvent) => { event.preventDefault(); const value = Number(draft); if (!Number.isInteger(value) || value < reserved || !reason.trim()) return; onSet(product, value, reason.trim()); };
  return <article className="inventory-product-card"><div className="inventory-product-card__main"><div className="inventory-product-card__icon"><Package size={18} /></div><div><strong>{product.name}</strong><span>{quantity} físico · {reserved} reservado{reserved === 1 ? '' : 's'} · {product.active ? 'Publicado' : 'Oculto'}</span></div></div><div className="inventory-product-card__status"><b className={zero ? 'is-zero' : low ? 'is-low' : 'is-ok'}>{available}</b><small>disponíveis</small></div><div className="inventory-product-stock-actions"><form className="inventory-product-count-form" onSubmit={saveCount}><label>Definir físico<input aria-label={`Definir estoque físico de ${product.name}`} type="number" min={reserved} step="1" inputMode="numeric" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={busy} /></label><label>Motivo<input aria-label={`Motivo do ajuste de ${product.name}`} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={160} placeholder="Conferência, reposição..." disabled={busy} /></label><button type="submit" className="secondary-button compact-button" disabled={busy || !reason.trim() || !/^\d+$/.test(draft) || Number(draft) < reserved}>{busy ? 'Salvando…' : 'Definir'}</button></form><div className="inventory-product-adjust-control"><label>Adicionar/remover unidades<input aria-label={`Quantidade para ajuste rápido de ${product.name}`} type="number" min="1" step="1" inputMode="numeric" value={adjustmentDraft} onChange={(event) => setAdjustmentDraft(event.target.value)} disabled={busy} /></label><div className="inventory-stepper" aria-label={`Ajustar estoque de ${product.name}`}><button type="button" onClick={() => adjustBy(-1)} disabled={busy || !Number.isInteger(adjustmentQuantity) || adjustmentQuantity < 1 || quantity - adjustmentQuantity < reserved} aria-label={`Remover ${adjustmentQuantity} unidade(s) de ${product.name}`}><Minus size={16} /></button><span>{quantity}</span><button type="button" onClick={() => adjustBy(1)} disabled={busy || !Number.isInteger(adjustmentQuantity) || adjustmentQuantity < 1} aria-label={`Adicionar ${adjustmentQuantity} unidade(s) de ${product.name}`}><Plus size={16} /></button></div></div></div></article>;
}

export default function InventoryAdmin() {
  const { settings, products, updateProductStock, loading: storeLoading, error: storeError, reloadAdmin } = useStore(); const { showToast } = useToast();
  const stockOperationKeys = useRef(new Map<string, string>());
  const currentStoreId = useRef(settings.id);
  currentStoreId.current = settings.id;
  const loadedStoreId = useRef(settings.id);
  const inventoryRequest = useRef(0);
  const recipeRequest = useRef(0);
  const stockOperationKey = (productId: string, mode: 'set' | 'add' | 'remove', quantity: number) => {
    const intent = `${settings.id}:${productId}:${mode}:${quantity}`;
    const existing = stockOperationKeys.current.get(intent);
    if (existing) return { intent, key: existing };
    const key = createId();
    stockOperationKeys.current.set(intent, key);
    return { intent, key };
  };
  const [advanced, setAdvanced] = useState(false); const [items, setItems] = useState<InventoryItem[]>([]); const [recipes, setRecipes] = useState<ProductRecipe[]>([]); const [recipeItems, setRecipeItems] = useState<ProductRecipeItem[]>([]); const [movements, setMovements] = useState<InventoryMovement[]>([]); const [loading, setLoading] = useState(false); const [inventoryError, setInventoryError] = useState(''); const [query, setQuery] = useState(''); const [filter, setFilter] = useState<InventoryFilter>('all'); const [kindFilter, setKindFilter] = useState<'all' | InventoryItemType>('all'); const [sort, setSort] = useState<InventorySort>('priority'); const [showArchived, setShowArchived] = useState(false); const [busyId, setBusyId] = useState(''); const [showNew, setShowNew] = useState(false); const [purchaseId, setPurchaseId] = useState(''); const [purchaseQuantity, setPurchaseQuantity] = useState(''); const [purchaseCost, setPurchaseCost] = useState(''); const [showBatchPurchase, setShowBatchPurchase] = useState(false); const [batchPurchaseLines, setBatchPurchaseLines] = useState<BatchPurchaseLine[]>([]); const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({}); const [editingItemId, setEditingItemId] = useState(''); const [detailItemId, setDetailItemId] = useState(''); const [editingName, setEditingName] = useState(''); const [editingItemType, setEditingItemType] = useState<InventoryItemType>('ingredient'); const [editingUnit, setEditingUnit] = useState<InventoryUnit>('kg'); const [editingReorderPoint, setEditingReorderPoint] = useState(''); const [editingNotes, setEditingNotes] = useState(''); const [editingAlert, setEditingAlert] = useState(true); const [recipeProductId, setRecipeProductId] = useState(''); const [recipeYield, setRecipeYield] = useState('1'); const [recipeYieldUnit, setRecipeYieldUnit] = useState<InventoryUnit>('un'); const [recipeLines, setRecipeLines] = useState<Array<{ inventoryItemId: string; stage: string; quantity: string; unit: InventoryUnit; wastePercent: string }>>([]);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const loadItems = async () => {
    const storeId = settings.id;
    if (currentStoreId.current !== storeId) return;
    const request = ++inventoryRequest.current;
    const isCurrent = () => inventoryRequest.current === request && currentStoreId.current === storeId;
    setLoading(true); setInventoryError('');
    try {
      const [loadedItems, loadedRecipes, loadedMovements] = await Promise.all([
        inventoryApi.listItems(storeId, true), inventoryApi.listRecipes(storeId), inventoryApi.listMovements(storeId, 300),
      ]);
      const loadedRecipeItems = loadedRecipes.length ? await inventoryApi.listAllRecipeItems(storeId) : [];
      if (!isCurrent()) return;
      setItems(loadedItems);
      setQuantityDrafts(Object.fromEntries(loadedItems.map((item) => [item.id, String(item.currentQuantity)])));
      setRecipes(loadedRecipes); setRecipeItems(loadedRecipeItems); setMovements(loadedMovements);
    } catch (err) {
      if (!isCurrent()) return;
      const message = err instanceof Error ? err.message : 'Não foi possível carregar os insumos.';
      setInventoryError(message); showToast(message, 'error');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  };
  useEffect(() => {
    if (loadedStoreId.current !== settings.id) {
      loadedStoreId.current = settings.id;
      inventoryRequest.current++; recipeRequest.current++;
      setItems([]); setRecipes([]); setRecipeItems([]); setMovements([]); setQuantityDrafts({});
      setRecipeProductId(''); setRecipeLines([]); setRecipeLoading(false); setDetailItemId('');
      setInventoryError(''); setLoading(false);
    }
    if (advanced) void loadItems();
    else setRecipeLoading(false);
    return () => { inventoryRequest.current++; recipeRequest.current++; };
  }, [settings.id, advanced]);
  const [recipePreviewQuantity, setRecipePreviewQuantity] = useState('20');
  const activeItems = useMemo(() => items.filter((item) => item.active), [items]);
  const detailItem = useMemo(() => items.find((item) => item.id === detailItemId), [detailItemId, items]);
  const filteredItems = useMemo(() => { const term = query.trim().toLowerCase(); const priority = (item: InventoryItem) => item.currentQuantity <= 0 ? 0 : item.currentQuantity <= item.reorderPoint ? 1 : item.averageUnitCost <= 0 ? 2 : 3; return items.filter((item) => { const matchesActive = showArchived ? !item.active : item.active; const matchesQuery = !term || `${item.name} ${inventoryLabels[item.itemType]}`.toLowerCase().includes(term); const matchesKind = kindFilter === 'all' || item.itemType === kindFilter; const matchesStock = filter === 'all' || (filter === 'zero' ? item.currentQuantity <= 0 : item.currentQuantity > 0 && item.currentQuantity <= item.reorderPoint); return matchesActive && matchesQuery && matchesKind && matchesStock; }).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'pt-BR') : sort === 'value' ? (b.currentQuantity * b.averageUnitCost) - (a.currentQuantity * a.averageUnitCost) || a.name.localeCompare(b.name, 'pt-BR') : priority(a) - priority(b) || a.name.localeCompare(b.name, 'pt-BR')); }, [filter, items, kindFilter, query, showArchived, sort]);
  const summary = useMemo(() => ({ total: activeItems.length, low: activeItems.filter((item) => item.currentQuantity > 0 && item.currentQuantity <= item.reorderPoint).length, zero: activeItems.filter((item) => item.currentQuantity <= 0).length, value: activeItems.reduce((total, item) => total + item.currentQuantity * item.averageUnitCost, 0) }), [activeItems]);
  const lowStockItems = useMemo(() => activeItems.filter((item) => item.lowStockAlertEnabled && item.currentQuantity <= item.reorderPoint), [activeItems]);
  const calibrationInsights = useMemo(() => activeItems.map((item) => { const itemMovements = movements.filter((movement) => movement.inventoryItemId === item.id); const counts = itemMovements.filter((movement) => movement.reason === 'Conferência de estoque real'); const consumed = itemMovements.filter((movement) => movement.movementType === 'consumption').reduce((total, movement) => total + Math.abs(Math.min(0, movement.quantityDelta)), 0); const correction = counts.reduce((total, movement) => total + movement.quantityDelta, 0); const deviationPercent = consumed > 0 ? correction / consumed * 100 : 0; return { item, countTotal: counts.length, consumed, correction, deviationPercent }; }).filter((entry) => entry.countTotal >= 3 && entry.consumed > 0 && Math.abs(entry.deviationPercent) >= 3).sort((a, b) => Math.abs(b.deviationPercent) - Math.abs(a.deviationPercent)), [activeItems, movements]);
  const productionInsights = useMemo(() => {
    const itemById = new Map(items.map((item) => [item.id, item]));
    return recipes.map((recipe) => {
      const product = products.find((entry) => entry.id === recipe.productId);
      const lines = recipeItems.filter((line) => line.recipeId === recipe.id);
      let totalCost = 0;
      let complete = lines.length > 0;
      for (const line of lines) {
        const item = itemById.get(line.inventoryItemId);
        const quantity = convertQuantity(line.quantity * (1 + Math.max(0, line.wastePercent) / 100), line.unit, item?.unit || line.unit);
        if (!item || quantity == null || !Number.isFinite(item.averageUnitCost) || item.averageUnitCost <= 0) { complete = false; continue; }
        totalCost += quantity * item.averageUnitCost;
      }
      const unitCost = recipe.yieldQuantity > 0 && complete ? totalCost / recipe.yieldQuantity : null;
      const price = product?.price ?? null;
      const margin = unitCost != null && price != null ? price - unitCost : null;
      return { recipe, product, unitCost, margin, marginPercent: margin != null && price ? (margin / price) * 100 : null, complete };
    }).filter((entry) => entry.product);
  }, [items, products, recipeItems, recipes]);
  const recipeConsumptionPreview = useMemo(() => {
    const quantity = Math.max(0, Number(recipePreviewQuantity) || 0);
    const yieldQuantity = Math.max(0.0001, Number(recipeYield) || 1);
    return recipeLines.map((line) => {
      const item = items.find((entry) => entry.id === line.inventoryItemId);
      const perBatch = Number(line.quantity) * (1 + Math.max(0, Number(line.wastePercent) || 0) / 100);
      const amount = perBatch * quantity / yieldQuantity;
      const converted = item ? convertQuantity(amount, line.unit, item.unit) : null;
      return { ...line, item, amount, converted, cost: converted != null && item ? converted * item.averageUnitCost : null };
    });
  }, [items, recipeLines, recipePreviewQuantity, recipeYield]);
  const purchaseSuggestions = useMemo(() => activeItems.filter((item) => item.lowStockAlertEnabled && item.currentQuantity <= item.reorderPoint).map((item) => ({ ...item, suggestedQuantity: Math.max(item.reorderPoint * 2 - item.currentQuantity, item.unit === 'un' || item.unit === 'pack' ? 1 : 0) })).sort((a, b) => (b.suggestedQuantity * b.averageUnitCost) - (a.suggestedQuantity * a.averageUnitCost)), [activeItems]);
  const exportInventory = () => {
    if (!filteredItems.length) { showToast('Não há insumos neste filtro para exportar.', 'error'); return; }
    downloadCsv(`estoque-${new Date().toISOString().slice(0, 10)}`, ['Insumo', 'Tipo', 'Unidade', 'Saldo atual', 'Estoque mínimo', 'Custo médio', 'Valor em estoque', 'Alerta', 'Status'], filteredItems.map((item) => [
      item.name, inventoryLabels[item.itemType], inventoryUnitLabels[item.unit], item.currentQuantity, item.reorderPoint,
      currency.format(item.averageUnitCost), currency.format(item.currentQuantity * item.averageUnitCost), item.lowStockAlertEnabled ? 'Ativo' : 'Pausado',
      item.currentQuantity <= 0 ? 'Zerado' : item.currentQuantity <= item.reorderPoint ? 'Baixo' : 'Saudável',
    ]));
    showToast(`${filteredItems.length} insumo${filteredItems.length === 1 ? '' : 's'} exportado${filteredItems.length === 1 ? '' : 's'}.`, 'success');
  };
  useEffect(() => {
    // Dispara somente na transição para estoque baixo para não poluir o PWA
    // a cada abertura ou atualização do painel.
    if (!settings.id || !settings.notificationsDesktopEnabled || !items.length) return;
    for (const item of items) {
      const key = `foodweb:low-stock-alert:${settings.id}:${item.id}`;
      const isLow = item.lowStockAlertEnabled && item.currentQuantity <= item.reorderPoint;
      if (!isLow) {
        try { window.localStorage.setItem(key, 'ok'); } catch { /* storage local indisponível */ }
        continue;
      }
      let previous = '';
      try { previous = window.localStorage.getItem(key) || ''; } catch { /* notifica nesta abertura */ }
      if (previous === 'low') continue;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') continue;
      try { window.localStorage.setItem(key, 'low'); } catch { /* não impede a notificação */ }
      void showPwaNotification('Estoque baixo', `${item.name}: ${formatQuantity(item.currentQuantity, item.unit)} · mínimo ${formatQuantity(item.reorderPoint, item.unit)}`, { tag: `low-stock:${settings.id}:${item.id}`, url: '/admin/estoque' });
    }
  }, [items, settings.id, settings.notificationsDesktopEnabled]);
  const trackedProducts = useMemo(() => products.filter((product) => product.trackStock), [products]); const productSummary = useMemo(() => ({ tracked: trackedProducts.length, zero: trackedProducts.filter((product) => Number(product.stockQuantity || 0) - Number(product.stockReservedQuantity || 0) <= 0).length }), [trackedProducts]);
  const adjustItem = async (item: InventoryItem, direction: number) => { const quantityDelta = direction * stepForUnit(item.unit); setBusyId(item.id); try { const result = await inventoryApi.adjust({ storeId: settings.id, inventoryItemId: item.id, quantityDelta, reason: direction > 0 ? 'Ajuste rápido de entrada' : 'Ajuste rápido de saída', movementType: direction > 0 ? 'adjustment_in' : 'adjustment_out' }); setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, currentQuantity: result.quantityAfter, averageUnitCost: result.averageUnitCost, updatedAt: new Date().toISOString() } : entry)); setQuantityDrafts((current) => ({ ...current, [item.id]: String(result.quantityAfter) })); } catch (err) { showToast(err instanceof Error ? err.message : 'Não foi possível ajustar o estoque.', 'error'); } finally { setBusyId(''); } };
  const pendingQuantityChanges = useMemo(() => items.filter((item) => {
    const draft = Number(quantityDrafts[item.id]);
    return Number.isFinite(draft) && Math.max(0, draft) !== Number(item.currentQuantity);
  }), [items, quantityDrafts]);
  const discardQuantityChanges = () => setQuantityDrafts(Object.fromEntries(items.map((item) => [item.id, String(item.currentQuantity)])));
  const saveQuantityChanges = async () => {
    if (!pendingQuantityChanges.length) return;
    setBusyId('inventory-stock-batch');
    try {
      await inventoryApi.commitPhysicalCount(settings.id, pendingQuantityChanges.map((item) => ({ inventoryItemId: item.id, countedQuantity: Math.max(0, Number(quantityDrafts[item.id])) })));
      await loadItems();
      showToast(`${pendingQuantityChanges.length} saldo${pendingQuantityChanges.length === 1 ? '' : 's'} conferido${pendingQuantityChanges.length === 1 ? '' : 's'} e recalibrado${pendingQuantityChanges.length === 1 ? '' : 's'}.`, 'success');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Não foi possível salvar os saldos do estoque.', 'error'); }
    finally { setBusyId(''); }
  };
  const adjustProduct = async (product: Product, delta: number, reason = 'Ajuste rápido de estoque') => {
    if (!product.trackStock) return;
    const currentQuantity = Math.max(0, Number(product.stockQuantity || 0));
    const reservedQuantity = Math.max(0, Number(product.stockReservedQuantity || 0));
    const nextQuantity = Math.max(0, currentQuantity + delta);
    // Nunca permita que o ajuste manual consuma unidades já reservadas por
    // pedidos pendentes. Isso evita saldo disponível negativo e mantém a
    // confirmação/cancelamento desses pedidos idempotente no banco.
    if (nextQuantity < reservedQuantity) {
      showToast(`Não é possível retirar esta unidade: ${reservedQuantity} já está(ão) reservada(s) para pedidos.`, 'error');
      return;
    }
    setBusyId(product.id);
    const mode = delta < 0 ? 'remove' : 'add'; const quantity = Math.abs(delta); const operation = stockOperationKey(product.id, mode, quantity);
    try {
      await updateProductStock(product.id, { mode, quantity, reason, idempotencyKey: operation.key });
      stockOperationKeys.current.delete(operation.intent);
      showToast(`Estoque de ${product.name} atualizado.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Não foi possível ajustar o estoque do produto.', 'error');
    } finally {
      setBusyId('');
    }
  };
  const setProductStock = async (product: Product, quantity: number, reason: string) => {
    if (!product.trackStock || !Number.isInteger(quantity) || quantity < Number(product.stockReservedQuantity || 0)) return;
    setBusyId(product.id);
    const operation = stockOperationKey(product.id, 'set', quantity);
    try { await updateProductStock(product.id, { mode: 'set', quantity, reason, idempotencyKey: operation.key }); stockOperationKeys.current.delete(operation.intent); showToast(`Estoque físico de ${product.name} definido para ${quantity}.`, 'success'); }
    catch (err) { showToast(err instanceof Error ? err.message : 'Não foi possível definir o estoque do produto.', 'error'); }
    finally { setBusyId(''); }
  };
  const saveNewItem = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); const name = String(data.get('name') || '').trim(); if (!name) { showToast('Informe o nome do insumo.', 'error'); return; } setBusyId('new'); try { const item = await inventoryApi.saveItem(settings.id, { name, itemType: String(data.get('itemType') || 'ingredient') as InventoryItemType, unit: String(data.get('unit') || 'kg') as InventoryUnit, reorderPoint: Number(data.get('reorderPoint') || 0), quantity: Number(data.get('currentQuantity') || 0), averageUnitCost: Number(data.get('averageUnitCost') || 0), lowStockAlertEnabled: data.get('lowStockAlertEnabled') !== 'false' }); setItems((current) => [item, ...current]); setShowNew(false); event.currentTarget.reset(); showToast('Insumo cadastrado.', 'success'); } catch (err) { showToast(err instanceof Error ? err.message : 'Não foi possível cadastrar o insumo.', 'error'); } finally { setBusyId(''); } };
  const startEditItem = (item: InventoryItem) => { setDetailItemId(item.id); setEditingName(item.name); setEditingItemType(item.itemType); setEditingUnit(item.unit); setEditingReorderPoint(String(item.reorderPoint)); setEditingNotes(item.notes || ''); setEditingAlert(item.lowStockAlertEnabled); window.requestAnimationFrame(() => document.getElementById('inventory-item-details')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })); };
  const cancelEditItem = () => { setEditingItemId(''); setDetailItemId(''); setEditingName(''); setEditingItemType('ingredient'); setEditingUnit('kg'); setEditingReorderPoint(''); setEditingNotes(''); setEditingAlert(true); };
  const changeEditingUnit = (next: InventoryUnit) => {
    if (next === editingUnit) return;
    if (editingReorderPoint.trim()) {
      const converted = convertQuantity(Number(editingReorderPoint), editingUnit, next);
      const rounded = converted == null ? NaN : Math.round(converted * 1000) / 1000;
      if (!Number.isFinite(rounded) || rounded < 0 || Math.abs(rounded - (converted ?? NaN)) > 1e-7) {
        showToast('A conversão do estoque mínimo perderia precisão. Revise a quantidade antes de trocar a unidade.', 'error');
        return;
      }
      setEditingReorderPoint(String(rounded));
    }
    setEditingUnit(next);
  };
  const saveEditItem = async (item: InventoryItem) => {
    if (busyId) return;
    const name = editingName.trim(); const reorderPoint = Number(editingReorderPoint);
    if (!name || !editingReorderPoint.trim() || !Number.isFinite(reorderPoint) || reorderPoint < 0) { showToast('Informe nome e estoque mínimo válidos.', 'error'); return; }
    if (editingUnit !== item.unit && !window.confirm(`Converter “${item.name}” de ${inventoryUnitLabels[item.unit]} para ${inventoryUnitLabels[editingUnit]}? O servidor converterá saldo, custo, movimentos, compras, ficha técnica e histórico. O estoque mínimo exibido (${editingReorderPoint} ${inventoryUnitLabels[editingUnit]}) já está na nova unidade.${recipeProductId ? ' A ficha técnica aberta será fechada; alterações não salvas nela serão descartadas.' : ''}`)) return;
    setBusyId(item.id);
    try {
      const updated = await inventoryApi.saveDetails(settings.id, item.id, { name, itemType: editingItemType, unit: editingUnit, reorderPoint, notes: editingNotes, lowStockAlertEnabled: editingAlert, active: item.active });
      setItems((current) => current.map((entry) => entry.id === item.id ? updated : entry));
      if (updated.unit !== item.unit) {
        setRecipeProductId(''); setRecipeLines([]); // Evita exibir uma ficha aberta com quantidades da unidade anterior.
        await loadItems();
      }
      cancelEditItem();
      showToast(updated.unit !== item.unit ? 'Unidade e detalhes atualizados. Reabra a ficha técnica para ver as quantidades convertidas.' : 'Detalhes do insumo atualizados.', 'success');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Não foi possível editar o insumo. Nenhuma alteração parcial foi aplicada.', 'error'); }
    finally { setBusyId(''); }
  };
  const archiveItem = async (item: InventoryItem) => { if (!window.confirm(`Arquivar o insumo “${item.name}”? O histórico e as fichas técnicas serão preservados.`)) return; setBusyId(item.id); try { const updated = await inventoryApi.archiveItem(settings.id, item.id); setItems((current) => current.map((entry) => entry.id === item.id ? updated : entry)); if (editingItemId === item.id || detailItemId === item.id) cancelEditItem(); showToast('Insumo arquivado. Você pode restaurá-lo em “Ver arquivados”.', 'success'); } catch (err) { showToast(err instanceof Error ? err.message : 'Não foi possível arquivar o insumo.', 'error'); } finally { setBusyId(''); } };
  const restoreItem = async (item: InventoryItem) => { setBusyId(item.id); try { const updated = await inventoryApi.restoreItem(settings.id, item.id); setItems((current) => current.map((entry) => entry.id === item.id ? updated : entry)); showToast('Insumo restaurado para os ativos.', 'success'); } catch (err) { showToast(err instanceof Error ? err.message : 'Não foi possível restaurar o insumo.', 'error'); } finally { setBusyId(''); } };
  const openBatchPurchase = () => {
    const orderedItems = [...activeItems].sort((a, b) => {
      const aNeedsPurchase = Number(a.currentQuantity <= a.reorderPoint);
      const bNeedsPurchase = Number(b.currentQuantity <= b.reorderPoint);
      return bNeedsPurchase - aNeedsPurchase || a.name.localeCompare(b.name, 'pt-BR');
    });
    setBatchPurchaseLines(orderedItems.map((item) => ({ inventoryItemId: item.id, quantity: '', totalCost: '' })));
    setShowBatchPurchase(true);
  };
  const updateBatchPurchaseLine = (inventoryItemId: string, field: 'quantity' | 'totalCost', value: string) => { setBatchPurchaseLines((current) => current.map((line) => line.inventoryItemId === inventoryItemId ? { ...line, [field]: value } : line)); };
  const saveBatchPurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const entries = batchPurchaseLines.map((line) => {
      const item = activeItems.find((entry) => entry.id === line.inventoryItemId);
      const quantity = Number(line.quantity);
      const usesProvidedCost = line.totalCost.trim() !== '';
      const totalCost = usesProvidedCost ? Number(line.totalCost) : (item?.averageUnitCost || 0) * quantity;
      const hasInput = line.quantity.trim() !== '' || usesProvidedCost;
      return { inventoryItemId: line.inventoryItemId, quantity, totalCost, usesProvidedCost, hasInput, item };
    }).filter((line) => line.hasInput);
    if (!entries.length || entries.some((line) => !line.item || !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.totalCost) || line.totalCost < 0 || (!line.usesProvidedCost && (line.item?.averageUnitCost || 0) <= 0))) {
      showToast('Informe o custo na primeira compra de cada insumo. Nas próximas, o custo médio pode ser usado automaticamente.', 'error');
      return;
    }
    setBusyId('batch-purchase');
    try { await inventoryApi.recordPurchase({ storeId: settings.id, items: entries.map((line) => ({ inventoryItemId: line.inventoryItemId, quantity: line.quantity, unitCost: line.totalCost / line.quantity })) }); await loadItems(); setBatchPurchaseLines([]); setShowBatchPurchase(false); showToast(`${entries.length} insumo${entries.length === 1 ? '' : 's'} atualizado${entries.length === 1 ? '' : 's'} com a entrada em lote.`, 'success'); } catch (err) { showToast(err instanceof Error ? err.message : 'Não foi possível registrar a entrada em lote.', 'error'); } finally { setBusyId(''); }
  };
  const selectRecipeProduct = async (productId: string) => {
    const request = ++recipeRequest.current;
    const storeId = settings.id;
    const isCurrent = () => recipeRequest.current === request && currentStoreId.current === storeId;
    setRecipeProductId(productId); setRecipeLines([]);
    const recipe = recipes.find((entry) => entry.productId === productId);
    if (!recipe) { setRecipeYield('1'); setRecipeYieldUnit('un'); setRecipeLoading(false); return; }
    setRecipeYield(String(recipe.yieldQuantity)); setRecipeYieldUnit(recipe.yieldUnit); setRecipeLoading(true);
    try {
      const loaded = await inventoryApi.listRecipeItems(storeId, recipe.id);
      if (!isCurrent()) return;
      setRecipeLines(loaded.map((line) => ({ inventoryItemId: line.inventoryItemId, stage: line.stage || 'Geral', quantity: String(line.quantity), unit: line.unit, wastePercent: String(line.wastePercent) })));
    } catch (err) {
      if (isCurrent()) showToast(err instanceof Error ? err.message : 'Não foi possível carregar a ficha técnica.', 'error');
    } finally {
      if (isCurrent()) setRecipeLoading(false);
    }
  };
  const addRecipeLine = () => { const first = activeItems[0] || items[0]; if (!first) { showToast('Cadastre um insumo antes de criar a ficha técnica.', 'error'); return; } setRecipeLines((current) => [...current, { inventoryItemId: first.id, stage: current.length ? 'Finalização' : 'Base', quantity: '', unit: first.unit, wastePercent: '0' }]); };
  const saveRecipe = async () => {
    if (busyId || recipeLoading) return;
    if (!recipeProductId) { showToast('Selecione um produto.', 'error'); return; }
    const yieldQuantity = Number(recipeYield);
    const validLines = recipeLines.map((line) => ({ inventoryItemId: line.inventoryItemId, stage: line.stage.trim() || 'Geral', quantity: Number(line.quantity), unit: line.unit, wastePercent: Number(line.wastePercent) }));
    if (!Number.isFinite(yieldQuantity) || yieldQuantity <= 0 || !validLines.length || validLines.some((line) => !line.inventoryItemId || !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.wastePercent) || line.wastePercent < 0 || line.wastePercent > 100)) {
      showToast('Revise o rendimento e todos os insumos, quantidades e perdas antes de salvar.', 'error'); return;
    }
    setBusyId('recipe');
    try {
      const { recipe, items: savedLines } = await inventoryApi.saveRecipe({ storeId: settings.id, productId: recipeProductId, yieldQuantity, yieldUnit: recipeYieldUnit, items: validLines });
      setRecipes((current) => current.some((entry) => entry.id === recipe.id) ? current.map((entry) => entry.id === recipe.id ? recipe : entry) : [...current, recipe]);
      setRecipeItems((current) => [...current.filter((line) => line.recipeId !== recipe.id), ...savedLines]);
      showToast('Ficha técnica salva integralmente. O consumo será calculado nas próximas vendas confirmadas.', 'success');
    } catch (err) { showToast(err instanceof Error ? err.message : 'Não foi possível salvar a ficha técnica.', 'error'); }
    finally { setBusyId(''); }
  };
  const archiveRecipe = async () => { if (!recipeProductId) return; const product = products.find((entry) => entry.id === recipeProductId); if (!window.confirm(`Remover a automação de “${product?.name || 'este produto'}”? O histórico de consumo será preservado.`)) return; setBusyId('recipe-archive'); try { await inventoryApi.archiveRecipe(settings.id, recipeProductId); setRecipes((current) => current.filter((entry) => entry.productId !== recipeProductId)); setRecipeLines([]); setRecipeYield('1'); setRecipeYieldUnit('un'); showToast('Automação arquivada. Você pode criar uma nova ficha quando quiser.', 'success'); } catch (err) { showToast(err instanceof Error ? err.message : 'Não foi possível arquivar a automação.', 'error'); } finally { setBusyId(''); } };
  const registerPurchase = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const item = items.find((entry) => entry.id === purchaseId); if (!item) return; const quantity = Number(purchaseQuantity); const usesProvidedCost = purchaseCost.trim() !== ''; const totalCost = usesProvidedCost ? Number(purchaseCost) : item.averageUnitCost * quantity; if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(totalCost) || totalCost < 0 || (!usesProvidedCost && item.averageUnitCost <= 0)) { showToast('Informe o custo nesta primeira compra. Depois o sistema pode reutilizar o custo médio.', 'error'); return; } setBusyId(item.id); try { await inventoryApi.recordPurchase({ storeId: settings.id, items: [{ inventoryItemId: item.id, quantity, unitCost: totalCost / quantity }] }); await loadItems(); setPurchaseId(''); setPurchaseQuantity(''); setPurchaseCost(''); showToast(usesProvidedCost ? 'Compra registrada e custo médio atualizado.' : 'Entrada registrada com o custo médio anterior.', 'success'); } catch (err) { showToast(err instanceof Error ? err.message : 'Não foi possível registrar a compra.', 'error'); } finally { setBusyId(''); } };
  if (storeLoading || (advanced && loadedStoreId.current !== settings.id)) return <LoadingState label="Carregando estoque..." />; if (storeError) return <ErrorState message={storeError} onRetry={() => void reloadAdmin()} />;
  return <main className="inventory-page-flow">
    <section className="admin-card inventory-simple-stock" aria-label="Estoque simples dos produtos">
      <div className="inventory-section-heading"><div><span className="eyebrow">ESTOQUE SIMPLES</span><h1>Produtos prontos para venda</h1><p>Confira o físico, o reservado e o disponível. Digite a quantidade desejada ou ajuste o saldo com + e −.</p></div><a className="secondary-button compact-button" href="/admin/produtos">Gerenciar produtos</a></div>
      <div className="inventory-product-list">{trackedProducts.length?trackedProducts.map(product=><ProductStockCard key={product.id} product={product} onAdjust={(current,delta,reason)=>void adjustProduct(current,delta,reason)} onSet={(current,quantity,reason)=>void setProductStock(current,quantity,reason)} busy={busyId===product.id}/>):<div className="inventory-empty"><Package size={22}/><strong>Sem produtos com controle de estoque</strong><span>Ative o controle no cadastro do produto.</span></div>}</div>
    </section>
    <section className="admin-card inventory-advanced-choice"><div><h2>Produção e insumos</h2><p>Compras, fichas técnicas e conferência de ingredientes são opcionais. Abra quando sua operação precisar deles.</p></div><button className="secondary-button" type="button" aria-expanded={advanced} onClick={()=>{if(advanced&&pendingQuantityChanges.length&&!window.confirm('Descartar saldos digitados que ainda não foram salvos?'))return;if(advanced&&pendingQuantityChanges.length)discardQuantityChanges();setAdvanced(!advanced);}}>{advanced?'Fechar ferramentas avançadas':'Abrir ferramentas avançadas'}</button></section>
    {advanced && (loading?<p role="status" className="admin-card">Carregando ferramentas de produção...</p>:inventoryError?<div role="alert" className="admin-card">{inventoryError}<button type="button" onClick={()=>void loadItems()}>Tentar novamente</button></div>:<>

    {calibrationInsights.length > 0 && <section className="admin-card inventory-calibration-card" aria-label="Sugestões de calibração do estoque"><div className="inventory-section-heading"><div><span className="eyebrow">APRENDIZADO DO ESTOQUE</span><h2>O sistema encontrou uma diferença recorrente</h2><p>Compara as conferências físicas com o consumo previsto pelas vendas. A sugestão não altera sua ficha técnica sozinha: você confirma após observar o fluxo real.</p></div><Sparkles size={21} /></div><div className="inventory-calibration-list">{calibrationInsights.slice(0, 3).map(({ item, countTotal, deviationPercent }) => <div key={item.id}><span><strong>{item.name}</strong><small>{countTotal} conferências físicas registradas</small></span><p>{deviationPercent < 0 ? `O físico ficou ${Math.abs(deviationPercent).toFixed(0)}% abaixo do previsto. Revise a perda ou o rendimento usado na ficha técnica.` : `O físico ficou ${deviationPercent.toFixed(0)}% acima do previsto. Revise entradas, rendimento ou consumo cadastrado.`}</p><button type="button" className="text-button" onClick={() => startEditItem(item)}>Ver insumo</button></div>)}</div></section>}
    {detailItem && <section id="inventory-item-details" className="admin-card inventory-item-details" aria-label={`Detalhes de ${detailItem.name}`}><div className="inventory-section-heading"><div><span className="eyebrow">DETALHES DO INSUMO</span><h2>{detailItem.name}</h2><p>Atualize as informações operacionais sem perder compras, movimentações ou histórico das fichas técnicas.</p></div><button type="button" className="icon-button" onClick={cancelEditItem} aria-label="Fechar detalhes"><X size={18} /></button></div><div className="inventory-detail-meta"><span><small>Saldo estimado</small><strong>{formatQuantity(detailItem.currentQuantity, detailItem.unit)}</strong></span><span><small>Custo médio</small><strong>{currency.format(detailItem.averageUnitCost)}/{inventoryUnitLabels[detailItem.unit]}</strong></span><span><small>Última atualização</small><strong>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(detailItem.updatedAt))}</strong></span></div><div className="inventory-detail-form"><label>Nome<input value={editingName} onChange={(event) => setEditingName(event.target.value)} /></label><label>Tipo<select value={editingItemType} onChange={(event) => setEditingItemType(event.target.value as InventoryItemType)}>{kindOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>Estoque mínimo ({inventoryUnitLabels[editingUnit]})<input aria-label={`Estoque mínimo em ${inventoryUnitLabels[editingUnit]}`} value={editingReorderPoint} onChange={(event) => setEditingReorderPoint(event.target.value)} type="number" min="0" step="0.001" inputMode="decimal" /></label><label className="inventory-detail-unit">Unidade<select value={editingUnit} onChange={(event) => changeEditingUnit(event.target.value as InventoryUnit)}>{unitOptions.filter((option) => unitFamily(option.value) === unitFamily(detailItem.unit)).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small>{editingUnit === detailItem.unit ? `Unidade atual: ${inventoryUnitLabels[detailItem.unit]}. Escolha outra medida compatível, se necessário.` : `De ${inventoryUnitLabels[detailItem.unit]} para ${inventoryUnitLabels[editingUnit]}: saldo, custo, compras, ficha e histórico serão convertidos pelo servidor. Confira o mínimo na unidade nova.`}</small></label><label className="inventory-detail-notes">Observações<textarea value={editingNotes} onChange={(event) => setEditingNotes(event.target.value)} placeholder="Ex.: pacote rende aproximadamente 20 porções" rows={2} /></label><label className="switch-row"><span><strong><Bell size={14} />Alertar</strong><small>Notificar ao atingir o estoque mínimo</small></span><input type="checkbox" checked={editingAlert} onChange={(event) => setEditingAlert(event.target.checked)} /></label></div><div className="inventory-detail-actions"><button className="secondary-button inventory-danger-button" type="button" onClick={() => void archiveItem(detailItem)} disabled={busyId === detailItem.id}><Trash2 size={16} />Arquivar</button><span>Unidades sem equivalência física, como pacote e unidade, continuam protegidas para não criar uma conversão inventada.</span><div><button className="secondary-button compact-button" type="button" onClick={cancelEditItem}>Cancelar</button><button className="primary-button compact-button" type="button" disabled={Boolean(busyId)} onClick={() => void saveEditItem(detailItem)}>{busyId === detailItem.id ? 'Salvando...' : 'Salvar detalhes'}</button></div></div></section>}
    {recipeProductId && recipeLines.length > 0 && <section className="admin-card inventory-consumption-preview" aria-label="Estimativa de consumo dos insumos"><div className="inventory-section-heading"><div><span className="eyebrow">PREVISÃO DE CONSUMO</span><h2>Quanto será gasto nesta produção?</h2><p>Convertemos automaticamente g, kg, ml e litros para a unidade cadastrada no insumo. O débito real ocorre na confirmação da venda e é estornado em correções ou cancelamentos.</p></div><label>Quantidade de produtos<input type="number" min="1" step="1" value={recipePreviewQuantity} onChange={(event) => setRecipePreviewQuantity(event.target.value)} /></label></div><div className="inventory-consumption-preview__list">{recipeConsumptionPreview.map((entry, index) => <div key={`${entry.inventoryItemId}-${index}`}><span><strong>{entry.item?.name || 'Insumo não selecionado'}</strong><small>{entry.stage} · {entry.item ? `${entry.converted == null ? 'unidade incompatível' : formatQuantity(entry.converted, entry.item.unit)}` : 'selecione um insumo'}</small></span><b>{entry.cost != null ? currency.format(entry.cost) : '—'}</b></div>)}</div><div className="inventory-consumption-preview__total"><span>Custo estimado desta produção</span><strong>{currency.format(recipeConsumptionPreview.reduce((total, entry) => total + (entry.cost || 0), 0))}</strong></div></section>}
    {activeItems.length > 0 && <section id="conferencia-real" className="admin-card inventory-bulk-stock-card" aria-label="Conferência real dos saldos"><div className="inventory-section-heading"><div><span className="eyebrow">CONFERÊNCIA REAL</span><h2>Conte o que está na prateleira</h2><p>O sistema já estima o saldo por compras, entradas e consumo das vendas. Quando você conferir o saldo físico, digite apenas o que encontrou: a diferença recalibra a previsão sem apagar o histórico.</p></div><span className="inventory-count-pill">{pendingQuantityChanges.length} pendente{pendingQuantityChanges.length === 1 ? '' : 's'}</span></div><div className="inventory-bulk-stock-grid">{activeItems.map((item) => <label key={item.id}><span>{item.name}<small>Estimado: {formatQuantity(item.currentQuantity, item.unit)}</small></span><input type="number" min="0" step={stepForUnit(item.unit)} value={quantityDrafts[item.id] ?? String(item.currentQuantity)} onChange={(event) => setQuantityDrafts((current) => ({ ...current, [item.id]: event.target.value }))} aria-label={`Estoque físico de ${item.name}`} /></label>)}</div></section>}
     <div className="admin-page-title inventory-page-title"><div><span className="eyebrow">OPERAÇÃO</span><h1>Estoque e insumos</h1><p>Registre compras em segundos, deixe as vendas baixarem os insumos e confira o físico quando quiser.</p></div><div className="inventory-page-actions"><button className="secondary-button" type="button" onClick={exportInventory}><Download size={17} />Exportar CSV</button><button className="secondary-button" type="button" onClick={() => setShowNew((value) => !value)}>{showNew ? <X size={17} /> : <Plus size={17} />}{showNew ? 'Fechar cadastro' : 'Novo insumo'}</button><button className="secondary-button" type="button" onClick={() => showBatchPurchase ? setShowBatchPurchase(false) : openBatchPurchase()}><ShoppingCart size={17} />{showBatchPurchase ? 'Fechar lançamentos' : 'Lançar compra'}</button><a className="primary-button" href="#conferencia-real"><ClipboardList size={17} />Conferir estoque</a></div></div>
    <div className="inventory-kpi-grid"><article className="inventory-kpi"><span><Layers3 size={18} /></span><div><small>Insumos ativos</small><strong>{summary.total}</strong><p>ingredientes e materiais</p></div></article><article className="inventory-kpi inventory-kpi--warning"><span><TrendingDown size={18} /></span><div><small>Estoque baixo</small><strong>{summary.low}</strong><p>precisam de atenção</p></div></article><article className="inventory-kpi inventory-kpi--danger"><span><AlertTriangle size={18} /></span><div><small>Zerados</small><strong>{summary.zero}</strong><p>sem saldo registrado</p></div></article><article className="inventory-kpi inventory-kpi--value"><span><ShoppingCart size={18} /></span><div><small>Valor em insumos</small><strong>{currency.format(summary.value)}</strong><p>estimativa pelo custo médio</p></div></article></div>
    <section className="admin-card inventory-model-card" aria-label="Como o saldo do estoque é calculado"><div className="inventory-section-heading"><div><span className="eyebrow">ESTOQUE CONFIÁVEL</span><h2>O saldo se atualiza sem planilha</h2><p>A VendeWeb parte de cada compra registrada, baixa o consumo proporcional das fichas técnicas nas vendas confirmadas e usa sua conferência física para corrigir pequenas diferenças.</p></div><a className="secondary-button compact-button" href="#conferencia-real"><ClipboardList size={16} />Conferir agora</a></div><div className="inventory-model-card__steps"><div><ShoppingCart size={18}/><span><strong>1. Registre a compra</strong><small>Informe a quantidade; o último custo médio pode preencher as próximas entradas.</small></span></div><div><Sparkles size={18}/><span><strong>2. Venda confirmada baixa os insumos</strong><small>{recipes.length ? `${recipes.length} ficha${recipes.length === 1 ? '' : 's'} técnica${recipes.length === 1 ? '' : 's'} ativa${recipes.length === 1 ? '' : 's'}.` : 'Cadastre uma ficha técnica por produto para ativar a baixa automática.'}</small></span></div><div><CheckCircle2 size={18}/><span><strong>3. Confira quando precisar</strong><small>Digite o saldo físico em lote; o sistema registra somente a diferença e preserva todo o histórico.</small></span></div></div></section>
    <section className="inventory-decision-grid" aria-label="Decisões rápidas de produção">
      <article className="admin-card inventory-decision-card inventory-decision-card--purchase"><div className="inventory-decision-card__heading"><div><span className="eyebrow">PRÓXIMA COMPRA</span><h2>O que está acabando?</h2></div><ShoppingCart size={20}/></div>{purchaseSuggestions.length ? <div className="inventory-decision-list">{purchaseSuggestions.slice(0, 4).map((item) => <div key={item.id}><div><strong>{item.name}</strong><small>Saldo {formatQuantity(item.currentQuantity, item.unit)} · mínimo {formatQuantity(item.reorderPoint, item.unit)}</small></div><b>{formatQuantity(item.suggestedQuantity, item.unit)}</b></div>)}</div> : <p className="inventory-decision-empty">Nenhum insumo atingiu o mínimo. Sua próxima compra pode esperar.</p>}<button type="button" className="text-button" onClick={() => setFilter('low')}>Abrir lista de estoque baixo →</button></article>
      <article className="admin-card inventory-decision-card inventory-decision-card--margin"><div className="inventory-decision-card__heading"><div><span className="eyebrow">CUSTO E MARGEM</span><h2>O que realmente sobra?</h2></div><TrendingDown size={20}/></div>{productionInsights.length ? <div className="inventory-decision-list">{productionInsights.slice().sort((a, b) => (b.marginPercent ?? -999) - (a.marginPercent ?? -999)).slice(0, 4).map((entry) => <div key={entry.recipe.id}><div><strong>{entry.product?.name}</strong><small>{entry.unitCost != null ? `Custo estimado ${currency.format(entry.unitCost)} por ${entry.recipe.yieldUnit}` : 'Complete a ficha técnica para calcular'}</small></div><b className={entry.margin != null && entry.margin >= 0 ? 'is-positive' : 'is-negative'}>{entry.marginPercent != null ? `${entry.marginPercent.toFixed(0)}%` : '—'}</b></div>)}</div> : <p className="inventory-decision-empty">Cadastre uma ficha técnica para comparar custo, preço e margem por produto.</p>}<small className="inventory-decision-note">O cálculo considera custo médio dos insumos e perdas informadas.</small></article>
    </section>
    {lowStockItems.length > 0 && <div className="inventory-alert-banner" role="status"><Bell size={18}/><div><strong>{lowStockItems.length} insumo{lowStockItems.length === 1 ? '' : 's'} no limite configurado</strong><span>{lowStockItems.slice(0, 3).map((item) => item.name).join(' · ')}{lowStockItems.length > 3 ? ' · ...' : ''}</span></div><button className="text-button" type="button" onClick={() => setFilter('low')}>Ver estoque baixo</button></div>}
    {showNew && <section className="admin-card inventory-new-card"><div className="admin-card__header"><div><span className="eyebrow">CADASTRO RÁPIDO</span><h2>Novo insumo</h2><p>Cadastre ingredientes, embalagens ou materiais para acompanhar custo e reposição.</p></div><button type="button" className="icon-button" onClick={() => setShowNew(false)} aria-label="Fechar cadastro"><X size={18} /></button></div><form className="inventory-new-form" onSubmit={saveNewItem}><label>Nome<input name="name" required placeholder="Ex.: Leite em pó" /></label><label>Tipo<select name="itemType" defaultValue="ingredient">{kindOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>Unidade<select name="unit" defaultValue="kg">{unitOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>Estoque mínimo<input name="reorderPoint" type="number" min="0" step="0.01" defaultValue="0" /></label><label>Saldo inicial <small>opcional</small><input name="currentQuantity" type="number" min="0" step="0.01" defaultValue="0" /></label><label>Custo médio <small>opcional</small><input name="averageUnitCost" type="number" min="0" step="0.01" defaultValue="0" /></label><label className="switch-row full"><span><strong><Bell size={15} />Avisar ao atingir o estoque mínimo</strong><small>O painel exibirá o alerta e o PWA poderá notificar administradores.</small></span><input name="lowStockAlertEnabled" type="checkbox" defaultChecked /></label><button className="primary-button" type="submit" disabled={busyId === 'new'}>{busyId === 'new' ? 'Salvando...' : <><CheckCircle2 size={17} />Salvar insumo</>}</button></form></section>}
    {showBatchPurchase && <section className="admin-card inventory-batch-card"><div className="admin-card__header"><div><span className="eyebrow">LANÇAMENTO RÁPIDO</span><h2>Compras e abastecimentos</h2><p>Digite somente a quantidade recebida. Depois da primeira compra, o custo total é opcional: o sistema preserva o custo médio conhecido até você informar um valor novo.</p></div><button type="button" className="icon-button" onClick={() => setShowBatchPurchase(false)} aria-label="Fechar lançamentos"><X size={18} /></button></div><form onSubmit={saveBatchPurchase}><div className="inventory-batch-table" role="table" aria-label="Entrada de insumos em lote"><div className="inventory-batch-row inventory-batch-row--head" role="row"><span>Insumo</span><span>Quantidade recebida</span><span>Custo total <small>opcional após a 1ª compra</small></span></div>{batchPurchaseLines.map((line) => { const item = items.find((entry) => entry.id === line.inventoryItemId); if (!item) return null; return <div className="inventory-batch-row" role="row" key={item.id}><strong>{item.name}<small>{inventoryUnitLabels[item.unit]} · estimado {formatQuantity(item.currentQuantity, item.unit)}</small></strong><label><span className="sr-only">Quantidade recebida de {item.name}</span><input type="number" min="0" step="0.001" value={line.quantity} onChange={(event) => updateBatchPurchaseLine(item.id, 'quantity', event.target.value)} placeholder="0" inputMode="decimal" /></label><label><span className="sr-only">Custo total de {item.name}</span><input type="number" min="0" step="0.01" value={line.totalCost} onChange={(event) => updateBatchPurchaseLine(item.id, 'totalCost', event.target.value)} placeholder={item.averageUnitCost > 0 ? `Mantém ${currency.format(item.averageUnitCost)}/${inventoryUnitLabels[item.unit]}` : 'Obrigatório na 1ª compra'} inputMode="decimal" /></label></div>; })}</div><div className="inventory-batch-actions"><small>Itens sem quantidade ficam fora. Os que estão no mínimo aparecem primeiro.</small><button className="primary-button" type="submit" disabled={busyId === 'batch-purchase'}>{busyId === 'batch-purchase' ? 'Salvando...' : <><CheckCircle2 size={16} />Salvar entradas</>}</button></div></form></section>}
    <section className="admin-card inventory-recipe-card"><div className="inventory-section-heading"><div><span className="eyebrow">FICHA TÉCNICA</span><h2>Consumo automático por venda</h2><p>Comece com uma estimativa simples por produto. A cada venda confirmada, o sistema baixa essa proporção; depois, ajuste pela conferência física se o pacote render diferente.</p><small className="inventory-helper-text">Selecione um produto para editar a automação existente. Arquivar remove a regra ativa sem apagar o histórico.</small></div><span className="inventory-count-pill">{recipes.length} configurada{recipes.length === 1 ? '' : 's'}</span></div><div className="inventory-recipe-form"><label>Produto<select value={recipeProductId} onChange={(event) => void selectRecipeProduct(event.target.value)}><option value="">Selecione uma pipoca</option>{products.filter((product) => product.active).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label>Rendimento<input type="number" min="0.001" step="0.001" value={recipeYield} onChange={(event) => setRecipeYield(event.target.value)} /></label><label>Unidade do rendimento<select value={recipeYieldUnit} onChange={(event) => setRecipeYieldUnit(event.target.value as InventoryUnit)}>{unitOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>{recipeLoading && <p role="status">Carregando ficha técnica do produto selecionado…</p>}<div className="inventory-recipe-lines">{recipeLines.map((line, index) => <div className="inventory-recipe-line" key={`${line.inventoryItemId}-${index}`}><input className="inventory-recipe-stage" value={line.stage} onChange={(event) => setRecipeLines((current) => current.map((entry, lineIndex) => lineIndex === index ? { ...entry, stage: event.target.value } : entry))} placeholder="Etapa (ex.: Base)" aria-label="Etapa do insumo" /><select value={line.inventoryItemId} onChange={(event) => setRecipeLines((current) => current.map((entry, lineIndex) => lineIndex === index ? { ...entry, inventoryItemId: event.target.value, unit: items.find((item) => item.id === event.target.value)?.unit || entry.unit } : entry))} aria-label="Insumo da ficha"><option value="">Selecione o insumo</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}{item.active ? '' : ' (arquivado)'}</option>)}</select><input type="number" min="0.001" step="0.001" placeholder="Quantidade" value={line.quantity} onChange={(event) => setRecipeLines((current) => current.map((entry, lineIndex) => lineIndex === index ? { ...entry, quantity: event.target.value } : entry))} /><select value={line.unit} onChange={(event) => setRecipeLines((current) => current.map((entry, lineIndex) => lineIndex === index ? { ...entry, unit: event.target.value as InventoryUnit } : entry))} aria-label="Unidade do consumo">{unitOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><input type="number" min="0" max="100" step="0.1" placeholder="Perda %" value={line.wastePercent} onChange={(event) => setRecipeLines((current) => current.map((entry, lineIndex) => lineIndex === index ? { ...entry, wastePercent: event.target.value } : entry))} aria-label="Percentual de perda" /><button type="button" className="icon-button" onClick={() => setRecipeLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} aria-label="Remover insumo"><X size={15} /></button></div>)}{!recipeLines.length && <div className="inventory-empty"><ClipboardList size={20} /><span>Adicione os materiais usados em cada etapa do rendimento.</span></div>}</div><div className="inventory-recipe-actions"><button className="secondary-button" type="button" onClick={addRecipeLine} disabled={recipeLoading}><Plus size={16} />Adicionar insumo</button>{recipes.some((entry) => entry.productId === recipeProductId) && <button className="secondary-button inventory-danger-button" type="button" onClick={() => void archiveRecipe()} disabled={recipeLoading || busyId === 'recipe-archive'}><Trash2 size={16} />{busyId === 'recipe-archive' ? 'Removendo...' : 'Remover automação'}</button>}<button className="primary-button" type="button" onClick={() => void saveRecipe()} disabled={recipeLoading || busyId === 'recipe'}>{busyId === 'recipe' ? 'Salvando...' : <><CheckCircle2 size={16} />Salvar ficha</>}</button></div></section>
    <div className="inventory-workspace"><section className="admin-card inventory-materials-card"><div className="inventory-section-heading"><div><span className="eyebrow">INSUMOS</span><h2>Materiais da produção</h2><p>Use + e − para contagens rápidas. Compras recalculam automaticamente o custo médio. Para substituir um cadastro, arquive o antigo e crie outro sem perder o histórico.</p></div><span className="inventory-count-pill">{filteredItems.length} de {items.length}</span></div><div className="inventory-toolbar"><div className="admin-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar insumo..." /></div><div className="inventory-filters"><label><Filter size={15} /><select value={filter} onChange={(event) => setFilter(event.target.value as InventoryFilter)} aria-label="Filtrar estoque"><option value="all">Todos os saldos</option><option value="low">Estoque baixo</option><option value="zero">Zerados</option></select></label><select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as 'all' | InventoryItemType)} aria-label="Filtrar tipo"><option value="all">Todos os tipos</option>{kindOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><button type="button" className={`inventory-archived-toggle${showArchived ? ' is-active' : ''}`} onClick={() => setShowArchived((current) => !current)}>{showArchived ? 'Voltar aos ativos' : 'Ver arquivados'}</button></div></div><div className="inventory-material-list">{!filteredItems.length && <div className="inventory-empty"><ClipboardList size={25} /><strong>Nenhum insumo encontrado</strong><span>Cadastre um insumo ou ajuste os filtros.</span></div>}{filteredItems.map((item) => { const zero = item.currentQuantity <= 0; const low = !zero && item.currentQuantity <= item.reorderPoint; return <article className="inventory-material-row" key={item.id}>{editingItemId === item.id ? <div className="inventory-inline-edit"><label>Nome<input value={editingName} onChange={(event) => setEditingName(event.target.value)} /></label><label>Estoque mínimo<input value={editingReorderPoint} onChange={(event) => setEditingReorderPoint(event.target.value)} type="number" min="0" step="0.01" /></label><label className="switch-row"><span><strong><Bell size={14} />Alertar</strong><small>Notificar ao atingir o mínimo</small></span><input type="checkbox" checked={editingAlert} onChange={(event) => setEditingAlert(event.target.checked)} /></label><div className="inventory-inline-edit__actions"><button className="primary-button compact-button" type="button" disabled={busyId === item.id} onClick={() => void saveEditItem(item)}>{busyId === item.id ? 'Salvando...' : 'Salvar'}</button><button className="secondary-button compact-button" type="button" onClick={cancelEditItem}>Cancelar</button></div></div> : <><div className="inventory-material-main"><span className={`inventory-material-icon ${item.itemType}`}><Boxes size={17} /></span><div><strong>{item.name}</strong><small>{inventoryLabels[item.itemType]} · custo médio {currency.format(item.averageUnitCost)}/{inventoryUnitLabels[item.unit]}</small></div></div><div className="inventory-material-balance"><strong className={zero ? 'is-zero' : low ? 'is-low' : ''}>{formatQuantity(item.currentQuantity, item.unit)}</strong><small>{zero ? 'Comprar agora' : low ? `Mínimo ${formatQuantity(item.reorderPoint, item.unit)}` : 'Saldo saudável'} · {item.lowStockAlertEnabled ? 'alerta ativo' : 'alerta pausado'}</small></div><div className="inventory-material-actions">{item.active ? <><div className="inventory-stepper"><button type="button" onClick={() => void adjustItem(item, -1)} disabled={busyId === item.id || zero} aria-label={`Remover de ${item.name}`}><Minus size={15} /></button><span>{stepForUnit(item.unit)} {inventoryUnitLabels[item.unit]}</span><button type="button" onClick={() => void adjustItem(item, 1)} disabled={busyId === item.id} aria-label={`Adicionar em ${item.name}`}><Plus size={15} /></button></div><button className="inventory-purchase-button" type="button" onClick={() => setPurchaseId((current) => current === item.id ? '' : item.id)}><ShoppingCart size={14} />Comprar</button><button className="icon-button" type="button" onClick={() => startEditItem(item)} aria-label={`Editar ${item.name}`}><Edit3 size={15} /></button><button className="icon-button inventory-danger-action" type="button" onClick={() => void archiveItem(item)} disabled={busyId === item.id} aria-label={`Arquivar ${item.name}`}><Trash2 size={15} /></button></> : <><span className="inventory-archived-label">Arquivado</span><button className="secondary-button compact-button" type="button" onClick={() => void restoreItem(item)} disabled={busyId === item.id}><RotateCcw size={14} />Restaurar</button><button className="icon-button" type="button" onClick={() => startEditItem(item)} aria-label={`Editar ${item.name}`}><Edit3 size={15} /></button></>}</div>{purchaseId === item.id && <form className="inventory-purchase-form" onSubmit={registerPurchase}><label>Quantidade<input value={purchaseQuantity} onChange={(event) => setPurchaseQuantity(event.target.value)} type="number" min="0.01" step="0.01" required placeholder={inventoryUnitLabels[item.unit]} /></label><label>Custo total<input value={purchaseCost} onChange={(event) => setPurchaseCost(event.target.value)} type="number" min="0" step="0.01" required placeholder="R$ 0,00" /></label><button className="primary-button" type="submit" disabled={busyId === item.id}>{busyId === item.id ? 'Salvando...' : 'Registrar compra'}</button></form>}</>}</article>; })}</div></section><aside className="inventory-side-column"><section className="admin-card inventory-guide-card"><div className="inventory-guide-icon"><Sparkles /></div><span className="eyebrow">AUTOMAÇÃO</span><h2>Fichas técnicas</h2><p>Associe os insumos a cada pipoca para que o sistema calcule e debite automaticamente o consumo proporcional à quantidade vendida.</p><div className="inventory-guide-list"><span><CheckCircle2 size={15} />20 pipocas podem consumir 2 pacotes</span><span><CheckCircle2 size={15} />Correções e cancelamentos estornam o consumo</span><span><Bell size={15} />Alertas respeitam o estoque mínimo configurado</span></div></section><section className="admin-card inventory-products-card" id="produtos-prontos"><div className="inventory-section-heading"><div><span className="eyebrow">PRODUTOS PRONTOS</span><h2>Estoque de venda</h2><p>{productSummary.tracked} controlado(s) · {productSummary.zero} zerado(s)</p></div><a className="text-link" href="/admin/produtos">Editar catálogo →</a></div><div className="inventory-product-list">{trackedProducts.length ? trackedProducts.map((product) => <ProductStockCard key={product.id} product={product} onAdjust={(current, delta, reason) => void adjustProduct(current, delta, reason)} onSet={(current, quantity, reason) => void setProductStock(current, quantity, reason)} busy={busyId === product.id} />) : <div className="inventory-empty"><Package size={22} /><strong>Nenhum produto controla estoque</strong><span>Ative o controle dentro do cadastro do produto.</span></div>}</div></section></aside></div>
    {pendingQuantityChanges.length > 0 && <FloatingSaveBar description={`${pendingQuantityChanges.length} saldo${pendingQuantityChanges.length === 1 ? '' : 's'} de estoque alterado${pendingQuantityChanges.length === 1 ? '' : 's'}.`} saving={busyId === 'inventory-stock-batch'} onSave={() => void saveQuantityChanges()} onCancel={discardQuantityChanges} />}
    </>)}
   </main>;
}
