import { Bell, Download, X } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { getInstallPrompt, installPwa, subscribeInstallPrompt } from '../services/pwaInstall';
import './pwa-access-card.css';

type Props={role:'customer'|'admin'|'master';scope:string;name:string;notifications?:boolean};
const standalone=()=>typeof window!=='undefined' && (window.matchMedia('(display-mode: standalone)').matches ||
  Boolean((navigator as Navigator & {standalone?:boolean}).standalone));

export function PwaAccessCard({role,scope,name,notifications=false}:Props){
  const installPrompt=useSyncExternalStore(subscribeInstallPrompt,getInstallPrompt,()=>null);
  const [openCount,setOpenCount]=useState(0);
  const [dismissed,setDismissed]=useState(false);
  const [showInstructions,setShowInstructions]=useState(false);
  const [installed,setInstalled]=useState(standalone);
  const [permission,setPermission]=useState<NotificationPermission|null>(()=>typeof Notification==='undefined'?null:Notification.permission);
  const storageKey=`vendeweb-pwa-nudge:${role}:${scope}`;

  useEffect(()=>{const onInstalled=()=>setInstalled(true);window.addEventListener('appinstalled',onInstalled);return()=>window.removeEventListener('appinstalled',onInstalled)},[]);

  useEffect(()=>{
    if(!scope)return;
    try{
      const sessionKey=`${storageKey}:opened`;
      const previous=Number(window.localStorage.getItem(storageKey)||0);
      const count=window.sessionStorage.getItem(sessionKey)?previous:previous+1;
      window.sessionStorage.setItem(sessionKey,'1');
      window.localStorage.setItem(storageKey,String(count));
      setOpenCount(count);
      setDismissed(count<Number(window.localStorage.getItem(`${storageKey}:snooze`)||0));
    }catch {setOpenCount(1)}
  },[storageKey,scope]);

  if(!scope)return null;
  const installVisible=!installed && openCount>=2 && !dismissed;
  const permissionVisible=notifications && permission==='default' && openCount>=3 && (openCount-3)%5===0 && !dismissed;
  if(!installVisible&&!permissionVisible)return null;
  const dismiss=()=>{
    setDismissed(true);
    try{window.localStorage.setItem(`${storageKey}:snooze`,String(openCount+5))}catch{/* armazenamento opcional */}
  };
  const install=async()=>{
    if(!installPrompt){setShowInstructions(true);return;}
    try{if(await installPwa())setInstalled(true)}catch{setShowInstructions(true)}
  };
  const allowNotifications=async()=>{
    if(typeof Notification==='undefined')return;
    const result=await Notification.requestPermission();
    setPermission(result);
    if(result!=='default')dismiss();
  };
  return <section className="pwa-access-card" aria-label="Aplicativo e permissões">
    <div className="pwa-access-card__icon"><Download size={20}/></div>
    <div className="pwa-access-card__copy"><strong>{role==='customer'?`Leve ${name} para sua tela inicial`:`Acesse ${name} direto da tela inicial`}</strong>
      <p>O ícone identifica {role==='master'?'o Admin Master':role==='customer'?'a loja':'este painel'}; a abertura continua com a marca VendeWeb. {permissionVisible?(role==='master'?'Permita avisos de novos comprovantes enquanto o painel estiver aberto.':'Permita avisos da operação da loja no navegador.'):''}</p>
      {showInstructions&&<small role="status">No navegador, abra o menu Compartilhar ou ⋮ e escolha “Adicionar à tela inicial” ou “Instalar aplicativo”.</small>}
      <div className="pwa-access-card__actions">{installVisible&&<button type="button" onClick={()=>void install()}><Download size={15}/>Instalar</button>}
        {permissionVisible&&<button type="button" className="secondary-button" onClick={()=>void allowNotifications()}><Bell size={15}/>Permitir avisos</button>}</div>
    </div>
    <button type="button" className="pwa-access-card__close" onClick={dismiss} aria-label="Lembrar mais tarde"><X size={16}/></button>
  </section>;
}
