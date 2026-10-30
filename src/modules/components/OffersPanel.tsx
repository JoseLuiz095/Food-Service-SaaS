import { InfoHint } from '../../components/ui/InfoHint';
import { useState } from 'react';
import { moduleMoney } from '../calculator';
import { offerKindLabels } from '../types';
import type { ModuleSettings, Offer, OfferKind } from '../types';

export type ModuleCommand = (action: string, data: unknown) => Promise<boolean>;
export default function OffersPanel({ settings, offers, command, busy }: { settings: ModuleSettings; offers: Offer[]; command: ModuleCommand; busy: boolean }) {
  const empty = { name: '', kind: 'product' as OfferKind, price: '', stock: '', ready: false, published: false, max: settings.max_quantity, lead: settings.lead_hours };
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string>();
  const kinds = (Object.keys(offerKindLabels) as OfferKind[]).filter(kind => kind === 'rental' ? settings.rentals_enabled : ['printing3d','custom'].includes(kind) ? settings.custom_enabled : settings.events_enabled);
  return <section className="module-card"><h2>Catálogo dos módulos</h2>
    <InfoHint label="Sobre Catálogo dos módulos">Cadastre saldo destinado a eventos e encomendas. Esse saldo é separado do catálogo da venda normal.</InfoHint>
    <form onSubmit={async e => { e.preventDefault(); if (await command('offer_save', { id: editing, name: form.name, kind: kinds.includes(form.kind) ? form.kind : kinds[0], price_cents: Math.round(Number(form.price) * 100), stock_quantity: form.stock === '' ? null : Number(form.stock), max_quantity: form.max, lead_hours: form.lead, ready_now: form.ready, published: form.published })) { setForm(empty); setEditing(undefined); } }}>
      <div className="module-grid">
        <label>Nome<input required minLength={2} maxLength={150} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label>Tipo<select disabled={!!editing} value={kinds.includes(form.kind) ? form.kind : kinds[0]} onChange={e => setForm({ ...form, kind: e.target.value as OfferKind })}>{kinds.map(k => <option key={k} value={k}>{offerKindLabels[k]}</option>)}</select></label>
        <label>Preço (R$)<input type="number" min="0" required step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></label>
        <label>Saldo destinado ao módulo<input type="number" min="0" placeholder="Vazio: produção/serviço sem saldo físico" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} /></label>
        <label>Quantidade máxima<input type="number" min="1" required value={form.max} onChange={e => setForm({ ...form, max: Number(e.target.value) })} /></label>
        <label>Prazo mínimo (h)<input type="number" min="0" required value={form.lead} onChange={e => setForm({ ...form, lead: Number(e.target.value) })} /></label>
      </div>
      <label className="module-check"><input type="checkbox" checked={form.ready} onChange={e => setForm({ ...form, ready: e.target.checked })} />Pronta entrega (caso contrário, requer agendamento)</label>
      <label className="module-check"><input type="checkbox" checked={form.published} onChange={e => setForm({ ...form, published: e.target.checked })} />Publicar no catálogo e disponibilizar para propostas de combo</label>
      <div className="module-actions"><button className="button button-primary" disabled={busy || !kinds.length}>{editing ? 'Salvar oferta' : 'Cadastrar oferta'}</button>{editing && <button type="button" className="button" onClick={() => { setEditing(undefined); setForm(empty); }}>Cancelar edição</button>}</div>
    </form>
    <div className="module-list">{offers.map(o => <article className="module-row" key={o.id}><div><strong>{o.name}</strong><p>{offerKindLabels[o.kind]} · {moduleMoney(o.price_cents)} · {o.published ? 'Publicado' : 'Privado'} · Saldo: {o.stock_quantity ?? 'Sob demanda'} · Reservado: {o.reserved_quantity}</p></div>
      <button type="button" className="button" onClick={() => { setEditing(o.id); setForm({ name: o.name, kind: o.kind, price: String(o.price_cents / 100), stock: o.stock_quantity === null ? '' : String(o.stock_quantity), max: o.max_quantity, lead: o.lead_hours, ready: o.ready_now, published: o.published }); }}>Editar</button></article>)}</div>
  </section>;
}
