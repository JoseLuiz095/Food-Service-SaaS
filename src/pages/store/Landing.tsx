import { ArrowRight, Check, MessageCircle, ShieldCheck, Store } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { ProtectedContactButton } from '../../components/ProtectedContactButton';
import { LoadingState } from '../../components/ui/AsyncState';
import { loadPublicLanding, type LandingPlan, type PublicLanding } from '../../services/landingApi';
import { currency } from '../../utils/format';
import { ExistingValueSection } from '../../components/marketing/ExistingValueSection';
import '../../segments/commercial.css';
import { CommercialHero, CommercialModules, CommercialFinal } from '../../components/marketing/CommercialSegments';
import { PLATFORM_BRAND } from '../../lib/brand';

const InteractiveShowcase = lazy(() => import('../../components/marketing/InteractiveShowcase').then((module) => ({ default: module.InteractiveShowcase })));

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
    description: 'A base para publicar seus produtos, receber pedidos e organizar o atendimento em um canal próprio.',
    idealFor: 'Negócios que estão começando e querem uma vitrine simples para vender.',
    features: [
      'Até 40 produtos no catálogo',
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
    idealFor: 'Lojas que querem acompanhar vendas, produtos e o financeiro do dia a dia.',
    features: [
      'Até 120 produtos no catálogo',
      'Até 30 categorias e 120 adicionais',
      'Até 5 imagens por produto',
      'Pedidos online com delivery e retirada',
      'WhatsApp integrado após o pedido salvo',
      'Analytics comercial para acompanhar desempenho',
      'Financeiro gerencial com entradas e saídas',
      'Leitura local de boletos, cupons e comprovantes',
      'Estoque de insumos com custo médio e alertas de reposição',
      'Fichas técnicas para consumo automático na produção',
      'Visão de custo e margem estimada por produto',
      'Banner personalizado na vitrine',
      'Experiência otimizada para celular',
    ],
    contactLabel: 'Quero testar o Profissional',
    intent: 'trial',
  },
  PROFESSIONAL: {
    eyebrow: 'MAIS COMPLETO',
    description: `Para quem quer transformar a ${PLATFORM_BRAND} em uma ferramenta contínua de venda, relacionamento e operação, com mais autonomia de marca e recursos para crescer sem trocar de plataforma.`,
    idealFor: 'Operações com maior volume, identidade própria e necessidade de mais capacidade de catálogo.',
    features: [
      'Tudo do plano Profissional',
      'Produtos, categorias e adicionais sem limite definido',
      'Até 10 imagens por produto',
      'Financeiro gerencial completo',
      'Leitura de documentos financeiros',
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
    { id: 'essential', code: 'ESSENTIAL', name: 'Essencial', monthlyPrice: 49.9, featureCodes: ['storefront', 'orders', 'whatsapp', 'delivery'], marketingBenefits: [], productLimit: 40, imageLimitPerProduct: 1, categoryLimit: 12, addonLimit: 40, customDomain: false, reports: false, prioritySupport: false },
    { id: 'starter', code: 'STARTER', name: 'Profissional', monthlyPrice: 79.9, featureCodes: ['storefront', 'orders', 'whatsapp', 'delivery', 'analytics', 'finance', 'financial_documents', 'custom_banner', 'multiple_images'], marketingBenefits: [], productLimit: 120, imageLimitPerProduct: 5, categoryLimit: 30, addonLimit: 120, customDomain: false, reports: true, prioritySupport: false },
    { id: 'professional', code: 'PROFESSIONAL', name: 'Premium', monthlyPrice: 129.9, featureCodes: ['storefront', 'orders', 'whatsapp', 'delivery', 'analytics', 'finance', 'financial_documents', 'custom_banner', 'multiple_images'], marketingBenefits: [], productLimit: null, imageLimitPerProduct: 10, categoryLimit: null, addonLimit: null, customDomain: true, reports: true, prioritySupport: true },
  ],
};

