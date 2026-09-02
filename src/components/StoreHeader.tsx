import { Clock3, MapPin, MessageCircle, ShoppingBag } from 'lucide-react';
import { useMemo } from 'react';
import { useCart } from '../contexts/CartContext';
import { useStore } from '../contexts/StoreContext';
import { storefrontPath } from '../utils/storefrontRoute';
import { sanitizeWhatsAppNumber } from '../utils/format';
import { getStoreOpenStatus } from '../utils/storeHours';
import { ImageWithFallback } from './ui/ImageWithFallback';

export function StoreHeader(){
  const {settings,storeBasePath}=useStore();const {totalItems}=useCart();
  const whatsapp=sanitizeWhatsAppNumber(settings.whatsapp);
  const status=useMemo(()=>getStoreOpenStatus(settings.openingSchedule),[settings.openingSchedule]);
  return <header className="food-storefront-header">
    <div className="hero food-hero" style={{backgroundImage:`url(${settings.heroUrl})`}} aria-label="Capa do estabelecimento"/>
    <section className="store-card container food-store-card">
      <ImageWithFallback className="store-card__logo" src={settings.logoUrl} alt={`Logo ${settings.name}`}/>
      <div className="store-card__main">
        <div className="store-card__title-row">
          <div><h1>{settings.name}</h1><span className="store-card__location"><MapPin size={15}/>{settings.city} — {settings.state}</span></div>
          <div className="store-status"><span className={`open-pill ${status.open?'is-open':'is-closed'}`}>{status.label}</span><small>{status.detail}</small></div>
        </div>
        <p className="store-card__tagline">{settings.tagline}</p>
        <div className="food-store-meta">
          {settings.deliveryEnabled&&<span>Delivery</span>}{settings.pickupEnabled&&<span>Retirada</span>}<span><Clock3 size={14}/>{settings.openingHours||'Consulte os horários'}</span>
        </div>
      </div>
      <div className="store-card__actions food-store-actions">
        {whatsapp&&<a className="outline-action" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer"><MessageCircle size={18}/>Falar com a loja</a>}
        <a className="icon-action cart-action" href={storefrontPath(storeBasePath,'/carrinho')} aria-label="Carrinho"><ShoppingBag size={21}/>{totalItems>0&&<span>{totalItems}</span>}</a>
      </div>
    </section>
  </header>;
}
