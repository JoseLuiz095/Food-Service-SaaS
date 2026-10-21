import { useState } from 'react';
import PrintCalculator from './PrintCalculator';
import { moduleMoney } from '../calculator';
import { modulesApi } from '../api';
import type { CustomRequest, CustomFile, PrintCosts } from '../types';
import type { ModuleCommand } from './OffersPanel';

export default function CustomPanel({ requests, files, command, busy, urgencyBps, reload, onError }: { requests: CustomRequest[]; files: CustomFile[]; command: ModuleCommand; busy: boolean; urgencyBps: number; reload: () => Promise<void>; onError: (message: string) => void }) {
  const empty = { customer_name: '', customer_phone: '', quantity: 1, size: '', material: '', color: '', due_at: '', notes: '', status: 'quote', final: '' };
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<CustomRequest>();
  const [quote, setQuote] = useState<PrintCosts>();
  const [urgent, setUrgent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [download, setDownload] = useState<{ id: string; url: string }>();
  const upload = async (request: CustomRequest, file?: File) => {
    if (!file) return;
    setUploading(true);
    try { await modulesApi.upload(request, file); await reload(); } catch (e) { onError((e as Error).message); } finally { setUploading(false); }
  };
  return <><PrintCalculator urgencyBps={urgencyBps} onApply={(costs, finalCents, isUrgent) => { setQuote(costs); setUrgent(isUrgent); setForm({ ...form, final: (finalCents / 100).toFixed(2) }); }} />
    <section className="module-card"><h2>Pedidos personalizados e avulsos</h2><p>Chaveiros, brindes, peças e encomendas para Doce Lua ou outras empresas. Conversa e aprovação de arte pelo WhatsApp.</p>
      <form onSubmit={async e => { e.preventDefault(); if (await command('custom_save', { ...form, id: editing?.id, quote, urgent, final_cents: form.final === '' ? null : Math.round(Number(form.final) * 100), due_at: new Date(form.due_at).toISOString() })) { setEditing(undefined); setForm(empty); setQuote(undefined); } }}>
        <div className="module-grid">
          <label>Cliente ou empresa<input required minLength={2} maxLength={120} value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} /></label>
          <label>WhatsApp<input required type="tel" value={form.customer_phone} onChange={e => setForm({ ...form, customer_phone: e.target.value })} /></label>
          <label>Quantidade<input required type="number" min="1" max="100000" value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} /></label>
          <label>Tamanho / dimensões<input required value={form.size} onChange={e => setForm({ ...form, size: e.target.value })} /></label>
          <label>Material<input required value={form.material} onChange={e => setForm({ ...form, material: e.target.value })} /></label>
          <label>Cor<input required value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} /></label>
          <label>Prazo<input required type="datetime-local" value={form.due_at} onChange={e => setForm({ ...form, due_at: e.target.value })} /></label>
          <label>Situação<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="quote">Orçamento</option><option value="artwork_whatsapp">Arte pelo WhatsApp</option><option value="approved">Aprovado</option><option value="rejected">Recusado</option><option value="completed">Concluído</option></select></label>
          <label>Preço final por unidade (R$)<input type="number" min="0" step="0.01" value={form.final} onChange={e => setForm({ ...form, final: e.target.value })} /></label>
        </div><label>Observações<textarea maxLength={2000} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
        <div className="module-actions"><button className="button button-primary" disabled={busy}>{editing ? 'Atualizar pedido' : 'Salvar orçamento'}</button>{editing && <button type="button" className="button" onClick={() => { setEditing(undefined); setForm(empty); setQuote(undefined); }}>Novo pedido</button>}</div>
      </form>
      {requests.map(r => <article key={r.id} className="module-card"><div className="module-row"><div><strong>{r.customer_name} · {r.quantity} un.</strong><p>{r.size} · {r.material} · {r.color} · {r.status}</p><p>{r.final_cents === null ? 'Sem preço fechado' : `${moduleMoney(r.final_cents)} por unidade · total ${moduleMoney(r.final_cents * r.quantity)}`}</p></div>
        <button className="button" onClick={() => { setEditing(r); setQuote(r.quote || undefined); const date = new Date(r.due_at); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); setForm({ customer_name: r.customer_name, customer_phone: r.customer_phone, quantity: r.quantity, size: r.size, material: r.material, color: r.color, due_at: date.toISOString().slice(0,16), notes: r.notes, status: r.status, final: r.final_cents === null ? '' : String(r.final_cents / 100) }); }}>Editar ficha</button></div>
        <a className="button" target="_blank" rel="noreferrer" href={`https://wa.me/${r.customer_phone.replace(/\D/g,'')}?text=${encodeURIComponent(`Olá! Vamos revisar a arte do pedido ${r.id.slice(0,8)}.`)}`}>Conversar sobre a arte</a>
        <label>Anexar foto, PDF, STL, OBJ ou 3MF (até 25 MiB)<input type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.stl,.obj,.3mf" disabled={uploading} onChange={e => { void upload(r, e.target.files?.[0]); e.target.value = ''; }} /></label>
        {files.filter(f => f.request_id === r.id).map(f => <div className="module-row" key={f.id}><span>{f.name}</span>{download?.id === f.id ? <a href={download.url} target="_blank" rel="noreferrer">Abrir arquivo (link por 60 segundos)</a> : <button className="button" onClick={() => void modulesApi.fileUrl(f.storage_path).then(url => setDownload({ id: f.id, url })).catch(e => onError((e as Error).message))}>Preparar download</button>}</div>)}
      </article>)}
    </section></>;
}
