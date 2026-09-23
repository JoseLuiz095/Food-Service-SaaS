import { ArrowRight, BarChart3, Check, ChefHat, LockKeyhole, MessageCircle, RefreshCw, ShieldCheck, ShoppingBag, Sparkles, Store, TrendingUp, Users, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedContactButton } from '../../components/ProtectedContactButton';
import { LoadingState } from '../../components/ui/AsyncState';
import { loadPublicLanding, type LandingPlan, type PublicLanding } from '../../services/landingApi';
import { currency } from '../../utils/format';
import { InteractiveShowcase } from '../../components/marketing/InteractiveShowcase';
import { ExistingValueSection } from '../../components/marketing/ExistingValueSection';

type PlanMarketingContent = {
  eyebrow: string;
  description: string;
  idealFor: string;
  features: string[];
  contactLabel: string;
  intent: 'trial' | 'commercial';
};

const planMarketingContent: Record<string, PlanMarketingContent> = {
  ESSENTIAL: {
    eyebrow: 'PARA COMEÇAR',
    description: 'A base para publicar um cardápio profissional, receber pedidos e organizar o atendimento sem depender somente de redes sociais.',
    idealFor: 'Operações enxutas, início do delivery ou cardápio digital com foco em praticidade.',
    features: [
      'Até 40 produtos no cardápio',
      'Até 12 categorias organizadas',
      '1 imagem por produto',
      'Pedidos online com carrinho',
      'WhatsApp integrado após o pedido salvo',
      'Delivery e retirada no local',
      'Cobrança por PIX dentro do fluxo',
    ],
    contactLabel: 'Quero saber sobre o Essencial',
    intent: 'commercial',
  },
  STARTER: {
    eyebrow: 'MAIS INDICADO',
    description: 'O Profissional reúne os recursos mais importantes para vender melhor, acompanhar a operação e dar mais consistência à gestão do negócio.',
    idealFor: 'Restaurantes, lanchonetes e operações que querem vender com controle comercial e financeiro.',
    features: [
      'Até 120 produtos no cardápio',
      'Até 30 categorias e 120 adicionais',
      'Até 5 imagens por produto',
      'Pedidos online com delivery e retirada',
      'WhatsApp integrado após o pedido salvo',
      'Analytics comercial para acompanhar desempenho',
      'Financeiro gerencial com entradas e saídas',
      'Leitura local de boletos, cupons e comprovantes',
      'Banner personalizado na vitrine',
      'Experiência otimizada para celular',
    ],
    contactLabel: 'Quero testar o Profissional',
    intent: 'trial',
  },
  PROFESSIONAL: {
    eyebrow: 'MAIS COMPLETO',
    description: 'Para quem quer transformar o FoodWeb em uma ferramenta contínua de venda, relacionamento e operação, com mais autonomia de marca e recursos para crescer sem trocar de plataforma.',
    idealFor: 'Operações com maior volume, identidade própria e necessidade de mais capacidade de catálogo.',
    features: [
      'Tudo do plano Profissional',
      'Produtos, categorias e adicionais sem limite definido',
      'Até 10 imagens por produto',
      'Domínio próprio incluído',
      'Analytics comercial liberado',
      'Financeiro gerencial completo',
      'Leitura de documentos financeiros',
      'Suporte prioritário para a operação',
    ],
    contactLabel: 'Quero crescer com o Premium',
    intent: 'commercial',
  },
};

const fallback: PublicLanding = {
  stores: [],
  demoStoreSlug: 'central-food-demo',
  demoEnabled: true,
  demoDurationDays: 14,
  contactProtected: true,
  plans: [
    { id: 'essential', code: 'ESSENTIAL', name: 'Essencial', monthlyPrice: 49.9, featureCodes: ['storefront', 'orders', 'whatsapp', 'delivery'], marketingBenefits: [] },
    { id: 'starter', code: 'STARTER', name: 'Profissional', monthlyPrice: 79.9, featureCodes: ['storefront', 'orders', 'whatsapp', 'delivery', 'analytics', 'finance', 'financial_documents', 'custom_banner', 'multiple_images'], marketingBenefits: [] },
    { id: 'professional', code: 'PROFESSIONAL', name: 'Premium', monthlyPrice: 129.9, featureCodes: ['storefront', 'orders', 'whatsapp', 'delivery', 'analytics', 'finance', 'financial_documents', 'custom_banner', 'multiple_images'], marketingBenefits: [] },
  ],
};

