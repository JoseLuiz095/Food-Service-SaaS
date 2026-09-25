import { Activity, BarChart3, CreditCard, Eye, MapPin, PackageCheck, ShieldCheck, ShoppingBag, ShoppingCart, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
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
  return <section className="admin-card analytics-distribution"><div className="admin-card__header"><div><span className="eyebrow">DISTRIBUIÇÃO</span><h2>{title}</h2></div><Icon size={21}/></div><div className="analytics-bars">{data.length?data.slice(0,8).map(([label,value])=><div key={label}><div><span>{label}</span><strong>{value}</strong></div><div className="analytics-track"><span style={{width:`${Math.max(4,(value/max)*100)}%`}}/></div></div>):<p className="analytics-empty">Ainda não há dados suficientes.</p>}</div></section>;
}

function OrderRhythmChart({data}:{data:[string,number][]}){
  const max=Math.max(1,...data.map(([,value])=>value));
  const peakValue=Math.max(0,...data.map(([,value])=>value));
  const peakLabel=data.find(([,value])=>value===peakValue)?.[0]||'—';
  const chartBottom=204;
  const chartHeight=178;
  const chartDescription=data.map(([label,value])=>`${label}: ${value} pedido${value===1?'':'s'}`).join('; ');

  return <section className="admin-card analytics-chart-card"><div className="admin-card__header"><div><span className="eyebrow">RITMO DE PEDIDOS</span><h2>Pedidos por dia da semana</h2><p className="analytics-chart-helper">Identifique rapidamente os dias com maior movimento no histórico carregado.</p></div><BarChart3 size={21}/></div><div className="analytics-chart-wrap"><svg className="analytics-chart-svg" viewBox="0 0 700 270" role="img" aria-labelledby="analytics-chart-title analytics-chart-desc"><title id="analytics-chart-title">Pedidos por dia da semana</title><desc id="analytics-chart-desc">{chartDescription||'Ainda não há pedidos registrados.'}</desc>{[0,.5,1].map((ratio)=><g key={ratio}><line className="analytics-chart-gridline" x1="34" x2="668" y1={chartBottom-(chartHeight*ratio)} y2={chartBottom-(chartHeight*ratio)}/><text className="analytics-chart-axis-label" x="22" y={chartBottom-(chartHeight*ratio)+4} textAnchor="end">{Math.round(max*ratio)}</text></g>)}{data.map(([label,value],index)=>{const barHeight=value?Math.max(8,(value/max)*chartHeight):0;const x=38+(index*90);const y=chartBottom-barHeight;return <g key={`${label}-${index}`}><rect className={`analytics-chart-bar${label===peakLabel&&peakValue>0?' is-peak':''}`} x={x} y={y} width="54" height={barHeight} rx="8"><title>{label}: {value} pedido{value===1?'':'s'}</title></rect>{value>0&&<text className="analytics-chart-value" x={x+27} y={y-8} textAnchor="middle">{value}</text>}<text className="analytics-chart-label" x={x+27} y="227" textAnchor="middle">{label}</text></g>})}</svg><ol className="sr-only">{data.map(([label,value])=><li key={`summary-${label}`}>{label}: {value} pedido{value===1?'':'s'}</li>)}</ol></div><div className="analytics-chart-insight"><BarChart3 size={16}/><span>Maior movimento: <strong>{peakLabel}</strong> ({peakValue} pedido{peakValue===1?'':'s'}).</span></div></section>;
}

