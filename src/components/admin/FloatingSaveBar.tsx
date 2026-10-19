import { Check, X } from 'lucide-react';

type FloatingSaveBarProps = {
  label?: string;
  description?: string;
  saving?: boolean;
  onSave: () => void;
  onCancel?: () => void;
};

/** A small, non-blocking save action that only appears while a form is dirty. */
export function FloatingSaveBar({ label = 'Salvar alterações', description = 'Você tem alterações não salvas.', saving = false, onSave, onCancel }: FloatingSaveBarProps) {
  return <div className="floating-save-bar" role="status" aria-live="polite">
    <div className="floating-save-bar__copy"><strong>{description}</strong><span>Revise e salve quando terminar.</span></div>
    {onCancel && <button type="button" className="secondary-button compact-button" onClick={onCancel} disabled={saving}><X size={15} />Descartar</button>}
    <button type="button" className="primary-button compact-button" onClick={onSave} disabled={saving}><Check size={16} />{saving ? 'Salvando...' : label}</button>
  </div>;
}
