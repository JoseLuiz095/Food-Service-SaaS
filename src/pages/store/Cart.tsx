import { AlertCircle, ArrowLeft, ArrowRight, ShoppingBag, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { ProductMedia } from '../../components/ProductMedia';
import { LoadingState } from '../../components/ui/AsyncState';
import { QuantityControl } from '../../components/QuantityControl';
import { cartItemUnitTotal, useCart } from '../../contexts/CartContext';
import { useStore } from '../../contexts/StoreContext';
import { currency } from '../../utils/format';
import { storefrontPath } from '../../utils/storefrontRoute';

export default function Cart() {
  const { items, subtotal, updateQuantity, removeItem, validateAgainstProducts } = useCart();
  const { products, settings, loading, storeBasePath } = useStore();

  useEffect(() => { if (!loading) validateAgainstProducts(products); }, [products, loading, validateAgainstProducts]);

  if (loading) return <div className="page-center"><LoadingState label="Carregando carrinho..." /></div>;

  if (!items.length) return <div className="simple-page">
    <header className="simple-topbar container cart-navigation-layer"><a className="cart-nav-button" href={storefrontPath(storeBasePath)}><ArrowLeft size={19}/>Voltar ao cardápio</a></header>
    <div className="cart-empty"><ShoppingBag size={48}/><h1>Seu carrinho está vazio</h1><p>Escolha seus produtos no cardápio e volte aqui para finalizar.</p><a className="primary-button" href={storefrontPath(storeBasePath)}>Ver cardápio</a></div>
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
