import { InfoHint } from '../../components/ui/InfoHint';
import { useState } from 'react';
import { moduleMoney } from '../calculator';
import type { ComboItem, ComboVersion, Offer } from '../types';
import type { ModuleCommand } from './OffersPanel';

export default function CombosPanel({ directory, approvals, versions, command, busy, canApprove }: { directory: Offer[]; approvals: ComboItem[]; versions: ComboVersion[]; command: ModuleCommand; busy: boolean; canApprove: boolean }) {
  const [name, setName] = useState('');
  const [combo, setCombo] = useState('');
  const [selected, setSelected] = useState<Record<string, { quantity: number; discount_bps: number }>>({});
  return <><section className="module-card"><h2>Propor combo</h2><InfoHint label="Sobre Propor combo">Cada fornecedor aprova os próprios itens, quantidades, preços e descontos. Editar sempre cria uma nova versão.</InfoHint>
    <form onSubmit={async e => { e.preventDefault(); if (await command('combo_save', { name, combo_id: combo || undefined, items: Object.entries(selected).map(([offer_id, terms]) => ({ offer_id, ...terms })) })) { setSelected({}); setName(''); setCombo(''); } }}>
      <div className="module-grid"><label>Nome do combo<input required minLength={2} maxLength={150} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>Versionamento<select value={combo} onChange={e => setCombo(e.target.value)}><option value="">Criar novo combo</option>{versions.filter((v,i,all) => all.findIndex(x => x.combo_id === v.combo_id) === i).map(v => <option key={v.combo_id} value={v.combo_id}>Nova versão: {v.name}</option>)}</select></label></div>
      {directory.map(o => <div className="module-row" key={o.id}><label className="module-check"><input type="checkbox" checked={!!selected[o.id]} onChange={e => { const next = { ...selected }; if (e.target.checked) next[o.id] = { quantity: 1, discount_bps: 0 }; else delete next[o.id]; setSelected(next); }} />{o.name} · {o.store_name} · {moduleMoney(o.price_cents)}</label>
        {selected[o.id] && <div className="module-inline"><label>Quantidade<input type="number" min="1" max={o.max_quantity} required value={selected[o.id].quantity} onChange={e => setSelected({ ...selected, [o.id]: { ...selected[o.id], quantity: Number(e.target.value) } })} /></label><label>Desconto (%)<input type="number" min="0" max="100" step="0.01" value={selected[o.id].discount_bps / 100} onChange={e => setSelected({ ...selected, [o.id]: { ...selected[o.id], discount_bps: Math.round(Number(e.target.value) * 100) } })} /></label></div>}</div>)}
      {!directory.length && <p>Os fornecedores precisam publicar ofertas e ativar Combos.</p>}
      <button className="button button-primary" disabled={busy || !Object.keys(selected).length}>Enviar para aprovação</button>
    </form>
  </section>
  <section className="module-card"><h2>Aprovações desta loja</h2>{approvals.map(i => <article className="module-row" key={i.id}><div><strong>{i.snapshot.name}</strong><p>{i.quantity} un. · {moduleMoney(i.snapshot.price_cents)} por unidade · desconto {i.discount_bps / 100}% · {i.approval}</p><small>Versão {i.version_id.slice(0,8)}</small></div>
    {canApprove && i.approval === 'pending' && <div className="module-actions"><button className="button" disabled={busy} onClick={() => void command('combo_approve', { item_id: i.id, approve: true })}>Aprovar</button><button className="button" disabled={busy} onClick={() => void command('combo_approve', { item_id: i.id, approve: false })}>Recusar</button></div>}</article>)}</section>
  <section className="module-card"><h2>Versões da loja vendedora</h2>{versions.map(v => <article className="module-row" key={v.id}><div><strong>{v.name} · v{v.version}</strong><p>{v.published ? 'Publicado' : 'Aguardando aprovação/publicação'}</p></div>{!v.published && <button className="button" disabled={busy} onClick={() => void command('combo_publish', { version_id: v.id })}>Publicar versão aprovada</button>}</article>)}</section></>;
}
