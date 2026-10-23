import { ArrowRight, ArrowUpRight, CalendarDays, Check, CheckCircle2, Clock3, Dumbbell, Flower2, HeartPulse, LayoutDashboard, Link2, Megaphone, Minus, Monitor, Package, Plus, ShoppingBag, Smartphone, Store, Users, Utensils, X } from 'lucide-react';
import { useState, type CSSProperties, type FormEvent } from 'react';
import type { BusinessSegment } from '../../segments/businessSegments';
import './segment-showcase.css';

type DemoId = 'food' | 'florist' | 'retail' | 'rentals' | 'personal' | 'nutrition' | 'creator';
type DemoItem = { id: string; name: string; category: string; description: string; price: number; stock?: number; duration?: string };
type DemoProfile = { id: DemoId; label: string; company: string; tagline: string; headline: string; description: string; color: string; pale: string; icon: typeof Store; items: DemoItem[]; mode: 'cart' | 'booking' | 'creator'; features: string[] };

const profiles: DemoProfile[] = [
  { id: 'food', label: 'Alimentação', company: 'Sabor da Vila', tagline: 'Comida de verdade, pertinho de você.', headline: 'Do primeiro desejo ao próximo pedido.', description: 'Um cardápio que organiza sabores, adicionais e pedidos. Experimente montar uma compra e acompanhar o que chega ao painel.', color: '#A94726', pale: '#FFF0E5', icon: Utensils, mode: 'cart', features: ['Cardápio e adicionais', 'Carrinho e pedido', 'Entrega ou retirada'], items: [
    { id: 'prato', name: 'Prato da casa', category: 'Da cozinha', description: 'Arroz, legumes e frango grelhado.', price: 32 },
    { id: 'burger', name: 'Burger da Vila', category: 'Lanches', description: 'Pão artesanal, queijo e molho da casa.', price: 26 },
    { id: 'suco', name: 'Limonada fresca', category: 'Bebidas', description: 'Limão, hortelã e um dia mais leve.', price: 9 },
  ] },
  { id: 'florist', label: 'Floricultura', company: 'Jardim Encantado', tagline: 'Flores para dizer o que importa.', headline: 'Seu cuidado, em cada entrega.', description: 'Buquês, mensagens de presente e encomendas com contexto. Monte um presente fictício com cartão e data desejada.', color: '#85455F', pale: '#F8EAF0', icon: Flower2, mode: 'cart', features: ['Buquês e arranjos', 'Mensagem para presente', 'Data de entrega'], items: [
    { id: 'buque', name: 'Buquê Afeto', category: 'Buquês', description: 'Flores da estação em tons delicados.', price: 89 },
    { id: 'arranjo', name: 'Jardim de mesa', category: 'Arranjos', description: 'Um pequeno jardim para presentear.', price: 119 },
    { id: 'presente', name: 'Flores & chocolate', category: 'Presentes', description: 'Dois jeitos de demonstrar carinho.', price: 139 },
  ] },
  { id: 'retail', label: 'Comércio geral', company: 'Loja Horizonte', tagline: 'Pequenas escolhas, novas possibilidades.', headline: 'Sua marca abre as portas online.', description: 'Organize categorias, mostre o estoque disponível e acompanhe pedidos. Da coleção à compra, sem perder a identidade da loja.', color: '#285887', pale: '#EAF1F8', icon: Package, mode: 'cart', features: ['Catálogo e categorias', 'Estoque por produto', 'Compras organizadas'], items: [
    { id: 'caderno', name: 'Caderno Horizonte', category: 'Papelaria', description: 'Capa de linho e páginas para suas ideias.', price: 39, stock: 4 },
    { id: 'caneca', name: 'Caneca do dia', category: 'Casa', description: 'Cerâmica artesanal para o seu ritual.', price: 49, stock: 3 },
    { id: 'bolsa', name: 'Bolsa Essencial', category: 'Acessórios', description: 'Leve, prática e feita para acompanhar.', price: 79, stock: 2 },
  ] },
  { id: 'rentals', label: 'Serviços e locações', company: 'Festa Nuvem', tagline: 'Uma boa festa começa com tranquilidade.', headline: 'Disponibilidade clara. Combinados organizados.', description: 'Apresente serviços e equipamentos, selecione uma data e organize reservas. Uma demonstração que respeita horários já ocupados.', color: '#80601C', pale: '#F8F0DA', icon: CalendarDays, mode: 'booking', features: ['Serviços e equipamentos', 'Data e disponibilidade', 'Reservas sem conflito'], items: [
    { id: 'pula', name: 'Pula-pula para festa', category: 'Brinquedos', description: 'Montagem e retirada combinadas com a equipe.', price: 280, duration: '4 horas' },
    { id: 'decoracao', name: 'Decoração de mesa', category: 'Serviços', description: 'Detalhes para deixar o encontro especial.', price: 180, duration: '2 horas' },
  ] },
  { id: 'personal', label: 'Personal trainer', company: 'Movimento Ativo', tagline: 'Consistência para uma rotina possível.', headline: 'Mais tempo para acompanhar pessoas.', description: 'Apresente suas consultorias, organize clientes e marque sessões. No painel de exemplo, adicione um aluno e salve uma rotina demonstrativa.', color: '#2E6855', pale: '#E8F3EB', icon: Dumbbell, mode: 'booking', features: ['Consultorias e sessões', 'Alunos e acompanhamento', 'Agenda administrativa'], items: [
    { id: 'consultoria', name: 'Consultoria individual', category: 'Acompanhamento', description: 'Conversa inicial e organização da rotina.', price: 120, duration: '60 minutos' },
    { id: 'avaliacao', name: 'Sessão de avaliação', category: 'Sessões', description: 'Um encontro para entender seus objetivos.', price: 90, duration: '45 minutos' },
  ] },
  { id: 'nutrition', label: 'Nutricionista', company: 'Equilíbrio Nutri', tagline: 'Cuidado próximo, com organização.', headline: 'Do primeiro contato ao próximo retorno.', description: 'Divulgue consultas e pacotes e organize agendamentos. A prévia é administrativa: não usa prontuários ou dados clínicos.', color: '#536D36', pale: '#EEF3E5', icon: HeartPulse, mode: 'booking', features: ['Consultas e pacotes', 'Clientes e retornos', 'Agenda administrativa'], items: [
    { id: 'consulta', name: 'Consulta inicial', category: 'Consultas', description: 'Atendimento individual com horário reservado.', price: 180, duration: '60 minutos' },
    { id: 'retorno', name: 'Consulta de retorno', category: 'Acompanhamento', description: 'Um novo encontro para acompanhar a rotina.', price: 120, duration: '45 minutos' },
  ] },
  { id: 'creator', label: 'Influenciador digital', company: 'Studio Prisma', tagline: 'Conteúdo com propósito. Negócio com direção.', headline: 'Sua audiência encontra o seu negócio.', description: 'Produtos digitais, links e campanhas em uma página própria. Teste um link e crie uma campanha no painel, sem publicar em redes sociais.', color: '#66509A', pale: '#F0EAF8', icon: Megaphone, mode: 'creator', features: ['Produtos digitais e serviços', 'Links comerciais', 'Campanhas e conteúdo'], items: [
    { id: 'guia', name: 'Guia de conteúdo criativo', category: 'Digitais', description: 'Um material de exemplo para organizar ideias.', price: 49 },
    { id: 'mentoria', name: 'Mentoria de conteúdo', category: 'Serviços', description: 'Uma conversa sobre seus próximos projetos.', price: 150, duration: '60 minutos' },
  ] },
];

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const days = ['Hoje', 'Amanhã', 'Próxima semana'];
const slots = ['09:00', '11:00', '14:00', '16:00'];
type LocalOrder = { id: number; title: string; value: number; status: string; detail: string };

