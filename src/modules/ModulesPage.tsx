import { InfoHint } from '../components/ui/InfoHint';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { restFetch } from '../lib/supabaseRest';
import { modulesApi } from './api';
import { disabledModules } from './types';
import ModuleSettingsForm from './components/ModuleSettingsForm';
import OffersPanel from './components/OffersPanel';
import CombosPanel from './components/CombosPanel';
import ModuleOrdersPanel from './components/ModuleOrdersPanel';
import CustomPanel from './components/CustomPanel';
import RentalsPanel from './components/RentalsPanel';
import type { ComboItem, ComboVersion, CustomFile, CustomRequest, ModuleOrder, ModuleOrderItem, ModuleSettings, Offer, OrderPart, Receivable, Refund, RentalAsset, RentalReservation } from './types';
import './modules.css';
import { useBusinessStatus } from '../platform/useBusinessStatus';

type PanelData = { settings: ModuleSettings; offers: Offer[]; directory: Offer[]; versions: ComboVersion[]; approvals: ComboItem[];
  orders: ModuleOrder[]; parts: OrderPart[]; items: ModuleOrderItem[]; receivables: Receivable[]; refunds: Refund[];
  customs: CustomRequest[]; files: CustomFile[]; assets: RentalAsset[]; reservations: RentalReservation[] };
const empty = (store: string): PanelData => ({ settings: disabledModules(store), offers: [], directory: [], versions: [], approvals: [],
  orders: [], parts: [], items: [], receivables: [], refunds: [], customs: [], files: [], assets: [], reservations: [] });

