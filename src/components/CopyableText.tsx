import { useEffect, useId, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyText } from '../utils/clipboard';

type Props = { value: string; label: string; copyLabel: string; instructions: string; copiedMessage: string };

/** Mantém texto selecionável quando o navegador bloqueia a área de transferência. */
export default function CopyableText({ value, label, copyLabel, instructions, copiedMessage }: Props) {
  const id = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const [state, setState] = useState<'idle' | 'copying' | 'copied' | 'manual'>('idle');
  useEffect(() => { generation.current++; busy.current = false; setState('idle'); return () => { generation.current++; }; }, [value]);
  const copy = async () => {
    if (busy.current) return;
    const request = generation.current;
    busy.current = true; setState('copying');
    try {
      await copyText(value);
      if (request === generation.current) setState('copied');
    } catch {
      if (request !== generation.current) return;
      setState('manual'); field.current?.focus(); field.current?.select(); field.current?.setSelectionRange(0, value.length);
    } finally { if (request === generation.current) busy.current = false; }
  };
  return <div className="pix-copy-control">
    <label htmlFor={id}>{label}</label>
    <textarea id={id} ref={field} readOnly value={value} rows={3} onClick={event => event.currentTarget.select()} aria-describedby={`${id}-status`}/>
    <button type="button" className="primary-button" disabled={state === 'copying'} onClick={() => void copy()}>{state === 'copied' ? <Check size={18} aria-hidden="true"/> : <Copy size={18} aria-hidden="true"/>}{state === 'copying' ? 'Copiando…' : copyLabel}</button>
    <p id={`${id}-status`} role="status">{state === 'copied' ? copiedMessage : state === 'manual' ? 'A cópia automática foi bloqueada. O texto está selecionado: mantenha o dedo sobre ele e escolha Copiar, ou use Ctrl+C.' : instructions}</p>
  </div>;
}