export function SegmentShowcase({ trialDays }: { trialDays: number }) {
  const [segment, setSegment] = useState<DemoId>('food');
  const profile = profiles.find(item => item.id === segment)!;
  return <section id="demonstracao" className="segment-lab" aria-labelledby="segment-lab-title">
    <div className="sales-shell">
      <div className="segment-lab__heading"><div><span className="commercial-eyebrow">SEU NEGÓCIO. SUA EXPERIÊNCIA.</span><h2 id="segment-lab-title">Veja como o VendeWeb funciona<br />para o <em>seu negócio.</em></h2></div><p>Escolha um segmento. Explore a vitrine, faça uma simulação e veja o reflexo no painel.</p></div>
      <div id="ramos" className="segment-lab__segments" role="group" aria-label="Escolha o segmento da demonstração">{profiles.map(item => { const Icon = item.icon; return <button type="button" key={item.id} aria-pressed={segment === item.id} onClick={() => setSegment(item.id)}><Icon size={20} aria-hidden="true" /><span>{item.label}</span></button>; })}</div>
      <DemoExperience key={profile.id} profile={profile} trialDays={trialDays} />
      <p className="segment-lab__disclaimer"><CheckCircle2 size={16} aria-hidden="true" />Demonstração com dados fictícios. Nenhuma conta, reserva, compra, cobrança ou publicação real é criada. Recursos da sua loja dependem do plano e dos módulos liberados.</p>
    </div>
  </section>;
}