const planFeatures = (plan: LandingPlan, content: PlanMarketingContent) => {
  const allowed = (feature: string) => !(
    (!plan.customDomain && /dom[ií]nio pr[oó]prio/i.test(feature))
    || (!plan.reports && /analytics|relat[oó]rio/i.test(feature))
    || (!plan.prioritySupport && /suporte priorit[aá]rio/i.test(feature))
  );
  const limits = [
    plan.productLimit == null ? 'Produtos sem limite definido' : `Até ${plan.productLimit} produtos ativos`,
    plan.categoryLimit == null && plan.addonLimit == null ? 'Categorias e adicionais sem limite definido' : `Até ${plan.categoryLimit ?? 'sem limite'} categorias e ${plan.addonLimit ?? 'sem limite'} adicionais`,
    plan.imageLimitPerProduct == null ? 'Imagens por produto sem limite definido' : `Até ${plan.imageLimitPerProduct} ${plan.imageLimitPerProduct === 1 ? 'imagem' : 'imagens'} por produto`,
  ];
  const fixed = content.features.filter((feature) => !/^Até \d+ (produtos|categorias|imagens)|Produtos, categorias|Categorias e adicionais/i.test(feature));
  const capabilities = [plan.customDomain && 'Domínio próprio incluído', plan.reports && 'Analytics e relatórios comerciais', plan.prioritySupport && 'Suporte prioritário para a operação'].filter(Boolean) as string[];
  return [...limits, ...fixed, ...capabilities, ...(plan.marketingBenefits || [])].filter(allowed).filter((feature, index, all) => all.indexOf(feature) === index);
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
  const demoHref = `/${encodeURIComponent(view.demoStoreSlug)}`;
  const trialDays = view.demoEnabled ? view.demoDurationDays : 14;

  if (!data) return <div className="landing-loading"><LoadingState label={`Preparando apresentação ${PLATFORM_BRAND}...`} /></div>;

  return <div className="food-sales-page food-sales-page-v43 food-sales-page-v44 food-sales-page-v59 food-sales-page--segments">
    <header className="sales-nav sales-nav-v44"><div className="sales-shell">
      <a className="sales-brand" href="/"><img className="foodweb-brand-mark brand-mark-image" src="/assets/vendeweb-mark.svg" alt=""/><strong>{PLATFORM_BRAND}<small>Seu negócio, em movimento.</small></strong></a>
      <nav aria-label="Navegação comercial"><a href="#ramos">Para seu negócio</a><a href="#recursos">Recursos</a><a href="#demonstracao">Demonstração</a><a href="#planos">Planos</a></nav>
      <div className="sales-nav-actions"><a href="/admin/login">Entrar</a><a className="sales-nav-primary" href="/cadastro?plan=DEMO">Começar agora <ArrowRight size={15} /></a></div>
    </div></header>

    <main className="sales-main">
      <CommercialHero trialDays={trialDays} />

      <ExistingValueSection variant="food" />

      <CommercialModules />

      <div className="commercial-demo-context sales-shell"><span className="commercial-eyebrow">EXPERIMENTE NA PRÁTICA</span><p>A demonstração abaixo usa uma loja de alimentação para mostrar a jornada de compra e gestão. Os dados são fictícios e nenhuma cobrança é feita.</p></div>
      <Suspense fallback={<section id="demonstracao" className="sales-shell showcase-loading" aria-label="Demonstração"><strong>Uma experiência da vitrine ao pedido.</strong><span>Preparando demonstração interativa…</span><a href={demoHref}>Abrir a loja de demonstração</a></section>}><InteractiveShowcase variant="food" demoHref={demoHref} /></Suspense>

      <section id="lojas" className="sales-stores sales-stores-v43"><div className="sales-shell"><div className="sales-section-heading split"><div><span>NEGÓCIOS PUBLICADOS</span><h2>Cada loja, uma história. Cada marca, seu espaço.</h2></div><Store size={28} /></div>{view.stores.length ? <div className="sales-store-grid">{view.stores.map((store) => <a key={store.id} className="sales-store-card" href={`/${encodeURIComponent(store.slug)}`}><div className="sales-store-cover" style={store.coverUrl ? { backgroundImage: `url(${store.coverUrl})` } : undefined}></div><div className="sales-store-content"><img src={store.logoUrl || '/assets/marketing/app-splash-v2.png?v=20261015'} alt="" loading="lazy" decoding="async" /><div><h3>{store.name}</h3><p>{store.description}</p><span>{[store.city, store.state].filter(Boolean).join(' · ') || 'Atendimento online'}</span></div></div><div className="sales-store-footer"><span>{store.deliveryEnabled ? 'Delivery' : ''}{store.deliveryEnabled && store.pickupEnabled ? ' + ' : ''}{store.pickupEnabled ? 'Retirada' : ''}</span><strong>Conhecer a loja <ArrowRight size={15} /></strong></div></a>)}</div> : <div className="sales-empty-stores"><Store size={30} /><h3>As lojas publicadas aparecerão aqui automaticamente.</h3></div>}</div></section>

      <section id="planos" className="sales-plans sales-plans-v43"><div className="sales-shell"><div className="sales-section-heading center"><span>PLANOS</span><h2>Escolha a base que combina com o seu momento.</h2><p>Experimente o Profissional por {trialDays} dias antes de decidir como continuar.</p></div><div className="sales-plan-grid">{view.plans.filter((plan) => plan.code !== 'DEMO').map((plan) => {
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
          <ul>{planFeatures(plan, content).map((feature) => <li key={`${plan.id}-${feature}`}><Check size={15} />{feature}</li>)}</ul>
          <ProtectedContactButton className={`sales-plan-contact-v59 ${recommended ? 'sales-plan-contact-v59--featured' : ''}`} intent={content.intent}><MessageCircle size={16} />{content.contactLabel}</ProtectedContactButton>
        </article>;
      })}<article className="sales-plan-card food-business-sales-v051 sales-plan-card-business-v59"><span className="sales-plan-badge">SOB MEDIDA</span><small>BUSINESS</small><h3>Business</h3><div className="sales-plan-price"><strong>Sob consulta</strong><span>valor definido pelo projeto</span></div><p className="sales-plan-description-v59">Projeto desenhado para operações que precisam de mais integração, automação e acompanhamento técnico no dia a dia.</p><div className="sales-plan-fit-v59 sales-plan-fit-v59--dark"><strong>Indicado para</strong><span>Operações multiunidade, franquias, centrais de produção e negócios com necessidades especiais.</span></div><ul><li><Check size={15} />Presença digital sob medida</li><li><Check size={15} />Multiunidade e fluxos personalizados</li><li><Check size={15} />Integrações com ERP, PDV e APIs</li><li><Check size={15} />Indicadores e automações sob medida</li><li><Check size={15} />Acompanhamento técnico dedicado</li></ul><ProtectedContactButton className="sales-plan-contact-v59 sales-plan-contact-v59--dark" intent="commercial"><MessageCircle size={16} />Quero avaliar um projeto Business</ProtectedContactButton></article></div><div className="commercial-plan-note"><ShieldCheck size={19} /><p><strong>Recursos e limites conforme o plano contratado.</strong> Módulos opcionais são ativados nas configurações da loja. Pagamentos, sinais e repasses que exigem conferência continuam com confirmação manual.</p></div></div></section>

      <CommercialFinal trialDays={trialDays} />
    </main>

    <footer className="sales-footer"><div className="sales-shell"><a className="sales-brand" href="/"><img className="foodweb-brand-mark brand-mark-image" src="/assets/vendeweb-mark.svg" alt=""/><strong>{PLATFORM_BRAND}</strong></a><span>Produtos, serviços e novas possibilidades para o seu negócio.</span><a href="/admin/login">Área do lojista</a></div></footer>
  </div>;
}
