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
import { cartItemIdFor, MAX_CART_ITEM_QUANTITY, useCart } from '../contexts/CartContext';
import { useToast } from '../contexts/ToastContext';
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
  const simpleItemId=cartItemIdFor(product.id);
  const simpleQuantity=items.find(item=>item.id===simpleItemId)?.quantity||0;
  const quantityInCart=items.filter(item=>item.productId===product.id).reduce((sum,item)=>sum+item.quantity,0);
  const globalAvailable=product.trackStock?Math.max(0,Number(product.stockQuantity||0)-Number(product.stockReservedQuantity||0)):MAX_CART_ITEM_QUANTITY;
  const maxQuantity=Math.min(MAX_CART_ITEM_QUANTITY,product.trackStock&&hasPointContext?Number(pointAvailable||0):globalAvailable);
  const stockUnknown=checkingPointStock;
  const canAddDirect=!product.partyOrderConfig?.enabled&&product.optionGroups.every(group=>!group.active||group.minChoices===0);
  const canIncrease=!stockUnknown&&quantityInCart<maxQuantity&&simpleQuantity<MAX_CART_ITEM_QUANTITY;
  const productUrl=storefrontPath(storeBasePath,`/produto/${product.slug}`);
  const quickParams = new URLSearchParams({ compra: 'rapida' });
  if (pointCode) quickParams.set('ponto', pointCode);
  const increase=()=>{
    if(!canIncrease){showToast(stockUnknown?'Aguarde a consulta do estoque deste ponto.':'Limite disponível atingido para este produto.','error');return;}
    if(simpleQuantity)updateQuantity(simpleItemId,simpleQuantity+1);
    else addItem(product,1,[]);
    void trackPublicEvent(settings.id,'add_to_cart',product.id);
    showToast(simpleQuantity?'Quantidade atualizada no carrinho.':'Produto adicionado ao carrinho.','success');
  };
  const decrease=()=>{
    if(simpleQuantity<=1)removeItem(simpleItemId);
    else updateQuantity(simpleItemId,simpleQuantity-1);
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
  </Link>{!unavailable && !outOfStock && !checkingPointStock && (canAddDirect ? <div className="product-card-quick-controls">{simpleQuantity>0&&<button type="button" className="product-card-quick-step" onClick={decrease} aria-label={`Diminuir ${product.name}`}><Minus size={16}/></button>}<button type="button" className="product-card-quick" onClick={increase} disabled={!canIncrease} aria-label={`Adicionar ${product.name} ao carrinho${simpleQuantity?`, ${simpleQuantity} no carrinho`:''}`}><Plus size={17} aria-hidden="true"/>{simpleQuantity?`Adicionar mais · ${simpleQuantity} no carrinho`:'Adicionar'}</button></div> : <Link className="product-card-quick" to={`${productUrl}?${quickParams.toString()}`} aria-label={`Escolher opções de ${product.name}`}><Zap size={16} aria-hidden="true"/>Escolher opções</Link>)}</div>;
}
