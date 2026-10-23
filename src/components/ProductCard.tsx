import { Plus, Zap } from 'lucide-react';
import './product-card-quick.css';
import { Link, useSearchParams } from 'react-router-dom';
import type { Category, Product } from '../types';
import { currency } from '../utils/format';
import { Badge } from './Badge';
import { ProductMedia } from './ProductMedia';
import { useStore } from '../contexts/StoreContext';
import { storefrontPath } from '../utils/storefrontRoute';
import { getBusinessSegment } from '../segments/businessSegments';

export function ProductCard({product,category}:{product:Product;category?:Category}){
  const {storeBasePath,settings}=useStore();
  const [searchParams] = useSearchParams();
  const pointCode = searchParams.get('ponto');
  const profile=getBusinessSegment(settings.visualTheme);
  const unavailable=product.stockStatus==='unavailable'||product.availabilityStatus!=='available';
  const outOfStock=product.trackStock&&Number(product.stockQuantity||0)-Number(product.stockReservedQuantity||0)<=0;
  const productUrl=storefrontPath(storeBasePath,`/produto/${product.slug}`);
  const quickParams = new URLSearchParams({ compra: 'rapida' });
  if (pointCode) quickParams.set('ponto', pointCode);
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
      <div className="product-card__badges">{product.promotionalPrice!=null&&<Badge tone="rose">Oferta</Badge>}{unavailable&&<Badge tone="amber">Indisponível</Badge>}{!unavailable&&outOfStock&&<Badge tone="amber">Agende para amanhã</Badge>}</div>
      {!unavailable&&<span className="product-card__open" aria-hidden="true"><Plus size={20}/></span>}
    </div>
  </Link>{!unavailable && !outOfStock && <Link className="product-card-quick" to={`${productUrl}?${quickParams.toString()}`} aria-label={`Compra relâmpago: ${product.name}`}><Zap size={16} aria-hidden="true"/>Comprar agora</Link>}</div>;
}
