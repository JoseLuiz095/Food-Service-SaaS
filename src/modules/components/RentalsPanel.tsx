import { InfoHint } from '../../components/ui/InfoHint';
import { useState } from 'react';
import { moduleMoney } from '../calculator';
import type { Offer, RentalAsset, RentalReservation } from '../types';
import type { ModuleCommand } from './OffersPanel';

function ReservationForm({ reservation: r, command, busy }: { reservation: RentalReservation; command: ModuleCommand; busy: boolean }) {
  const [form, setForm] = useState(r);
  const templates = { assembly_checklist: ['Local e piso verificados','Equipamento fixado','Energia e proteção verificadas','Responsável orientado'], return_checklist: ['Equipamento desligado','Inspeção de danos','Limpeza e secagem','Retirada confirmada'] };
  return <form className="module-card" onSubmit={e => { e.preventDefault(); void command('rental_update', form); }}>
    <h3>Reserva · {new Date(r.starts_at).toLocaleString('pt-BR')} até {new Date(r.ends_at).toLocaleString('pt-BR')}</h3><p>Situação: {r.status}</p>
    <div className="module-grid"><label>Sinal recebido manualmente (R$)<input type="number" min="0" step="0.01" value={form.deposit_cents / 100} onChange={e => setForm({ ...form, deposit_cents: Math.round(Number(e.target.value) * 100) })} /></label><label>Referência do sinal<input value={form.deposit_reference || ''} required={form.deposit_cents > 0} onChange={e => setForm({ ...form, deposit_reference: e.target.value })} /></label></div>
    <p>O sinal é um registro manual da reserva. Confira o saldo devedor antes da cobrança do pedido para evitar cobrança em duplicidade.</p>
    <label>Contrato / condições<textarea value={form.contract} maxLength={20000} onChange={e => setForm({ ...form, contract: e.target.value })} /></label>
    <div className="module-grid">{(['assembly_checklist','return_checklist'] as const).map(key => <fieldset key={key}><legend>{key === 'assembly_checklist' ? 'Checklist de montagem' : 'Checklist de retirada'}</legend>
      {(form[key].length ? form[key] : templates[key].map(label => ({ label, checked: false }))).map((c, i, checklist) => <label key={c.label} className="module-check"><input type="checkbox" checked={c.checked} onChange={e => setForm({ ...form, [key]: checklist.map((entry, index) => index === i ? { ...entry, checked: e.target.checked } : entry) })} />{c.label}</label>)}</fieldset>)}</div>
    <p>Sinal registrado: {moduleMoney(form.deposit_cents)}</p><button className="button button-primary" disabled={busy}>Salvar reserva e checklists</button>
  </form>;
}

export default function RentalsPanel({ assets, offers, reservations, command, busy }: { assets: RentalAsset[]; offers: Offer[]; reservations: RentalReservation[]; command: ModuleCommand; busy: boolean }) {
  return <section className="module-card"><h2>Aluguel e manutenção</h2><InfoHint label="Sobre Aluguel e manutenção">Um cadastro por equipamento físico. Reservas sobrepostas e ativos em manutenção são bloqueados pelo servidor.</InfoHint>
    {assets.map(a => <article className="module-row" key={a.offer_id}><div><strong>{offers.find(o => o.id === a.offer_id)?.name || 'Equipamento'}</strong><p>{a.maintenance ? 'Em manutenção' : 'Disponível para novas reservas'}</p><p>{a.maintenance_notes}</p></div><button className="button" disabled={busy} onClick={() => void command('rental_asset', { offer_id: a.offer_id, maintenance: !a.maintenance, notes: a.maintenance_notes })}>{a.maintenance ? 'Concluir manutenção' : 'Colocar em manutenção'}</button></article>)}
    {reservations.map(r => <ReservationForm key={`${r.id}:${r.deposit_cents}:${r.contract}:${JSON.stringify(r.assembly_checklist)}:${JSON.stringify(r.return_checklist)}`} reservation={r} command={command} busy={busy} />)}
    {!reservations.length && <p>Orçamentos e reservas começam pelo catálogo de eventos da loja. Use a revisão do pedido antes de emitir a cobrança.</p>}
  </section>;
}