export default function ModulesPage({ master = false }: { master?: boolean }) {
  const { membership } = useAuth();
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState('');
  const store = master ? selected : membership?.storeId || '';
  const {state:business}=useBusinessStatus(store);
  useEffect(() => {
    if (!master) return;
    let active = true;
    void restFetch<{ id: string; name: string }[]>('food_stores?select=id,name&order=name&limit=500').then(data => { if (active) { setStores(data); setSelected(data[0]?.id || ''); } }).catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [master]);
  const [data, setData] = useState<PanelData>(() => empty(store));
  const [tab, setTab] = useState('settings');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canManage = master || ['owner','admin','manager'].includes(membership?.role || '');
  const load = useCallback(async (): Promise<PanelData> => {
    const settings = await modulesApi.settings(store);
    if (!settings.organization_id) return { ...empty(store), settings };
    const [offers,directory,versions,approvals,orders,parts,items,receivables,refunds,customs,files,assets,reservations] = await Promise.all([
      modulesApi.offers(store), settings.combos_enabled ? modulesApi.directory() : Promise.resolve([]), modulesApi.versions(store), modulesApi.approvals(store),
      modulesApi.orders(store), modulesApi.parts(store), modulesApi.orderItems(store), modulesApi.receivables(store), modulesApi.refunds(store),
      modulesApi.customs(store), modulesApi.files(store), modulesApi.assets(store), modulesApi.reservations(store),
    ]);
    if (master) {
      const orderIds = [...new Set([...orders.map(o => o.id),...parts.map(p => p.order_id)])];
      if (orderIds.length) {
        const allOrders = await modulesApi.masterParents(orderIds);
        return { settings, offers, directory, versions, approvals, orders: allOrders, parts, items, receivables, refunds, customs, files, assets, reservations };
      }
    }
    return { settings, offers, directory, versions, approvals, orders, parts, items, receivables, refunds, customs, files, assets, reservations };
  }, [store, master]);
  useEffect(() => {
    let active = true; setError(''); setNotice(''); setData(empty(store)); setTab('settings');
    if (!store) return;
    setLoading(true);
    void load().then(value => { if (active) setData(value); }).catch(e => { if (active) setError(`Não foi possível carregar os módulos. Verifique a implantação das migrations. ${(e as Error).message}`); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [store, load]);
  const reload = async () => setData(await load());
  const loadDetail = async (orderId: string) => {
    setBusy(true); setError('');
    try {
      const detail = await modulesApi.masterDetail(orderId);
      setData(current => ({ ...current,
        parts: [...current.parts.filter(p => p.order_id !== orderId), ...detail.parts],
        items: [...current.items.filter(i => i.order_id !== orderId), ...detail.items],
        refunds: [...current.refunds.filter(r => r.order_id !== orderId), ...detail.refunds],
        receivables: [...current.receivables.filter(r => !detail.parts.some(p => p.id === r.part_id)), ...detail.receivables],
      }));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const command = async (action: string, payload: unknown): Promise<boolean> => {
    if (busy) return false;
    setBusy(true); setError(''); setNotice('');
    try { await modulesApi.command(store, action, payload); await reload(); setNotice('Alteração salva para esta loja.'); return true; }
    catch (e) { setError((e as Error).message); return false; } finally { setBusy(false); }
  };
  const tabs = [{ id: 'settings', label: 'Configuração' }, { id: 'offers', label: 'Catálogo' }, { id: 'combos', label: 'Combos' },
    { id: 'orders', label: 'Pedidos e valores' }, { id: 'custom', label: 'Personalizados / 3D' }, { id: 'rentals', label: 'Aluguel' }];
  const hasModule = data.settings.events_enabled || data.settings.combos_enabled || data.settings.rentals_enabled || data.settings.custom_enabled;
  return <div className="food-modules"><header className="module-row"><div><h1>Eventos e módulos</h1><InfoHint label="Sobre Eventos e módulos">Recursos opcionais por loja.</InfoHint></div>{master && <label>Loja<select disabled={busy} value={store} onChange={e => setSelected(e.target.value)}>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}</header>
    {error && <p className="module-message module-error" role="alert">{error}</p>}{notice && <p className="module-message" role="status">{notice}</p>}
    {loading ? <p role="status">Carregando módulos...</p> : store && <>
      <nav className="module-tabs" aria-label="Seções dos módulos">{tabs.filter(t => t.id === 'orders' || (t.id === 'settings' && canManage) || (t.id === 'offers' && hasModule && canManage) || (t.id === 'combos' && data.settings.combos_enabled && canManage) || (t.id === 'custom' && data.settings.custom_enabled && canManage) || (t.id === 'rentals' && data.settings.rentals_enabled && canManage)).map(t => <button type="button" key={t.id} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>)}</nav>
      {tab === 'settings' && canManage && <ModuleSettingsForm settings={data.settings} busy={busy} canToggle={master||business?.legacy===true} save={value => void command('settings', value)} />}
      {tab === 'offers' && canManage && <OffersPanel key={store} settings={data.settings} offers={data.offers} command={command} busy={busy} />}
      {tab === 'combos' && canManage && <CombosPanel directory={data.directory} approvals={data.approvals} versions={data.versions} command={command} busy={busy} canApprove={!master || membership?.storeId === store} />}
      {(tab === 'orders' || !canManage) && <ModuleOrdersPanel orders={data.orders} parts={data.parts} items={data.items} receivables={data.receivables} refunds={data.refunds} command={command} busy={busy || !canManage} master={master} storeId={store} onDetail={loadDetail} />}
      {tab === 'custom' && canManage && <CustomPanel requests={data.customs} files={data.files} command={command} busy={busy} urgencyBps={data.settings.urgency_bps} reload={reload} onError={setError} />}
      {tab === 'rentals' && canManage && <RentalsPanel offers={data.offers} assets={data.assets} reservations={data.reservations} command={command} busy={busy} />}
      {hasModule && <p><a href={`/modulos/eventos/${store}`} target="_blank" rel="noreferrer">Abrir catálogo de eventos desta loja</a></p>}
      <p className="module-caption">Exibição limitada aos primeiros 200 registros por seção. Todas as consultas permanecem sujeitas às permissões da loja.</p>
    </>}
  </div>;
}
