import { ArrowUpRight, Boxes, CheckCircle2, Circle, Eye, PackageCheck, PackageX, Rocket, ShoppingBag, Tags } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ErrorState, LoadingState } from '../../components/ui/AsyncState';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { useStore } from '../../contexts/StoreContext';
import { getStoreReadiness } from '../../utils/storeReadiness';

export default function Dashboard(){
  const {products,categories,deliveryZones,orders,settings,planUsage,loading,error,reloadAdmin}=useStore();
  if(loading)return <LoadingState label="Carregando painel..."/>;
  if(error)return <ErrorState message={error} onRetry={()=>void reloadAdmin()}/>;

  const active=products.filter(p=>p.active).length;
  const inactive=products.length-active;
  const limit=planUsage.plan.productLimit;
  const usage=limit?Math.min(100,(active/limit)*100):0;
  const cards=[
    {label:'Produtos cadastrados',value:products.length,icon:Boxes},
    {label:'Produtos ativos',value:active,icon:PackageCheck},
    {label:'Produtos ocultos',value:inactive,icon:PackageX},
    {label:'Categorias',value:categories.length,icon:Tags},
    {label:'Pedidos registrados',value:orders.length,icon:ShoppingBag},
  ];

  const readinessState=getStoreReadiness(settings,categories,products,deliveryZones);
  const {steps:readiness,readyCount,total,percent:readinessPercent,launchReady}=readinessState;

  return <>
    <div className="admin-page-title"><div><span className="eyebrow">VISÃO GERAL</span><h1>Painel do estabelecimento</h1><p>Acompanhe a operação e deixe o cardápio pronto para receber pedidos.</p></div><a className="secondary-button" href={`/${settings.slug}`} target="_blank" rel="noreferrer"><Eye size={17}/>Abrir loja <ArrowUpRight size={16}/></a></div>
    <div className="stat-grid">{cards.map(({label,value,icon:Icon})=><article className="stat-card" key={label}><div className="stat-icon"><Icon size={20}/></div><span>{label}</span><strong>{value}</strong></article>)}</div>

    <section className={`admin-card store-readiness ${launchReady?'is-ready':''}`}><div className="store-readiness__heading"><div><span className="eyebrow">PRONTO PARA VENDER</span><h2>{launchReady?'Sua vitrine está operacional':'Finalize a configuração comercial'}</h2><p>{launchReady?'Os itens essenciais estão configurados. Faça um pedido de teste antes de divulgar o link.':'Conclua os pontos abaixo para evitar que um cliente chegue a uma vitrine incompleta.'}</p><Link to="/admin/primeiros-passos" className="text-link">Abrir roteiro de implantação →</Link></div><div className="store-readiness__score"><Rocket size={22}/><strong>{readinessPercent}%</strong><span>{readyCount}/{total} itens</span></div></div><div className="progress-track store-readiness__progress"><div style={{width:`${readinessPercent}%`}}/></div><div className="store-readiness-list">{readiness.map((item)=><Link to={item.to} key={item.key} className={item.ready?'is-done':''}>{item.ready?<CheckCircle2 size={19}/>:<Circle size={19}/>}<div><strong>{item.label}</strong><span>{item.ready?'Configurado':item.help}</span></div><ArrowUpRight size={16}/></Link>)}</div></section>

    <div className="dashboard-grid"><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">PLANO {planUsage.plan.name.toUpperCase()}</span><h2>Uso do catálogo</h2></div><span>{active}/{limit??'∞'} ativos</span></div>{limit!=null&&<div className="progress-track"><div style={{width:`${usage}%`}}/></div>}<p>{limit==null?'Seu plano não possui limite de produtos ativos.':planUsage.canActivateProduct?`Você ainda pode publicar ${Math.max(0,limit-active)} produto(s). Cadastros ocultos não entram no limite.`:'O limite de produtos ativos deste plano foi atingido. Você pode continuar cadastrando itens ocultos ou desativar um produto para publicar outro.'}</p><div className="dashboard-plan-links"><Link to="/admin/produtos" className="text-link">Gerenciar produtos →</Link><Link to="/admin/plano" className="text-link">Ver plano e vantagens →</Link></div></section><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">IDENTIDADE</span><h2>Sua loja</h2></div><ImageWithFallback className="dashboard-store-logo" src={settings.logoUrl} alt="Logo da loja"/></div><div className="store-data-list"><div><span>Nome</span><strong>{settings.name}</strong></div><div><span>WhatsApp</span><strong>{settings.whatsapp||'Não informado'}</strong></div><div><span>Localização</span><strong>{settings.city} · {settings.state}</strong></div></div><Link to="/admin/configuracoes" className="text-link">Editar configurações →</Link></section></div>

    <section className="admin-card quick-actions"><div className="admin-card__header"><div><span className="eyebrow">ATALHOS</span><h2>O que você quer atualizar?</h2></div></div><div className="quick-grid"><Link to="/admin/produtos/novo"><ShoppingBag size={20}/><div><strong>Novo produto</strong><span>Adicionar item ao catálogo</span></div></Link><Link to="/admin/produtos"><Boxes size={20}/><div><strong>Imagens e preços</strong><span>Editar produtos existentes</span></div></Link><Link to="/admin/categorias"><Tags size={20}/><div><strong>Categorias</strong><span>Organizar a vitrine</span></div></Link></div></section>
  </>;
}
