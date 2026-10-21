import { ArrowRight, BarChart3, CakeSlice, CalendarDays, Check, ChevronRight, CircleCheck, Cuboid, Handshake, LayoutDashboard, MessageCircle, Package, Palette, PartyPopper, Settings2, ShoppingBag, Store, Utensils, Wrench } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { ProtectedContactButton } from '../ProtectedContactButton';

type CommercialSegment = {
  id: string;
  name: string;
  title: string;
  description: string;
  storefront: string;
  product: string;
  detail: string;
  category: string;
  accent: string;
  icon: typeof Store;
};

const segments: CommercialSegment[] = [
  { id: 'food', name: 'Alimentação', title: 'Do cardápio ao próximo pedido.', description: 'Fotos que abrem o apetite, adicionais, entrega e retirada. Sua rotina de vendas no centro da experiência.', storefront: 'Sabor da Vila', product: 'Hambúrguer da casa', detail: 'Feito na hora, do seu jeito.', category: 'Mais pedidos', accent: '#c84e35', icon: Utensils },
  { id: 'confectionery', name: 'Confeitaria', title: 'Seu cuidado aparece em cada detalhe.', description: 'Valorize doces, presentes e encomendas com uma vitrine delicada e informações claras sobre seus produtos.', storefront: 'Ateliê de Doces', product: 'Caixa de doces especiais', detail: 'Um presente feito com carinho.', category: 'Para presentear', accent: '#9b5368', icon: CakeSlice },
  { id: 'retail', name: 'Produtos e lojas', title: 'Uma vitrine com a sua identidade.', description: 'Organize coleções, destaque produtos e facilite a escolha. Seu catálogo, sua marca e seu canal de venda.', storefront: 'Casa & Forma', product: 'Kit de organização', detail: 'Design que faz parte da rotina.', category: 'Novidades', accent: '#447a67', icon: ShoppingBag },
  { id: 'printing3d', name: 'Impressão 3D', title: 'Transforme ideias em novos pedidos.', description: 'Apresente peças prontas e, com o módulo opcional de personalizados, receba especificações e arquivos para orçamento.', storefront: 'Forma 3D', product: 'Chaveiro personalizado', detail: 'Seu projeto ganha forma.', category: 'Peças e brindes', accent: '#5069a7', icon: Cuboid },
  { id: 'rentals', name: 'Aluguel', title: 'O que torna o evento especial.', description: 'Destaque seu catálogo de locação. Ative o módulo opcional para organizar reservas, checklists e sinal manual.', storefront: 'Dia de Festa', product: 'Pula-pula para festas', detail: 'Consulte disponibilidade e condições.', category: 'Para o seu evento', accent: '#96702e', icon: PartyPopper },
  { id: 'services', name: 'Serviços', title: 'Mostre seu trabalho. Abra novas conversas.', description: 'Uma apresentação clara dos seus serviços, com identidade própria e atendimento que continua pelo WhatsApp.', storefront: 'Oficina Criativa', product: 'Projeto sob medida', detail: 'Conte o que você precisa.', category: 'Nossos serviços', accent: '#487a82', icon: Wrench },
];

function SegmentPreview({ segment }: { segment: CommercialSegment }) {
  const Icon = segment.icon;
  return <div className="commercial-preview" style={{ '--preview-accent': segment.accent } as CSSProperties} aria-label={`Exemplo de apresentação para ${segment.name}`}>
    <div className="commercial-preview__browser"><span /><span /><span /><small>Uma vitrine com a sua marca</small></div>
    <div className="commercial-preview__store">
      <header><span className="commercial-preview__store-logo"><Icon size={23} /></span><div><strong>{segment.storefront}</strong><small>Produtos, cuidado e identidade própria</small></div><ShoppingBag size={19} /></header>
      <div className="commercial-preview__cover"><span>{segment.category}</span><strong>{segment.product}</strong><p>{segment.detail}</p><Icon size={92} strokeWidth={1.1} /></div>
      <div className="commercial-preview__product"><span><Icon size={30} strokeWidth={1.5} /></span><div><small>SELECIONADO PARA VOCÊ</small><strong>{segment.product}</strong><p>Informações claras para escolher com confiança.</p></div><ChevronRight size={17} /></div>
      <div className="commercial-preview__product commercial-preview__product--secondary"><span><Package size={27} strokeWidth={1.5} /></span><div><small>CONHEÇA NOSSO CATÁLOGO</small><strong>Mais possibilidades para você</strong><p>Explore produtos e encontre o que procura.</p></div><ChevronRight size={17} /></div>
      <div className="commercial-preview__footer"><CircleCheck size={15} /><span>Exemplo ilustrativo de apresentação</span></div>
    </div>
    <div className="commercial-preview__admin"><span><LayoutDashboard size={19} /></span><div><strong>Por trás de cada venda, controle.</strong><small>Sua marca na vitrine. Sua operação no painel.</small></div><BarChart3 size={23} /></div>
  </div>;
}

