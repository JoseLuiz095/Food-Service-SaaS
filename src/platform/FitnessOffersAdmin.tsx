import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { restFetch } from '../lib/supabaseRest';
import { businessApi, type BusinessRecord } from './api';
import { fitnessApi, type FitnessWorkout } from '../services/fitnessApi';
import { fitnessOffersApi, type FitnessOffer, type FitnessOfferInput, type FitnessOfferKind, type FitnessOfferOrder } from '../services/fitnessOffersApi';

const kindLabels: Record<FitnessOfferKind, string> = {
  workout: 'Ficha digital', assessment: 'Avaliação física', combo: 'Avaliação + ficha',
  nutrition_consult: 'Consulta nutricional', nutrition_plan: 'Plano alimentar personalizado',
};
type Staff = { user_id: string; name: string | null; kind: string | null; council: string | null; professional_active: boolean };
const blank: FitnessOfferInput = {
  kind: 'workout', name: '', description: '', price_cents: 0, workout_id: null,
  service_id: null, professional_user_id: '', published: false,
};
const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const cents = (value: string) => Math.round(Number(value.replace(',', '.')) * 100);

export function FitnessOffersAdmin({ store }: { store: string }) {
  const [offers, setOffers] = useState<FitnessOffer[]>([]);
  const [orders, setOrders] = useState<FitnessOfferOrder[]>([]);
  const [workouts, setWorkouts] = useState<FitnessWorkout[]>([]);
  const [services, setServices] = useState<BusinessRecord[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [draft, setDraft] = useState<FitnessOfferInput>(blank);
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const reload = useCallback(async () => {
    const [nextOffers, nextOrders, nextWorkouts, nextServices, nextStaff] = await Promise.all([
      fitnessOffersApi.list(store, true), fitnessOffersApi.adminOrders(store), fitnessApi.listWorkouts(store),
      businessApi.operate(store, 'services.list'),
      restFetch<Staff[]>('rpc/food_service_professional_staff', { method: 'POST', body: { p_store: store } }),
    ]);
    setOffers(nextOffers); setOrders(nextOrders); setWorkouts(nextWorkouts);
    setServices(nextServices.items || []); setStaff(nextStaff.filter(item => item.professional_active));
  }, [store]);
  useEffect(() => {
    let active = true;
    setOffers([]); setOrders([]); setDraft(blank); setError('');
    void reload().catch(cause => { if (active) setError((cause as Error).message); });
    return () => { active = false; };
  }, [reload]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await fitnessOffersApi.save(store, { ...draft, price_cents: cents(price) });
      await reload();
      setNotice(draft.published ? 'Oferta publicada após a validação profissional.' : 'Oferta salva em rascunho.');
      setDraft(blank); setPrice('');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  const confirm = async (order: FitnessOfferOrder, action: 'confirm' | 'refund') => {
    if (busy || !window.confirm(action === 'confirm'
      ? 'Você conferiu o crédito no extrato da loja? Confirmar libera o direito desta compra.'
      : 'Confirmar reembolso e revogar o acesso desta compra?')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await fitnessOffersApi.confirm(store, order.id, action);
      await reload();
      setNotice(action === 'confirm' ? 'Pagamento confirmado e direito do aluno liberado.' : 'Compra reembolsada e acesso revisto.');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  const needsWorkout = draft.kind === 'workout' || draft.kind === 'combo';
  const needsService = draft.kind !== 'workout';
  const professionalKind = draft.kind.startsWith('nutrition') ? 'nutrition' : 'training';
  const availableStaff = staff.filter(item => item.kind === professionalKind && item.council === (professionalKind === 'nutrition' ? 'CRN' : 'CREF'));
  const serviceKind = professionalKind;
  const activeServices = services.filter(item => item.active && item.kind === serviceKind && item.professional_user_id === draft.professional_user_id);

  return <section className="business-card fitness-workouts" aria-label="Ofertas e pedidos Fitness">
    <h2>Produtos, serviços e fichas</h2>
    <p>Cadastre a oferta que o aluno compra na loja. A ficha deve ser aprovada pelo profissional antes da publicação. O pedido só concede acesso após conferência do Pix no extrato e confirmação com MFA.</p>
    {error && <p role="alert" className="business-message business-message--error">{error}</p>}
    {notice && <p role="status" className="business-message">{notice}</p>}
    <form className="business-form-grid" onSubmit={save}>
      <label>Tipo de oferta<select value={draft.kind} onChange={e => setDraft({ ...blank, kind: e.target.value as FitnessOfferKind })}>{Object.entries(kindLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Nome<input required minLength={3} maxLength={120} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label>
      <label>Preço em R$<input required inputMode="decimal" type="number" step="0.01" min="0.01" value={price} onChange={e => setPrice(e.target.value)}/></label>
      <label>Responsável<select required value={draft.professional_user_id} onChange={e => setDraft({ ...draft, professional_user_id: e.target.value, service_id: null })}><option value="">Selecione</option>{availableStaff.map(item => <option key={item.user_id} value={item.user_id}>{item.name} · {item.council}</option>)}</select></label>
      {needsWorkout && <label>Modelo aprovado<select required value={draft.workout_id || ''} onChange={e => setDraft({ ...draft, workout_id: e.target.value || null })}><option value="">Selecione</option>{workouts.filter(item => item.status === 'approved' && item.professional?.user_id === draft.professional_user_id).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
      {needsService && <label>Serviço da agenda<select required value={draft.service_id || ''} onChange={e => setDraft({ ...draft, service_id: e.target.value || null })}><option value="">Selecione</option>{activeServices.map(item => <option key={item.id} value={item.id}>{String(item.name)}</option>)}</select></label>}
      <label className="fitness-wide">Descrição<textarea required minLength={10} maxLength={2000} rows={3} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}/></label>
      <label className="fitness-check"><input type="checkbox" checked={draft.published} onChange={e => setDraft({ ...draft, published: e.target.checked })}/><span>Publicar após revisar preço, responsável e entrega</span></label>
      <div className="business-actions"><button className="primary-button" disabled={busy}>{busy ? 'Salvando…' : draft.id ? 'Atualizar oferta' : 'Cadastrar oferta'}</button>{draft.id && <button type="button" className="secondary-button" onClick={() => { setDraft(blank); setPrice(''); }}>Cancelar edição</button>}</div>
    </form>
    <h3>Ofertas da loja</h3>
    {offers.length === 0 ? <p className="business-muted">Nenhuma oferta cadastrada.</p> : <div className="fitness-workout-list">{offers.map(item => <article className="fitness-workout-card" key={item.id}>
      <div className="business-card-heading"><h4>{item.name}</h4><span className="business-badge">{item.published ? 'Publicada' : 'Rascunho'}</span></div>
      <p>{kindLabels[item.kind]} · {money(item.price_cents)} · {item.professional_name}</p>
      <button type="button" className="secondary-button" onClick={() => { setDraft({ ...item }); setPrice(String(item.price_cents / 100)); }}>Editar</button>
    </article>)}</div>}
    <h3>Pedidos Pix manual</h3>
    {orders.length === 0 ? <p className="business-muted">Nenhum pedido recebido.</p> : <div className="fitness-workout-list">{orders.map(order => <article className="fitness-workout-card" key={order.id}>
      <div className="business-card-heading"><h4>{order.offer_name}</h4><span className="business-badge">{order.state}</span></div>
      <p>{order.student_name} · {money(order.price_cents)} · Ref. {order.id}</p>
      {order.state === 'pending' && <button className="primary-button" disabled={busy} onClick={() => void confirm(order, 'confirm')}>Conferi o Pix: liberar acesso</button>}
      {order.state === 'paid' && <button className="secondary-button" disabled={busy} onClick={() => void confirm(order, 'refund')}>Registrar reembolso e revogar</button>}
    </article>)}</div>}
  </section>;
}
