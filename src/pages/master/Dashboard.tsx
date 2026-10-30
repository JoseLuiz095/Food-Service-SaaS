import { InfoHint } from '../../components/ui/InfoHint';
import { AlertCircle, AlertTriangle, Building2, CalendarClock, CircleDollarSign, Clock3, CreditCard, Gift, PackageX, Power, RefreshCw, Store, TrendingUp, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorState, LoadingState } from '../../components/ui/AsyncState';
import { PLATFORM_BRAND } from '../../lib/brand';
import { DEFAULT_PLATFORM_SETTINGS } from '../../data/platformDefaults';
import { platformApi } from '../../services/platformApi';
import type { PlatformEventLog } from '../../services/interactionTelemetry';
import type { PlatformDashboardStats, PlatformSettings, PlatformStoreSummary, SubscriptionPayment } from '../../types';
import { currency } from '../../utils/format';
import { daysUntilBillingDate } from '../../utils/billingStatus';

const daysUntil=(value?:string)=>value?Math.ceil((new Date(value).getTime()-Date.now())/86_400_000):Number.POSITIVE_INFINITY;
const trialExpired=(value?:string)=>Boolean(value)&&new Date(value as string).getTime()<=Date.now();

export default function MasterDashboard(){
  const[stats,setStats]=useState<PlatformDashboardStats|null>(null);
  const[stores,setStores]=useState<PlatformStoreSummary[]>([]);
  const[settings,setSettings]=useState<PlatformSettings>(DEFAULT_PLATFORM_SETTINGS);
  const[error,setError]=useState('');
  const[payments,setPayments]=useState<SubscriptionPayment[]>([]);
  const[events,setEvents]=useState<PlatformEventLog[]>([]);
  const[paymentsUnavailable,setPaymentsUnavailable]=useState(false);
  const[eventsUnavailable,setEventsUnavailable]=useState(false);
  const seenProofs=useRef<Set<string>|null>(null);
  const load=async()=>{
    setError('');
    try { const [storesResult,platformSettings,paymentRows,eventRows]=await Promise.all([
    platformApi.listStores(),platformApi.getPlatformSettings(),
    platformApi.listSubscriptionPayments().catch(()=>null),platformApi.listPlatformEvents({limit:120}).catch(()=>null),
    ]);setStats(await platformApi.dashboard({stores:storesResult,settings:platformSettings}));setStores(storesResult);setSettings(platformSettings);setPayments(paymentRows||[]);setEvents(eventRows||[]);setPaymentsUnavailable(paymentRows===null);setEventsUnavailable(eventRows===null);
      if(paymentRows){
        const proofs=new Set(paymentRows.filter(payment=>payment.status==='proof_sent').map(payment=>payment.id));
        if(seenProofs.current && [...proofs].some(id=>!seenProofs.current?.has(id)) && typeof Notification!=='undefined' && Notification.permission==='granted')
          try{new Notification('VendeWeb · pagamento para analisar',{body:'Há um novo comprovante aguardando conferência no Admin Master.',icon:'/assets/vendeweb-icon-192.png'})}catch{/* Alguns navegadores exigem notificação via service worker. */}
        seenProofs.current=proofs;
      }}
    catch(e){setError(e instanceof Error?e.message:'Falha ao carregar indicadores.')}
  };
  useEffect(()=>{void load();const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load()},120_000);return()=>window.clearInterval(timer)},[]);

  const trialWarnings=useMemo(()=>stores.filter((store)=>store.planCode==='DEMO'&&store.subscriptionStatus==='trial'&&!trialExpired(store.expiresAt)&&daysUntil(store.expiresAt)<=settings.demoWarningDays).sort((a,b)=>daysUntil(a.expiresAt)-daysUntil(b.expiresAt)),[stores,settings.demoWarningDays]);
  const payingStores=useMemo(()=>stores.filter((store)=>store.planCode!=='DEMO'&&store.subscriptionStatus==='active'&&store.accessStatus==='online'&&store.billingMode!=='complimentary'&&!(store.billingMode==='introductory'&&store.introFirstChargeOn&&store.introFirstChargeOn>new Date().toISOString().slice(0,10))),[stores]);
  const introductoryStores=useMemo(()=>stores.filter(store=>store.billingMode==='introductory'&&store.introFirstChargeOn&&store.introFirstChargeOn>new Date().toISOString().slice(0,10)).sort((a,b)=>(a.introFirstChargeOn||'').localeCompare(b.introFirstChargeOn||'')),[stores]);
  const averageRevenue=payingStores.length?(stats?.monthlyRecurringRevenue||0)/payingStores.length:0;
  const annualRecurringRevenue=(stats?.monthlyRecurringRevenue||0)*12;
  const onboardingPending=useMemo(()=>stores.filter((store)=>store.accessStatus==='online'&&store.activeProductCount===0),[stores]);
  const upcomingBilling=useMemo(()=>stores.filter((store)=>store.planCode!=='DEMO'&&store.subscriptionStatus==='active'&&store.nextDueDate&&(daysUntilBillingDate(store.nextDueDate)??Number.POSITIVE_INFINITY)>=0&&(daysUntilBillingDate(store.nextDueDate)??Number.POSITIVE_INFINITY)<=7).sort((a,b)=>(daysUntilBillingDate(a.nextDueDate)??Number.POSITIVE_INFINITY)-(daysUntilBillingDate(b.nextDueDate)??Number.POSITIVE_INFINITY)),[stores]);
  const planDistribution=useMemo(()=>{
    const counts=new Map<string,number>();
    for(const store of payingStores){const label=store.planName||store.planCode||'Sem plano';counts.set(label,(counts.get(label)||0)+1)}
    return [...counts.entries()].sort((a,b)=>b[1]-a[1]);
  },[payingStores]);
  const pendingPayments=useMemo(()=>payments.filter((payment)=>payment.status==='pending'||payment.status==='proof_sent'),[payments]);
  const pendingPlanChanges=useMemo(()=>pendingPayments.filter((payment)=>payment.paymentIntent==='plan_change'),[pendingPayments]);
  const overdueStores=useMemo(()=>stores.filter((store)=>store.planCode!=='DEMO'&&store.billingMode!=='complimentary'&&store.subscriptionStatus!=='cancelled'&&store.nextDueDate&&(daysUntilBillingDate(store.nextDueDate)??0)<0),[stores]);
  const recentErrors=useMemo(()=>{const since=Date.now()-86_400_000;return events.filter((event)=>event.result==='error'&&new Date(event.createdAt).getTime()>=since)},[events]);

  if(error)return <div role="alert"><ErrorState message={error} onRetry={()=>void load()}/></div>;
  if(!stats)return <div role="status"><LoadingState label="Carregando gestão da plataforma..."/></div>;
  const cards=[
    {label:'Lojas cadastradas',value:stats.storesTotal,icon:Building2},
    {label:'Online',value:stats.storesOnline,icon:Power},
    {label:'Clientes pagantes',value:payingStores.length,icon:UsersRound},
    {label:'Em demonstração',value:stats.storesTrial,icon:Clock3},
    {label:'MRR estimado',value:currency.format(stats.monthlyRecurringRevenue),icon:CircleDollarSign},
    {label:'Ticket mensal médio',value:currency.format(averageRevenue),icon:TrendingUp},
  ];
  return <>
    <div className="admin-page-title"><div><h1>Gestão comercial da {PLATFORM_BRAND}</h1><InfoHint>Acompanhe aquisição, demonstrações, clientes ativos e receita recorrente em uma única visão.</InfoHint></div><div className="master-dashboard-actions"><button type="button" className="secondary-button" onClick={()=>void load()}><RefreshCw size={16}/>Atualizar</button><Link className="primary-button" to="/admin-master/lojas">Gerenciar lojas</Link></div></div>

    <section className="admin-card master-pending-center-r69">
      <div className="admin-card__header"><div><span className="eyebrow">CENTRO DE PENDÊNCIAS</span><h2>O que precisa de atenção agora</h2><InfoHint label="Sobre O que precisa de atenção agora">Ações financeiras, vencimentos e falhas recentes reunidos em um só lugar.</InfoHint></div><AlertCircle size={23}/></div>
      {(paymentsUnavailable||eventsUnavailable)&&<div role="alert" className="master-source-warning"><AlertTriangle size={18}/><p>{paymentsUnavailable?'Não foi possível carregar pagamentos. ':''}{eventsUnavailable?'Não foi possível carregar o histórico de falhas. ':''}Os totais dessas fontes estão indisponíveis. <button type="button" className="secondary-button compact-button" onClick={()=>void load()}>Tentar novamente</button></p></div>}
      <div className="master-pending-grid-r69">
        <Link to="/admin-master/pagamentos"><span className="is-payment"><CreditCard size={18}/></span><div><strong className={paymentsUnavailable?'is-unavailable':undefined}>{paymentsUnavailable?'Indisponível':pendingPayments.length}</strong><small>pagamento(s) aguardando decisão</small></div></Link>
        <Link to="/admin-master/lojas"><span className="is-overdue"><CalendarClock size={18}/></span><div><strong>{overdueStores.length}</strong><small>mensalidade(s) vencida(s)</small></div></Link>
        <Link to="/admin-master/pagamentos"><span className="is-plan"><TrendingUp size={18}/></span><div><strong className={paymentsUnavailable?'is-unavailable':undefined}>{paymentsUnavailable?'Indisponível':pendingPlanChanges.length}</strong><small>alteração(ões) de plano pendente(s)</small></div></Link>
        <Link to="/admin-master/diagnostico"><span className="is-error"><AlertTriangle size={18}/></span><div><strong className={eventsUnavailable?'is-unavailable':undefined}>{eventsUnavailable?'Indisponível':recentErrors.length}</strong><small>falha(s) registrada(s) nas últimas 24h</small></div></Link>
      </div>
    </section>

    <details className="operational-details master-report-details"><summary>Indicadores e relatórios comerciais</summary>
    <div className="stat-grid master-stat-grid">{cards.map(({label,value,icon:Icon})=><article className="stat-card" key={label}><div className="stat-icon"><Icon size={20}/></div><span>{label}</span><strong>{value}</strong></article>)}</div>
    <div className="master-commercial-grid">
      <section className="admin-card master-commercial-summary"><span className="eyebrow">RECEITA RECORRENTE</span><h2>{currency.format(annualRecurringRevenue)} / ano</h2><InfoHint>ARR projetado a partir do MRR atual. Valores de setup não entram nesta projeção.</InfoHint><div><span>MRR atual</span><strong>{currency.format(stats.monthlyRecurringRevenue)}</strong></div><div><span>Clientes pagantes</span><strong>{payingStores.length}</strong></div><div><span>Ticket mensal médio</span><strong>{currency.format(averageRevenue)}</strong></div></section>
      <section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">MIX COMERCIAL</span><h2>Clientes por plano</h2></div><Store size={21}/></div>{planDistribution.length?<div className="master-plan-distribution">{planDistribution.map(([plan,count])=><div key={plan}><span>{plan}</span><strong>{count}</strong></div>)}</div>:<p className="analytics-empty">Ainda não há clientes pagantes ativos.</p>}</section>
    </div>

    </details>

    {trialWarnings.length>0&&<section className="admin-card master-trial-alerts"><div className="admin-card__header"><div><span className="eyebrow">OPORTUNIDADE DE CONVERSÃO</span><h2>Demonstrações próximas do vencimento</h2></div><AlertTriangle size={23}/></div><p>Priorize contato comercial antes do encerramento automático. O aviso considera os {settings.demoWarningDays} dias definidos na plataforma.</p><div className="trial-alert-list">{trialWarnings.map((store)=>{const days=daysUntil(store.expiresAt);return <Link key={store.id} to={`/admin-master/lojas?q=${encodeURIComponent(store.name)}`}><div><strong>{store.name}</strong><span>{store.ownerEmail||'Responsável sem e-mail'} · {store.activeProductCount} produtos ativos</span></div><b>{days===0?'Vence hoje':days===1?'Vence amanhã':`${days} dias`}</b></Link>})}</div></section>}

    {introductoryStores.length>0&&<section className="admin-card master-intro-summary"><div className="admin-card__header"><div><span className="eyebrow">ACORDOS DE ENTRADA</span><h2>Cortesias em andamento</h2><p>{introductoryStores.length} {introductoryStores.length===1?'loja usa':'lojas usam'} o plano sem mensalidade até a data combinada. A receita começa no primeiro vencimento.</p></div><Gift size={23}/></div><div className="master-action-list">{introductoryStores.slice(0,8).map(store=><Link key={store.id} to={`/admin-master/lojas?q=${encodeURIComponent(store.name)}`}><div><strong>{store.name}</strong><span>{currency.format(store.billingAmount||0)}/mês após a cortesia</span></div><b>{new Date(`${store.introFirstChargeOn}T12:00:00`).toLocaleDateString('pt-BR')}</b></Link>)}</div></section>}

    <div className="master-commercial-grid">
      <section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">ONBOARDING</span><h2>Lojas que ainda não publicaram produtos</h2></div><PackageX size={22}/></div>{onboardingPending.length?<div className="master-action-list">{onboardingPending.slice(0,8).map((store)=><Link key={store.id} to={`/admin-master/lojas?q=${encodeURIComponent(store.name)}`}><div><strong>{store.name}</strong><span>{store.ownerEmail||'Responsável sem e-mail'} · {store.planName||'Sem plano'}</span></div><b>0 ativos</b></Link>)}</div>:<p className="analytics-empty">Todas as lojas online possuem pelo menos um produto ativo.</p>}</section>
      <section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">COBRANÇA</span><h2>Vencimentos nos próximos 7 dias</h2></div><CalendarClock size={22}/></div>{upcomingBilling.length?<div className="master-action-list">{upcomingBilling.slice(0,8).map((store)=><Link key={store.id} to={`/admin-master/lojas?q=${encodeURIComponent(store.name)}`}><div><strong>{store.name}</strong><span>{store.planName||'Plano'} · {currency.format(store.billingAmount||0)}</span></div><b>{(daysUntilBillingDate(store.nextDueDate)??0)===0?'Hoje':`${daysUntilBillingDate(store.nextDueDate)??0}d`}</b></Link>)}</div>:<p className="analytics-empty">Nenhum vencimento cadastrado para os próximos 7 dias.</p>}</section>
    </div>

    {stats.storesSuspended>0&&<section className="admin-card master-status-note"><AlertTriangle size={20}/><div><strong>{stats.storesSuspended} {stats.storesSuspended===1?'loja suspensa':'lojas suspensas'}</strong><span>Os dados continuam preservados, mas vitrine e painel do cliente permanecem bloqueados até a reativação.</span></div></section>}
  </>;
}