function DemoExperience({ profile, trialDays }: { profile: DemoProfile; trialDays: number }) {
  const [view, setView] = useState<'storefront' | 'admin'>('storefront');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [category, setCategory] = useState('Todos');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [extra, setExtra] = useState(false);
  const [message, setMessage] = useState('');
  const [deliveryDay, setDeliveryDay] = useState('Amanhã');
  const [feedback, setFeedback] = useState('');
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [selectedService, setSelectedService] = useState(profile.items[0].id);
  const [day, setDay] = useState('Amanhã');
  const [slot, setSlot] = useState('09:00');
  const [contacts, setContacts] = useState(['Ana Exemplo', 'Lucas Exemplo']);
  const [contactName, setContactName] = useState('');
  const [routine, setRoutine] = useState(false);
  const [campaignTitle, setCampaignTitle] = useState('');
  const [campaigns, setCampaigns] = useState([{ id: 1, title: 'Apresentação do novo guia', done: false }]);
  const [clicks, setClicks] = useState(0);
  const Icon = profile.icon;
  const count = Object.values(cart).reduce((sum, value) => sum + value, 0);
  const total = profile.items.reduce((sum, item) => sum + item.price * (cart[item.id] || 0), 0) + (extra && count ? 4 : 0);
  const service = profile.items.find(item => item.id === selectedService)!;
  const bookingTaken = orders.some(order => order.detail === `${day} · ${slot}` && order.status !== 'Cancelado');
  const categories = ['Todos', ...new Set(profile.items.map(item => item.category))];
  const isCommerce = profile.mode === 'cart' || profile.mode === 'creator';
  const primaryAction = profile.mode === 'booking' ? 'Reservar horário de exemplo' : 'Simular pedido';

  function addItem(item: DemoItem) {
    const next = (cart[item.id] || 0) + 1;
    if (next > (item.stock ?? 20)) { setFeedback('Limite de estoque deste exemplo atingido.'); return; }
    setCart(current => ({ ...current, [item.id]: next }));
    setFeedback(`${item.name} adicionado à sacola de exemplo.`);
  }
  function createOrder() {
    if (!count) return;
    const title = profile.items.filter(item => cart[item.id]).map(item => `${cart[item.id]} × ${item.name}`).join(', ');
    const detail = profile.id === 'florist' ? `Entrega: ${deliveryDay}${message ? ` · Cartão: ${message}` : ''}` : extra ? 'Com adicional de exemplo' : 'Pedido de exemplo';
    setOrders(current => [{ id: current.length + 1043, title, value: total, status: 'Recebido', detail }, ...current]);
    setCart({}); setExtra(false); setMessage(''); setView('admin');
    setFeedback('Pedido fictício recebido. Ele já aparece no painel abaixo. Nenhum pagamento foi solicitado.');
  }
  function book(event: FormEvent) {
    event.preventDefault();
    if (bookingTaken) { setFeedback('Este horário já foi reservado no exemplo. Escolha outro.'); return; }
    setOrders(current => [{ id: current.length + 1043, title: service.name, value: service.price, status: 'A confirmar', detail: `${day} · ${slot}` }, ...current]);
    setView('admin'); setFeedback(`Solicitação fictícia registrada para ${day.toLowerCase()}, às ${slot}. A confirmação fica com o profissional.`);
  }
  function addContact(event: FormEvent) {
    event.preventDefault();
    const name = contactName.trim(); if (!name) return;
    setContacts(current => [...current, name]); setContactName(''); setFeedback(`${name} adicionado somente a esta demonstração.`);
  }
  function addCampaign(event: FormEvent) {
    event.preventDefault();
    const title = campaignTitle.trim(); if (!title) return;
    setCampaigns(current => [...current, { id: Date.now(), title, done: false }]); setCampaignTitle(''); setFeedback('Campanha de exemplo criada. Nada foi publicado nas redes sociais.');
  }
  const theme = { '--lab-color': profile.color, '--lab-pale': profile.pale } as CSSProperties;
  return <div className={`segment-workbench segment-workbench--${profile.id}`} style={theme}>
    <aside className="segment-workbench__story"><span className="segment-workbench__icon"><Icon size={28} aria-hidden="true" /></span><span className="commercial-eyebrow">{profile.label}</span><h3>{profile.headline}</h3><p>{profile.description}</p><ul>{profile.features.map(feature => <li key={feature}><Check size={15} aria-hidden="true" />{feature}</li>)}</ul><a href={`/cadastro?plan=DEMO&segment=${profile.id as BusinessSegment}`}>Começar com este segmento <ArrowRight size={17} aria-hidden="true" /></a><small>Teste por {trialDays} dias. Módulos adicionais mediante liberação.</small></aside>
    <div className="segment-workbench__playground">
      <div className="segment-workbench__toolbar"><div className="lab-switch" role="group" aria-label="Visão da demonstração"><button type="button" aria-pressed={view === 'storefront'} onClick={() => setView('storefront')}><Store size={15} />Vitrine</button><button type="button" aria-pressed={view === 'admin'} onClick={() => setView('admin')}><LayoutDashboard size={15} />Painel{orders.length > 0 && <span>{orders.length}</span>}</button></div><div className="lab-device-switch" role="group" aria-label="Formato da prévia"><button type="button" title="Visualizar desktop" aria-label="Visualizar desktop" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}><Monitor size={17} /></button><button type="button" title="Visualizar mobile" aria-label="Visualizar mobile" aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')}><Smartphone size={17} /></button></div></div>
      <div className={`lab-device lab-device--${device}`}>
        <div className="lab-browser"><div><span /><span /><span /></div><small>vendeweb / {profile.company.toLowerCase().replaceAll(' ', '-')}</small><span>EXEMPLO</span></div>
        <div className={`lab-screen lab-screen--${view}`} key={view}>
          {view === 'storefront' ? <>
            <header className="lab-store-header"><span className="lab-brand-symbol"><Icon size={22} aria-hidden="true" /></span><div><strong>{profile.company}</strong><small>{profile.tagline}</small></div>{isCommerce && <span className="lab-bag-count" aria-label={`${count} itens na sacola de exemplo`}><ShoppingBag size={17} />{count}</span>}</header>
            <div className="lab-store-hero"><div><span>{profile.id === 'creator' ? 'CRIAR. CONECTAR. CRESCER.' : profile.mode === 'booking' ? 'UM ENCONTRO, NOVAS POSSIBILIDADES' : 'ESCOLHAS FEITAS COM CUIDADO'}</span><h4>{profile.id === 'food' ? 'Que tal algo gostoso hoje?' : profile.id === 'florist' ? 'Transforme carinho em flores.' : profile.id === 'retail' ? 'Encontre seu novo favorito.' : profile.id === 'creator' ? 'Ideias que ganham movimento.' : 'Reserve tempo para o que importa.'}</h4><p>{profile.mode === 'booking' ? 'Conheça os serviços e escolha um horário de exemplo.' : 'Uma seleção especial para você conhecer.'}</p></div><div className="lab-hero-art" aria-hidden="true"><Icon size={76} strokeWidth={1} /><span /><span /></div></div>
            {profile.id === 'creator' && <div className="lab-creator-links"><button type="button" onClick={() => { setClicks(value => value + 1); setFeedback('Acesso fictício ao portfólio registrado. Nenhum site externo foi aberto.'); }}><Link2 size={16} />Conhecer meu portfólio <ArrowUpRight size={15} /></button><button type="button" onClick={() => { setView('admin'); setFeedback('Explore o calendário de campanhas de exemplo.'); }}><Megaphone size={16} />Ver campanhas de exemplo <ArrowRight size={15} /></button></div>}
            {isCommerce ? <><div className="lab-categories" role="group" aria-label="Categorias da vitrine de exemplo">{categories.map(item => <button type="button" key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="lab-product-grid">{profile.items.filter(item => category === 'Todos' || item.category === category).map((item, index) => <article className="lab-product" key={item.id}><div className={`lab-product-art lab-product-art--${index}`} aria-hidden="true"><Icon size={profile.id === 'florist' ? 54 : 40} strokeWidth={1.3} /><span /></div><div className="lab-product-copy"><small>{item.category}{item.stock !== undefined && ` · ${item.stock} disponíveis`}</small><h5>{item.name}</h5><p>{item.description}</p><div><strong>{money(item.price)}</strong><button type="button" aria-label={`Adicionar ${item.name} ao exemplo`} onClick={() => addItem(item)}><Plus size={16} aria-hidden="true" /></button></div></div></article>)}</div>
              {count > 0 && <div className="lab-cart"><div className="lab-cart__title"><strong><ShoppingBag size={16} />Sua sacola de exemplo</strong><button type="button" aria-label="Esvaziar sacola de exemplo" onClick={() => { setCart({}); setFeedback('Sacola de exemplo esvaziada.'); }}><X size={16} /></button></div>{profile.items.filter(item => cart[item.id]).map(item => <div className="lab-cart__line" key={item.id}><span>{item.name}</span><div><button type="button" aria-label={`Diminuir ${item.name} no exemplo`} onClick={() => setCart(current => ({ ...current, [item.id]: Math.max(0, current[item.id] - 1) }))}><Minus size={12} /></button><b>{cart[item.id]}</b><button type="button" aria-label={`Aumentar ${item.name} no exemplo`} onClick={() => addItem(item)}><Plus size={12} /></button></div></div>)}{profile.id === 'food' && <label className="lab-check"><input type="checkbox" checked={extra} onChange={event => setExtra(event.target.checked)} />Adicionar queijo extra no pedido (+ {money(4)})</label>}{profile.id === 'florist' && <div className="lab-gift-fields"><label>Mensagem do cartão<input maxLength={160} value={message} onChange={event => setMessage(event.target.value)} placeholder="Escreva uma mensagem fictícia" /></label><label>Entrega desejada<select aria-label="Entrega desejada" value={deliveryDay} onChange={event => setDeliveryDay(event.target.value)}>{days.map(item => <option key={item}>{item}</option>)}</select></label></div>}<div className="lab-cart__footer"><span>Total ilustrativo<strong>{money(total)}</strong></span><button type="button" className="lab-primary" onClick={createOrder}>{primaryAction}<ArrowRight size={15} /></button></div></div>}
            </> : <form className="lab-booking" onSubmit={book}><label>Serviço de exemplo<select value={selectedService} onChange={event => setSelectedService(event.target.value)}>{profile.items.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><div className="lab-service-detail"><span><Clock3 size={15} />{service.duration}</span><strong>{money(service.price)}</strong><p>{service.description}</p></div><div className="lab-booking__days" role="group" aria-label="Dia da reserva de exemplo">{days.map(item => <button type="button" key={item} aria-pressed={day === item} onClick={() => setDay(item)}>{item}</button>)}</div><fieldset><legend>Escolha um horário de exemplo</legend><div className="lab-slots">{slots.map(item => { const taken = orders.some(order => order.detail === `${day} · ${item}` && order.status !== 'Cancelado'); return <button type="button" key={item} disabled={taken} aria-pressed={slot === item} onClick={() => setSlot(item)}>{item}{taken && <small>Reservado</small>}</button>; })}</div></fieldset><button className="lab-primary" disabled={bookingTaken}>Reservar horário de exemplo<ArrowRight size={15} /></button><small>Solicitação administrativa. Valores e horários são fictícios.</small></form>}
          </> : <>
            <header className="lab-admin-header"><div><span>PAINEL DO NEGÓCIO</span><h4>{profile.company}</h4></div><span className="lab-admin-avatar">{profile.company.slice(0, 1)}</span></header>
            <div className="lab-admin-metrics"><div><small>{profile.mode === 'booking' ? 'Solicitações' : 'Pedidos'}</small><strong>{orders.length.toString().padStart(2, '0')}</strong><span>nesta demonstração</span></div><div><small>{profile.id === 'creator' ? 'Acessos ao portfólio' : 'Valor solicitado'}</small><strong>{profile.id === 'creator' ? clicks.toString().padStart(2, '0') : money(orders.reduce((sum, order) => sum + order.value, 0))}</strong><span>{profile.id === 'creator' ? 'cliques simulados' : 'sem recebimento real'}</span></div></div>
            <div className="lab-admin-section"><div className="lab-section-title"><h5>{profile.mode === 'booking' ? 'Agenda de solicitações' : 'Pedidos recebidos'}</h5><span>{orders.length} {orders.length === 1 ? 'registro' : 'registros'}</span></div>{orders.length ? orders.map(order => <article className="lab-order" key={order.id}><div><span>#{order.id} · {order.status}</span><strong>{order.title}</strong><small>{order.detail}</small></div><div><b>{money(order.value)}</b><button type="button" disabled={order.status === 'Concluído'} onClick={() => { setOrders(current => current.map(item => item.id === order.id ? { ...item, status: 'Concluído' } : item)); setFeedback('Atendimento de exemplo concluído. Nenhum pagamento foi confirmado.'); }}>{order.status === 'Concluído' ? <><Check size={13} />Concluído</> : 'Concluir atendimento'}</button></div></article>) : <div className="lab-empty"><CalendarDays size={27} /><strong>A próxima ação começa na vitrine.</strong><p>{profile.mode === 'booking' ? 'Escolha um serviço e horário para criar uma solicitação de exemplo.' : 'Adicione um item e simule um pedido para vê-lo aqui.'}</p><button type="button" onClick={() => setView('storefront')}>Explorar a vitrine<ArrowRight size={14} /></button></div>}</div>
            {(profile.id === 'personal' || profile.id === 'nutrition') && <section className="lab-admin-section"><div className="lab-section-title"><h5><Users size={16} />{profile.id === 'personal' ? 'Alunos' : 'Clientes'}</h5><span>{contacts.length} cadastrados</span></div><div className="lab-contact-list">{contacts.map((name, index) => <div key={`${name}-${index}`}><span>{name.slice(0, 1)}</span><strong>{name}</strong><small>{profile.id === 'personal' && routine && index === 0 ? 'Rotina de exemplo salva' : 'Cadastro administrativo'}</small></div>)}</div><form className="lab-inline-form" onSubmit={addContact}><label>Nome fictício<input required maxLength={60} value={contactName} onChange={event => setContactName(event.target.value)} placeholder={profile.id === 'personal' ? 'Novo aluno de exemplo' : 'Novo cliente de exemplo'} /></label><button className="lab-primary"><Plus size={15} />Adicionar</button></form>{profile.id === 'personal' && <div className="lab-training"><div><Dumbbell size={18} /><span><strong>Rotina de exemplo · Ana</strong><small>Caminhada e mobilidade · conteúdo ilustrativo</small></span></div><button type="button" onClick={() => { setRoutine(current => !current); setFeedback(routine ? 'Rotina de exemplo removida.' : 'Rotina demonstrativa vinculada a Ana Exemplo.'); }}>{routine ? 'Remover rotina' : 'Salvar rotina de exemplo'}</button></div>}{profile.id === 'nutrition' && <p className="lab-privacy">Somente cadastro e agenda administrativos. Nenhum prontuário ou dado clínico é usado nesta prévia.</p>}</section>}
            {profile.id === 'creator' && <section className="lab-admin-section"><div className="lab-section-title"><h5><Megaphone size={16} />Campanhas e conteúdo</h5><span>{campaigns.filter(item => !item.done).length} pendentes</span></div><div className="lab-campaign-list">{campaigns.map(item => <div key={item.id}><span className={item.done ? 'is-done' : ''}>{item.done ? <Check size={15} /> : <Clock3 size={15} />}</span><strong>{item.title}<small>{item.done ? 'Tarefa concluída' : 'Planejamento de exemplo'}</small></strong><button type="button" onClick={() => { setCampaigns(current => current.map(campaign => campaign.id === item.id ? { ...campaign, done: !campaign.done } : campaign)); setFeedback('Status da tarefa alterado apenas neste exemplo.'); }}>{item.done ? 'Reabrir' : 'Concluir'}</button></div>)}</div><form className="lab-inline-form" onSubmit={addCampaign}><label>Nome da campanha<input required maxLength={80} value={campaignTitle} onChange={event => setCampaignTitle(event.target.value)} placeholder="Campanha fictícia" /></label><button className="lab-primary"><Plus size={15} />Criar</button></form><p className="lab-privacy">Planejamento administrativo. Publicação automática em redes sociais não é executada nesta demonstração.</p></section>}
          </>}
        </div>
      </div>
      <div className="lab-feedback" role="status" aria-live="polite">{feedback ? <><CheckCircle2 size={16} />{feedback}</> : <><ArrowUpRight size={16} />{isCommerce ? 'Adicione um item para experimentar o fluxo.' : 'Selecione um serviço e reserve um horário de exemplo.'}</>}</div>
    </div>
  </div>;
}
