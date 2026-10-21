import { ChevronRight, Search, Sparkles, Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ProductCard } from '../../components/ProductCard';
import { StoreHeader } from '../../components/StoreHeader';
import { ErrorState, LoadingState } from '../../components/ui/AsyncState';
import { useStore } from '../../contexts/StoreContext';
import { trackPublicEvent } from '../../services/analyticsApi';
import { currency } from '../../utils/format';
import { isFoodWebMarketingRoot } from '../../lib/config';
import Landing from './Landing';
import { getBusinessSegment } from '../../segments/businessSegments';

export default function Home(){
  if (typeof window !== 'undefined' && isFoodWebMarketingRoot(window.location.pathname, window.location.hostname)) return <Landing/>;
  return <StorefrontHome/>;
}

function StorefrontHome(){
  const {products,categories,settings,loading,error,reloadPublic}=useStore();
  const segment=getBusinessSegment(settings.visualTheme);
  const traditionalPresentation=segment.id==='food'||settings.visualTheme.preset==='doce_lua';
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
  const grouped=useMemo(()=>categories.filter((category)=>category.active).map((category)=>({category,items:visible.filter((product)=>product.categoryId===category.id&&(!featured.some((featuredProduct)=>featuredProduct.id===product.id)||selectedCategory!=='all'||Boolean(normalizedQuery)))})).filter((group)=>group.items.length),[categories,featured,normalizedQuery,selectedCategory,visible]);

  if(loading)return <div className="page-center"><LoadingState label={traditionalPresentation?'Carregando cardápio...':'Carregando catálogo...'}/></div>;
  if(error)return <div className="container page-center"><ErrorState message={error} onRetry={()=>void reloadPublic()}/></div>;

  return <>
    <StoreHeader/>
    <main id="cardapio" className="container storefront-body food-marketplace-body">
      {!traditionalPresentation&&<section className="segment-catalog-intro" aria-label={`Catálogo de ${segment.label}`}><div><span className="eyebrow">{segment.heroEyebrow}</span><h2>{segment.heroTitle}</h2><p>{segment.heroDescription}</p></div><a href="#catalogo-produtos" className="segment-catalog-intro__link">Explorar {segment.catalogLabel.toLocaleLowerCase('pt-BR')} <ChevronRight size={17}/></a></section>}
      <section className="food-order-summary"><div><Truck size={17}/><strong>{settings.deliveryEnabled&&settings.pickupEnabled?'Delivery ou retirada':settings.deliveryEnabled?'Delivery':'Retirada'}</strong><span>{settings.minimumOrder>0?`Pedido mínimo ${currency.format(settings.minimumOrder)}`:'Sem pedido mínimo'}</span></div><div><Sparkles size={17}/><strong>{traditionalPresentation?'Peça em poucos minutos':'Escolha com tranquilidade'}</strong><span>{traditionalPresentation?'Personalize e finalize online':'Confira os detalhes de cada item'}</span></div></section>

      <div className="food-discovery-bar">
        <label className="store-search"><Search size={20}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={traditionalPresentation?'Buscar item no cardápio':segment.searchPlaceholder} aria-label={traditionalPresentation?'Buscar no cardápio':segment.searchPlaceholder}/></label>
        <nav className="category-strip" aria-label="Categorias"><button className={selectedCategory==='all'?'active':''} onClick={()=>setSelectedCategory('all')}>Início</button>{categories.filter(c=>c.active).map(category=><button key={category.id} className={selectedCategory===category.id?'active':''} onClick={()=>setSelectedCategory(category.id)}>{category.name}</button>)}</nav>
      </div>

      {!traditionalPresentation&&<div id="catalogo-produtos" className="segment-catalog-anchor"/>}
      {!normalizedQuery&&selectedCategory==='all'&&featured.length>0&&<section className="food-featured-section"><div className="food-section-title"><div><span>{traditionalPresentation?'Para pedir sem pensar muito':'Uma seleção para começar'}</span><h2>{traditionalPresentation?'Os queridinhos da casa':'Destaques do catálogo'}</h2></div><Sparkles size={22}/></div><div className="food-featured-rail" aria-label="Produtos em destaque">{featured.map(product=><ProductCard key={product.id} product={product} category={categories.find(category=>category.id===product.categoryId)}/>)}</div></section>}

      {selectedCategory==='all'&&!normalizedQuery?grouped.map(({category,items})=><section className="food-category-section" key={category.id}><div className="food-section-title"><div><h2>{category.name}</h2>{category.description&&<p>{category.description}</p>}</div><button type="button" onClick={()=>setSelectedCategory(category.id)}>Ver categoria <ChevronRight size={16}/></button></div><div className="product-grid food-product-grid">{items.map(product=><ProductCard key={product.id} product={product} category={category}/>)}</div></section>):<section className="food-category-section"><div className="food-section-title"><div><h2>{selectedCategory==='all'?'Resultados':categories.find(c=>c.id===selectedCategory)?.name||(traditionalPresentation?'Cardápio':segment.catalogLabel)}</h2><p>{visible.length} {visible.length===1?'item encontrado':'itens encontrados'}</p></div></div>{visible.length?<div className="product-grid food-product-grid">{visible.map(product=><ProductCard key={product.id} product={product} category={categories.find(category=>category.id===product.categoryId)}/>)}</div>:<div className="empty-state"><Search size={28}/><h3>Nenhum item encontrado</h3><p>Tente outra categoria ou termo de pesquisa.</p></div>}</section>}
    </main>
  </>;
}
