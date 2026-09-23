import { AlertCircle, ArrowLeft, ArrowRight, Plus, RotateCcw, ShoppingBag, Trash2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { ProductMedia } from '../../components/ProductMedia';
import { LoadingState } from '../../components/ui/AsyncState';
import { QuantityControl } from '../../components/QuantityControl';
import { cartItemUnitTotal, useCart } from '../../contexts/CartContext';
import { useStore } from '../../contexts/StoreContext';
import { currency } from '../../utils/format';
import { loadRecentOrder } from '../../utils/customerSales';
import { storefrontPath } from '../../utils/storefrontRoute';
import type { SelectedOption } from '../../types';

export default function Cart() {
  const { items, subtotal, addItem, updateQuantity, removeItem, validateAgainstProducts } = useCart();
  const { products, settings, loading, storeBasePath } = useStore();

  useEffect(() => { if (!loading) validateAgainstProducts(products); }, [products, loading, validateAgainstProducts]);

  const recentOrder = useMemo(() => loadRecentOrder(settings.id), [settings.id]);
  const suggestions = useMemo(() => {
    const inCart = new Set(items.map((item) => item.productId));
    return products
      .filter((product) => product.active && product.stockStatus !== 'unavailable' && product.availabilityStatus === 'available' && !inCart.has(product.id))
      .sort((a, b) => Number(b.featured) - Number(a.featured) || a.price - b.price)
      .slice(0, settings.upsellEnabled ? settings.upsellLimit : 0);
  }, [items, products, settings.upsellEnabled, settings.upsellLimit]);

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
    <header className="simple-topbar container cart-navigation-layer"><a className="cart-nav-button" href={storefrontPath(storeBasePath)}><ArrowLeft size={19}/>Voltar ao cardápio</a></header>
    <div className="cart-empty"><ShoppingBag size={48}/><h1>Seu carrinho está vazio</h1><p>Escolha seus produtos no cardápio e volte aqui para finalizar.</p><div className="cart-empty-actions"><a className="primary-button" href={storefrontPath(storeBasePath)}>Ver cardápio</a>{settings.repeatOrderEnabled && recentOrder && <button type="button" className="secondary-button" onClick={restoreRecentOrder}><RotateCcw size={17}/>Pedir novamente</button>}</div>{settings.repeatOrderEnabled && recentOrder && <small className="recent-order-note">Último pedido salvo neste dispositivo em {new Date(recentOrder.createdAt).toLocaleDateString('pt-BR')}.</small>}</div>
  </div>;

  const minimumMissing = Math.max(0, settings.minimumOrder - subtotal);
  return <div className="simple-page">
    <header className="simple-topbar container cart-navigation-layer"><a className="cart-nav-button" href={storefrontPath(storeBasePath)}><ArrowLeft size={19}/>Continuar comprando</a><span>Seu carrinho</span></header>
    <div className="container cart-layout">
      <section>
        <div className="page-title"><span className="eyebrow">SEU PEDIDO</span><h1>Revise os itens</h1><p>Confira tamanhos, escolhas, adicionais e remoções antes de avançar.</p></div>
        <div className="cart-list">{items.map((item) => <article key={item.id} className="cart-item">
          <ProductMedia src={item.imageUrl} emoji={item.visualEmoji} alt={item.productName} emojiClassName="cart-item__emoji-v060"/>
          <div className="cart-item__main"><strong>{item.productName}</strong>
            {item.options.length > 0 && <div className="cart-option-summary">{Array.from(new Set(item.options.map((option) => option.groupId))).map((groupId) => {
              const groupOptions = item.options.filter((option) => option.groupId === groupId);
              return <span key={groupId}><b>{groupOptions[0].groupName}:</b> {groupOptions.map((option) => `${option.itemName}${option.quantity > 1 ? ` ×${option.quantity}` : ''}`).join(', ')}</span>;
            })}</div>}
            <b>{currency.format(cartItemUnitTotal(item))} / un.</b>
          </div>
          <QuantityControl value={item.quantity} onChange={(value) => updateQuantity(item.id, value)}/>
          <strong className="cart-item__total">{currency.format(cartItemUnitTotal(item) * item.quantity)}</strong>
          <button type="button" className="row-delete" onClick={() => removeItem(item.id)} aria-label={`Remover ${item.productName}`}><Trash2 size={18}/></button>
        </article>)}</div>

        {suggestions.length > 0 && <section className="cart-upsell-v061"><div className="cart-upsell-v061__heading"><span className="eyebrow">COMPLETE O PEDIDO</span><h2>Que tal levar também?</h2><p>Sugestões disponíveis no cardápio para aumentar seu pedido sem complicar a escolha.</p></div><div className="cart-upsell-v061__grid">{suggestions.map((product) => {
          const canQuickAdd = product.optionGroups.every((group) => !group.active || group.minChoices === 0);
          const price = product.promotionalPrice ?? product.price;
          return <article key={product.id}><ProductMedia src={product.imageUrl} emoji={product.visualEmoji} alt={product.name}/><div><strong>{product.name}</strong><span>{currency.format(price)}</span></div>{canQuickAdd ? <button type="button" onClick={() => addItem(product, 1, [])}><Plus size={16}/>Adicionar</button> : <a href={storefrontPath(storeBasePath, `/produto/${product.slug}`)}>Personalizar <ArrowRight size={15}/></a>}</article>;
        })}</div></section>}
      </section>
      <aside className="order-summary cart-navigation-layer">
        <span className="eyebrow">RESUMO</span>
        <div className="summary-total"><span>Subtotal</span><strong>{currency.format(subtotal)}</strong></div>
        {settings.minimumOrder > 0 && <div className={`minimum-order ${minimumMissing > 0 ? 'warning' : ''}`}><span>Pedido mínimo: {currency.format(settings.minimumOrder)}</span>{minimumMissing > 0 && <strong>Faltam {currency.format(minimumMissing)}</strong>}</div>}
        <p>Taxa de entrega será calculada conforme o bairro selecionado.</p>
        {minimumMissing > 0 ? <button type="button" className="primary-button cart-continue-button" disabled><AlertCircle size={18}/>Complete o pedido</button> : <a className="primary-button cart-continue-button" href={storefrontPath(storeBasePath, '/finalizar')}>Continuar <ArrowRight size={18}/></a>}
      </aside>
    </div>
  </div>;
}
