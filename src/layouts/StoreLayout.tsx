import { ArrowRight, Clock3, Store, ShoppingBag } from 'lucide-react';
import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { useStore } from '../contexts/StoreContext';
import { currency } from '../utils/format';
import { storefrontPath } from '../utils/storefrontRoute';

export default function StoreLayout(){
  const location=useLocation();
  const {storeUnavailable,unavailableStoreName,storeBasePath}=useStore();
  const {totalItems,subtotal}=useCart();
  useEffect(()=>{window.scrollTo({top:0,left:0,behavior:'auto'})},[location.pathname]);

  if(storeUnavailable){
    return <main className="store-layout storefront-unavailable-page">
      <section className="storefront-unavailable-card">
        <div className="storefront-unavailable-icon"><Store size={30}/></div>
        <span className="eyebrow">CATÁLOGO TEMPORARIAMENTE INDISPONÍVEL</span>
        <h1>{unavailableStoreName||'Estabelecimento'}</h1>
        <p>Esta loja está passando por uma pausa temporária no catálogo online.</p>
        <div className="storefront-unavailable-note"><Clock3 size={18}/><span>Tente novamente mais tarde. Nenhum dado do estabelecimento ou dos pedidos anteriores foi removido.</span></div>
        <small>Food Service SaaS · pedidos online</small>
      </section>
    </main>;
  }

  const path=location.pathname;
  const hideDock=path.includes('/carrinho')||path.includes('/finalizar')||path.includes('/pedido/');
  const showDock=totalItems>0&&!hideDock;

  return <main className={`store-layout ${showDock?'has-mobile-cart-dock':''}`}><div key={location.pathname} className="store-route-view"><Outlet/></div>{showDock&&<a className="mobile-cart-dock" href={storefrontPath(storeBasePath,'/carrinho')} aria-label={`Abrir carrinho com ${totalItems} item(ns)`}><span className="mobile-cart-dock__icon"><ShoppingBag size={19}/><b>{totalItems}</b></span><span className="mobile-cart-dock__copy"><small>Seu carrinho</small><strong>{currency.format(subtotal)}</strong></span><span className="mobile-cart-dock__action">Ver carrinho <ArrowRight size={17}/></span></a>}</main>;
}
