import { useId, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { copyText } from '../utils/clipboard';

/** Always leaves the payload selectable, including in browsers that deny clipboard access. */
export default function PixCopyButton({ value, label = 'Código Pix' }: { value: string; label?: string }) {
  const id = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const copy = async () => {
    try { await copyText(value); setState('copied'); }
    catch { setState('manual'); field.current?.focus(); field.current?.select(); field.current?.setSelectionRange(0, value.length); }
  };
  return <div className="pix-copy-control">
    <label htmlFor={id}>{label}</label><textarea id={id} ref={field} readOnly value={value} rows={3} onClick={event => event.currentTarget.select()} />
    <button type="button" className="primary-button" onClick={() => void copy()}>{state === 'copied' ? <Check size={18}/> : <Copy size={18}/>}{label === 'Chave Pix' ? 'Copiar chave Pix' : 'Copiar código Pix'}</button>
    <p role="status">{state === 'copied' ? 'Código Pix copiado. Cole no aplicativo do seu banco.' : state === 'manual' ? 'A cópia automática foi bloqueada. O código está selecionado: mantenha o dedo sobre ele e escolha Copiar.' : 'Cole este código na opção Pix Copia e Cola do seu banco.'}</p>
  </div>;
}
