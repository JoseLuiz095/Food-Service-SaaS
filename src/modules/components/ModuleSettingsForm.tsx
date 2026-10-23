import { useEffect, useState } from 'react';
import type { ModuleSettings } from '../types';

export default function ModuleSettingsForm({ settings, save, busy, canToggle=true }: { settings: ModuleSettings; save: (data: ModuleSettings) => void; busy: boolean; canToggle?:boolean }) {
  const [form, setForm] = useState(settings);
  useEffect(() => setForm(settings), [settings]);
  return <form className="module-card" onSubmit={e => { e.preventDefault(); save(form); }}>
    <h2>Módulos opcionais</h2><p>{canToggle?'Configuração operacional dos módulos desta loja.':'A ativação de recursos complementares depende de autorização do Admin Master. Você pode ajustar os parâmetros da operação.'}</p>{!canToggle&&<p><a href="/admin/negocio">Consultar módulos e permissões</a></p>}
    {([['events_enabled','Eventos'],['combos_enabled','Combos com parceiros'],['rentals_enabled','Aluguel'],['custom_enabled','Personalizados e impressão 3D']] as const).map(([key,label]) =>
      <label className="module-check" key={key}><input type="checkbox" disabled={!canToggle||busy} checked={form[key]} onChange={e => setForm({ ...form, [key]: e.target.checked })} />{label}</label>)}
    <div className="module-grid">
      <label>Quantidade máxima por oferta<input type="number" required min="1" max="100000" value={form.max_quantity} onChange={e => setForm({ ...form, max_quantity: Number(e.target.value) })} /></label>
      <label>Prazo mínimo (horas)<input type="number" required min="0" max="87600" value={form.lead_hours} onChange={e => setForm({ ...form, lead_hours: Number(e.target.value) })} /></label>
      <label>Taxa de urgência (%)<input type="number" required min="0" max="100" step="0.01" value={form.urgency_bps / 100} onChange={e => setForm({ ...form, urgency_bps: Math.round(Number(e.target.value) * 100) })} /></label>
    </div><button className="button button-primary" disabled={busy}>Salvar configuração desta loja</button>
    <p>Desativar impede novas vendas do módulo. Pedidos e compromissos existentes continuam acessíveis.</p>
  </form>;
}
