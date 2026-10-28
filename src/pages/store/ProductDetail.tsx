import { ArrowLeft, Check, ChevronLeft, ChevronRight, Clock3, Minus, Package, Plus, Share2, ShoppingBag, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ProductMedia, hasProductImage } from '../../components/ProductMedia';
import { LoadingState } from '../../components/ui/AsyncState';
import { cartItemIdFor, MAX_CART_ITEM_QUANTITY, useCart } from '../../contexts/CartContext';
import { useStore } from '../../contexts/StoreContext';
import type { OptionGroup, PartyOrderConfig, SelectedOption } from '../../types';
import { currency, roundMoney } from '../../utils/format';
import { useToast } from '../../contexts/ToastContext';
import { publicProductUrl, storefrontPath } from '../../utils/storefrontRoute';
import { trackPublicEvent } from '../../services/analyticsApi';
import '../../segments/product-detail-mobile.css';
import { PickupPointSelector, PointStockNotice } from './PickupPointSelector';
import { pointStock, usePickupAvailability } from './usePickupAvailability';
import { cartLineLimit } from '../../utils/cartAvailability';

const groupInstruction = (group: OptionGroup) => {
  if (group.minChoices === group.maxChoices && group.maxChoices === 1) return 'Escolha 1 opção';
  if (group.minChoices > 0 && group.minChoices === group.maxChoices) return `Escolha ${group.minChoices}`;
  if (group.minChoices > 0) return `Escolha de ${group.minChoices} até ${group.maxChoices}`;
  if (group.maxChoices === 1) return 'Opcional · escolha até 1';
  return `Opcional · escolha até ${group.maxChoices}`;
};

