import { ArrowLeft, Check, Clock3, Minus, Plus, Share2, ShoppingBag } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { LoadingState } from '../../components/ui/AsyncState';
import { useCart } from '../../contexts/CartContext';
import { useStore } from '../../contexts/StoreContext';
import type { OptionGroup, SelectedOption } from '../../types';
import { currency, roundMoney } from '../../utils/format';
import { useToast } from '../../contexts/ToastContext';
import { storefrontPath } from '../../utils/storefrontRoute';
import { trackPublicEvent } from '../../services/analyticsApi';

const groupInstruction = (group: OptionGroup) => {
  if (group.minChoices === group.maxChoices && group.maxChoices === 1) return 'Escolha 1 opção';
  if (group.minChoices > 0 && group.minChoices === group.maxChoices) return `Escolha ${group.minChoices}`;
  if (group.minChoices > 0) return `Escolha de ${group.minChoices} até ${group.maxChoices}`;
  if (group.maxChoices === 1) return 'Opcional · escolha até 1';
  return `Opcional · escolha até ${group.maxChoices}`;
};

export default function ProductDetail() {
  const { slug } = useParams();
  const { products, categories, settings, loading, storeBasePath } = useStore();
  const { addItem } = useCart();
  const { showToast } = useToast();
  const product = products.find((item) => item.slug === slug && item.active);
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    if (!product) return;
    const defaults: Record<string, string[]> = {};
    product.optionGroups.filter((group) => group.active).forEach((group) => {
      const activeItems = group.items.filter((item) => item.active);
      if (group.minChoices > 0 && group.maxChoices === 1 && activeItems[0]) defaults[group.id] = [activeItems[0].id];
    });
    setQuantity(1);
    setSelections(defaults);
    setImageIndex(0);
  }, [product?.id]);

  useEffect(() => {
    if (!loading && product?.id && settings.id) void trackPublicEvent(settings.id, 'product_view', product.id);
  }, [loading, product?.id, settings.id]);

  const selectedOptions = useMemo<SelectedOption[]>(() => {
    if (!product) return [];
    return product.optionGroups.flatMap((group) => {
      const selectedIds = selections[group.id] || [];
      return group.items
        .filter((item) => item.active && selectedIds.includes(item.id))
        .map((item) => ({
          groupId: group.id,
          groupName: group.name,
          groupKind: group.kind,
          itemId: item.id,
          itemName: item.name,
          priceDelta: item.priceDelta,
          quantity: 1,
        }));
    });
  }, [product, selections]);

  const total = useMemo(() => {
    if (!product) return 0;
    const base = product.promotionalPrice ?? product.price;
    const optionsTotal = selectedOptions.reduce((sum, option) => sum + option.priceDelta * option.quantity, 0);
    return roundMoney((base + optionsTotal) * quantity);
  }, [product, selectedOptions, quantity]);

  if (loading) return <div className="page-center"><LoadingState label="Carregando produto..." /></div>;
  if (!product) return <div className="not-found"><h2>Produto não encontrado</h2><a href={storefrontPath(storeBasePath)}>Voltar ao cardápio</a></div>;

  const category = categories.find((item) => item.id === product.categoryId);
  const gallery = product.gallery.length ? product.gallery : [product.imageUrl];
  const unavailable = product.stockStatus === 'unavailable' || product.availabilityStatus !== 'available' || (product.trackStock && Number(product.stockQuantity || 0) <= 0);

  const toggleOption = (group: OptionGroup, itemId: string) => {
    setSelections((current) => {
      const selected = current[group.id] || [];
      if (selected.includes(itemId)) return { ...current, [group.id]: selected.filter((id) => id !== itemId) };
      if (group.maxChoices === 1) return { ...current, [group.id]: [itemId] };
      if (selected.length >= group.maxChoices) {
        showToast(`Você pode escolher até ${group.maxChoices} opções em ${group.name}.`, 'error');
        return current;
      }
      return { ...current, [group.id]: [...selected, itemId] };
    });
  };

  const validateSelections = () => {
    for (const group of product.optionGroups.filter((item) => item.active)) {
      const count = (selections[group.id] || []).length;
      if (count < group.minChoices) {
        showToast(`${group.name}: escolha pelo menos ${group.minChoices} opção${group.minChoices === 1 ? '' : 'ões'}.`, 'error');
        return false;
      }
      if (count > group.maxChoices) {
        showToast(`${group.name}: escolha no máximo ${group.maxChoices}.`, 'error');
        return false;
      }
    }
    return true;
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: product.name, text: product.description, url });
      else { await navigator.clipboard.writeText(url); showToast('Link do produto copiado.', 'success'); }
    } catch { /* usuário cancelou */ }
  };

  const add = () => {
    if (unavailable || !validateSelections()) return;
    addItem(product, quantity, selectedOptions);
    void trackPublicEvent(settings.id, 'add_to_cart', product.id);
    showToast('Produto adicionado ao carrinho.', 'success');
    window.location.assign(storefrontPath(storeBasePath, '/carrinho'));
  };

  return <div className="simple-page">
    <header className="simple-topbar container"><a href={storefrontPath(storeBasePath)}><ArrowLeft size={19}/>Voltar ao cardápio</a><button onClick={() => void share()}><Share2 size={18}/>Compartilhar</button></header>
    <div className="container product-detail-layout">
      <section className="product-gallery">
        <div className="product-main-image"><ImageWithFallback src={gallery[imageIndex] || gallery[0]} alt={product.name}/>{product.preparationTimeMinutes > 0 && <span className="gallery-badge"><Clock3 size={14}/>+{product.preparationTimeMinutes} min</span>}</div>
        {gallery.length > 1 && <div className="gallery-thumbs">{gallery.map((src, index) => <button key={`${src}-${index}`} className={imageIndex === index ? 'active' : ''} onClick={() => setImageIndex(index)}><ImageWithFallback src={src} alt={`${product.name} ${index + 1}`}/></button>)}</div>}
      </section>

      <section className="product-detail-info">
        <span className="eyebrow">{category?.name ?? 'PRODUTO'}</span>
        <h1>{product.name}</h1>
        <p className="product-long-description">{product.description}</p>
        {product.preparationTimeMinutes > 0 && <div className="made-to-order"><Clock3 size={19}/><div><strong>Tempo adicional de preparo</strong><span>Este item pode acrescentar cerca de {product.preparationTimeMinutes} minutos ao prazo do pedido.</span></div></div>}

        {product.optionGroups.filter((group) => group.active).map((group) => {
          const activeItems = group.items.filter((item) => item.active);
          const selectedIds = selections[group.id] || [];
          return <div className="option-group food-option-group" key={group.id}>
            <div className="option-group__heading"><div><h3>{group.name}{group.minChoices > 0 ? ' *' : ''}</h3><p>{group.description || groupInstruction(group)}</p></div><span className="option-limit-badge">{groupInstruction(group)}</span></div>
            <div className="variation-list">
              {activeItems.map((item) => {
                const selected = selectedIds.includes(item.id);
                return <button type="button" key={item.id} className={selected ? 'selected' : ''} onClick={() => toggleOption(group, item.id)}>
                  <span>{item.name}{item.description && <small>{item.description}</small>}</span>
                  <strong>{item.priceDelta === 0 ? (group.kind === 'removal' ? 'Sem custo' : 'Incluso') : `${item.priceDelta > 0 ? '+' : '-'} ${currency.format(Math.abs(item.priceDelta))}`}</strong>
                  {selected && <Check size={16}/>} 
                </button>;
              })}
            </div>
          </div>;
        })}

        <div className="buy-box">
          <div className="quantity-control"><button onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Diminuir quantidade"><Minus size={17}/></button><span>{quantity}</span><button onClick={() => setQuantity((value) => value + 1)} aria-label="Aumentar quantidade"><Plus size={17}/></button></div>
          <div className="buy-total"><small>Total</small><strong>{currency.format(total)}</strong></div>
          <button className="primary-button" disabled={unavailable} onClick={add}><ShoppingBag size={18}/>{unavailable ? 'Indisponível' : 'Adicionar ao carrinho'}</button>
        </div>
      </section>
    </div>
  </div>;
}
