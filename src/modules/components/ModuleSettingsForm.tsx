import { useEffect, useState } from 'react';
import type { ModuleSettings } from '../types';

export default function ModuleSettingsForm({ settings, save, busy }: { settings: ModuleSettings; save: (data: ModuleSettings) => void; busy: boolean }) {
  const [form, setForm] = useState(settings);
  useEffect(() => setForm(settings), [settings]);
  return <form className="module-card" onSubmit={e => { e.preventDefault(); save(form); }}>
    <h2>Módulos opcionais</h2><p>Ative somente os recursos que esta loja vai utilizar. Todos começam desativados.</p>
    {([['events_enabled','Eventos'],['combos_enabled','Combos com parceiros'],['rentals_enabled','Aluguel'],['custom_enabled','Personalizados e impressão 3D']] as const).map(([key,label]) =>
      <label className="module-check" key={key}><input type="checkbox" checked={form[key]} onChange={e => setForm({ ...form, [key]: e.target.checked })} />{label}</label>)}
    <div className="module-grid">
      <label>Quantidade máxima por oferta<input type="number" required min="1" max="100000" value={form.max_quantity} onChange={e => setForm({ ...form, max_quantity: Number(e.target.value) })} /></label>
      <label>Prazo mínimo (horas)<input type="number" required min="0" max="87600" value={form.lead_hours} onChange={e => setForm({ ...form, lead_hours: Number(e.target.value) })} /></label>
      <label>Taxa de urgência (%)<input type="number" required min="0" max="100" step="0.01" value={form.urgency_bps / 100} onChange={e => setForm({ ...form, urgency_bps: Math.round(Number(e.target.value) * 100) })} /></label>
    </div><button className="button button-primary" disabled={busy}>Salvar configuração desta loja</button>
    <p>Desativar impede novas vendas do módulo. Pedidos e compromissos existentes continuam acessíveis.</p>
  </form>;
}