const getPlanContent = (plan: LandingPlan, trialDays: number): PlanMarketingContent => {
  if (plan.code === 'STARTER') {
    return {
      ...planMarketingContent.STARTER,
      contactLabel: `Quero testar por ${trialDays} dias`,
    };
  }

  return planMarketingContent[plan.code] ?? {
    eyebrow: plan.code,
    description: 'Recursos pensados para vender online com praticidade e gestão simples.',
    idealFor: 'Operações que buscam um processo digital mais organizado.',
    features: plan.featureCodes,
    contactLabel: `Quero falar sobre o ${plan.name}`,
    intent: 'commercial',
  };
};

export default function Landing() {
  const [data, setData] = useState<PublicLanding | null>(null);

  useEffect(() => {
    void loadPublicLanding().then(setData).catch(() => setData(fallback));
  }, []);

  const view = data || fallback;
  const demo = useMemo(() => view.stores.find((store) => store.slug === view.demoStoreSlug) || view.stores[0], [view]);
  const demoHref = `/${encodeURIComponent(view.demoStoreSlug)}`;
  const trialDays = view.demoEnabled ? view.demoDurationDays : 14;

  if (!data) return <div className="landing-loading"><LoadingState label="Preparando apresentação FoodWeb..." /></div>;

  return <div className="food-sales-page food-sales-page-v43 food-sales-page-v44 food-sales-page-v59">
    <header className="sales-nav sales-nav-v44"><div className="sales-shell">
      <a className="sales-brand" href="/"><span className="foodweb-brand-mark">FW</span><strong>FoodWeb</strong></a>
      <nav><a href="#recursos">Recursos</a><a href="#demonstracao">Demonstração</a><a href="#lojas">Lojas</a><a href="#planos">Planos</a></nav>
      <div className="sales-nav-actions"><a href="/admin/login">Entrar</a><a className="sales-nav-primary" href="/cadastro?plan=DEMO">Criar conta e testar por {trialDays} dias</a></div>
    </div></header>

    <main>
      <section className="sales-hero sales-hero-v43 sales-hero-v44"><div className="sales-shell sales-hero-grid-v43">
        <div className="sales-hero-copy"><span className="sales-kicker"><Sparkles size={16} /> Plataforma completa para delivery</span><h1>Seu cardápio profissional, seus pedidos e sua gestão <em>em um só lugar.</em></h1><p>Venda direto pelo seu canal, sem comissão por pedido, com cardápio, delivery e retirada, pedidos, Analytics e Financeiro em um só painel.</p>
          <div className="sales-hero-actions"><a className="sales-cta-primary sales-cta-trial" href="/cadastro?plan=DEMO">Criar conta e testar por {trialDays} dias</a><a className="sales-cta-secondary" href="#demonstracao">Ver demonstração <ArrowRight size={18} /></a></div>
          <div className="sales-proof-row"><span><Check />Sem cartão no teste</span><span><Check />Ativação acompanhada</span><span><ShieldCheck />Contato comercial protegido</span></div>
        </div>
        <div className="sales-hero-visual-v43 sales-hero-visual-v44"><img src="/assets/marketing/storefront-preview.webp" alt="Prévia do cardápio FoodWeb" loading="eager" /><div className="sales-hero-visual-badge"><strong>Experiência pronta para celular</strong><span>Cardápio, carrinho e checkout</span></div></div>
      </div></section>

      <section className="sales-trust-strip-v44"><div className="sales-shell"><div><ShoppingBag /><span><strong>Loja online em minutos</strong><small>Cardápio pronto para vender</small></span></div><div><BarChart3 /><span><strong>Gestão em tempo real</strong><small>Pedidos e desempenho</small></span></div><div><Wallet /><span><strong>Financeiro gerencial</strong><small>Entradas, saídas e documentos</small></span></div><div><LockKeyhole /><span><strong>Segurança por padrão</strong><small>Turnstile nas ações públicas</small></span></div></div></section>

      <section id="recursos" className="sales-benefits sales-benefits-v43"><div className="sales-shell"><div className="sales-section-heading center"><span>POR QUE FOODWEB?</span><h2>Uma experiência melhor para quem compra e mais controle para quem administra.</h2></div><div className="sales-benefit-grid sales-benefit-grid-v43"><article><span><ShoppingBag /></span><h3>Cardápio que dá vontade de pedir</h3><p>Fotos em destaque, busca, categorias, adicionais e carrinho pensado para celular.</p></article><article><span><BarChart3 /></span><h3>Entenda o que realmente vende</h3><p>Analytics para acompanhar visualizações, conversão e comportamento de compra.</p></article><article><span><Wallet /></span><h3>Financeiro simples e útil</h3><p>Entradas, saídas, categorias, vencimentos e leitura local de boletos, cupons e documentos.</p></article><article><span><ShieldCheck /></span><h3>Suporte reservado ao lojista</h3><p>O canal de suporte da plataforma fica disponível apenas dentro das áreas autenticadas de Admin e Master.</p></article></div></div></section>

      <ExistingValueSection variant="food" />

      <section className="sales-growth-v061"><div className="sales-shell"><div className="sales-section-heading center"><span>VENDA MAIS COM A BASE QUE VOCÊ JÁ TEM</span><h2>O FoodWeb agora ajuda a recuperar oportunidades, organizar a cozinha e estimular novas compras.</h2><p>Recursos simples, integrados ao fluxo atual, sem transformar sua operação em um ERP pesado.</p></div><div className="sales-growth-v061__grid"><article><span><RefreshCw/></span><h3>Recuperação de vendas</h3><p>Identifique pedidos registrados que não seguiram para o WhatsApp e retome o contato com uma mensagem pronta.</p></article><article><span><ChefHat/></span><h3>Cozinha / KDS opcional</h3><p>Acompanhe pedidos em etapas de produção e envie atualizações prontas ao cliente a cada mudança de status.</p></article><article><span><TrendingUp/></span><h3>Upsell no carrinho</h3><p>Sugestões de produtos complementares aparecem no momento certo para aumentar o ticket sem atrapalhar a compra.</p></article><article><span><Users/></span><h3>CRM simples + pedir novamente</h3><p>Veja frequência e valor dos clientes recentes e facilite a recompra no dispositivo do próprio consumidor.</p></article></div></div></section>

      <InteractiveShowcase variant="food" demoHref={demoHref} />

      <section id="lojas" className="sales-stores sales-stores-v43"><div className="sales-shell"><div className="sales-section-heading split"><div><span>NEGÓCIOS PUBLICADOS</span><h2>Veja lojas que já estão no FoodWeb.</h2></div><Store size={28} /></div>{view.stores.length ? <div className="sales-store-grid">{view.stores.map((store) => <a key={store.id} className="sales-store-card" href={`/${encodeURIComponent(store.slug)}`}><div className="sales-store-cover" style={store.coverUrl ? { backgroundImage: `url(${store.coverUrl})` } : undefined}></div><div className="sales-store-content"><img src={store.logoUrl || '/favicon-foodweb-v046.svg'} alt="" loading="lazy" decoding="async" /><div><h3>{store.name}</h3><p>{store.description}</p><span>{[store.city, store.state].filter(Boolean).join(' · ') || 'Atendimento online'}</span></div></div><div className="sales-store-footer"><span>{store.deliveryEnabled ? 'Delivery' : ''}{store.deliveryEnabled && store.pickupEnabled ? ' + ' : ''}{store.pickupEnabled ? 'Retirada' : ''}</span><strong>Ver cardápio <ArrowRight size={15} /></strong></div></a>)}</div> : <div className="sales-empty-stores"><Store size={30} /><h3>As lojas publicadas aparecerão aqui automaticamente.</h3></div>}</div></section>

      <section id="planos" className="sales-plans sales-plans-v43"><div className="sales-shell"><div className="sales-section-heading center"><span>PLANOS</span><h2>Preço de entrada competitivo e recursos que crescem junto com a operação.</h2><p>Experimente o Profissional por {trialDays} dias antes de decidir como continuar.</p></div><div className="sales-plan-grid">{view.plans.filter((plan) => plan.code !== 'DEMO').map((plan) => {
        const recommended = plan.code === 'STARTER';
        const content = getPlanContent(plan, trialDays);
        return <article key={plan.id} className={`sales-plan-card ${recommended ? 'recommended' : ''}`}>
          {recommended && <span className="sales-plan-badge">Teste por {trialDays} dias</span>}
          <div className="sales-plan-header-v59">
            <small>{content.eyebrow}</small>
            <h3>{plan.name}</h3>
            <div className="sales-plan-price"><strong>{currency.format(plan.monthlyPrice)}</strong><span>/mês</span></div>
            <p className="sales-plan-description-v59">{content.description}</p>
            <div className="sales-plan-fit-v59"><strong>Indicado para</strong><span>{content.idealFor}</span></div>
          </div>
          <ul>{[...content.features,...(plan.marketingBenefits||[])].filter((feature,index,all)=>all.indexOf(feature)===index).map((feature) => <li key={`${plan.id}-${feature}`}><Check size={15} />{feature}</li>)}</ul>
          <ProtectedContactButton className={`sales-plan-contact-v59 ${recommended ? 'sales-plan-contact-v59--featured' : ''}`} intent={content.intent}><MessageCircle size={16} />{content.contactLabel}</ProtectedContactButton>
        </article>;
      })}<article className="sales-plan-card food-business-sales-v051 sales-plan-card-business-v59"><span className="sales-plan-badge">SOB MEDIDA</span><small>BUSINESS</small><h3>Business</h3><div className="sales-plan-price"><strong>Sob consulta</strong><span>valor definido pelo projeto</span></div><p className="sales-plan-description-v59">Projeto desenhado para operações que precisam de mais integração, automação e acompanhamento técnico no dia a dia.</p><div className="sales-plan-fit-v59 sales-plan-fit-v59--dark"><strong>Indicado para</strong><span>Operações multiunidade, franquias, centrais de produção e negócios com necessidades especiais.</span></div><ul><li><Check size={15} />Domínio próprio incluído</li><li><Check size={15} />Multiunidade e fluxos personalizados</li><li><Check size={15} />Integrações com ERP, PDV e APIs</li><li><Check size={15} />Relatórios e automações sob medida</li><li><Check size={15} />Acompanhamento técnico dedicado</li></ul><ProtectedContactButton className="sales-plan-contact-v59 sales-plan-contact-v59--dark" intent="commercial"><MessageCircle size={16} />Quero avaliar um projeto Business</ProtectedContactButton></article></div><div className="premium-value-story-v062"><div><span>POR QUE O PREMIUM?</span><h3>O Profissional organiza. O Premium ajuda a vender novamente e operar melhor.</h3></div><p>Quando a operação começa a ganhar recorrência, domínio próprio, CRM, recuperação, upsell e KDS deixam de ser detalhes e passam a reduzir trabalho e criar novas oportunidades de venda.</p></div><div className="sales-plan-note"><ShieldCheck size={17} /><span>O telefone comercial não fica exposto no HTML. O contato é liberado pelo servidor somente após a validação anti-robô.</span></div></div></section>

      <section className="sales-final-cta sales-final-cta-v43 sales-final-cta-v59"><div className="sales-shell"><div><span>PRONTO PARA CONHECER MELHOR?</span><h2>Fale com a equipe comercial e entenda qual plano faz mais sentido para o seu negócio.</h2><p>O contato público é protegido e o suporte técnico continua reservado para lojistas autenticados.</p></div><ProtectedContactButton className="sales-cta-light sales-cta-contact-v59" intent="commercial"><MessageCircle size={18} />Entrar em contato no WhatsApp</ProtectedContactButton></div></section>
    </main>

    <footer className="sales-footer"><div className="sales-shell"><a className="sales-brand" href="/"><span className="foodweb-brand-mark">FW</span><strong>FoodWeb</strong></a><span>Cardápio, pedidos e gestão para negócios de alimentação.</span><a href="/admin/login">Área do lojista</a></div></footer>
  </div>;
}
