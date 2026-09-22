import { ArrowRight, BarChart3, Check, LockKeyhole, MessageCircle, ShieldCheck, ShoppingBag, Sparkles, Store, UserPlus, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedContactButton } from '../../components/ProtectedContactButton';
import { LoadingState } from '../../components/ui/AsyncState';
import { loadPublicLanding, type PublicLanding } from '../../services/landingApi';
import { currency } from '../../utils/format';
import { InteractiveShowcase } from '../../components/marketing/InteractiveShowcase';
import { ExistingValueSection } from '../../components/marketing/ExistingValueSection';

const featureLabels:Record<string,string>={
  storefront:'Cardápio digital',orders:'Pedidos online',whatsapp:'WhatsApp',analytics:'Analytics comercial',
  finance:'Financeiro gerencial',financial_documents:'Leitura de documentos',custom_banner:'Banner personalizado',
  multiple_images:'Mais fotos por produto',delivery:'Delivery e retirada',
};

const fallback:PublicLanding={
  stores:[],demoStoreSlug:'central-food-demo',demoEnabled:true,demoDurationDays:14,contactProtected:true,
  plans:[
    {id:'essential',code:'ESSENTIAL',name:'Essencial',monthlyPrice:49.9,featureCodes:['storefront','orders','whatsapp','delivery']},
    {id:'starter',code:'STARTER',name:'Profissional',monthlyPrice:79.9,featureCodes:['storefront','orders','whatsapp','delivery','analytics','finance','financial_documents','custom_banner','multiple_images']},
    {id:'professional',code:'PROFESSIONAL',name:'Premium',monthlyPrice:129.9,featureCodes:['storefront','orders','whatsapp','delivery','analytics','finance','financial_documents','custom_banner','multiple_images']},
  ],
};

