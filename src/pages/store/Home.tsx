import { CreditCard, Search, ShoppingBag, Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ProductCard } from '../../components/ProductCard';
import { StoreHeader } from '../../components/StoreHeader';
import { ErrorState, LoadingState } from '../../components/ui/AsyncState';
import { useCart } from '../../contexts/CartContext';
import { useStore } from '../../contexts/StoreContext';
import { trackPublicEvent } from '../../services/analyticsApi';
import { currency } from '../../utils/format';
import { storefrontPath } from '../../utils/storefrontRoute';

export default function Home(){
  const {products,categories,settings,loading,error,reloadPublic,storeBasePath}=useStore();
  const {totalItems,subtotal}=useCart();
  const [selectedCategory,setSelectedCategory]=useState('all');
  const [query,setQuery]=useState('');

  useEffect(()=>{if(!loading&&!error&&settings.id)void trackPublicEvent(settings.id,'storefront_view')},[loading,error,settings.id]);

  const visible=useMemo(()=>products.filter((product)=>{
    if(!product.active)return false;
    const categoryMatch=selectedCategory==='all'||product.categoryId===selectedCategory;
    const q=query.trim().toLowerCase();
    const textMatch=!q||`${product.name} ${product.description}`.toLowerCase().includes(q);
    return categoryMatch&&textMatch;
  }),[products,selectedCategory,query]);

  const fulfillmentLabel=settings.deliveryEnabled&&settings.pickupEnabled?'Delivery e retirada':settings.deliveryEnabled?'Delivery':'Retirada';
  const paymentLabels=[settings.pixEnabled?'PIX':'',settings.cardPaymentEnabled?'Cartão':'',settings.cashPaymentEnabled?'Dinheiro':''].filter(Boolean);

  if(loading)return <div className="page-center"><LoadingState label="Carregando cardápio..."/></div>;
  if(error)return <div className="container page-center"><ErrorState message={error} onRetry={()=>void reloadPublic()}/></div>;

  return <>
    <StoreHeader/>
    <main className="container storefront-body food-marketplace-body">
      <div className="food-discovery-bar">
        <div className="store-search"><Search size={19}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={`Buscar no cardápio de ${settings.name}`}/></div>
        <div className="category-strip"><button className={selectedCategory==='all'?'active':''} onClick={()=>setSelectedCategory('all')}>Todos</button>{categories.filter(c=>c.active).map(category=><button key={category.id} className={selectedCategory===category.id?'active':''} onClick={()=>setSelectedCategory(category.id)}>{category.name}</button>)}</div>
      </div>

      <section className="storefront-commerce-strip food-commerce-strip" aria-label="Informações do pedido">
        <div><Truck size={19}/><span><strong>{fulfillmentLabel}</strong><small>{settings.minimumOrder>0?`Pedido mínimo ${currency.format(settings.minimumOrder)}`:'Sem pedido mínimo'}</small></span></div>
        <div><CreditCard size={19}/><span><strong>Pagamento fácil</strong><small>{paymentLabels.length?paymentLabels.join(' · '):'Consulte a loja'}</small></span></div>
      </section>

      <div className="section-heading food-menu-heading"><div><h2>Cardápio</h2><p>Escolha, personalize e peça em poucos passos.</p></div><span>{visible.length} {visible.length===1?'item':'itens'}</span></div>
      {visible.length?<div className="product-grid food-product-grid">{visible.map(product=><ProductCard key={product.id} product={product} category={categories.find(category=>category.id===product.categoryId)}/>)}</div>:<div className="empty-state"><Search size={28}/><h3>Nenhum item encontrado</h3><p>Tente outra categoria ou termo de pesquisa.</p></div>}
    </main>
    {totalItems>0&&<a className="food-cart-dock" href={storefrontPath(storeBasePath,'/carrinho')}><span><ShoppingBag size={20}/><b>{totalItems} {totalItems===1?'item':'itens'}</b></span><strong>Ver carrinho · {currency.format(subtotal)}</strong></a>}
    <footer className="store-footer food-store-footer"><div className="container"><strong>FoodWeb</strong><span>Cardápio e pedidos online.</span><a href="/admin/login">Área do estabelecimento</a></div></footer>
  </>;
}
