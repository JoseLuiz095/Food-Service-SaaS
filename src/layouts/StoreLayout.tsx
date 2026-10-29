import { ArrowRight, Clock3, Store, ShoppingBag } from 'lucide-react';
import { useEffect } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { useStore } from '../contexts/StoreContext';
import { currency } from '../utils/format';
import { storefrontPath } from '../utils/storefrontRoute';
import { isFoodWebMarketingRoot } from '../lib/config';
import { getStorefrontThemeStyle } from '../utils/storeVisualTheme';
import { StorePlatformFooter } from '../components/StorePlatformFooter';
import { getBusinessSegment, resolveBusinessTheme } from '../segments/businessSegments';
import { usePwaIdentity } from '../services/pwaIdentity';
import { PwaAccessCard } from '../components/PwaAccessCard';
import '../segments/segments.css';
import '../segments/storefront-motion.css';

export default function StoreLayout(){
  const location=useLocation();
  const marketingRoot=typeof window!=='undefined'&&isFoodWebMarketingRoot(location.pathname,window.location.hostname);
  const {settings,storeUnavailable,unavailableStoreName,storeBasePath}=useStore();
  const {totalItems,subtotal}=useCart();
  usePwaIdentity(settings.id && settings.slug ? {kind:'customer',slug:settings.slug,name:settings.name,iconUrl:settings.logoUrl,root:!storeBasePath}:null);
  useEffect(()=>{window.scrollTo({top:0,left:0,behavior:'auto'})},[location.pathname]);

  if(marketingRoot)return <main className="store-layout marketing-root-layout"><Outlet/></main>;

  const segment=getBusinessSegment(settings.visualTheme);
  const storefrontThemeStyle=getStorefrontThemeStyle(resolveBusinessTheme(settings.visualTheme));
  const useSegmentPresentation=segment.id!=='food'&&settings.visualTheme.preset!=='doce_lua';

  if(segment.id==='fitness' && /\/(carrinho|finalizar)(\/|$)/.test(location.pathname)){
    return <Navigate to={storefrontPath(storeBasePath)} replace/>;
  }

  if(storeUnavailable){
    return <main className="store-layout food-storefront-theme storefront-unavailable-page" style={storefrontThemeStyle}>
      <section className="storefront-unavailable-card">
        <div className="storefront-unavailable-icon"><Store size={30}/></div>
        <span className="eyebrow">CATÁLOGO TEMPORARIAMENTE INDISPONÍVEL</span>
        <h1>{unavailableStoreName||'Estabelecimento'}</h1>
        <p>Esta loja está passando por uma pausa temporária no catálogo online.</p>
        <div className="storefront-unavailable-note"><Clock3 size={18}/><span>Tente novamente mais tarde. Nenhum dado do estabelecimento ou dos pedidos anteriores foi removido.</span></div>
        <small>VendeWeb · pedidos online</small>
      </section>
    </main>;
  }

  const path=location.pathname;
  const hideDock=path.includes('/carrinho')||path.includes('/finalizar')||path.includes('/pedido/');
  const showDock=segment.id!=='fitness'&&totalItems>0&&!hideDock;

  return <main data-business-segment={segment.id} data-visual-preset={settings.visualTheme.preset} className={`store-layout food-storefront-theme storefront-motion ${useSegmentPresentation?'storefront-business-theme':''} ${showDock?'has-mobile-cart-dock':''}`} style={storefrontThemeStyle}><div key={location.pathname} className="store-route-view"><Outlet/></div>{settings.id&&path===storefrontPath(storeBasePath)&&<div className="container"><PwaAccessCard role="customer" scope={settings.id} name={settings.name}/></div>}<StorePlatformFooter/>{showDock&&<Link className="mobile-cart-dock" to={storefrontPath(storeBasePath,'/finalizar')} aria-label={`Finalizar pedido com ${totalItems} item(ns)`}><span className="mobile-cart-dock__icon"><ShoppingBag size={19}/><b>{totalItems}</b></span><span className="mobile-cart-dock__copy"><small>Seu carrinho</small><strong>{currency.format(subtotal)}</strong></span><span className="mobile-cart-dock__action">Finalizar <ArrowRight size={17}/></span></Link>}</main>;
}