export default function Landing(){
  const[data,setData]=useState<PublicLanding|null>(null);
  useEffect(()=>{void loadPublicLanding().then(setData).catch(()=>setData(fallback))},[]);
  const view=data||fallback;
  const demo=useMemo(()=>view.stores.find((store)=>store.slug===view.demoStoreSlug)||view.stores[0],[view]);
  const demoHref=`/${encodeURIComponent(view.demoStoreSlug)}`;
  const trialDays=view.demoEnabled?view.demoDurationDays:14;
  if(!data)return <div className="landing-loading"><LoadingState label="Preparando apresentação FoodWeb..."/></div>;

  return <div className="food-sales-page food-sales-page-v43 food-sales-page-v44">
    <header className="sales-nav sales-nav-v44"><div className="sales-shell">
      <a className="sales-brand" href="/"><span className="foodweb-brand-mark">FW</span><strong>FoodWeb</strong></a>
      <nav><a href="#recursos">Recursos</a><a href="#demonstracao">Demonstração</a><a href="#lojas">Lojas</a><a href="#planos">Planos</a></nav>
      <div className="sales-nav-actions"><a href="/admin/login">Entrar</a><a className="sales-nav-self-service" href="/cadastro?plan=DEMO">Criar conta</a><a className="sales-nav-primary" href="/cadastro?plan=DEMO">Criar conta e testar {trialDays} dias</a></div>
    </div></header>

    <main>
      <section className="sales-hero sales-hero-v43 sales-hero-v44"><div className="sales-shell sales-hero-grid-v43">
        <div className="sales-hero-copy"><span className="sales-kicker"><Sparkles size={16}/> Plataforma completa para delivery</span><h1>Seu cardápio profissional, seus pedidos e sua gestão <em>em um só lugar.</em></h1><p>Venda direto pelo seu canal, sem comissão por pedido, com cardápio, delivery e retirada, pedidos, Analytics e Financeiro em um só painel.</p>
          <div className="sales-hero-actions"><a className="sales-cta-primary sales-cta-trial" href="/cadastro?plan=DEMO"><UserPlus size={18}/>Criar conta e testar por {trialDays} dias</a><a className="sales-cta-self-service" href="/cadastro?plan=DEMO"><UserPlus size={18}/>Criar minha conta</a><a className="sales-cta-secondary" href="#demonstracao">Ver demonstração <ArrowRight size={18}/></a></div>
          <div className="sales-proof-row"><span><Check/>Sem cartão no teste</span><span><Check/>Ativação acompanhada</span><span><ShieldCheck/>Contato comercial protegido</span></div>
        </div>
        <div className="sales-hero-visual-v43 sales-hero-visual-v44"><img src="/assets/marketing/storefront-preview.webp" alt="Prévia do cardápio FoodWeb" loading="eager"/><div className="sales-hero-visual-badge"><strong>Experiência pronta para celular</strong><span>Cardápio, carrinho e checkout</span></div></div>
      </div></section>

      <section className="sales-trust-strip-v44"><div className="sales-shell"><div><ShoppingBag/><span><strong>Loja online em minutos</strong><small>Cardápio pronto para vender</small></span></div><div><BarChart3/><span><strong>Gestão em tempo real</strong><small>Pedidos e desempenho</small></span></div><div><Wallet/><span><strong>Financeiro gerencial</strong><small>Entradas, saídas e documentos</small></span></div><div><LockKeyhole/><span><strong>Segurança por padrão</strong><small>Turnstile nas ações públicas</small></span></div></div></section>

      <section id="recursos" className="sales-benefits sales-benefits-v43"><div className="sales-shell"><div className="sales-section-heading center"><span>POR QUE FOODWEB?</span><h2>Uma experiência melhor para quem compra e mais controle para quem administra.</h2></div><div className="sales-benefit-grid sales-benefit-grid-v43"><article><span><ShoppingBag/></span><h3>Cardápio que dá vontade de pedir</h3><p>Fotos em destaque, busca, categorias, adicionais e carrinho pensado para celular.</p></article><article><span><BarChart3/></span><h3>Entenda o que realmente vende</h3><p>Analytics para acompanhar visualizações, conversão e comportamento de compra.</p></article><article><span><Wallet/></span><h3>Financeiro simples e útil</h3><p>Entradas, saídas, categorias, vencimentos e leitura local de boletos, cupons e documentos.</p></article><article><span><ShieldCheck/></span><h3>Suporte reservado ao lojista</h3><p>O canal de suporte da plataforma fica disponível apenas dentro das áreas autenticadas de Admin e Master.</p></article></div></div></section>

      <ExistingValueSection variant="food"/>

      <InteractiveShowcase variant="food" demoHref={demoHref}/>

      <section id="lojas" className="sales-stores sales-stores-v43"><div className="sales-shell"><div className="sales-section-heading split"><div><span>NEGÓCIOS PUBLICADOS</span><h2>Veja lojas que já estão no FoodWeb.</h2></div><Store size={28}/></div>{view.stores.length?<div className="sales-store-grid">{view.stores.map((store)=><a key={store.id} className="sales-store-card" href={`/${encodeURIComponent(store.slug)}`}><div className="sales-store-cover" style={store.coverUrl?{backgroundImage:`url(${store.coverUrl})`}:undefined}></div><div className="sales-store-content"><img src={store.logoUrl||'/favicon-foodweb-v046.svg'} alt="" loading="lazy" decoding="async"/><div><h3>{store.name}</h3><p>{store.description}</p><span>{[store.city,store.state].filter(Boolean).join(' · ')||'Atendimento online'}</span></div></div><div className="sales-store-footer"><span>{store.deliveryEnabled?'Delivery':''}{store.deliveryEnabled&&store.pickupEnabled?' + ':''}{store.pickupEnabled?'Retirada':''}</span><strong>Ver cardápio <ArrowRight size={15}/></strong></div></a>)}</div>:<div className="sales-empty-stores"><Store size={30}/><h3>As lojas publicadas aparecerão aqui automaticamente.</h3></div>}</div></section>

      <section id="planos" className="sales-plans sales-plans-v43"><div className="sales-shell"><div className="sales-section-heading center"><span>PLANOS</span><h2>Preço de entrada competitivo e recursos que crescem junto com a operação.</h2><p>Experimente o Profissional por {trialDays} dias antes de decidir como continuar.</p></div><div className="sales-plan-grid">{view.plans.filter((plan)=>plan.code!=='DEMO').map((plan)=>{const recommended=plan.code==='STARTER';return <article key={plan.id} className={`sales-plan-card ${recommended?'recommended':''}`}>{recommended&&<span className="sales-plan-badge">Teste por {trialDays} dias</span>}<small>{plan.code==='ESSENTIAL'?'PARA COMEÇAR':plan.code==='STARTER'?'MAIS INDICADO':'OPERAÇÃO CONSOLIDADA'}</small><h3>{plan.name}</h3><div className="sales-plan-price"><strong>{currency.format(plan.monthlyPrice)}</strong><span>/mês</span></div><ul>{plan.featureCodes.slice(0,8).map((feature)=><li key={feature}><Check size={15}/>{featureLabels[feature]||feature.replaceAll('_',' ')}</li>)}</ul>{recommended?<ProtectedContactButton className="sales-plan-trial-link" intent="trial"><MessageCircle size={16}/>Quero testar por {trialDays} dias</ProtectedContactButton>:<a href="/admin/login">Já sou lojista <ArrowRight size={15}/></a>}<a className="sales-plan-self-service sales-plan-self-service--primary" href={`/cadastro?plan=${encodeURIComponent(plan.code)}`}>Criar conta neste plano <ArrowRight size={15}/></a></article>})}<article className="sales-plan-card food-business-sales-v051"><span className="sales-plan-badge">SOB MEDIDA</span><small>BUSINESS</small><h3>Business</h3><div className="sales-plan-price"><strong>Sob consulta</strong><span>valor definido pelo projeto</span></div><ul><li><Check size={15}/>Domínio próprio incluído</li><li><Check size={15}/>Multiunidade e fluxos personalizados</li><li><Check size={15}/>Integrações com ERP, PDV e APIs</li><li><Check size={15}/>Relatórios e automações sob medida</li><li><Check size={15}/>Acompanhamento técnico dedicado</li></ul><ProtectedContactButton className="sales-plan-trial-link" intent="commercial"><MessageCircle size={16}/>Quero avaliar um projeto Business</ProtectedContactButton></article></div><div className="sales-plan-note"><ShieldCheck size={17}/><span>O telefone comercial não fica exposto no HTML. O contato é liberado pelo servidor somente após a validação anti-robô.</span></div></div></section>

      <section className="sales-final-cta sales-final-cta-v43"><div className="sales-shell"><div><span>COMECE COM A EXPERIÊNCIA COMPLETA</span><h2>Teste o Profissional por {trialDays} dias no seu negócio.</h2><p>O canal comercial público é protegido. O suporte técnico permanece restrito aos lojistas autenticados.</p></div><a className="sales-cta-light" href="/cadastro?plan=DEMO"><UserPlus size={18}/>Criar minha conta</a></div></section>
    </main>

    <footer className="sales-footer"><div className="sales-shell"><a className="sales-brand" href="/"><span className="foodweb-brand-mark">FW</span><strong>FoodWeb</strong></a><span>Cardápio, pedidos e gestão para negócios de alimentação.</span><a href="/admin/login">Área do lojista</a></div></footer>
  </div>;
}
