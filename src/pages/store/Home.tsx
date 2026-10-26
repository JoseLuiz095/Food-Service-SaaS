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
import { PublicBusinessOffers } from '../../platform/PublicBusinessOffers';
import { PickupPointSelector, PointStockNotice } from './PickupPointSelector';
import { pointStock, usePickupAvailability } from './usePickupAvailability';

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
  const pickup = usePickupAvailability();
  const productCard = (product: typeof products[number], category?: typeof categories[number]) => {
    const row = pointStock(pickup.availability, product.id);
    const hasPointContext = Boolean(pickup.selectedPoint);
    const globallyEmpty = !hasPointContext && product.trackStock && Number(product.stockQuantity || 0) - Number(product.stockReservedQuantity || 0) <= 0 && product.stockStatus !== 'unavailable' && product.availabilityStatus === 'available';
    const unavailableHere = Boolean(hasPointContext && row && Number(row.available) < 1);
    const pointAvailable = hasPointContext && product.trackStock
      ? pickup.availability === null ? null : Number(row?.available ?? 0)
      : undefined;
    return <div key={product.id} className={`store-point-product${globallyEmpty ? ' store-point-product--global-empty' : ''}${unavailableHere ? ' store-point-product--unavailable' : ''}`}><ProductCard product={product} category={category} pointAvailable={pointAvailable}/>{hasPointContext ? <PointStockNotice product={product} pointName={pickup.selectedPoint?.name ?? ''} row={row}/> : globallyEmpty ? <p className="store-point-stock store-point-stock--warning">Sob encomenda. Agende para amanhã no checkout.</p> : null}</div>;
  };

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
      <PublicBusinessOffers/>
      {settings.pickupEnabled && <PickupPointSelector points={pickup.points} value={pickup.pickupLocationId} onChange={pickup.setPickupLocationId} loading={pickup.pointsLoading} error={pickup.pointsError} invalidQr={pickup.invalidQr}/>}
      {pickup.selectedPoint && pickup.availabilityError && <p className="store-point-stock store-point-stock--warning" role="status">{pickup.availabilityError}</p>}
      {!traditionalPresentation&&<section className="segment-catalog-intro" aria-label={`Catálogo de ${segment.label}`}><div><span className="eyebrow">{segment.heroEyebrow}</span><h2>{segment.heroTitle}</h2><p>{segment.heroDescription}</p></div><a href="#catalogo-produtos" className="segment-catalog-intro__link">Explorar {segment.catalogLabel.toLocaleLowerCase('pt-BR')} <ChevronRight size={17}/></a></section>}
      <section className="food-order-summary"><div><Truck size={17}/><strong>{settings.deliveryEnabled&&settings.pickupEnabled?'Delivery ou retirada':settings.deliveryEnabled?'Delivery':'Retirada'}</strong><span>{settings.minimumOrder>0?`Pedido mínimo ${currency.format(settings.minimumOrder)}`:'Sem pedido mínimo'}</span></div><div><Sparkles size={17}/><strong>{traditionalPresentation?'Peça em poucos minutos':'Escolha com tranquilidade'}</strong><span>{traditionalPresentation?'Personalize e finalize online':'Confira os detalhes de cada item'}</span></div></section>

      <div className="food-discovery-bar">
        <label className="store-search"><Search size={20}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={traditionalPresentation?'Buscar item no cardápio':segment.searchPlaceholder} aria-label={traditionalPresentation?'Buscar no cardápio':segment.searchPlaceholder}/></label>
        <nav className="category-strip" aria-label="Categorias"><button type="button" aria-pressed={selectedCategory==='all'} className={selectedCategory==='all'?'active':''} onClick={()=>setSelectedCategory('all')}>Início</button>{categories.filter(c=>c.active).map(category=><button key={category.id} type="button" aria-pressed={selectedCategory===category.id} className={selectedCategory===category.id?'active':''} onClick={()=>setSelectedCategory(category.id)}>{category.name}</button>)}</nav>
      </div>

      {!traditionalPresentation&&<div id="catalogo-produtos" className="segment-catalog-anchor"/>}
      {!normalizedQuery&&selectedCategory==='all'&&featured.length>0&&<section className="food-featured-section"><div className="food-section-title"><div><span>{traditionalPresentation?'Para pedir sem pensar muito':'Uma seleção para começar'}</span><h2>{traditionalPresentation?'Os queridinhos da casa':'Destaques do catálogo'}</h2></div><Sparkles size={22}/></div><div className="food-featured-rail" aria-label="Produtos em destaque">{featured.map(product=>productCard(product,categories.find(category=>category.id===product.categoryId)))}</div></section>}

      {selectedCategory==='all'&&!normalizedQuery?grouped.map(({category,items})=><section className="food-category-section" key={category.id}><div className="food-section-title"><div><h2>{category.name}</h2>{category.description&&<p>{category.description}</p>}</div><button type="button" onClick={()=>setSelectedCategory(category.id)}>Ver categoria <ChevronRight size={16}/></button></div><div className="product-grid food-product-grid">{items.map(product=>productCard(product,category))}</div></section>):<section className="food-category-section"><div className="food-section-title"><div><h2 key={selectedCategory} className="storefront-filter-heading">{selectedCategory==='all'?'Resultados':categories.find(c=>c.id===selectedCategory)?.name||(traditionalPresentation?'Cardápio':segment.catalogLabel)}</h2><p>{visible.length} {visible.length===1?'item encontrado':'itens encontrados'}</p></div></div>{visible.length?<div className="product-grid food-product-grid">{visible.map(product=>productCard(product,categories.find(category=>category.id===product.categoryId)))}</div>:<div className="empty-state"><Search size={28}/><h3>Nenhum item encontrado</h3><p>Tente outra categoria ou termo de pesquisa.</p></div>}</section>}
    </main>
  </>;
}
