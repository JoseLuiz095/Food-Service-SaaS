import { Minus, Plus } from 'lucide-react';

export function QuantityControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="quantity-control" aria-label="Quantidade">
      <button type="button" onClick={() => onChange(Math.max(1, value - 1))} aria-label="Diminuir quantidade"><Minus size={16} /></button>
      <span>{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} aria-label="Aumentar quantidade"><Plus size={16} /></button>
    </div>
  );
}