export function CommercialHero({ trialDays }: { trialDays: number }) {
  const [selected, setSelected] = useState(segments[0]);
  const signupHref = `/cadastro?plan=DEMO&segment=${selected.id}`;
  return <>
    <section className="commercial-hero"><div className="sales-shell commercial-hero__grid">
      <div className="commercial-hero__copy"><span className="commercial-eyebrow"><span /> SUA MARCA. SEU JEITO DE VENDER.</span><h1>Um espaço para vender.<br /><em>Do seu jeito.</em></h1><p>Produtos, encomendas ou serviços: aproxime seu negócio de quem compra, com uma vitrine própria e uma operação mais organizada.</p>
        <div className="sales-hero-actions"><a className="sales-cta-primary sales-cta-trial" href={signupHref}>Criar conta e testar por {trialDays} dias <ArrowRight size={17} /></a><a className="sales-cta-secondary" href="#demonstracao">Conhecer a plataforma</a></div>
        <div className="sales-proof-row"><span><Check />Sem cartão no teste</span><span><Check />Sem comissão por pedido</span><span><Check />Sua identidade preservada</span></div>
        <div className="commercial-hero__caption"><span><Store size={18} /></span><p>Do pequeno negócio aos novos projetos.<br /><strong>Uma base simples para crescer com você.</strong></p></div>
      </div>
      <SegmentPreview segment={selected} />
    </div></section>
    <section id="ramos" className="commercial-segments"><div className="sales-shell">
      <div className="commercial-section-heading"><div><span className="commercial-eyebrow">FEITO PARA O SEU RAMO</span><h2>Seu negócio tem um jeito.<br />Sua página também.</h2></div><p>Escolha seu ramo para explorar a apresentação. A identidade acompanha o negócio na vitrine e no painel.</p></div>
      <div className="commercial-segments__choices" role="group" aria-label="Explore a apresentação por ramo">{segments.map((segment) => { const Icon = segment.icon; return <button key={segment.id} type="button" aria-pressed={selected.id === segment.id} className={selected.id === segment.id ? 'is-selected' : ''} onClick={() => setSelected(segment)}><Icon size={23} strokeWidth={1.6} /><span>{segment.name}</span><ArrowRight size={15} /></button>; })}</div>
      <div className="commercial-segments__detail" aria-live="polite"><div><strong>{selected.title}</strong><p>{selected.description}</p></div><a href={signupHref}>Começar com {selected.name.toLocaleLowerCase('pt-BR')} <ArrowRight size={17} /></a></div>
    </div></section>
  </>;
}

export function CommercialModules() {
  return <section className="commercial-modules"><div className="sales-shell commercial-modules__layout"><div><span className="commercial-eyebrow">NOVAS POSSIBILIDADES, NO SEU TEMPO</span><h2>Comece com o essencial.<br />Ative o próximo passo.</h2><p>Eventos, combos, personalizados e aluguel são módulos opcionais. Todos começam desativados e só aparecem na operação quando a loja escolhe ativar.</p><div className="commercial-modules__principle"><Settings2 size={20} /><span>Escolher o ramo adapta a apresentação.<br /><strong>Ativar um módulo é uma decisão separada.</strong></span></div></div>
      <div className="commercial-modules__grid"><article><CalendarDays /><h3>Eventos e combos</h3><p>Monte propostas com parceiros aprovados. O cliente tem um pedido; cada loja acompanha sua parte.</p></article><article><Cuboid /><h3>Impressão 3D</h3><p>Peças, brindes e personalizados. Especificações, arquivos e calculadora com preço final editável.</p></article><article><Palette /><h3>Personalizados</h3><p>Organize a solicitação e os detalhes do projeto. A conversa e a aprovação da arte continuam no WhatsApp.</p></article><article><PartyPopper /><h3>Aluguel</h3><p>Prepare orçamentos, reservas, sinal manual e checklists para acompanhar sua operação.</p></article></div>
    </div></section>;
}

export function CommercialFinal({ trialDays }: { trialDays: number }) {
  return <section className="commercial-final"><div className="sales-shell"><Handshake size={35} strokeWidth={1.3} /><span className="commercial-eyebrow">SEU PRÓXIMO PASSO COMEÇA AQUI</span><h2>Um negócio único merece<br />um espaço com a sua cara.</h2><p>Conheça a plataforma, escolha seu ramo e prepare sua loja.</p><div><a className="sales-cta-primary" href="/cadastro?plan=DEMO">Testar por {trialDays} dias <ArrowRight size={17} /></a><ProtectedContactButton className="sales-cta-secondary" intent="commercial"><MessageCircle size={17} />Conversar com a equipe</ProtectedContactButton></div></div></section>;
}
