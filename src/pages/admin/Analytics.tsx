import './admin-clarity.css';
import { InfoHint } from '../../components/ui/InfoHint';
import { Activity, BarChart3, CreditCard, Eye, MapPin, PackageCheck, ShieldCheck, ShoppingBag, ShoppingCart, Truck } from 'lucide-react';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { ErrorState, LoadingState } from '../../components/ui/AsyncState';
import { useStore } from '../../contexts/StoreContext';
import { loadAnalyticsReport } from '../../services/analyticsApi';
import type { AnalyticsReport, Order, PaymentMethod } from '../../types';
import { currency } from '../../utils/format';
import { planHasFeature } from '../../utils/plan';

const paymentLabel: Record<PaymentMethod,string> = { confirm:'Na confirmação', pix:'PIX', card:'Cartão', cash:'Dinheiro' };
const dayName = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

const countBy = <T,>(items:T[], key:(item:T)=>string) => items.reduce<Record<string,number>>((acc,item)=>{
  const value=key(item)||'Não informado'; acc[value]=(acc[value]||0)+1; return acc;
},{});
const sortedEntries = (record:Record<string,number>) => Object.entries(record).sort((a,b)=>b[1]-a[1]);

function Distribution({title,icon:Icon,data}:{title:string;icon:typeof CreditCard;data:[string,number][]}){
  const max=Math.max(1,...data.map(([,value])=>value));
  const visibleData=data.slice(0,8);
  const [selectedLabel,setSelectedLabel]=useState<string|null>(visibleData[0]?.[0]||null);
  const selected=visibleData.find(([label])=>label===selectedLabel)||visibleData[0];

  return <section className="admin-card analytics-distribution"><div className="admin-card__header"><div><span className="eyebrow">DISTRIBUIÇÃO</span><h2>{title}</h2></div><Icon size={21}/></div><div className="analytics-bars">{visibleData.length?visibleData.map(([label,value])=><button type="button" className={`analytics-bar-row${label===selected?.[0]?' is-selected':''}`} aria-pressed={label===selected?.[0]} key={label} onClick={()=>setSelectedLabel(label)}><span className="analytics-bar-row__heading"><span>{label}</span><strong>{value}</strong></span><span className="analytics-track"><span style={{width:`${Math.max(4,(value/max)*100)}%`}}/></span></button>):<p className="analytics-empty">Ainda não há dados suficientes.</p>}</div>{selected&&<div className="analytics-selection-note"><span>Selecionado</span><strong>{selected[0]}</strong><b>{selected[1]} ocorrência{selected[1]===1?'':'s'}</b></div>}</section>;
}

function OrderRhythmChart({data}:{data:[string,number][]}){
  const max=Math.max(1,...data.map(([,value])=>value));
  const peakValue=Math.max(0,...data.map(([,value])=>value));
  const peakLabel=data.find(([,value])=>value===peakValue)?.[0]||'—';
  const chartBottom=204;
  const chartHeight=178;
  const chartDescription=data.map(([label,value])=>`${label}: ${value} pedido${value===1?'':'s'}`).join('; ');
  const [selectedLabel,setSelectedLabel]=useState<string|null>(peakLabel==='—'?null:peakLabel);
  const selected=data.find(([label])=>label===selectedLabel);
  const selectBar=(label:string)=>setSelectedLabel(label);
  const handleBarKey=(event:KeyboardEvent<SVGRectElement>,label:string)=>{
    if(event.key==='Enter'||event.key===' '){event.preventDefault();selectBar(label);}
  };

  return <section className="admin-card analytics-chart-card"><div className="admin-card__header"><div><span className="eyebrow">RITMO DE PEDIDOS</span><h2>Pedidos por dia da semana</h2><InfoHint label="Sobre o ritmo de pedidos">Dias com maior movimento no histórico operacional carregado. Este histórico não acompanha o filtro de período do funil.</InfoHint></div><BarChart3 size={21}/></div><div className="analytics-chart-wrap"><svg className="analytics-chart-svg" viewBox="0 0 700 270" role="group" aria-labelledby="analytics-chart-title analytics-chart-desc"><title id="analytics-chart-title">Pedidos por dia da semana</title><desc id="analytics-chart-desc">{chartDescription||'Ainda não há pedidos registrados.'}</desc>{[0,.5,1].map((ratio)=><g key={ratio}><line className="analytics-chart-gridline" x1="34" x2="668" y1={chartBottom-(chartHeight*ratio)} y2={chartBottom-(chartHeight*ratio)}/><text className="analytics-chart-axis-label" x="22" y={chartBottom-(chartHeight*ratio)+4} textAnchor="end">{Math.round(max*ratio)}</text></g>)}{data.map(([label,value],index)=>{const barHeight=value?Math.max(8,(value/max)*chartHeight):0;const x=38+(index*90);const y=chartBottom-barHeight;return <g key={`${label}-${index}`}><rect className={`analytics-chart-bar${label===peakLabel&&peakValue>0?' is-peak':''}${label===selectedLabel?' is-selected':''}`} x={x} y={y} width="54" height={barHeight} rx="8" tabIndex={0} role="button" aria-label={`${label}: ${value} pedido${value===1?'':'s'}`} aria-pressed={label===selectedLabel} onClick={()=>selectBar(label)} onKeyDown={(event)=>handleBarKey(event,label)}><title>{label}: {value} pedido{value===1?'':'s'}</title></rect>{value>0&&<text className="analytics-chart-value" x={x+27} y={y-8} textAnchor="middle">{value}</text>}<text className="analytics-chart-label" x={x+27} y="227" textAnchor="middle">{label}</text></g>})}</svg><ol className="sr-only">{data.map(([label,value])=><li key={`summary-${label}`}>{label}: {value} pedido{value===1?'':'s'}</li>)}</ol></div><div className="analytics-chart-insight"><BarChart3 size={16}/><span>{selected?<><strong>{selected[0]}</strong> selecionado: {selected[1]} pedido{selected[1]===1?'':'s'}.</>:<>Maior movimento: <strong>{peakLabel}</strong> ({peakValue} pedido{peakValue===1?'':'s'}).</>}</span></div></section>;
}

