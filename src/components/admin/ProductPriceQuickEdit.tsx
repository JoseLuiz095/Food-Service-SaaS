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
  const [baseDraft, setBaseDraft] = useState('');
  const [promoDraft, setPromoDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const promotional = product.promotionalPrice != null;

  const start = () => {
    setBaseDraft(String(product.price));
    setPromoDraft(product.promotionalPrice == null ? '' : String(product.promotionalPrice));
    setEditing(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || baseDraft.trim() === '') return;
    const basePrice = Number(baseDraft);
    const promoPrice = promoDraft.trim() === '' ? undefined : Number(promoDraft);
    if (!Number.isFinite(basePrice) || basePrice < 0 || (promoPrice !== undefined && (!Number.isFinite(promoPrice) || promoPrice < 0))) {
      showToast('Informe um preço válido.', 'error');
      return;
    }
    if (promoPrice !== undefined && promoPrice > basePrice) {
      showToast('O preço promocional não pode ser maior que o preço normal.', 'error');
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...product, price: basePrice, promotionalPrice: promoPrice });
      setEditing(false);
      showToast('Preço atualizado.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao atualizar preço.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (editing) return <form className="product-quick-price" onSubmit={(event) => void submit(event)}>
    <label>Preço normal
      <input autoFocus aria-label={`Novo preço de ${product.name}`} type="number" min="0" step="0.01" inputMode="decimal" required value={baseDraft} onChange={(event) => setBaseDraft(event.target.value)} disabled={saving} />
    </label>
    <label>Preço promocional (opcional)
      <input aria-label={`Novo preço promocional de ${product.name}`} type="number" min="0" step="0.01" inputMode="decimal" value={promoDraft} onChange={(event) => setPromoDraft(event.target.value)} disabled={saving} />
    </label>
    <div><button type="submit" className="primary-button compact-button" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button><button type="button" className="secondary-button compact-button" onClick={() => setEditing(false)} disabled={saving}>Cancelar</button></div>
  </form>;

  return <div className="product-quick-price-view"><strong>{currency.format(product.promotionalPrice ?? product.price)}</strong>{promotional && <small><del>{currency.format(product.price)}</del></small>}<button type="button" onClick={start} aria-label={`Alterar preço de ${product.name}`}><Edit3 size={13} />Alterar</button></div>;
}
