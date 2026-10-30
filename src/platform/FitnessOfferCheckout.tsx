import { useEffect, useRef, useState } from 'react';
import { restFetch } from '../lib/supabaseRest';
import { fitnessOffersApi, type FitnessOffer, type FitnessOfferOrder } from '../services/fitnessOffersApi';

type Pix = { pix_key?: string | null; pix_copy_paste?: string | null; holder_name?: string | null };
const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

export function FitnessOfferCheckout({ store, token, selected }: { store: string; token: string; selected?: string | null }) {
  const [offers, setOffers] = useState<FitnessOffer[]>([]);
  const [orders, setOrders] = useState<FitnessOfferOrder[]>([]);
  const [pix, setPix] = useState<Pix>({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const request = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    setOffers([]); setOrders([]); setPix({}); setError('');
    void Promise.all([
      fitnessOffersApi.list(store), fitnessOffersApi.mine(store, token),
      restFetch<Pix>('rpc/food_fitness_pix_v1', { method: 'POST', body: { p_store: store } }),
    ]).then(([nextOffers, nextOrders, nextPix]) => {
      if (active) { setOffers(nextOffers); setOrders(nextOrders); setPix(nextPix || {}); }
    }).catch(cause => { if (active) setError((cause as Error).message); });
    return () => { active = false; };
  }, [store, token]);
  const buy = async (offer: FitnessOffer) => {
    if (!consent || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const purpose = offer.kind.startsWith('nutrition') ? 'nutrition' : 'training';
      await fitnessOffersApi.authorize(store, offer.professional_user_id, purpose, token);
      const idempotencyKey = request.current || crypto.randomUUID();
      request.current = idempotencyKey;
      const order = await fitnessOffersApi.buy(store, offer.id, idempotencyKey, token);
      request.current = null;
      setOrders(await fitnessOffersApi.mine(store, token));
      setNotice(`Pedido ${order.id} criado por ${money(order.price_cents)}. Pague ao titular indicado e informe a referência ao profissional. O acesso será liberado somente após a conferência do crédito.`);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="business-card fitness-workouts" aria-label="Comprar fichas e serviços">
    <h2>Fichas e serviços da loja</h2>
    {selected && !offers.some(offer => offer.id === selected) && <p role="status">Oferta indisponível. Confira as opções da loja.</p>}
    {error && <p role="alert" className="business-message business-message--error">{error}</p>}
    {notice && <p role="status" className="business-message">{notice}</p>}
    {offers.length === 0 ? <p className="business-muted">Ainda não há ofertas publicadas nesta loja.</p>
      : <div className="fitness-workout-list">{offers.filter(offer => !selected || offer.id === selected).map(offer => <article className="fitness-workout-card" key={offer.id}>
        <div className="business-card-heading"><h3>{offer.name}</h3><strong>{money(offer.price_cents)}</strong></div>
        <p>{offer.description}</p><small>Responsável: {offer.professional_name} · {offer.professional_council}</small>
        <label className="fitness-check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>Autorizo {offer.professional_name} a acompanhar esta compra e a ficha ou atendimento nesta loja. Posso revogar essa autorização nas preferências do aluno.</span></label>
        <button className="primary-button" disabled={busy || !consent || (!pix.pix_key && !pix.pix_copy_paste)} onClick={() => void buy(offer)}>{busy ? 'Aguarde…' : 'Gerar pedido Pix'}</button>
      </article>)}</div>}
    {(pix.pix_key || pix.pix_copy_paste) ? <div className="fitness-workout-card">
      <h3>Pix da loja</h3><p>Titular: <strong>{pix.holder_name || 'Confira no aplicativo do banco'}</strong></p>
      {pix.pix_copy_paste ? <p>Copia e cola: <code>{pix.pix_copy_paste}</code></p> : <p>Chave: <code>{pix.pix_key}</code></p>}
      <p>Confira o recebedor e o valor do pedido no aplicativo do banco. Informe a referência do pedido à loja; comprovante e retorno da tela não liberam acesso.</p>
    </div> : <p className="business-muted">A loja ainda precisa configurar o Pix para receber pedidos.</p>}
    <h3>Minhas compras</h3>
    {orders.length === 0 ? <p className="business-muted">Nenhuma compra registrada.</p> : <ul className="fitness-records">{orders.map(order => <li key={order.id}>
      <strong>{order.offer_name} · {money(order.price_cents)}</strong><span>{order.state === 'paid' ? 'Acesso liberado' : order.state === 'pending' ? 'Aguardando confirmação do Pix' : order.state === 'refunded' ? 'Reembolsado' : 'Cancelado'}</span>
      <small>Referência: {order.id}</small>
    </li>)}</ul>}
  </section>;
}
