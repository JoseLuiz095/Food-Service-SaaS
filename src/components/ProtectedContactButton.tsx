import { Loader2, MessageCircle, ShieldCheck, X } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';
import { appConfig } from '../lib/config';
import { requestPublicContact, type PublicContactIntent } from '../services/publicContactApi';
import { TurnstileWidget } from './ui/TurnstileWidget';

export function ProtectedContactButton({
  className='',
  label,
  intent='commercial',
  children,
}: {
  className?:string;
  label?:string;
  intent?:PublicContactIntent;
  children?:ReactNode;
}){
  const[open,setOpen]=useState(false);
  const[token,setToken]=useState('');
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState('');
  const[reset,setReset]=useState(0);
  const receiveToken=useCallback((value:string)=>{setToken(value);setError('')},[]);
  const close=()=>{if(loading)return;setOpen(false);setToken('');setError('')};
  const proceed=async()=>{
    if(!appConfig.turnstileSiteKey){setError('A proteção anti-robô ainda não foi configurada para o contato público.');return;}
    if(!token){setError('Conclua a verificação de segurança.');return;}
    const popup=window.open('about:blank','_blank');
    try{
      setLoading(true);setError('');
      const redirectUrl=await requestPublicContact(token,intent);
      if(popup){popup.opener=null;popup.location.replace(redirectUrl)}else{window.location.assign(redirectUrl)}
      setOpen(false);setToken('');
    }catch(err){
      if(popup&&!popup.closed)popup.close();
      setError(err instanceof Error?err.message:'Não foi possível abrir o contato comercial.');
      setReset((value)=>value+1);
    }finally{setLoading(false)}
  };

  return <>
    <button type="button" className={className} onClick={()=>setOpen(true)}>{children||<><MessageCircle size={18}/>{label||'Falar no WhatsApp'}</>}</button>
    {open&&<div className="human-contact-overlay" role="dialog" aria-modal="true" aria-label="Verificação de contato"><div className="human-contact-card"><button type="button" className="human-contact-close" onClick={close} aria-label="Fechar"><X size={19}/></button><div className="human-contact-icon"><ShieldCheck size={24}/></div><span className="eyebrow">CONTATO PROTEGIDO</span><h2>Confirme que você é uma pessoa</h2><p>Essa etapa protege o canal comercial contra automações e evita expor o contato diretamente na página pública.</p>{appConfig.turnstileSiteKey?<TurnstileWidget siteKey={appConfig.turnstileSiteKey} action="marketing" onToken={receiveToken} resetSignal={reset}/>:<div className="form-error">Turnstile não configurado. Defina <code>VITE_TURNSTILE_SITE_KEY</code>.</div>}{error&&<div className="form-error">{error}</div>}<button type="button" className="primary-button human-contact-submit" onClick={()=>void proceed()} disabled={loading||!appConfig.turnstileSiteKey||!token}>{loading?<><Loader2 className="spin" size={17}/>Validando...</>:<><MessageCircle size={17}/>Continuar no WhatsApp</>}</button><small>O número comercial só é liberado após a validação no servidor.</small></div></div>}
  </>;
}
