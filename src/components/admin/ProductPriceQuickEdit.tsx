import { Edit3 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { Product } from '../../types';
import { currency } from '../../utils/format';
import { useToast } from '../../contexts/ToastContext';
import './product-price-quick-edit.css';

type Props = {
  product: Product;
  onSave: (product: Product) => Promise<void>;
};

export function ProductPriceQuickEdit({ product, onSave }: Props) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const promotional = product.promotionalPrice != null;

  const start = () => {
    setDraft(String(product.promotionalPrice ?? product.price));
    setEditing(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || draft.trim() === '') return;
    const value = Number(draft);
    if (!Number.isFinite(value) || value < 0) {
      showToast('Informe um preço válido.', 'error');
      return;
    }
    if (promotional && value > product.price) {
      showToast('O preço promocional não pode ser maior que o preço normal.', 'error');
      return;
    }
    setSaving(true);
    try {
      await onSave(promotional ? { ...product, promotionalPrice: value } : { ...product, price: value });
      setEditing(false);
      showToast('Preço atualizado.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao atualizar preço.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (editing) return <form className="product-quick-price" onSubmit={(event) => void submit(event)}>
    <label>{promotional ? 'Preço promocional' : 'Preço'}
      <input autoFocus aria-label={`Novo preço de ${product.name}`} type="number" min="0" step="0.01" inputMode="decimal" required value={draft} onChange={(event) => setDraft(event.target.value)} disabled={saving} />
    </label>
    <div><button type="submit" className="primary-button compact-button" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button><button type="button" className="secondary-button compact-button" onClick={() => setEditing(false)} disabled={saving}>Cancelar</button></div>
  </form>;

  return <div className="product-quick-price-view"><strong>{currency.format(product.promotionalPrice ?? product.price)}</strong>{promotional && <small><del>{currency.format(product.price)}</del></small>}<button type="button" onClick={start} aria-label={`Alterar preço de ${product.name}`}><Edit3 size={13} />Alterar</button></div>;
}