const emptyReport = (): AnalyticsReport => ({
  from:'',to:'',storefrontSessions:0,productViews:0,productViewSessions:0,addToCartSessions:0,checkoutSessions:0,orderSessions:0,orders:0,whatsappClicks:0,
  conversionRate:0,cartAbandonmentRate:0,checkoutAbandonmentRate:0,whatsappRate:0,revenue:0,averageTicket:0,topProducts:[],viewedNotSold:[],
});

export default function Analytics(){
  const {orders,settings,loading,error,reloadAdmin,planUsage}=useStore();
  const [rangeDays,setRangeDays]=useState(30);
  const [report,setReport]=useState<AnalyticsReport>(emptyReport);
  const [reportLoading,setReportLoading]=useState(true);
  const [reportError,setReportError]=useState('');

  useEffect(()=>{
    if(!planHasFeature(planUsage.plan,'analytics')||!settings.id)return;
    let active=true;
    const to=new Date();
    const from=new Date(to.getTime()-rangeDays*86_400_000);
    setReportLoading(true);setReportError('');
    void loadAnalyticsReport(settings.id,from.toISOString(),to.toISOString())
      .then((value)=>{if(active)setReport(value);})
      .catch((analyticsError:unknown)=>{if(!active)return;const message=analyticsError instanceof Error?analyticsError.message:'';const missingRpc=/get_store_analytics_v[0-9]+|schema cache|PGRST202/i.test(message);setReportError(missingRpc?'O módulo de Analytics de conversão ainda não está ativo no banco desta instalação.':'Não foi possível carregar o funil de conversão agora. Tente novamente em alguns instantes.');})
      .finally(()=>{if(active)setReportLoading(false);});
    return ()=>{active=false;};
  },[settings.id,planUsage.plan,rangeDays]);

  if(!planHasFeature(planUsage.plan,'analytics'))return <section className="admin-card analytics-plan-gate"><div><span className="eyebrow">RECURSO DO PLANO</span><h1>Análises comerciais</h1><p>O plano {planUsage.plan.name} não inclui relatórios. Os pedidos continuam disponíveis normalmente; faça upgrade para liberar os indicadores comerciais.</p></div><Link className="primary-button" to="/admin/plano">Ver meu plano</Link></section>;
  if(loading)return <LoadingState label="Carregando análises..."/>;
  if(error)return <ErrorState message={error} onRetry={()=>void reloadAdmin()}/>;

  const valid=orders.filter((order)=>order.status!=='cancelled');
  const operationalRevenue=valid.reduce((sum,order)=>sum+Number(order.total||0),0);
  const operationalAverage=valid.length?operationalRevenue/valid.length:0;
  const sent=valid.filter((order)=>Boolean(order.whatsappClickedAt)).length;
  const payment=sortedEntries(countBy(valid,(order)=>paymentLabel[order.paymentMethod]));
  const fulfillment=sortedEntries(countBy(valid,(order)=>order.deliveryType==='delivery'?'Entrega':'Retirada'));
  const neighborhoods=sortedEntries(countBy(valid.filter((order)=>order.deliveryType==='delivery'),(order)=>order.deliveryNeighborhood||order.deliveryZoneName||'Não informado'));
  const weekdays=dayName.map((name,index)=>[name,valid.filter((order)=>new Date(order.createdAt).getDay()===index).length] as [string,number]);
  const hours=sortedEntries(countBy(valid,(order:Order)=>`${String(new Date(order.createdAt).getHours()).padStart(2,'0')}h`)).sort((a,b)=>a[0].localeCompare(b[0]));

  const funnel=[
    {label:'Sessões na vitrine',value:report.storefrontSessions,detail:'sessões de navegação',icon:Eye},
    {label:'Viram produtos',value:report.productViewSessions,detail:`${report.productViews} visualizações`,icon:PackageCheck},
    {label:'Adicionaram ao carrinho',value:report.addToCartSessions,detail:`${report.cartAbandonmentRate.toFixed(1)}% abandono`,icon:ShoppingCart},
    {label:'Iniciaram checkout',value:report.checkoutSessions,detail:`${report.checkoutAbandonmentRate.toFixed(1)}% abandono`,icon:Activity},
    {label:'Sessões com pedido',value:report.orderSessions,detail:`${report.orders} pedidos registrados`,icon:ShoppingBag},
    {label:'Abriram WhatsApp',value:report.whatsappClicks,detail:`${report.whatsappRate.toFixed(1)}% dos pedidos`,icon:Truck},
  ];

  return <>
    <div className="admin-page-title analytics-title"><div><span className="eyebrow">ANÁLISES</span><h1>Desempenho comercial</h1><InfoHint label="Sobre Desempenho comercial">Funil de conversão e indicadores operacionais para entender a jornada de compra.</InfoHint></div><div className="analytics-title-actions"><select aria-label="Período dos indicadores" value={rangeDays} onChange={(e)=>setRangeDays(Number(e.target.value))}><option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option></select></div></div>

    <details className="analytics-privacy-note"><summary><ShieldCheck size={17}/>Privacidade das métricas</summary><p>O funil usa um identificador aleatório de navegação e eventos de uso da vitrine. Essa telemetria não recebe nome, telefone, e-mail, endereço, mensagem do cartão ou observações. Os dados do pedido continuam armazenados normalmente na área de Pedidos.</p></details>

    {reportLoading?<LoadingState label="Calculando funil de conversão..."/>:reportError?<section className="admin-card analytics-rollout-warning"><strong>Analytics de conversão ainda não disponível</strong><p>{reportError}</p><span>Os indicadores baseados em pedidos abaixo continuam funcionando. O funil volta a aparecer assim que o módulo de Analytics do banco estiver ativo.</span></section>:<>
      <div className="analytics-commercial-grid"><article className="admin-card analytics-commercial-kpi"><span>Valor dos pedidos <InfoHint label="Sobre o valor dos pedidos">Soma dos pedidos não cancelados no período. Não equivale ao dinheiro recebido; confira recebimentos no Financeiro.</InfoHint></span><strong>{currency.format(report.revenue)}</strong></article><article className="admin-card analytics-commercial-kpi"><span>Ticket médio <InfoHint label="Sobre o ticket médio">Valor médio dos pedidos registrados no período.</InfoHint></span><strong>{currency.format(report.averageTicket)}</strong></article><article className="admin-card analytics-commercial-kpi"><span>Conversão vitrine → pedido <InfoHint label="Como a conversão é calculada">Sessões que geraram pedido ÷ sessões da vitrine × 100. Uma sessão pode gerar vários pedidos. Pedido criado não comprova pagamento. Compare cada loja com seu próprio histórico e com períodos de tráfego semelhante.</InfoHint></span><strong>{report.storefrontSessions?`${report.conversionRate.toFixed(1)}%`:"—"}</strong><small>{report.storefrontSessions?`${report.orderSessions} de ${report.storefrontSessions} sessões geraram pedido`:"Sem sessões registradas no período"}</small></article></div>
      <details className="admin-card admin-secondary-details"><summary>Funil de compra</summary>
      <div className="analytics-funnel-grid">{funnel.map(({label,value,detail,icon:Icon})=><article className="admin-card analytics-funnel-stat" key={label}><span><Icon size={18}/></span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>)}</div>
      </details>
      <details className="admin-card conversion-actions"><summary>Como vender mais <InfoHint label="Como usar as sugestões de conversão">Sugestões para testar, não um diagnóstico automático. O funil reúne eventos do período e não comprova a causa de abandono. Altere uma coisa por vez e acompanhe conversão, pedidos pagos e cancelamentos. Não há uma meta única para todos os segmentos.</InfoHint></summary>
        <div className="conversion-actions__grid">
          <Link to="/admin/produtos"><strong>1. Facilite a escolha</strong><span>Revise foto, nome, preço e descrição dos itens mais vistos.</span><b>Revisar catálogo →</b></Link>
          <Link to="/admin/configuracoes"><strong>2. Reduza dúvidas na compra</strong><span>Deixe pagamentos, pedido mínimo e horários claros antes de finalizar.</span><b>Revisar configurações →</b></Link>
          <Link to="/admin/pedidos"><strong>3. Acompanhe até o pagamento</strong><span>Confira pedidos pendentes e cancelados para identificar dificuldades.</span><b>Abrir pedidos →</b></Link>
        </div>
        <details className="admin-secondary-details"><summary>Adaptar ao meu segmento</summary><ul><li>Alimentação e comércio: destaque itens prontos e de compra frequente.</li><li>Floricultura e locações: explique personalização, prazo e entrega.</li><li>Serviços, Fitness e Nutrição: deixe claros responsável, duração, agenda e o que a compra inclui.</li><li>Conteúdos digitais: mostre formato, acesso e prazo de liberação.</li></ul></details>
      </details>
      <details className="admin-card admin-secondary-details"><summary>Produtos e oportunidades</summary><div className="analytics-product-grid"><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">INTERESSE × VENDA</span><h2>Produtos com maior interesse</h2></div><Eye size={21}/></div>{report.topProducts.length?<div className="analytics-product-list">{report.topProducts.map((product)=><div key={product.productId}><div><strong>{product.name}</strong><span>{product.views} visualizações · {product.addToCartSessions} sessões no carrinho</span></div><b>{product.soldUnits} vendidos</b></div>)}</div>:<p className="analytics-empty">Os dados aparecerão conforme clientes navegarem na vitrine.</p>}</section><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">OPORTUNIDADE</span><h2>Vistos, mas ainda não vendidos</h2></div><BarChart3 size={21}/></div>{report.viewedNotSold.length?<div className="analytics-product-list">{report.viewedNotSold.map((product)=><div key={product.productId}><div><strong>{product.name}</strong><span>{product.views} visualizações · {product.addToCartSessions} sessões no carrinho</span></div><b>0 vendidos</b></div>)}</div>:<p className="analytics-empty">Nenhuma oportunidade relevante detectada neste período.</p>}</section></div></details>
    </>}

    <details className="admin-card analytics-operational-details"><summary>Histórico operacional e distribuições <InfoHint label="Sobre o histórico operacional">Usa os pedidos carregados no painel, independentemente do período escolhido acima. Expanda para consultar dias, horários e formas de pagamento.</InfoHint></summary>
    <OrderRhythmChart data={weekdays}/>
    <div className="analytics-stat-grid"><article className="admin-card analytics-stat"><span><ShoppingBag size={19}/></span><div><small>Pedidos no painel</small><strong>{valid.length}</strong><p>histórico operacional carregado</p></div></article><article className="admin-card analytics-stat"><span><PackageCheck size={19}/></span><div><small>Valor dos pedidos no histórico</small><strong>{currency.format(operationalRevenue)}</strong><p>histórico disponível no painel</p></div></article><article className="admin-card analytics-stat"><span><BarChart3 size={19}/></span><div><small>Ticket médio histórico</small><strong>{currency.format(operationalAverage)}</strong><p>pedidos carregados</p></div></article><article className="admin-card analytics-stat"><span><Truck size={19}/></span><div><small>WhatsApp histórico</small><strong>{sent}</strong><p>{valid.length?`${Math.round((sent/valid.length)*100)}% dos pedidos`:'sem pedidos'}</p></div></article></div>
    <div className="analytics-grid"><Distribution title="Formas de pagamento" icon={CreditCard} data={payment}/><Distribution title="Entrega × retirada" icon={Truck} data={fulfillment}/><Distribution title="Bairros / zonas" icon={MapPin} data={neighborhoods}/><Distribution title="Horários dos pedidos" icon={ShoppingBag} data={hours}/></div>
    </details>
  </>;
}
