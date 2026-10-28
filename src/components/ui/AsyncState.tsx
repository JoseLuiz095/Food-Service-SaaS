import { AlertTriangle, RefreshCw, ShoppingBag } from 'lucide-react';

export function LoadingState({ label='Carregando...' }: { label?: string }) {
  return <div className="async-state" role="status"><ShoppingBag aria-hidden="true" className="spin-soft" size={28}/><strong>{label}</strong></div>;
}
export function ErrorState({ message, onRetry }: { message:string; onRetry?:()=>void }) {
  return <div className="async-state async-state--error" role="alert"><AlertTriangle aria-hidden="true" size={28}/><strong>Não foi possível carregar</strong><p>{message}</p>{onRetry&&<button className="secondary-button" onClick={onRetry}><RefreshCw size={16}/>Tentar novamente</button>}</div>;
}
export function EmptyState({ title, text }: { title:string; text?:string }) {
  return <div className="async-state"><ShoppingBag size={28}/><strong>{title}</strong>{text&&<p>{text}</p>}</div>;
}
