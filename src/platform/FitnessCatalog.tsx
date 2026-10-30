import { InfoHint } from '../components/ui/InfoHint';
import { ArrowLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ProductMedia } from '../components/ProductMedia';
import { useStore } from '../contexts/StoreContext';
import type { Category, Product } from '../types';
import { currency } from '../utils/format';
import { storefrontPath } from '../utils/storefrontRoute';
import { normalizeText } from '../utils/text';
import './fitness.css';

type CatalogProps = { products: Product[]; categories: Category[]; query?: string; visible?: boolean };

/** Only published rows from the tenant-scoped public snapshot reach this view. */
export function FitnessCatalog({ products, categories, query = '', visible: showProducts = true }: CatalogProps) {
  const [categoryId, setCategoryId] = useState('all');
  const { storeBasePath } = useStore();
  const published = useMemo(() => products.filter(product => product.active && categories.some(category => category.id === product.categoryId && category.active)), [products, categories]);
  const visibleCategories = categories.filter(category => category.active && published.some(product => product.categoryId === category.id));
  const visible = published.filter(product => (categoryId === 'all' || product.categoryId === categoryId) && normalizeText(`${product.name} ${product.description}`).includes(normalizeText(query)));

  if (!showProducts) return null;
  return <section className="fitness-catalog" aria-labelledby="fitness-catalog-title">
    <div className="food-section-title"><div><span>CATÁLOGO</span><h2 id="fitness-catalog-title">Produtos da loja</h2><InfoHint>Consulte os itens publicados e seus detalhes.</InfoHint></div></div>
    {published.length > 0 ? <>
      <div className="fitness-catalog-filters" role="group" aria-label="Categorias de produtos"><button type="button" aria-pressed={categoryId === 'all'} onClick={() => setCategoryId('all')}>Todos</button>{visibleCategories.map(category => <button type="button" key={category.id} aria-pressed={categoryId === category.id} onClick={() => setCategoryId(category.id)}>{category.name}</button>)}</div>
      {visible.length ? <div className="fitness-catalog-grid">{visible.map(product => <Link className="fitness-catalog-card" key={product.id} to={storefrontPath(storeBasePath, `/produto/${product.slug}`)}><ProductMedia src={product.imageUrl} imageCount={product.images.length} alt={product.name}/><span>{visibleCategories.find(category => category.id === product.categoryId)?.name}</span><h3>{product.name}</h3><p>{product.description}</p><strong>{product.price > 0 ? currency.format(product.promotionalPrice ?? product.price) : 'Preço não informado'}</strong><small>Ver detalhes</small></Link>)}</div> : <p role="status" className="business-muted">Nenhum produto corresponde à busca. Tente outro termo ou categoria.</p>}
    </> : <p role="status" className="business-muted">Ainda não há produtos publicados nesta loja. Os itens em preparação aparecem aqui somente após a confirmação dos dados comerciais.</p>}
  </section>;
}

export function FitnessProductDetail() {
  const { slug } = useParams();
  const { products, categories, loading, error, storeBasePath } = useStore();
  if (loading) return <div className="container page-center" role="status">Carregando produto…</div>;
  if (error) return <div className="container page-center" role="alert">Não foi possível consultar o produto: {error}</div>;
  const product = products.find(item => item.slug === slug && item.active && categories.some(category => category.id === item.categoryId && category.active));
  if (!product) return <div className="container page-center"><h1>Produto indisponível</h1><p>O item pode ter sido retirado do catálogo.</p><Link to={storefrontPath(storeBasePath)}>Voltar à loja</Link></div>;
  const category = categories.find(item => item.id === product.categoryId);
  const unavailable = product.availabilityStatus !== 'available' || product.stockStatus === 'unavailable' || (product.trackStock && Number(product.stockQuantity || 0) - Number(product.stockReservedQuantity || 0) <= 0);
  return <div className="container fitness-product-detail"><Link to={storefrontPath(storeBasePath)} className="fitness-back"><ArrowLeft size={18}/>Voltar à loja</Link><article className="fitness-product-grid"><ProductMedia src={product.imageUrl} imageCount={product.images.length} alt={product.name}/><div><span className="eyebrow">{category?.name ?? 'Produto'}</span><h1>{product.name}</h1><p>{product.description}</p><strong>{product.price > 0 ? currency.format(product.promotionalPrice ?? product.price) : 'Preço não informado'}</strong><p role="status">{unavailable ? 'Produto indisponível no momento.' : 'Produto publicado para consulta.'}</p><p className="business-muted">Compra online ainda não disponível para este item. Consulte a loja para mais informações.</p></div></article></div>;
}
