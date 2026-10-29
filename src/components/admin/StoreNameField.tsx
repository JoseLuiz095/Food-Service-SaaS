import { useEffect, useState } from 'react';
import './store-name-field.css';
import { checkStoreName } from '../../services/storeIdentityApi';
import { STORE_NAME_TAKEN, storeNameValidation } from '../../utils/storeName';

type Props = { storeId: string; value: string; originalName: string; onChange: (name: string) => void; disabled?: boolean };
export default function StoreNameField({ storeId, value, originalName, onChange, disabled }: Props) {
  const [result, setResult] = useState<{ storeId: string; name: string; available?: boolean; error?: string }>();
  const [retry, setRetry] = useState(0);
  const changed = value !== originalName;
  const invalid = storeNameValidation(value);
  const current = result?.storeId === storeId && result.name === value ? result : undefined;
  useEffect(() => {
    if (!changed || invalid) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void checkStoreName(storeId, value).then(available => {
        if (active) setResult({ storeId, name: value, available });
      }).catch(error => {
        if (active) setResult({ storeId, name: value, error: error instanceof Error ? error.message : 'Não foi possível validar o nome.' });
      });
    }, 400);
    return () => { active = false; window.clearTimeout(timer); };
  }, [storeId, value, changed, invalid, retry]);
  const message = invalid || (!changed ? 'Você pode alterar o nome exibido. O link da loja permanece o mesmo.'
    : current?.error || (current?.available === false ? STORE_NAME_TAKEN : current?.available ? 'Nome disponível. A confirmação ocorre ao salvar.' : 'Verificando se este nome está disponível…'));
  return <div className="full store-name-field">
    <label htmlFor="store-name">Nome da loja</label>
    <input id="store-name" required maxLength={120} value={value} disabled={disabled} onChange={e => onChange(e.target.value)} aria-describedby="store-name-status" aria-invalid={Boolean(invalid || current?.available === false)} />
    <small id="store-name-status" role="status">{message}</small>
    {current?.error && <button type="button" className="text-link" disabled={disabled} onClick={() => { setResult(undefined); setRetry(n => n + 1); }}>Verificar nome novamente</button>}
  </div>;
}
