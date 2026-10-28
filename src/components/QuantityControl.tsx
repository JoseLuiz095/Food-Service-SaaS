import { Minus, Plus } from 'lucide-react';

export function QuantityControl({ value, onChange, min = 1, max = 99, label = 'Quantidade' }: { value: number; onChange: (value: number) => void; min?: number; max?: number; label?: string }) {
  return (
    <div className="quantity-control" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Diminuir quantidade"><Minus size={16} /></button>
      <span>{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Aumentar quantidade"><Plus size={16} /></button>
    </div>
  );
}
