import AdminRoutineActions from '../../components/admin/AdminRoutineActions';
import {useBusinessStatus} from '../../platform/useBusinessStatus';
import { InfoHint } from '../../components/ui/InfoHint';
import { ArrowUpRight, Boxes, CalendarDays, CheckCircle2, Circle, CircleDollarSign, Clock3, Eye, Link2, Megaphone, MessageCircle, PackageCheck, PackageOpen, PackageX, Rocket, ShoppingBag, Tags, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ErrorState, LoadingState } from '../../components/ui/AsyncState';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { useStore } from '../../contexts/StoreContext';
import { getStoreReadiness } from '../../utils/storeReadiness';
import { publicStorefrontPath } from '../../utils/storefrontRoute';
import { currency } from '../../utils/format';
import { getBusinessSegment, isDefaultStoreImage } from '../../segments/businessSegments';
import { storeDateLabel } from '../../utils/storeHours';
import { dashboardApi, type DashboardMetrics } from '../../services/dashboardApi';
import './dashboard-metrics.css';
import { dashboardErrorMessage } from '../../utils/dashboardErrors';
import './dashboard-simple.css';

export default function Dashboard(){
  const {products,categories,deliveryZones,orders,settings,planUsage,loading,error,reloadAdmin}=useStore();
  const {state:business}=useBusinessStatus(settings.id);
  const [metricState,setMetricState]=useState<{storeId:string;data:DashboardMetrics|null;error:string;loading:boolean}|null>(null);
  const [metricRetry,setMetricRetry]=useState(0);
  useEffect(()=>{
    const refresh=()=>{if(!document.hidden)setMetricRetry(value=>value+1);};
    const onStorage=(event:StorageEvent)=>{if(event.key==='foodservice_store_sync_v1')refresh();};
    window.addEventListener('focus',refresh);
    window.addEventListener('storage',onStorage);
    return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('storage',onStorage);};
  },[]);
  useEffect(()=>{
    let current=true;
    if (!settings.id) return ()=>{current=false;};
    setMetricState({storeId:settings.id,data:null,error:'',loading:true});
    void dashboardApi.getMetrics(settings.id).then((data)=>{
      if(current)setMetricState({storeId:settings.id,data,error:'',loading:false});
    }).catch((cause)=>{
      if(current)setMetricState({storeId:settings.id,data:null,error:dashboardErrorMessage(cause),loading:false});
    });
    return ()=>{current=false;};
  },[settings.id,metricRetry]);
  const metrics=metricState?.storeId===settings.id?metricState.data:null;
  const metricsLoading=metricState?.storeId!==settings.id||metricState.loading;
  const metricsError=metricState?.storeId===settings.id?metricState.error:'';
  const count=(value:number|undefined)=>value==null?'—':value;
  const amount=(value:number|undefined)=>value==null?'—':currency.format(value);
  const metricCaption=(text:string)=>metrics?text:metricsLoading?'Consultando servidor…':metricsError?'Falha na consulta; tente atualizar.':'Aguardando dados do servidor';
  const segment=getBusinessSegment(business?.profile?.primary_segment || settings.visualTheme);
  const segmentPresentation=segment.id!=='food';
  const serviceFirst=['personal','nutrition','creator'].includes(segment.id);
  const hasCommerceActivity=products.length>0||categories.length>0||orders.length>0||(metrics?.ordersTotal??0)>0;
  const showCommerce= !serviceFirst||hasCommerceActivity;
  const logoUrl=segmentPresentation&&isDefaultStoreImage(settings.logoUrl)?'/assets/placeholder-catalog.svg':settings.logoUrl;
  if(loading)return <LoadingState label="Carregando painel..."/>;
  if(error)return <ErrorState message={error} onRetry={()=>void reloadAdmin()}/>;

  const active=products.filter(p=>p.active).length;
  const inactive=products.length-active;
  const limit=planUsage.plan.productLimit;
  const usage=limit?Math.min(100,(active/limit)*100):0;
  const timezone=metrics?.timezone||settings.openingSchedule.timezone;
  const lowStockProducts=products.filter((product)=>{if(!product.trackStock)return false;const available=Math.max(0,Number(product.stockQuantity||0)-Number(product.stockReservedQuantity||0));return product.stockStatus==='low_stock'||available<=3;});
  const physicalUnits=products.reduce((total,product)=>total+(product.trackStock?Number(product.stockQuantity||0):0),0);
  const reservedUnits=products.reduce((total,product)=>total+(product.trackStock?Number(product.stockReservedQuantity||0):0),0);
  const hasPhysicalStock=products.some(product=>product.trackStock);
  const cards=[
    {label:'Produtos cadastrados',value:products.length,icon:Boxes},
    {label:'Produtos ativos',value:active,icon:PackageCheck},
    {label:'Produtos ocultos',value:inactive,icon:PackageX},
    {label:'Categorias',value:categories.length,icon:Tags},
    {label:'Pedidos registrados',value:count(metrics?.ordersTotal),icon:ShoppingBag},
    {label:'Estoque físico',value:physicalUnits,icon:Boxes},
    {label:'Reservado',value:-reservedUnits,icon:PackageOpen},
    {label:'Disponível',value:physicalUnits-reservedUnits,icon:PackageCheck},
  ].filter(card=>hasPhysicalStock || !['Estoque físico','Reservado','Disponível'].includes(card.label));

  const readinessState=getStoreReadiness(settings,categories,products,deliveryZones);
  const {steps:readiness,readyCount,total,percent:readinessPercent,launchReady}=readinessState;


  return <>
    <div className="admin-page-title"><div><span className="eyebrow">VISÃO GERAL</span><h1>{segmentPresentation?segment.adminTitle:'Painel do estabelecimento'}</h1><p>{serviceFirst?`Acesse primeiro as rotinas de ${segment.id==='personal'?'alunos e atendimentos':segment.id==='nutrition'?'clientes e consultas':'campanhas e conteúdo'} e mantenha o catálogo comercial organizado.`:segmentPresentation?'Seu catálogo, pedidos e recebimentos em um só lugar. Organize a operação e acompanhe cada venda.':'Acompanhe a operação e deixe o cardápio pronto para receber pedidos.'}</p></div><a className="secondary-button" href={publicStorefrontPath(settings.slug)} target="_blank" rel="noreferrer"><Eye size={17}/>Abrir loja <ArrowUpRight size={16}/></a></div>


    <AdminRoutineActions key={settings.id} business={business}/>

    {showCommerce&&<section className="admin-card dashboard-today-card" aria-labelledby="dashboard-today-title">
      <div className="dashboard-today-card__header"><div><span className="eyebrow">CAIXA E OPERAÇÃO</span><h2 id="dashboard-today-title">O que importa hoje</h2><InfoHint>Comece pelo faturamento, recebimentos e pendências antes de entrar no catálogo.</InfoHint></div><div className="dashboard-metrics-actions"><span className="dashboard-today-card__date"><CalendarDays size={15}/>{storeDateLabel(new Date(),timezone)} · horário da loja</span><button type="button" className="secondary-button compact-button" disabled={metricsLoading} onClick={()=>{setMetricRetry((value)=>value+1);void reloadAdmin();}}>Atualizar indicadores</button></div></div>
      {metricsError&&<div role="alert" className="dashboard-metrics-error"><strong>Indicadores de pedidos e recebimentos indisponíveis</strong><p>{metricsError}</p><button type="button" className="secondary-button" onClick={()=>setMetricRetry((value)=>value+1)}>Tentar novamente</button></div>}
      {metricsLoading&&<p role="status">Consultando indicadores do servidor…</p>}
      <div className="dashboard-today-grid" aria-busy={metricsLoading}>
        <Link to="/admin/financeiro" className="dashboard-today-metric"><span className="dashboard-today-metric__icon is-green"><CircleDollarSign size={17}/></span><span><small>Recebido hoje</small><strong>{amount(metrics?.receivedToday)}</strong><em>{metricCaption(`${metrics?.receivedTodayCount ?? 0} pedido(s) recebido(s)`)}</em></span><ArrowUpRight size={15}/></Link>
        <Link to="/admin/pedidos?queue=payment" className={`dashboard-today-metric ${metrics?.pendingPayments?'is-attention':''}`}><span className="dashboard-today-metric__icon is-yellow"><CircleDollarSign size={17}/></span><span><small>A receber</small><strong>{amount(metrics?.pendingAmount)}</strong><em>{metricCaption(`${metrics?.pendingPayments ?? 0} aguardando conferência`)}</em></span><ArrowUpRight size={15}/></Link>
        <Link to="/admin/pedidos?queue=payment" className={`dashboard-today-metric ${metrics?.receiptsToReview?'is-attention':''}`}><span className="dashboard-today-metric__icon is-purple"><MessageCircle size={17}/></span><span><small>Comprovantes a conferir</small><strong>{amount(metrics?.receiptsToReviewAmount)}</strong><em>{metricCaption(`${metrics?.receiptsToReview ?? 0} informado(s) pelo cliente`)}</em></span><ArrowUpRight size={15}/></Link>
        <Link to="/admin/pedidos?queue=fulfillment" className="dashboard-today-metric"><span className="dashboard-today-metric__icon is-orange"><ShoppingBag size={17}/></span><span><small>Pedidos novos</small><strong>{count(metrics?.ordersToday)}</strong><em>{metricCaption(`${metrics?.processingOrders ?? 0} em processamento`)}</em></span><ArrowUpRight size={15}/></Link>
        <Link to="/admin/pedidos?queue=scheduled" className="dashboard-today-metric"><span className="dashboard-today-metric__icon is-purple"><CalendarDays size={17}/></span><span><small>Agendados hoje</small><strong>{count(metrics?.scheduledToday)}</strong><em>{metricCaption('encomendas programadas')}</em></span><ArrowUpRight size={15}/></Link>
        {hasPhysicalStock&&<Link to="/admin/estoque" className={`dashboard-today-metric ${lowStockProducts.length?'is-attention':''}`}><span className="dashboard-today-metric__icon is-red"><PackageOpen size={17}/></span><span><small>Estoque baixo</small><strong>{lowStockProducts.length}</strong><em>{lowStockProducts.length?'itens para revisar':'tudo sob controle'}</em></span><ArrowUpRight size={15}/></Link>}
      </div>
    </section>}

    {showCommerce?<details open={!launchReady} className="admin-card dashboard-readiness-details"><summary>Configuração da loja{!launchReady ? ' · há pendências' : ' · vitrine operacional'}</summary><section className={`store-readiness ${launchReady?'is-ready':''}`}><div className="store-readiness__heading"><div><span className="eyebrow">PRONTO PARA VENDER</span><h2>{launchReady?'Sua vitrine está operacional':'Finalize a configuração comercial'}</h2><p>{launchReady?'Os itens essenciais estão configurados. Faça um pedido de teste antes de divulgar o link.':'Conclua os pontos abaixo para evitar que um cliente chegue a uma vitrine incompleta.'}</p><Link to="/admin/primeiros-passos" className="text-link">Abrir roteiro de implantação →</Link></div><div className="store-readiness__score"><Rocket size={22}/><strong>{readinessPercent}%</strong><span>{readyCount}/{total} itens</span></div></div><div className="progress-track store-readiness__progress"><div style={{width:`${readinessPercent}%`}}/></div><div className="store-readiness-list">{readiness.map((item)=><Link to={item.to} key={item.key} className={item.ready?'is-done':''}>{item.ready?<CheckCircle2 size={19}/>:<Circle size={19}/>}<div><strong>{item.label}</strong><span>{item.ready?'Configurado':item.help}</span></div><ArrowUpRight size={16}/></Link>)}</div></section></details>:null}

    {showCommerce&&<details className="admin-card dashboard-indicators"><summary>Mais indicadores do catálogo e estoque</summary><div className="stat-grid">{cards.map(({label,value,icon:Icon})=><article className="stat-card" key={label}><div className="stat-icon"><Icon size={20}/></div><span>{label}</span><strong>{value}</strong></article>)}</div></details>}

    <div className={`dashboard-grid ${showCommerce?'':'dashboard-grid--single'}`}>{showCommerce&&<section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">PLANO {planUsage.plan.name.toUpperCase()}</span><h2>Uso do catálogo</h2></div><span>{active}/{limit??'∞'} ativos</span></div>{limit!=null&&<div className="progress-track"><div style={{width:`${usage}%`}}/></div>}<p>{limit==null?'Seu plano não possui limite de produtos ativos.':planUsage.canActivateProduct?`Você ainda pode publicar ${Math.max(0,limit-active)} produto(s). Cadastros ocultos não entram no limite.`:'O limite de produtos ativos deste plano foi atingido. Você pode continuar cadastrando itens ocultos ou desativar um produto para publicar outro.'}</p><div className="dashboard-plan-links"><Link to="/admin/produtos" className="text-link">Gerenciar produtos →</Link><Link to="/admin/plano" className="text-link">Ver plano e vantagens →</Link></div></section>}<section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">IDENTIDADE</span><h2>Sua loja</h2></div><ImageWithFallback className="dashboard-store-logo" src={logoUrl} fallbackSrc={segmentPresentation?'/assets/placeholder-catalog.svg':undefined} alt="Logo da loja"/></div><div className="store-data-list"><div><span>Nome</span><strong>{settings.name}</strong></div><div><span>WhatsApp</span><strong>{settings.whatsapp||'Não informado'}</strong></div><div><span>Localização</span><strong>{settings.city} · {settings.state}</strong></div></div><Link to="/admin/configuracoes" className="text-link">Editar configurações →</Link></section></div>


  </>;
}
