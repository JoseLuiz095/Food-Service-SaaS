import { ChevronRight, Search, ShoppingBag, Sparkles, Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ProductCard } from '../../components/ProductCard';
import { StoreHeader } from '../../components/StoreHeader';
import { ErrorState, LoadingState } from '../../components/ui/AsyncState';
import { useCart } from '../../contexts/CartContext';
import { useStore } from '../../contexts/StoreContext';
import { trackPublicEvent } from '../../services/analyticsApi';
import { currency } from '../../utils/format';
import { storefrontPath } from '../../utils/storefrontRoute';
import { isFoodWebMarketingRoot } from '../../lib/config';
import Landing from './Landing';

export default function Home(){
  if (typeof window !== 'undefined' && isFoodWebMarketingRoot(window.location.pathname, window.location.hostname)) return <Landing/>;
  return <StorefrontHome/>;
}

function StorefrontHome(){
  const {products,categories,settings,loading,error,reloadPublic,storeBasePath}=useStore();
  const {totalItems,subtotal}=useCart();
  const [selectedCategory,setSelectedCategory]=useState('all');
  const [query,setQuery]=useState('');

  useEffect(()=>{if(!loading&&!error&&settings.id)void trackPublicEvent(settings.id,'storefront_view')},[loading,error,settings.id]);

  const activeProducts=useMemo(()=>products.filter((product)=>product.active),[products]);
  const normalizedQuery=query.trim().toLowerCase();
  const visible=useMemo(()=>activeProducts.filter((product)=>{
    const categoryMatch=selectedCategory==='all'||product.categoryId===selectedCategory;
    const textMatch=!normalizedQuery||`${product.name} ${product.description}`.toLowerCase().includes(normalizedQuery);
    return categoryMatch&&textMatch;
  }),[activeProducts,selectedCategory,normalizedQuery]);
  const featured=useMemo(()=>visible.filter((product)=>product.featured).slice(0,6),[visible]);
  const grouped=useMemo(()=>categories.filter((category)=>category.active).map((category)=>({category,items:visible.filter((product)=>product.categoryId===category.id)})).filter((group)=>group.items.length),[categories,visible]);

  if(loading)return <div className="page-center"><LoadingState label="Carregando cardápio..."/></div>;
  if(error)return <div className="container page-center"><ErrorState message={error} onRetry={()=>void reloadPublic()}/></div>;

  return <>
    <StoreHeader/>
    <main className="container storefront-body food-marketplace-body">
      <section className="food-order-summary"><div><Truck size={17}/><strong>{settings.deliveryEnabled&&settings.pickupEnabled?'Delivery ou retirada':settings.deliveryEnabled?'Delivery':'Retirada'}</strong><span>{settings.minimumOrder>0?`Pedido mínimo ${currency.format(settings.minimumOrder)}`:'Sem pedido mínimo'}</span></div><div><Sparkles size={17}/><strong>Peça em poucos minutos</strong><span>Personalize e finalize online</span></div></section>

      <div className="food-discovery-bar">
        <label className="store-search"><Search size={20}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar item no cardápio" aria-label="Buscar no cardápio"/></label>
        <nav className="category-strip" aria-label="Categorias"><button className={selectedCategory==='all'?'active':''} onClick={()=>setSelectedCategory('all')}>Início</button>{categories.filter(c=>c.active).map(category=><button key={category.id} className={selectedCategory===category.id?'active':''} onClick={()=>setSelectedCategory(category.id)}>{category.name}</button>)}</nav>
      </div>

      {!normalizedQuery&&selectedCategory==='all'&&featured.length>0&&<section className="food-featured-section"><div className="food-section-title"><div><span>Para pedir sem pensar muito</span><h2>Os queridinhos da casa</h2></div><Sparkles size={22}/></div><div className="food-product-grid featured-grid">{featured.map(product=><ProductCard key={product.id} product={product} category={categories.find(category=>category.id===product.categoryId)}/>)}</div></section>}

      {selectedCategory==='all'&&!normalizedQuery?grouped.map(({category,items})=><section className="food-category-section" key={category.id}><div className="food-section-title"><div><h2>{category.name}</h2>{category.description&&<p>{category.description}</p>}</div><button type="button" onClick={()=>setSelectedCategory(category.id)}>Ver categoria <ChevronRight size={16}/></button></div><div className="product-grid food-product-grid">{items.map(product=><ProductCard key={product.id} product={product} category={category}/>)}</div></section>):<section className="food-category-section"><div className="food-section-title"><div><h2>{selectedCategory==='all'?'Resultados':categories.find(c=>c.id===selectedCategory)?.name||'Cardápio'}</h2><p>{visible.length} {visible.length===1?'item encontrado':'itens encontrados'}</p></div></div>{visible.length?<div className="product-grid food-product-grid">{visible.map(product=><ProductCard key={product.id} product={product} category={categories.find(category=>category.id===product.categoryId)}/>)}</div>:<div className="empty-state"><Search size={28}/><h3>Nenhum item encontrado</h3><p>Tente outra categoria ou termo de pesquisa.</p></div>}</section>}
    </main>
    {totalItems>0&&<a className="food-cart-dock" href={storefrontPath(storeBasePath,'/carrinho')}><span><ShoppingBag size={20}/><b>{totalItems} {totalItems===1?'item':'itens'}</b></span><strong>{currency.format(subtotal)} · Ver sacola</strong></a>}
    <footer className="store-footer food-store-footer"><div className="container"><strong>FoodWeb</strong><span>Pedido direto, sem complicação.</span><a href="/admin/login">Área do estabelecimento</a></div></footer>
  </>;
}
