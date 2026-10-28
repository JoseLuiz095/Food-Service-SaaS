import { AlertCircle, ArrowLeft, ArrowRight, Plus, RotateCcw, ShoppingBag, Trash2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ProductMedia } from '../../components/ProductMedia';
import { LoadingState } from '../../components/ui/AsyncState';
import { QuantityControl } from '../../components/QuantityControl';
import { cartItemUnitTotal, useCart } from '../../contexts/CartContext';
import { useStore } from '../../contexts/StoreContext';
import { currency } from '../../utils/format';
import { loadRecentOrder } from '../../utils/customerSales';
import { storefrontPath } from '../../utils/storefrontRoute';
import type { SelectedOption } from '../../types';
import { PickupPointSelector, PointStockNotice } from './PickupPointSelector';
import { pointStock, usePickupAvailability } from './usePickupAvailability';
import { canAddWithoutOptions, cartLineLimit } from '../../utils/cartAvailability';

export default function Cart() {
  const { items, subtotal, addItem, updateQuantity, removeItem, validateAgainstProducts } = useCart();
  const { products, settings, loading, storeBasePath } = useStore();
  const pickup = usePickupAvailability();
  const insufficient = pickup.selectedPoint && pickup.availability ? items.filter((item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    if (!product?.trackStock) return false;
    const totalQuantity = items.filter((candidate) => candidate.productId === item.productId).reduce((sum, candidate) => sum + candidate.quantity, 0);
    const row = pointStock(pickup.availability, item.productId);
    return row && Number(row.available) < totalQuantity;
  }) : [];
  const pickupOnlyShortage = insufficient.length > 0 && !settings.deliveryEnabled;
  const lineLimit = (productId: string, lineId: string) => {
    const product = products.find(candidate => candidate.id === productId);
    return product ? cartLineLimit(product, items, lineId, pickup.selectedPoint
      ? pickup.availability === null ? null : Number(pointStock(pickup.availability, productId)?.available || 0)
      : undefined) : 0;
  };

  useEffect(() => { if (!loading) validateAgainstProducts(products); }, [products, loading, validateAgainstProducts]);

  const recentOrder = useMemo(() => loadRecentOrder(settings.id, (settings.repeatOrderMaxAgeDays ?? 90)), [settings.id, settings.repeatOrderMaxAgeDays]);
  const suggestions = useMemo(() => {
    const inCart = new Set(items.map((item) => item.productId));
    return products
      .filter((product) => product.active && product.stockStatus !== 'unavailable' && product.availabilityStatus === 'available' && !inCart.has(product.id)
        && (settings.deliveryEnabled || !pickup.selectedPoint || !product.trackStock || Number(pointStock(pickup.availability, product.id)?.available || 0) > 0))
      .sort((a, b) => Number(b.featured) - Number(a.featured) || a.price - b.price)
      .slice(0, settings.upsellEnabled ? settings.upsellLimit : 0);
  }, [items, products, settings.upsellEnabled, settings.upsellLimit, settings.deliveryEnabled, pickup.selectedPoint, pickup.availability]);

  const restoreRecentOrder = () => {
    if (!recentOrder) return;
    let added = 0;
    for (const saved of recentOrder.items) {
      const product = products.find((candidate) => candidate.id === saved.productId && candidate.active && candidate.stockStatus !== 'unavailable' && candidate.availabilityStatus === 'available');
      if (!product) continue;
      const options: SelectedOption[] = saved.options.flatMap((selected) => {
        const group = product.optionGroups.find((candidate) => candidate.id === selected.groupId && candidate.active);
        const option = group?.items.find((candidate) => candidate.id === selected.itemId && candidate.active);
        if (!group || !option) return [];
        return [{ groupId: group.id, groupName: group.name, groupKind: group.kind, itemId: option.id, itemName: option.name, priceDelta: option.priceDelta, quantity: Math.max(1, selected.quantity || 1) }];
      });
      const missingRequired = product.optionGroups.some((group) => group.active && group.minChoices > 0 && !options.some((option) => option.groupId === group.id));
      if (missingRequired) continue;
      addItem(product, saved.quantity, options);
      added += 1;
    }
    if (!added) window.alert('Os itens do último pedido mudaram ou não estão disponíveis. Escolha novamente pelo cardápio.');
  };

  if (loading) return <div className="page-center"><LoadingState label="Carregando carrinho..." /></div>;

  if (!items.length) return <div className="simple-page">
    <header className="simple-topbar container cart-navigation-layer"><Link className="cart-nav-button" to={storefrontPath(storeBasePath)}><ArrowLeft size={19}/>Voltar ao cardápio</Link></header>
    <div className="cart-empty"><ShoppingBag size={48}/><h1>Seu carrinho está vazio</h1><p>Escolha seus produtos no cardápio e volte aqui para finalizar.</p><div className="cart-empty-actions"><Link className="primary-button" to={storefrontPath(storeBasePath)}>Ver cardápio</Link>{settings.repeatOrderEnabled && recentOrder && <button type="button" className="secondary-button" onClick={restoreRecentOrder}><RotateCcw size={17}/>Pedir novamente</button>}</div>{settings.repeatOrderEnabled && recentOrder && <small className="recent-order-note">Último pedido salvo neste dispositivo em {new Date(recentOrder.createdAt).toLocaleDateString('pt-BR')}.</small>}</div>
  </div>;

  const minimumMissing = Math.max(0, settings.minimumOrder - subtotal);
  return <div className="simple-page">
    <header className="simple-topbar container cart-navigation-layer"><Link className="cart-nav-button" to={storefrontPath(storeBasePath)}><ArrowLeft size={19}/>Continuar comprando</Link><span>Seu carrinho</span></header>
    <div className="container cart-layout">
      <section>
        <div className="page-title"><span className="eyebrow">SEU PEDIDO</span><h1>Revise os itens</h1><p>Confira tamanhos, escolhas, adicionais e remoções antes de avançar.</p></div>
        {settings.pickupEnabled && <PickupPointSelector points={pickup.points} value={pickup.pickupLocationId} onChange={pickup.setPickupLocationId} loading={pickup.pointsLoading} error={pickup.pointsError} invalidQr={pickup.invalidQr} identifiedByQr={pickup.identifiedByQr}/>}
        {pickup.selectedPoint && pickup.availabilityError && <p className="store-point-stock store-point-stock--warning" role="status">{pickup.availabilityError}</p>}
        <div className="cart-list">{items.map((item) => <article key={item.id} className="cart-item">
          <ProductMedia src={item.imageUrl} emoji={item.visualEmoji} alt={item.productName} emojiClassName="cart-item__emoji-v060"/>
          <div className="cart-item__main"><strong>{item.productName}</strong>
            {item.options.length > 0 && <div className="cart-option-summary">{Array.from(new Set(item.options.map((option) => option.groupId))).map((groupId) => {
              const groupOptions = item.options.filter((option) => option.groupId === groupId);
              return <span key={groupId}><b>{groupOptions[0].groupName}:</b> {groupOptions.map((option) => `${option.itemName}${option.quantity > 1 ? ` ×${option.quantity}` : ''}`).join(', ')}</span>;
            })}</div>}
            <b>{currency.format(cartItemUnitTotal(item))} / un.</b>
            {pickup.selectedPoint && products.find((product) => product.id === item.productId) && <PointStockNotice product={products.find((product) => product.id === item.productId)!} pointName={pickup.selectedPoint.name} row={pointStock(pickup.availability,item.productId)} quantity={items.filter((candidate) => candidate.productId === item.productId).reduce((sum, candidate) => sum + candidate.quantity, 0)}/>}
          </div>
          <QuantityControl value={item.quantity} max={lineLimit(item.productId,item.id)} onChange={(value) => updateQuantity(item.id, value)}/>
          <strong className="cart-item__total">{currency.format(cartItemUnitTotal(item) * item.quantity)}</strong>
          <button type="button" className="row-delete" onClick={() => removeItem(item.id)} aria-label={`Remover ${item.productName}`}><Trash2 size={18}/></button>
        </article>)}</div>

        {suggestions.length > 0 && <section className="cart-upsell-v061"><div className="cart-upsell-v061__heading"><span className="eyebrow">COMPLETE O PEDIDO</span><h2>Que tal levar também?</h2><p>Sugestões disponíveis no cardápio para aumentar seu pedido sem complicar a escolha.</p></div><div className="cart-upsell-v061__grid">{suggestions.map((product) => {
          const canQuickAdd = canAddWithoutOptions(product);
          const price = product.promotionalPrice ?? product.price;
          return <article key={product.id}><ProductMedia src={product.imageUrl} emoji={product.visualEmoji} alt={product.name}/><div><strong>{product.name}</strong><span>{currency.format(price)}</span></div>{canQuickAdd ? <button type="button" disabled={lineLimit(product.id,`${product.id}|base`)<1} onClick={() => addItem(product, 1, [])}><Plus size={16}/>Adicionar</button> : <Link to={storefrontPath(storeBasePath, `/produto/${product.slug}`)}>Personalizar <ArrowRight size={15}/></Link>}</article>;
        })}</div></section>}
      </section>
      <aside className="order-summary cart-navigation-layer">
        <span className="eyebrow">RESUMO</span>
        <div className="summary-total"><span>Subtotal</span><strong>{currency.format(subtotal)}</strong></div>
        {settings.minimumOrder > 0 && <div className={`minimum-order ${minimumMissing > 0 ? 'warning' : ''}`}><span>Pedido mínimo: {currency.format(settings.minimumOrder)}</span>{minimumMissing > 0 && <strong>Faltam {currency.format(minimumMissing)}</strong>}</div>}
        {pickup.selectedPoint ? <p>Retirada em <strong>{pickup.selectedPoint.name}</strong>. Sem taxa de entrega.</p> : settings.deliveryEnabled ? <p>Taxa de entrega calculada ao escolher o bairro. Retirada sem taxa.</p> : <p>Retirada sem taxa de entrega.</p>}
        {insufficient.length > 0 && <p className="store-point-stock store-point-stock--warning" role="alert">Há itens sem saldo suficiente no ponto escolhido. {settings.deliveryEnabled ? 'No checkout, escolha delivery ou altere o ponto de retirada.' : 'Ajuste as quantidades ou selecione outro ponto.'}</p>}
        {minimumMissing > 0 || pickupOnlyShortage ? <button type="button" className="primary-button cart-continue-button" disabled><AlertCircle size={18}/>{pickupOnlyShortage ? 'Ajuste o estoque do ponto' : 'Complete o pedido'}</button> : <Link className="primary-button cart-continue-button" to={storefrontPath(storeBasePath, '/finalizar')}>{insufficient.length ? 'Escolher delivery' : 'Continuar'} <ArrowRight size={18}/></Link>}
      </aside>
    </div>
  </div>;
}