const PARTY_CONFIG_GROUP = '__foodweb_party_order_config__';
const readPartyConfig = (groups: OptionGroup[]): PartyOrderConfig | undefined => {
  const raw = groups.find((group) => group.name === PARTY_CONFIG_GROUP)?.description;
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<PartyOrderConfig>;
    if (!parsed.enabled) return undefined;
    return {
      enabled: true,
      pricePerGram: Math.max(0, Number(parsed.pricePerGram) || 0),
      packageWeightGrams: Math.max(1, Math.trunc(Number(parsed.packageWeightGrams) || 100)),
      minimumPackages: Math.max(1, Math.trunc(Number(parsed.minimumPackages) || 1)),
      leadTimeDays: Math.max(0, Math.trunc(Number(parsed.leadTimeDays) || 0)),
      artworkInstructions: String(parsed.artworkInstructions || ''),
    };
  } catch {
    return undefined;
  }
};
const instagramHref = (value: string) => {
  const normalized = value.trim();
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return `https://www.instagram.com/${normalized.replace(/^@+/, '')}/`;
};
const instagramLabel = (value: string) => {
  const normalized = value.trim().replace(/\/$/, '');
  if (/^https?:\/\//i.test(normalized)) return `@${normalized.split('/').filter(Boolean).pop() || 'Instagram'}`;
  return normalized.startsWith('@') ? normalized : `@${normalized}`;
};
const InstagramGlyph = ({ size = 15 }: { size?: number }) => <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".7" fill="currentColor" stroke="none"/></svg>;

export default function ProductDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const quickMode = searchParams.get('compra') === 'rapida';
  const { products, categories, settings, loading, storeBasePath } = useStore();
  const { addItem, items } = useCart();
  const pickup = usePickupAvailability();
  const { showToast } = useToast();
  const product = products.find((item) => item.slug === slug && item.active);
  const partyConfig = product?.partyOrderConfig?.enabled ? product.partyOrderConfig : product ? readPartyConfig(product.optionGroups) : undefined;
  const [quantity, setQuantity] = useState(1);
  const [partyPackageWeightGrams, setPartyPackageWeightGrams] = useState(100);
  const [selections, setSelections] = useState<Record<string, Record<string, number>>>({});
  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    if (!product) return;
    const defaults: Record<string, Record<string, number>> = {};
    product.optionGroups.filter((group) => group.active).forEach((group) => {
      const activeItems = group.items.filter((item) => item.active);
      defaults[group.id] = {};
      if (group.minChoices > 0 && group.maxChoices === 1 && activeItems[0]) defaults[group.id][activeItems[0].id] = 1;
    });
    const config = product.partyOrderConfig?.enabled ? product.partyOrderConfig : readPartyConfig(product.optionGroups);
    setQuantity(config?.minimumPackages ?? 1);
    setPartyPackageWeightGrams(config?.packageWeightGrams ?? 100);
    setSelections(defaults);
    setImageIndex(0);
  }, [product?.id]);

  useEffect(() => {
    if (!loading && product?.id && settings.id) void trackPublicEvent(settings.id, 'product_view', product.id);
  }, [loading, product?.id, settings.id]);

  const selectedOptions = useMemo<SelectedOption[]>(() => {
    if (!product) return [];
    return product.optionGroups.flatMap((group) => {
      const selected = selections[group.id] || {};
      return group.items
        .filter((item) => item.active && (selected[item.id] || 0) > 0)
        .map((item) => ({
          groupId: group.id,
          groupName: group.name,
          groupKind: group.kind,
          itemId: item.id,
          itemName: item.name,
          priceDelta: item.priceDelta,
          quantity: Math.max(1, selected[item.id] || 1),
        }));
    });
  }, [product, selections]);

  const total = useMemo(() => {
    if (!product) return 0;
    const selectedPartyWeight = partyConfig ? Math.max(1, Math.trunc(Number(partyPackageWeightGrams) || partyConfig.packageWeightGrams)) : undefined;
    const base = partyConfig?.pricePerGram ? roundMoney(partyConfig.pricePerGram * (selectedPartyWeight || partyConfig.packageWeightGrams)) : (product.promotionalPrice ?? product.price);
    const optionsTotal = selectedOptions.reduce((sum, option) => sum + option.priceDelta * option.quantity, 0);
    return roundMoney((base + optionsTotal) * quantity);
  }, [product, partyConfig, partyPackageWeightGrams, selectedOptions, quantity]);

  if (loading) return <div className="page-center"><LoadingState label="Carregando produto..." /></div>;
  if (!product) return <div className="not-found"><h2>Produto não encontrado</h2><Link to={storefrontPath(storeBasePath)}>Voltar ao cardápio</Link></div>;

  const category = categories.find((item) => item.id === product.categoryId);
  const storeInstagramHref = instagramHref(settings.instagram);
  const realImage = hasProductImage(product.imageUrl, product.images.length);
  const gallery = Array.from(new Set([
    ...(realImage ? [product.imageUrl] : []),
    ...product.gallery.filter(Boolean),
  ]));
  const moveImage = (direction: number) => {
    if (gallery.length < 2) return;
    setImageIndex((current) => (current + direction + gallery.length) % gallery.length);
  };
  const unavailable = product.stockStatus === 'unavailable' || product.availabilityStatus !== 'available';
  const localStock = pickup.selectedPoint && product.trackStock ? pointStock(pickup.availability, product.id) : undefined;
  const outOfStock = pickup.selectedPoint ? Boolean(localStock && Number(localStock.available) <= 0) : product.trackStock && Number(product.stockQuantity || 0) - Number(product.stockReservedQuantity || 0) <= 0;
  const insufficientAtPoint = Boolean(localStock && Number(localStock.available) < quantity);

  const toggleOption = (group: OptionGroup, itemId: string) => {
    setSelections((current) => {
      const selected = current[group.id] || {};
      const currentQty = selected[itemId] || 0;
      if (currentQty > 0) {
        const next = { ...selected };
        delete next[itemId];
        return { ...current, [group.id]: next };
      }
      if (group.maxChoices === 1) return { ...current, [group.id]: { [itemId]: 1 } };
      const distinctCount = Object.values(selected).filter((value) => value > 0).length;
      if (distinctCount >= group.maxChoices) {
        showToast(`Você pode escolher até ${group.maxChoices} opções em ${group.name}.`, 'error');
        return current;
      }
      return { ...current, [group.id]: { ...selected, [itemId]: 1 } };
    });
  };

  const changeAddonQuantity = (group: OptionGroup, itemId: string, delta: number) => {
    setSelections((current) => {
      const selected = current[group.id] || {};
      const currentQty = selected[itemId] || 0;
      const nextQty = Math.max(0, Math.min(20, currentQty + delta));
      if (currentQty === 0 && nextQty > 0) {
        const distinctCount = Object.values(selected).filter((value) => value > 0).length;
        if (distinctCount >= group.maxChoices) {
          showToast(`Você pode escolher até ${group.maxChoices} adicionais diferentes em ${group.name}.`, 'error');
          return current;
        }
      }
      const next = { ...selected };
      if (nextQty === 0) delete next[itemId]; else next[itemId] = nextQty;
      return { ...current, [group.id]: next };
    });
  };

  const validateSelections = () => {
    for (const group of product.optionGroups.filter((item) => item.active)) {
      const count = Object.values(selections[group.id] || {}).filter((value) => value > 0).length;
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
    const url = publicProductUrl(settings.slug, product.slug);
    try {
      if (navigator.share) await navigator.share({ title: product.name, text: product.description, url });
      else { await navigator.clipboard.writeText(url); showToast('Link do produto copiado.', 'success'); }
    } catch { /* usuário cancelou */ }
  };

  const add = (quick = false) => {
    if (unavailable || !validateSelections()) return;
    if (product.trackStock && (pickup.pickupLocationId || searchParams.get('ponto')) && (!pickup.selectedPoint || !localStock)) {
      showToast('Confirme o ponto de retirada e aguarde a consulta de disponibilidade.', 'error');
      return;
    }
    if (localStock && Number(localStock.available) < quantity + items.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0)) {
      showToast(`Quantidade indisponível em ${pickup.selectedPoint?.name}. Ajuste o pedido ou escolha outro ponto.`, 'error');
      return;
    }
    const selectedPartyWeight = partyConfig ? Math.max(1, Math.trunc(Number(partyPackageWeightGrams) || partyConfig.packageWeightGrams)) : undefined;
    if (partyConfig && (!selectedPartyWeight || selectedPartyWeight < 1)) { showToast('Informe a gramatura por pacote.', 'error'); return; }
    const existingQuantity = items.find(item => item.id === cartItemIdFor(product.id, selectedOptions, selectedPartyWeight))?.quantity || 0;
    if (quantity + existingQuantity > MAX_CART_ITEM_QUANTITY) {
      showToast(`Este item tem limite de ${MAX_CART_ITEM_QUANTITY} unidades por combinação de opções. Ajuste a quantidade no carrinho.`, 'error');
      return;
    }
    const availableLimit = cartLineLimit(product, items, cartItemIdFor(product.id, selectedOptions, selectedPartyWeight), localStock ? Number(localStock.available) : undefined);
    if (quantity + existingQuantity > availableLimit) {
      showToast('Quantidade acima da disponibilidade. Ajuste o carrinho ou escolha outro ponto.', 'error');
      return;
    }
    addItem(product, quantity, selectedOptions, partyConfig ? { partyPackageWeightGrams: selectedPartyWeight } : undefined);
    void trackPublicEvent(settings.id, 'add_to_cart', product.id);
    if (quick) {
      const params = new URLSearchParams({ quick: cartItemIdFor(product.id, selectedOptions, selectedPartyWeight), qty: String(quantity) });
      if (searchParams.get('ponto')) params.set('ponto', searchParams.get('ponto')!);
      navigate(`${storefrontPath(storeBasePath, '/finalizar')}?${params.toString()}`);
    } else {
      showToast('Produto adicionado ao carrinho.', 'success');
      navigate(storefrontPath(storeBasePath, '/carrinho'));
    }
  };

  return <div className="simple-page">
    <header className="simple-topbar container"><Link to={storefrontPath(storeBasePath)}><ArrowLeft size={19}/>Voltar ao cardápio</Link><button onClick={() => void share()}><Share2 size={18}/>Compartilhar</button></header>
    <div className="container product-detail-layout">
      <section className="product-gallery">
        <div className="product-main-image">
          <ProductMedia src={gallery[imageIndex] || product.imageUrl} emoji={product.visualEmoji} imageCount={product.images.length} alt={product.name} emojiClassName="product-detail-emoji-v060"/>
          {gallery.length > 1 && <>
            <button type="button" className="gallery-arrow gallery-arrow--prev" onClick={() => moveImage(-1)} aria-label="Imagem anterior"><ChevronLeft size={20}/></button>
            <button type="button" className="gallery-arrow gallery-arrow--next" onClick={() => moveImage(1)} aria-label="Próxima imagem"><ChevronRight size={20}/></button>
            <div className="gallery-dots" role="tablist" aria-label="Imagens do produto">
              {gallery.map((src, index) => <button type="button" key={`dot-${src}-${index}`} className={imageIndex === index ? "active" : ""} onClick={() => setImageIndex(index)} role="tab" aria-selected={imageIndex === index} aria-label={`Ver imagem ${index + 1}`} />)}
            </div>
          </>}
          {product.preparationTimeMinutes > 0 && <span className="gallery-badge"><Clock3 size={14}/>+{product.preparationTimeMinutes} min</span>}
        </div>
        {gallery.length > 1 && <div className="gallery-thumbs">{gallery.map((src, index) => <button key={`${src}-${index}`} className={imageIndex === index ? 'active' : ''} onClick={() => setImageIndex(index)}><ProductMedia src={src} alt={`${product.name} ${index + 1}`}/></button>)}</div>}
      </section>

      <section className="product-detail-info">
        <span className="eyebrow">{category?.name ?? 'PRODUTO'}</span>
        <h1>{product.name}</h1>
        <p className="product-long-description">{product.description}</p>
        {settings.pickupEnabled && <PickupPointSelector points={pickup.points} value={pickup.pickupLocationId} onChange={pickup.setPickupLocationId} loading={pickup.pointsLoading} error={pickup.pointsError} invalidQr={pickup.invalidQr} compact/>}
        {pickup.selectedPoint && <PointStockNotice product={product} pointName={pickup.selectedPoint.name} row={localStock} quantity={quantity}/>}
        {pickup.selectedPoint && pickup.availabilityError && <p className="store-point-stock store-point-stock--warning" role="status">{pickup.availabilityError}</p>}
        {partyConfig && <div className="made-to-order party-order-note"><Package size={19}/><div><strong>Encomenda para festas</strong><span>Produção sob agendamento, com mínimo de {partyConfig.minimumPackages} pacote(s) de {partyConfig.packageWeightGrams} g{partyConfig.leadTimeDays > 0 ? ` e antecedência de ${partyConfig.leadTimeDays} dia${partyConfig.leadTimeDays === 1 ? '' : 's'}` : ''}.</span>{partyConfig.pricePerGram > 0 && <small>Preço de referência: {currency.format(partyConfig.pricePerGram)} por grama · {currency.format(partyConfig.pricePerGram * partyConfig.packageWeightGrams)} por pacote.</small>}{partyConfig.artworkInstructions && <small>{partyConfig.artworkInstructions}</small>}{storeInstagramHref && <a href={storeInstagramHref} target="_blank" rel="noreferrer"><InstagramGlyph/>Fale com a loja pelo Instagram {instagramLabel(settings.instagram)}</a>}</div></div>}
         {partyConfig && <label className="party-order-weight-field">Gramas por pacote <span>(opcional · padrão {partyConfig.packageWeightGrams} g)</span><input type="number" min="1" max="10000" step="1" value={partyPackageWeightGrams} onChange={(event) => setPartyPackageWeightGrams(Math.max(1, Math.min(10000, Number(event.target.value) || partyConfig.packageWeightGrams)))} /><small>Se você não alterar, usamos o padrão cadastrado pela loja. A quantidade abaixo representa o número de pacotes.</small></label>}
        {outOfStock && !unavailable && !pickup.selectedPoint && <div className="stock-schedule-note"><Clock3 size={18}/><div><strong>Sob encomenda</strong><span>Inclua no pedido e escolha a data disponível no checkout.</span></div></div>}
        {product.preparationTimeMinutes > 0 && <div className="made-to-order"><Clock3 size={19}/><div><strong>Tempo adicional de preparo</strong><span>Este item pode acrescentar cerca de {product.preparationTimeMinutes} minutos ao prazo do pedido.</span></div></div>}

        {product.optionGroups.filter((group) => group.active).map((group) => {
          const activeItems = group.items.filter((item) => item.active);
          const selectedMap = selections[group.id] || {};
          return <div className="option-group food-option-group" key={group.id}>
            <div className="option-group__heading"><div><h3>{group.name}{group.minChoices > 0 ? ' *' : ''}</h3><p>{group.description || groupInstruction(group)}</p></div><span className="option-limit-badge">{groupInstruction(group)}</span></div>
            <div className={`variation-list ${group.kind === 'addon' ? 'addon-list-v060' : ''}`}>
              {activeItems.map((item) => {
                const optionQty = selectedMap[item.id] || 0;
                const selected = optionQty > 0;
                if (group.kind === 'addon') return <div key={item.id} className={`addon-option-v060 ${selected ? 'selected' : ''}`}>
                  <button type="button" className="addon-option-main-v060" onClick={() => changeAddonQuantity(group, item.id, selected ? -optionQty : 1)}>
                    <span>{item.name}{item.description && <small>{item.description}</small>}</span>
                    <strong>{item.priceDelta === 0 ? 'Incluso' : `+ ${currency.format(Math.abs(item.priceDelta))}`}</strong>
                  </button>
                  <div className="addon-quantity-v060">
                    <button type="button" onClick={() => changeAddonQuantity(group, item.id, -1)} disabled={!selected} aria-label={`Diminuir ${item.name}`}><Minus size={14}/></button>
                    <b>{optionQty}</b>
                    <button type="button" onClick={() => changeAddonQuantity(group, item.id, 1)} aria-label={`Adicionar ${item.name}`}><Plus size={14}/></button>
                  </div>
                </div>;
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
          <div className="quantity-control"><small>{partyConfig ? 'Pacotes' : 'Quantidade'}</small><button onClick={() => setQuantity((value) => Math.max(partyConfig?.minimumPackages ?? 1, value - 1))} disabled={quantity <= (partyConfig?.minimumPackages ?? 1)} aria-label="Diminuir quantidade"><Minus size={17}/></button><span>{quantity}</span><button onClick={() => setQuantity((value) => Math.min(MAX_CART_ITEM_QUANTITY, value + 1))} disabled={quantity >= MAX_CART_ITEM_QUANTITY} aria-label="Aumentar quantidade"><Plus size={17}/></button></div>
          <div className="buy-total"><small>Total</small><strong>{currency.format(total)}</strong></div>
          <button className="primary-button" disabled={unavailable || (insufficientAtPoint && !settings.deliveryEnabled)} onClick={() => add()}><ShoppingBag size={18}/>{unavailable || (insufficientAtPoint && !settings.deliveryEnabled) ? 'Indisponível neste ponto' : insufficientAtPoint ? 'Adicionar para delivery' : 'Adicionar ao carrinho'}</button>
          {!unavailable && !outOfStock && !insufficientAtPoint && <button type="button" className="secondary-button" onClick={() => add(true)}><Zap size={18}/>Comprar agora</button>}
          {quickMode && <small>Confirme a quantidade e as opções. Você seguirá direto para a finalização deste item.</small>}
        </div>
      </section>
    </div>
  </div>;
}
