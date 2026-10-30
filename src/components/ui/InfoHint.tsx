import { Info } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import './info-hint.css';

/** Native popover stays above scroll containers and works by touch or keyboard. */
export function InfoHint({ children, label = 'Informações sobre esta seção' }: { children: ReactNode; label?: string }) {
  const id = useId();
  const panel = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  return <span className="info-hint">
    <button type="button" className="info-hint__trigger" aria-label={label} aria-expanded={open} aria-controls={id} popoverTarget={id}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (panel.current) {
          const width = Math.min(320, window.innerWidth - 24);
          panel.current.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
          const top = Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - 160));
          panel.current.style.top = `${top}px`;
          panel.current.style.maxHeight = `${window.innerHeight - top - 12}px`;
        }
      }}><Info size={17} aria-hidden="true" /></button>
    <span ref={panel} id={id} popover="auto" role="note" className="info-hint__content" onToggle={(event) => setOpen(event.newState === 'open')}>{children}</span>
  </span>;
}
