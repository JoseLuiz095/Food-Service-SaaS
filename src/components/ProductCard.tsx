import { Minus, Plus, Zap } from 'lucide-react';
import './product-card-quick.css';
import { Link, useSearchParams } from 'react-router-dom';
import type { Category, Product } from '../types';
import { currency } from '../utils/format';
import { Badge } from './Badge';
import { ProductMedia } from './ProductMedia';
import { useStore } from '../contexts/StoreContext';
import { storefrontPath } from '../utils/storefrontRoute';
import { getBusinessSegment } from '../segments/businessSegments';
import { cartItemIdFor, useCart } from '../contexts/CartContext';
import { useToast } from '../contexts/ToastContext';
import { canAddWithoutOptions, cartLineLimit } from '../utils/cartAvailability';
import { trackPublicEvent } from '../services/analyticsApi';

type ProductCardProps = { product: Product; category?: Category; pointAvailable?: number | null };

export function ProductCard({product,category,pointAvailable}:ProductCardProps){
  const {storeBasePath,settings}=useStore();
  const {items,addItem,updateQuantity,removeItem}=useCart();
  const {showToast}=useToast();
  const [searchParams] = useSearchParams();
  const pointCode = searchParams.get('ponto');
  const profile=getBusinessSegment(settings.visualTheme);
  const unavailable=product.stockStatus==='unavailable'||product.availabilityStatus!=='available';
  const hasPointContext = pointAvailable !== undefined;
  const checkingPointStock = product.trackStock && hasPointContext && pointAvailable === null;
  const outOfStock = product.trackStock && (hasPointContext
    ? pointAvailable !== null && Number(pointAvailable) <= 0
    : Number(product.stockQuantity || 0) - Number(product.stockReservedQuantity || 0) <= 0);
  const productPath=storefrontPath(storeBasePath,`/produto/${product.slug}`);
  const productUrl=pointCode ? `${productPath}?${new URLSearchParams({ponto:pointCode})}` : productPath;
  const quickParams = new URLSearchParams({ compra: 'rapida' });
  if (pointCode) quickParams.set('ponto', pointCode);
  const lineId=cartItemIdFor(product.id);
  const quantity=items.find(item=>item.id===lineId)?.quantity || 0;
  const limit=cartLineLimit(product,items,lineId,pointAvailable);
  const simple=canAddWithoutOptions(product);
  const add=()=>{
    if(unavailable||checkingPointStock||quantity>=limit)return;
    addItem(product,1);
    void trackPublicEvent(settings.id,'add_to_cart',product.id);
    if(!quantity)showToast(`${product.name} adicionado.`, 'success');
  };
  return <div className="product-card-shell"><Link to={productUrl} className={`product-card product-card--food ${unavailable?'is-unavailable':''}`}>
    <div className="product-card__content">
      {product.featured&&<span className="product-card__featured">Mais pedido</span>}
      <span className="product-card__category">{category?.name??profile.catalogLabel}</span>
      <h3>{product.name}</h3>
      <p>{product.description}</p>
      <div className="product-card__price">{product.promotionalPrice!=null?<><strong>{currency.format(product.promotionalPrice)}</strong><del>{currency.format(product.price)}</del></>:<strong>{currency.format(product.price)}</strong>}</div>
    </div>
    <div className="product-card__image-wrap">
      <ProductMedia src={product.imageUrl} emoji={product.visualEmoji} imageCount={product.images.length} alt={product.name} className="product-card__image" emojiClassName="product-card__emoji-v060"/>
      <div className="product-card__badges">{product.promotionalPrice!=null&&<Badge tone="rose">Oferta</Badge>}{unavailable&&<Badge tone="amber">Indisponível</Badge>}{!unavailable&&outOfStock&&!hasPointContext&&<Badge tone="amber">Sob encomenda</Badge>}</div>
      {!unavailable&&<span className="product-card__open" aria-hidden="true"><Plus size={20}/></span>}
    </div>
  </Link>{!unavailable && <div className="product-card-actions">
    {simple && !outOfStock && !checkingPointStock ? quantity ? <div className="product-card-stepper" role="group" aria-label={`Quantidade de ${product.name}`}>
      <button type="button" aria-label={`Diminuir ${product.name}`} onClick={()=>quantity===1?removeItem(lineId):updateQuantity(lineId,quantity-1)}><Minus size={18}/></button>
      <span aria-live="polite">{quantity} no carrinho</span>
      <button type="button" aria-label={`Adicionar ${product.name}`} disabled={quantity>=limit} onClick={add}><Plus size={18}/></button>
    </div> : <button type="button" className="product-card-add" onClick={add} disabled={limit<1} aria-label={`Adicionar ${product.name}`}><Plus size={18}/>Adicionar</button>
    : checkingPointStock ? <span role="status" className="product-card-checking">Consultando disponibilidade…</span>
    : <Link className="product-card-add" to={productUrl}>{outOfStock ? hasPointContext ? 'Ver disponibilidade' : 'Encomendar' : 'Escolher opções'}</Link>}
    {!outOfStock && !checkingPointStock && <Link className="product-card-buy" to={`${productPath}?${quickParams.toString()}`} aria-label={`Compra relâmpago: ${product.name}`}><Zap size={14} aria-hidden="true"/>Comprar agora</Link>}
  </div>}</div>;
}
