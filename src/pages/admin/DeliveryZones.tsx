import { MapPinned, Plus, Save, Search, Trash2, Truck } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ErrorState, LoadingState } from '../../components/ui/AsyncState';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import type { DeliveryZone } from '../../types';
import { currency } from '../../utils/format';
import { createId } from '../../utils/id';

const emptyZone = (storeId: string, city: string, state: string, sortOrder: number): DeliveryZone => ({
  id: createId(),
  storeId,
  name: '',
  aliases: [],
  city,
  state,
  fee: 0,
  active: false,
  sortOrder,
});

export default function DeliveryZonesAdmin() {
  const { settings, deliveryZones, saveDeliveryZones, deleteDeliveryZone, loading, error, reloadAdmin } = useStore();
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState<DeliveryZone[]>([]);
  const [newZone, setNewZone] = useState<DeliveryZone>(() => emptyZone(settings.id, settings.city, settings.state, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDrafts(deliveryZones.map((zone) => ({ ...zone, aliases: [...zone.aliases] })));
    const nextOrder = Math.max(0, ...deliveryZones.map((zone) => zone.sortOrder)) + 10;
    setNewZone(emptyZone(settings.id, settings.city, settings.state, nextOrder));
  }, [deliveryZones, settings.id, settings.city, settings.state]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return drafts
      .filter((zone) => !term || `${zone.name} ${zone.city} ${zone.state}`.toLowerCase().includes(term))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [drafts, query]);

  const stats = useMemo(() => {
    const active = drafts.filter((zone) => zone.active);
    const avg = active.length ? active.reduce((sum, zone) => sum + zone.fee, 0) / active.length : 0;
    return { total: drafts.length, active: active.length, avg };
  }, [drafts]);

  const patchDraft = (id: string, patch: Partial<DeliveryZone>) => {
    setDrafts((current) => current.map((zone) => zone.id === id ? { ...zone, ...patch } : zone));
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const invalid = drafts.find((zone) => !zone.name.trim() || !zone.city.trim() || zone.state.trim().length !== 2 || zone.fee < 0);
      if (invalid) throw new Error(`Revise os dados da área "${invalid.name || 'sem nome'}".`);
      await saveDeliveryZones(drafts.map((zone) => ({ ...zone, name: zone.name.trim(), city: zone.city.trim(), state: zone.state.trim().toUpperCase() })));
      showToast('Áreas e taxas de entrega salvas.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Não foi possível salvar as áreas.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addZone = async (event: FormEvent) => {
    event.preventDefault();
    if (!newZone.name.trim() || !newZone.city.trim() || newZone.state.trim().length !== 2) {
      showToast('Informe nome, cidade e UF da nova área.', 'error');
      return;
    }
    try {
      await saveDeliveryZones([{ ...newZone, name: newZone.name.trim(), city: newZone.city.trim(), state: newZone.state.trim().toUpperCase() }]);
      showToast('Nova área de entrega adicionada.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Não foi possível adicionar a área.', 'error');
    }
  };

  const remove = async (zone: DeliveryZone) => {
    if (!confirm(`Excluir a área de entrega "${zone.name}"?`)) return;
    try {
      await deleteDeliveryZone(zone.id);
      showToast('Área removida.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Não foi possível remover a área.', 'error');
    }
  };

  if (loading) return <LoadingState label="Carregando áreas de entrega..." />;
  if (error) return <ErrorState message={error} onRetry={() => void reloadAdmin()} />;

  return (
    <>
      <div className="admin-page-title delivery-page-title">
        <div>
          <span className="eyebrow">LOGÍSTICA</span>
          <h1>Áreas e taxas de entrega</h1>
          <p>Defina os bairros e cidades atendidos. Somente áreas ativas aparecem no checkout.</p>
        </div>
        <button className="primary-button" type="button" disabled={saving} onClick={() => void saveAll()}><Save size={17} />{saving ? 'Salvando...' : 'Salvar alterações'}</button>
      </div>

      <div className="delivery-stat-grid">
        <article><Truck size={20} /><div><span>Áreas cadastradas</span><strong>{stats.total}</strong></div></article>
        <article><MapPinned size={20} /><div><span>Áreas ativas</span><strong>{stats.active}</strong></div></article>
        <article><span className="delivery-money-icon">R$</span><div><span>Taxa média ativa</span><strong>{currency.format(stats.avg)}</strong></div></article>
      </div>

      <div className="delivery-admin-layout">
        <section className="admin-card no-padding delivery-zone-list-card">
          <div className="delivery-zone-toolbar">
            <div className="admin-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar bairro, cidade ou UF" /></div>
            <span>{filtered.length} área(s)</span>
          </div>

          <div className="delivery-zone-head">
            <span>Área</span><span>Taxa</span><span>Ordem</span><span>Status</span><span />
          </div>
          <div className="delivery-zone-list">
            {filtered.map((zone) => (
              <article key={zone.id} className={zone.active ? 'is-active' : ''}>
                <div className="delivery-zone-name">
                  <strong>{zone.name}</strong>
                  <span>{zone.city} · {zone.state}</span>
                  {zone.aliases.length > 0 && <small>Também reconhece: {zone.aliases.join(', ')}</small>}
                </div>
                <label className="delivery-inline-field"><span>Taxa</span><div><b>R$</b><input type="number" min="0" step="0.01" value={zone.fee} onChange={(e) => patchDraft(zone.id, { fee: Number(e.target.value) })} /></div></label>
                <label className="delivery-inline-field"><span>Ordem</span><input type="number" min="0" step="10" value={zone.sortOrder} onChange={(e) => patchDraft(zone.id, { sortOrder: Number(e.target.value) })} /></label>
                <label className="delivery-status-toggle"><input type="checkbox" checked={zone.active} onChange={(e) => patchDraft(zone.id, { active: e.target.checked })} /><span>{zone.active ? 'Ativa' : 'Oculta'}</span></label>
                <button className="icon-danger-button" type="button" onClick={() => void remove(zone)} aria-label={`Excluir ${zone.name}`}><Trash2 size={17} /></button>
              </article>
            ))}
            {!filtered.length && <div className="delivery-zone-empty">Nenhuma área encontrada.</div>}
          </div>
        </section>

        <aside className="admin-card delivery-new-zone-card">
          <span className="eyebrow">NOVA ÁREA</span>
          <h2>Adicionar bairro ou cidade</h2>
          <p>Use também para atender municípios ou regiões fora de Linhares.</p>
          <form onSubmit={addZone}>
            <label>Nome da área<input required value={newZone.name} onChange={(e) => setNewZone((current) => ({ ...current, name: e.target.value }))} placeholder="Ex.: Bairro Novo" /></label>
            <div className="form-grid">
              <label>Cidade<input required value={newZone.city} onChange={(e) => setNewZone((current) => ({ ...current, city: e.target.value }))} /></label>
              <label>UF<input required maxLength={2} value={newZone.state} onChange={(e) => setNewZone((current) => ({ ...current, state: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) }))} /></label>
              <label>Taxa (R$)<input type="number" min="0" step="0.01" value={newZone.fee} onChange={(e) => setNewZone((current) => ({ ...current, fee: Number(e.target.value) }))} /></label>
              <label>Ordem<input type="number" min="0" step="10" value={newZone.sortOrder} onChange={(e) => setNewZone((current) => ({ ...current, sortOrder: Number(e.target.value) }))} /></label>
            </div>
            <label>Apelidos para reconhecer pelo CEP<input value={newZone.aliases.join(', ')} onChange={(e) => setNewZone((current) => ({ ...current, aliases: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) }))} placeholder="Ex.: Vila Betânea, Betania" /></label>
            <label className="switch-row"><span><strong>Área ativa</strong><small>Exibir imediatamente no checkout</small></span><input type="checkbox" checked={newZone.active} onChange={(e) => setNewZone((current) => ({ ...current, active: e.target.checked }))} /></label>
            <button className="primary-button full-button" type="submit"><Plus size={17} />Adicionar área</button>
          </form>
        </aside>
      </div>
    </>
  );
}
