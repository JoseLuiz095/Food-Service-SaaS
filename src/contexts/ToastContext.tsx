import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { createId } from '../utils/id';

type ToastTone = 'success' | 'error' | 'info';
type Toast = { id: string; message: string; tone: ToastTone };
type ToastContextValue = { showToast: (message: string, tone?: ToastTone) => void };
const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const remove = useCallback((id: string) => setToasts((current)=>current.filter((toast)=>toast.id!==id)), []);
  const showToast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = createId();
    setToasts((current)=>[...current,{id,message,tone}]);
    window.setTimeout(()=>remove(id), 4200);
  }, [remove]);
  const value = useMemo(()=>({showToast}),[showToast]);
  return <ToastContext.Provider value={value}>{children}<div className="toast-stack" aria-live="polite">{toasts.map((toast)=>{const Icon=toast.tone==='success'?CheckCircle2:toast.tone==='error'?CircleAlert:Info;return <div key={toast.id} className={`toast toast--${toast.tone}`}><Icon size={18}/><span>{toast.message}</span><button onClick={()=>remove(toast.id)} aria-label="Fechar aviso"><X size={16}/></button></div>})}</div></ToastContext.Provider>;
}

export const useToast = () => {
  const value=useContext(ToastContext);
  if(!value) throw new Error('useToast deve ser usado dentro de ToastProvider');
  return value;
};
