import { useMemo, useState } from 'react';
import { calculatePrintPrice, defaultPrintCosts, moduleMoney } from '../calculator';
import type { PrintCosts } from '../types';

const fields: { key: keyof PrintCosts; label: string; factor?: number }[] = [
  { key: 'grams', label: 'Filamento (g)' }, { key: 'cents_per_gram', label: 'Preço por grama (R$)', factor: 100 },
  { key: 'watts', label: 'Potência (W)' }, { key: 'energy_cents_kwh', label: 'Energia (R$/kWh)', factor: 100 },
  { key: 'hours', label: 'Tempo de máquina (h)' }, { key: 'machine_cents_hour', label: 'Máquina (R$/h)', factor: 100 },
  { key: 'labor_cents', label: 'Mão de obra por unidade (R$)', factor: 100 }, { key: 'finishing_cents', label: 'Acabamento (R$)', factor: 100 },
  { key: 'margin_bps', label: 'Margem sobre venda (%)', factor: 100 },
];

export default function PrintCalculator({ urgencyBps, onApply }: { urgencyBps: number; onApply: (costs: PrintCosts, finalCents: number, urgent: boolean) => void }) {
  const [costs, setCosts] = useState(defaultPrintCosts);
  const [urgent, setUrgent] = useState(false);
  const [final, setFinal] = useState('');
  const result = useMemo(() => {
    try { return { price: calculatePrintPrice(costs, urgent ? urgencyBps : 0), error: '' }; }
    catch (error) { return { price: null, error: (error as Error).message }; }
  }, [costs, urgent, urgencyBps]);
  return <section className="module-card"><h2>Calculadora de impressão 3D</h2><p>Custos por unidade. Margem sobre o preço de venda. A urgência depende de aceite da loja.</p>
    <div className="module-grid">{fields.map(({ key, label, factor = 1 }) => <label key={key}>{label}<input type="number" min="0" step="0.01" value={costs[key] / factor}
      onChange={e => setCosts({ ...costs, [key]: Number(e.target.value) * factor })} /></label>)}</div>
    <label className="module-check"><input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} />Urgência ({urgencyBps / 100}%)</label>
    {result.error && <p role="alert">{result.error}</p>}
    {result.price && <p>Custo: <strong>{moduleMoney(result.price.baseCents)}</strong> · Preço sugerido por unidade: <strong>{moduleMoney(result.price.suggestedCents)}</strong></p>}
    <label>Preço final por unidade (R$)<input type="number" min="0" step="0.01" placeholder={result.price ? (result.price.suggestedCents / 100).toFixed(2) : ''} value={final} onChange={e => setFinal(e.target.value)} /></label>
    <button type="button" className="button button-primary" disabled={!result.price || (final !== '' && (!Number.isFinite(Number(final)) || Number(final) < 0))}
      onClick={() => result.price && onApply(costs, final === '' ? result.price.suggestedCents : Math.round(Number(final) * 100), urgent)}>Usar no orçamento</button>
  </section>;
}
