import { ArrowRight, Check, CircleCheck, ClipboardList, Package, ShoppingBag, Store } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { getBusinessSegment, type BusinessSegment } from '../../segments/businessSegments';
import './experience.css';

const examples: Record<BusinessSegment, { name: string; product: string; detail: string; price: string }> = {
  food: { name: 'Sabor da Vila', product: 'Especial da casa', detail: 'Preparado com cuidado, do seu jeito.', price: 'R$ 32,00' },
  confectionery: { name: 'Ateliê de Doces', product: 'Caixa de doces especiais', detail: 'Um presente para celebrar os detalhes.', price: 'R$ 48,00' },
  retail: { name: 'Casa & Forma', product: 'Kit de organização', detail: 'Uma escolha que combina com a sua rotina.', price: 'R$ 64,00' },
  printing3d: { name: 'Forma 3D', product: 'Kit de chaveiros', detail: 'Peças prontas para dar forma às suas ideias.', price: 'R$ 36,00' },
  rentals: { name: 'Dia de Festa', product: 'Pula-pula para festas', detail: 'Consulte datas, condições e disponibilidade.', price: 'Sob consulta' },
  florist: { name: 'Jardim Encantado', product: 'Buquê Afeto', detail: 'Flores, cartão e uma data especial.', price: 'R$ 89,00' },
  personal: { name: 'Movimento Ativo', product: 'Consultoria individual', detail: 'Serviços, clientes e sessões organizados.', price: 'R$ 120,00' },
  fitness: { name: 'Academia de exemplo', product: 'Acompanhamento de treino', detail: 'Exemplo visual, sem oferta ou reserva real.', price: 'Sob consulta' },
  nutrition: { name: 'Equilíbrio Nutri', product: 'Consulta inicial', detail: 'Serviços e agenda administrativa.', price: 'R$ 180,00' },
  creator: { name: 'Studio Prisma', product: 'Guia de conteúdo', detail: 'Produtos digitais, links e campanhas.', price: 'R$ 49,00' },
  services: { name: 'Oficina Criativa', product: 'Projeto sob medida', detail: 'Conte à loja o que você precisa.', price: 'Sob consulta' },
};
const stages = [
  { id: 'storefront', label: 'Vitrine', icon: Store },
  { id: 'order', label: 'Pedido', icon: ShoppingBag },
  { id: 'operation', label: 'Operação', icon: ClipboardList },
] as const;
type Stage = typeof stages[number]['id'];

/** Dados exclusivamente ilustrativos, sem requisições nem efeitos na operação. */
export function BusinessJourneyPreview({ segment, storeName, compact = false }: { segment: BusinessSegment; storeName?: string; compact?: boolean }) {
  const [stage, setStage] = useState<Stage>('storefront');
  const profile = getBusinessSegment(segment);
  const example = examples[segment];
  const name = storeName?.trim() || example.name;
  const consultation = ['rentals', 'services', 'personal', 'fitness', 'nutrition'].includes(segment);

  return <div className={`commercial-preview business-journey ${compact ? 'business-journey--compact' : ''}`} style={{ '--preview-accent': profile.primaryColor } as CSSProperties} aria-label={`Exemplo de apresentação para ${profile.label}`}>
    <div className="business-journey__browser"><span /><span /><span /><small>Prévia ilustrativa · sua marca aqui</small></div>
    <div className="business-journey__identity"><span><Store size={23} aria-hidden="true" /></span><div><strong>{name}</strong><small>{profile.catalogLabel}</small></div><span className="business-journey__identity-label">SUA LOJA</span></div>
    <div className="business-journey__steps" role="group" aria-label="Explore a jornada da loja">{stages.map(({ id, label, icon: Icon }, index) => <button key={id} type="button" aria-pressed={stage === id} onClick={() => setStage(id)}><Icon size={16} aria-hidden="true" /><span>{label}</span>{index < stages.length - 1 && <ArrowRight size={12} className="business-journey__connector" aria-hidden="true" />}</button>)}</div>
    <div key={`${segment}-${stage}`} className="business-journey__scene" aria-live="polite" aria-atomic="true">
      {stage === 'storefront' && <div className="business-journey__storefront">
        <div className="business-journey__cover"><span>{profile.catalogLabel}</span><h2>{profile.heroTitle}</h2><p>{profile.heroDescription}</p></div>
        <div className="business-journey__product"><div className="business-journey__product-art"><Package size={38} strokeWidth={1.3} aria-hidden="true" /></div><div><strong>{example.product}</strong><p>{example.detail}</p><span>{example.price}</span></div></div>
        <button className="business-journey__next" type="button" onClick={() => setStage('order')}>{consultation ? 'Ver solicitação de exemplo' : 'Ver pedido de exemplo'}<ArrowRight size={16} aria-hidden="true" /></button>
      </div>}
      {stage === 'order' && <div className="business-journey__order"><span className="business-journey__status"><CircleCheck size={17} aria-hidden="true" />{consultation ? 'Solicitação organizada' : 'Pedido recebido'}</span><h2>{consultation ? 'Os detalhes chegam juntos.' : 'Da escolha ao pedido, tudo junto.'}</h2><p>{consultation ? 'O atendimento continua com a loja para combinar os detalhes.' : 'Produto, quantidade e observação ficam registrados para a loja.'}</p><div className="business-journey__receipt"><div><span>1 × {example.product}</span><strong>{example.price}</strong></div><div><span>Observação</span><span>Combinar detalhes com a loja</span></div><div><span>{consultation ? 'Atendimento' : 'Pedido de exemplo'}</span><strong>Direto com {name}</strong></div></div><button className="business-journey__next" type="button" onClick={() => setStage('operation')}>Ver a visão do lojista<ArrowRight size={16} aria-hidden="true" /></button></div>}
      {stage === 'operation' && <div className="business-journey__operation"><span className="business-journey__status"><ClipboardList size={17} aria-hidden="true" />Visão do lojista</span><h2>Você sabe o que vem a seguir.</h2><p>Consulte o pedido e acompanhe o atendimento no painel da sua loja.</p><div className="business-journey__queue"><div><span>EXEMPLO #1042</span><strong>{example.product}</strong><small>{consultation ? 'Aguardando atendimento da loja' : 'Recebido · aguardando atendimento'}</small></div><span className="business-journey__queue-check"><Check size={19} aria-hidden="true" /></span></div><div className="business-journey__operation-note"><Store size={18} aria-hidden="true" /><span>Seu catálogo e seus pedidos.<br /><strong>Uma operação com a sua identidade.</strong></span></div><button className="business-journey__restart" type="button" onClick={() => setStage('storefront')}>Voltar para a vitrine de exemplo <ArrowRight size={15} aria-hidden="true" /></button></div>}
    </div>
    <p className="business-journey__disclaimer">Dados e valores ilustrativos. Nenhum pedido ou cobrança é criado.</p>
  </div>;
}
