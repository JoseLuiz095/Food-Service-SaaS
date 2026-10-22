import { ArrowRight, CakeSlice, CalendarDays, Check, Cuboid, Handshake, MessageCircle, Palette, PartyPopper, Settings2, ShoppingBag, Store, Utensils, Wrench } from 'lucide-react';
import { useState } from 'react';
import { ProtectedContactButton } from '../ProtectedContactButton';
import { BusinessJourneyPreview } from './BusinessJourneyPreview';
import type { BusinessSegment } from '../../segments/businessSegments';

type CommercialSegment = {
  id: BusinessSegment;
  name: string;
  title: string;
  description: string;
  icon: typeof Store;
};

const segments: CommercialSegment[] = [
  { id: 'food', name: 'Alimentação', title: 'Do cardápio ao próximo pedido.', description: 'Fotos que abrem o apetite, adicionais, entrega e retirada. Sua rotina de vendas no centro da experiência.', icon: Utensils },
  { id: 'confectionery', name: 'Confeitaria', title: 'Seu cuidado aparece em cada detalhe.', description: 'Valorize doces, presentes e encomendas com uma vitrine delicada e informações claras sobre seus produtos.', icon: CakeSlice },
  { id: 'retail', name: 'Produtos e lojas', title: 'Uma vitrine com a sua identidade.', description: 'Organize coleções, destaque produtos e facilite a escolha. Seu catálogo, sua marca e seu canal de venda.', icon: ShoppingBag },
  { id: 'printing3d', name: 'Impressão 3D', title: 'Transforme ideias em novos pedidos.', description: 'Apresente peças prontas e, com o módulo opcional de personalizados, receba especificações e arquivos para orçamento.', icon: Cuboid },
  { id: 'rentals', name: 'Aluguel', title: 'O que torna o evento especial.', description: 'Destaque seu catálogo de locação. Ative o módulo opcional para organizar reservas, checklists e sinal manual.', icon: PartyPopper },
  { id: 'services', name: 'Serviços', title: 'Mostre seu trabalho. Abra novas conversas.', description: 'Uma apresentação clara dos seus serviços, com identidade própria e atendimento que continua pelo WhatsApp.', icon: Wrench },
];

export function CommercialHero({ trialDays }: { trialDays: number }) {
  const [selected, setSelected] = useState(segments[0]);
  const signupHref = `/cadastro?plan=DEMO&segment=${selected.id}`;
  return <>
    <section className="commercial-hero"><div className="sales-shell commercial-hero__grid">
      <div className="commercial-hero__copy"><h1>Um espaço para vender.<br /><em>Do seu jeito.</em></h1><p>Produtos, encomendas ou serviços: aproxime seu negócio de quem compra, com uma vitrine própria e uma operação mais organizada.</p>
        <div className="sales-hero-actions"><a className="sales-cta-primary sales-cta-trial" href={signupHref}>Criar conta e testar por {trialDays} dias <ArrowRight size={17} /></a><a className="sales-cta-secondary" href="#demonstracao">Conhecer a plataforma</a></div>
        <div className="sales-proof-row"><span><Check />Sem cartão no teste</span><span><Check />Sem comissão por pedido</span><span><Check />Sua identidade preservada</span></div>
        <div className="commercial-hero__caption"><span><Store size={18} /></span><p>Do pequeno negócio aos novos projetos.<br /><strong>Uma base simples para crescer com você.</strong></p></div>
      </div>
      <div id="ramos" className="commercial-experience"><p>Escolha seu ramo. Explore a experiência da sua loja.</p>
      <div className="commercial-segments__choices" role="group" aria-label="Explore a apresentação por ramo">{segments.map((segment) => { const Icon = segment.icon; return <button key={segment.id} type="button" aria-pressed={selected.id === segment.id} className={selected.id === segment.id ? 'is-selected' : ''} onClick={() => setSelected(segment)}><Icon size={23} strokeWidth={1.6} /><span>{segment.name}</span><ArrowRight size={15} /></button>; })}</div>
      <BusinessJourneyPreview segment={selected.id} />
      <div className="commercial-segments__detail" aria-live="polite"><div><strong>{selected.title}</strong><p>{selected.description}</p></div><a href={signupHref}>Começar com {selected.name.toLocaleLowerCase('pt-BR')} <ArrowRight size={17} /></a></div>
      </div>
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
