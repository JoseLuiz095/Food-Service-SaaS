import { Clock3, MapPin, MessageCircle, ShieldCheck, ShoppingBag, Store, Truck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCart } from '../contexts/CartContext';
import { useStore } from '../contexts/StoreContext';
import { storefrontPath } from '../utils/storefrontRoute';
import { sanitizeWhatsAppNumber } from '../utils/format';
import { getOpeningScheduleOverview, getStoreOpenStatus } from '../utils/storeHours';
import { ImageWithFallback } from './ui/ImageWithFallback';

export function StoreHeader(){
  const {settings,storeBasePath}=useStore();
  const {totalItems}=useCart();
  const whatsapp=sanitizeWhatsAppNumber(settings.whatsapp);
  const status=useMemo(()=>getStoreOpenStatus(settings.openingSchedule),[settings.openingSchedule]);
  const scheduleOverview=useMemo(()=>getOpeningScheduleOverview(settings.openingSchedule),[settings.openingSchedule]);
  const todaySchedule = scheduleOverview.today?.summary || 'Consulte os horários';
  const [hoursOpen,setHoursOpen]=useState(false);
  const hoursRef=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{document.title=`${settings.name} · FoodWeb`;},[settings.name]);
  useEffect(()=>{
    const onPointerDown=(event:PointerEvent)=>{
      if(!hoursOpen)return;
      const target=event.target as Node|null;
      if(target && !hoursRef.current?.contains(target))setHoursOpen(false);
    };
    const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape')setHoursOpen(false);};
    document.addEventListener('pointerdown',onPointerDown);
    document.addEventListener('keydown',onKeyDown);
    return()=>{document.removeEventListener('pointerdown',onPointerDown);document.removeEventListener('keydown',onKeyDown);};
  },[hoursOpen]);
  const fulfillment=settings.deliveryEnabled&&settings.pickupEnabled?'Delivery e retirada':settings.deliveryEnabled?'Delivery':'Retirada';
  return <header className="food-storefront-header food-storefront-header-v43">
    <div className="food-platform-bar"><div className="container"><a className="foodweb-wordmark" href={storefrontPath(storeBasePath)} aria-label="FoodWeb"><span>F</span><strong>FoodWeb</strong></a><div className="food-platform-trust"><ShieldCheck size={15}/><span>Pedido direto com o estabelecimento</span></div><a className="food-platform-cart" href={storefrontPath(storeBasePath,'/carrinho')}><ShoppingBag size={18}/><span>Sacola</span>{totalItems>0&&<b>{totalItems}</b>}</a></div></div>
    <div className="food-store-hero-v43" style={{backgroundImage:`linear-gradient(90deg,rgba(18,10,8,.62),rgba(18,10,8,.18) 48%,rgba(18,10,8,.18)),url(${settings.heroUrl})`}}><div className="container"><span>Pedido online</span><strong>{settings.tagline||'Seu pedido, do seu jeito.'}</strong></div></div>
    <section className="container food-store-profile-v43">
      <ImageWithFallback loading="eager" className="food-store-profile-logo" src={settings.logoUrl} alt={`Logo ${settings.name}`}/>
      <div className="food-store-profile-main">
        <div className="food-store-profile-title"><h1>{settings.name}</h1><span className={`open-pill ${status.open?'is-open':'is-closed'}`}>{status.label}</span></div>
        <div className="food-store-profile-location"><MapPin size={14}/>{[settings.city,settings.state].filter(Boolean).join(' · ')||'Atendimento online'}</div>
        <p>{settings.description||settings.tagline}</p>
        <div className="food-store-profile-meta">
          <div className="food-hours-panel">
            <div className="food-hours-summary"><Clock3 size={14}/><div><strong>Hoje</strong><span>{todaySchedule}</span></div></div>
            <div className="food-hours-popover" ref={hoursRef}><button type="button" className="food-hours-button" aria-expanded={hoursOpen} onClick={()=>setHoursOpen((current)=>!current)}>Ver horários da semana</button>{hoursOpen&&<div className="hours-details-list food-hours-list food-hours-flyout" role="dialog" aria-label="Horários da semana">{scheduleOverview.days.map((day)=><div key={day.day} className={`hours-details-item ${day.isToday?'is-today':''}`}><strong>{day.shortLabel}</strong><span>{day.summary}</span></div>)}</div>}</div>
          </div>
          <span><Truck size={14}/>{fulfillment}</span>
          {settings.minimumOrder>0&&<span><Store size={14}/>Pedido mínimo R$ {settings.minimumOrder.toFixed(2).replace('.',',')}</span>}
        </div>
      </div>
      <div className="food-store-profile-actions">
        <div className="food-open-details"><span className={`open-pill ${status.open?'is-open':'is-closed'}`}>{status.label}</span><small>{status.detail}</small></div>
        {settings.deliveryEnabled&&<span className="food-fulfillment-pill active"><Truck size={16}/>Delivery</span>}
        {settings.pickupEnabled&&<span className="food-fulfillment-pill"><ShoppingBag size={16}/>Retirada</span>}
        {whatsapp&&<a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer"><MessageCircle size={17}/>Falar com a loja</a>}
      </div>
    </section>
  </header>;
}