function WeekdayOrdersChart({data}:{data:[string,number][]}){
  const chartWidth=680;
  const baseline=196;
  const chartHeight=136;
  const groupWidth=chartWidth/data.length;
  const barWidth=Math.min(56,groupWidth-24);
  const max=Math.max(1,...data.map(([,value])=>value));
  const total=data.reduce((sum,[,value])=>sum+value,0);

  return <section className="admin-card analytics-chart-card" aria-labelledby="food-analytics-weekday-title">
    <div className="admin-card__header"><div><span className="eyebrow">RITMO DE VENDAS</span><h2 id="food-analytics-weekday-title">Pedidos por dia da semana</h2></div><BarChart3 size={21}/></div>
    <p className="analytics-chart__intro">Identifique os dias mais fortes para planejar produção, equipe e entregas.</p>
    <div className="analytics-chart__viewport">
      <svg className="analytics-chart" viewBox={`0 0 ${chartWidth} 236`} role="img" aria-labelledby="food-analytics-weekday-svg-title food-analytics-weekday-svg-description" focusable="false">
        <title id="food-analytics-weekday-svg-title">Pedidos por dia da semana</title>
        <desc id="food-analytics-weekday-svg-description">Distribuição de {total} pedidos não cancelados entre os dias da semana.</desc>
        {[0,1,2,3].map((line)=><line key={line} className="analytics-chart__gridline" x1="30" x2={chartWidth-18} y1={baseline-(chartHeight/3)*line} y2={baseline-(chartHeight/3)*line}/>)}
        {data.map(([label,value],index)=>{
          const height=value?Math.max(5,(value/max)*chartHeight):0;
          const x=32+index*groupWidth+(groupWidth-barWidth)/2;
          const y=baseline-height;
          return <g key={label}><rect className="analytics-chart__bar" x={x} y={y} width={barWidth} height={height} rx="8" aria-hidden="true"/><text className="analytics-chart__value" x={x+barWidth/2} y={value?y-8:baseline-8} textAnchor="middle">{value}</text><text className="analytics-chart__label" x={x+barWidth/2} y="222" textAnchor="middle">{label}</text></g>;
        })}
      </svg>
    </div>
    <ul className="analytics-chart__sr-only" aria-label="Dados do gráfico de pedidos por dia da semana">
      {data.map(([label,value])=><li key={label}>{label}: {value} {value===1?'pedido':'pedidos'}</li>)}
    </ul>
  </section>;
}

const emptyReport = (): AnalyticsReport => ({
  from:'',to:'',storefrontSessions:0,productViews:0,productViewSessions:0,addToCartSessions:0,checkoutSessions:0,orderSessions:0,orders:0,whatsappClicks:0,
  conversionRate:0,cartAbandonmentRate:0,checkoutAbandonmentRate:0,whatsappRate:0,revenue:0,averageTicket:0,topProducts:[],viewedNotSold:[],
});

