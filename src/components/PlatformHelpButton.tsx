import { MessageCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { loadAdminSupportContact } from '../services/supportApi';

export function PlatformHelpButton(){
  const [phone,setPhone]=useState('');
  useEffect(()=>{
    let active=true;
    void loadAdminSupportContact().then((value)=>{if(active)setPhone(value)}).catch(()=>undefined);
    return()=>{active=false};
  },[]);
  if(!phone)return null;
  const normalized=(phone.length===10||phone.length===11)&&!phone.startsWith('55')?`55${phone}`:phone;
  const message=encodeURIComponent('Olá! Sou lojista e preciso de suporte com o FoodWeb.');
  return <a className="foodweb-help-fab admin-only-help" href={`https://wa.me/${normalized}?text=${message}`} target="_blank" rel="noreferrer" aria-label="Abrir suporte do FoodWeb no WhatsApp"><MessageCircle size={21}/><span>Suporte</span></a>;
}
