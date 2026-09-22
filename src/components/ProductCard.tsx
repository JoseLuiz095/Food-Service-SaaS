import { Plus } from 'lucide-react';
import type { Category, Product } from '../types';
import { currency } from '../utils/format';
import { Badge } from './Badge';
import { ProductMedia } from './ProductMedia';
import { useStore } from '../contexts/StoreContext';
import { storefrontPath } from '../utils/storefrontRoute';

export function ProductCard({product,category}:{product:Product;category?:Category}){
  const {storeBasePath}=useStore();
  const unavailable=product.stockStatus==='unavailable'||product.availabilityStatus!=='available'||(product.trackStock&&Number(product.stockQuantity||0)<=0);
  return <a href={storefrontPath(storeBasePath,`/produto/${product.slug}`)} className={`product-card product-card--food ${unavailable?'is-unavailable':''}`}>
    <div className="product-card__content">
      {product.featured&&<span className="product-card__featured">Mais pedido</span>}
      <span className="product-card__category">{category?.name??'Cardápio'}</span>
      <h3>{product.name}</h3>
      <p>{product.description}</p>
      <div className="product-card__price">{product.promotionalPrice!=null?<><strong>{currency.format(product.promotionalPrice)}</strong><del>{currency.format(product.price)}</del></>:<strong>{currency.format(product.price)}</strong>}</div>
    </div>
    <div className="product-card__image-wrap">
      <ProductMedia src={product.imageUrl} emoji={product.visualEmoji} imageCount={product.images.length} alt={product.name} className="product-card__image" emojiClassName="product-card__emoji-v060"/>
      <div className="product-card__badges">{product.promotionalPrice!=null&&<Badge tone="rose">Oferta</Badge>}{unavailable&&<Badge tone="amber">Indisponível</Badge>}</div>
      {!unavailable&&<span className="product-card__open" aria-hidden="true"><Plus size={20}/></span>}
    </div>
  </a>;
}