export default function Analytics(){
  const {orders,settings,loading,error,reloadAdmin,planUsage}=useStore();
  const [rangeDays,setRangeDays]=useState(30);
  const [report,setReport]=useState<AnalyticsReport>(emptyReport);
  const [reportLoading,setReportLoading]=useState(false);
  const [reportError,setReportError]=useState('');

  useEffect(()=>{
    if(!planHasFeature(planUsage.plan,'analytics')||!settings.id)return;
    const to=new Date();
    const from=new Date(to.getTime()-rangeDays*86_400_000);
    setReportLoading(true);setReportError('');
    void loadAnalyticsReport(settings.id,from.toISOString(),to.toISOString())
      .then(setReport)
      .catch((analyticsError:unknown)=>{const message=analyticsError instanceof Error?analyticsError.message:'';const missingRpc=/get_store_analytics_v3|schema cache|PGRST202/i.test(message);setReportError(missingRpc?'O módulo de Analytics de conversão ainda não está ativo no banco desta instalação.':'Não foi possível carregar o funil de conversão agora. Tente novamente em alguns instantes.');})
      .finally(()=>setReportLoading(false));
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
    {label:'Pedidos',value:report.orders,detail:`${report.conversionRate.toFixed(1)}% conversão`,icon:ShoppingBag},
    {label:'Abriram WhatsApp',value:report.whatsappClicks,detail:`${report.whatsappRate.toFixed(1)}% dos pedidos`,icon:Truck},
  ];

  return <>
    <div className="admin-page-title analytics-title"><div><span className="eyebrow">ANÁLISES</span><h1>Desempenho comercial</h1><p>Funil de conversão e indicadores operacionais para entender a jornada de compra.</p></div><div className="analytics-title-actions"><select value={rangeDays} onChange={(e)=>setRangeDays(Number(e.target.value))}><option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option></select></div></div>

    <details className="analytics-privacy-note"><summary><ShieldCheck size={17}/>Privacidade das métricas</summary><p>O funil usa um identificador aleatório de navegação e eventos de uso da vitrine. Essa telemetria não recebe nome, telefone, e-mail, endereço, mensagem do cartão ou observações. Os dados do pedido continuam armazenados normalmente na área de Pedidos.</p></details>

    {reportLoading?<LoadingState label="Calculando funil de conversão..."/>:reportError?<section className="admin-card analytics-rollout-warning"><strong>Analytics de conversão ainda não disponível</strong><p>{reportError}</p><span>Os indicadores baseados em pedidos abaixo continuam funcionando. O funil volta a aparecer assim que o módulo de Analytics do banco estiver ativo.</span></section>:<>
      <div className="analytics-funnel-grid">{funnel.map(({label,value,detail,icon:Icon})=><article className="admin-card analytics-funnel-stat" key={label}><span><Icon size={18}/></span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>)}</div>
      <div className="analytics-commercial-grid"><article className="admin-card analytics-commercial-kpi"><span>Receita do período</span><strong>{currency.format(report.revenue)}</strong><small>Pedidos não cancelados dentro do período selecionado.</small></article><article className="admin-card analytics-commercial-kpi"><span>Ticket médio</span><strong>{currency.format(report.averageTicket)}</strong><small>Valor médio dos pedidos registrados no período.</small></article><article className="admin-card analytics-commercial-kpi"><span>Conversão vitrine → pedido</span><strong>{report.conversionRate.toFixed(1)}%</strong><small>Sessões que geraram pedido ÷ sessões da vitrine.</small></article></div>
      <div className="analytics-product-grid"><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">INTERESSE × VENDA</span><h2>Produtos com maior interesse</h2></div><Eye size={21}/></div>{report.topProducts.length?<div className="analytics-product-list">{report.topProducts.map((product)=><div key={product.productId}><div><strong>{product.name}</strong><span>{product.views} visualizações · {product.addToCartSessions} sessões no carrinho</span></div><b>{product.soldUnits} vendidos</b></div>)}</div>:<p className="analytics-empty">Os dados aparecerão conforme clientes navegarem na vitrine.</p>}</section><section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">OPORTUNIDADE</span><h2>Vistos, mas ainda não vendidos</h2></div><BarChart3 size={21}/></div>{report.viewedNotSold.length?<div className="analytics-product-list">{report.viewedNotSold.map((product)=><div key={product.productId}><div><strong>{product.name}</strong><span>{product.views} visualizações · {product.addToCartSessions} sessões no carrinho</span></div><b>0 vendidos</b></div>)}</div>:<p className="analytics-empty">Nenhuma oportunidade relevante detectada neste período.</p>}</section></div>
    </>}

    <OrderRhythmChart data={weekdays}/>
    <div className="analytics-stat-grid"><article className="admin-card analytics-stat"><span><ShoppingBag size={19}/></span><div><small>Pedidos no painel</small><strong>{valid.length}</strong><p>histórico operacional carregado</p></div></article><article className="admin-card analytics-stat"><span><PackageCheck size={19}/></span><div><small>Receita registrada</small><strong>{currency.format(operationalRevenue)}</strong><p>histórico disponível no painel</p></div></article><article className="admin-card analytics-stat"><span><BarChart3 size={19}/></span><div><small>Ticket médio histórico</small><strong>{currency.format(operationalAverage)}</strong><p>pedidos carregados</p></div></article><article className="admin-card analytics-stat"><span><Truck size={19}/></span><div><small>WhatsApp histórico</small><strong>{sent}</strong><p>{valid.length?`${Math.round((sent/valid.length)*100)}% dos pedidos`:'sem pedidos'}</p></div></article></div>
    <WeekdayOrdersChart data={weekdays}/>
    <div className="analytics-grid"><Distribution title="Formas de pagamento" icon={CreditCard} data={payment}/><Distribution title="Entrega × retirada" icon={Truck} data={fulfillment}/><Distribution title="Bairros / zonas" icon={MapPin} data={neighborhoods}/><Distribution title="Dias da semana" icon={BarChart3} data={weekdays}/><Distribution title="Horários dos pedidos" icon={ShoppingBag} data={hours}/></div>
  </>;
}
