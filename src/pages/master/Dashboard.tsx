import { AlertTriangle, Building2, CalendarClock, CircleDollarSign, Clock3, PackageX, Power, Store, TrendingUp, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadingState } from '../../components/ui/AsyncState';
import { platformApi } from '../../services/platformApi';
import type { PlatformDashboardStats, PlatformSettings, PlatformStoreSummary } from '../../types';
import { currency } from '../../utils/format';

const daysUntil=(value?:string)=>value?Math.ceil((new Date(value).getTime()-Date.now())/86_400_000):Number.POSITIVE_INFINITY;
const trialExpired=(value?:string)=>Boolean(value)&&new Date(value as string).getTime()<=Date.now();

export default function MasterDashboard(){
  const[stats,setStats]=useState<PlatformDashboardStats|null>(null);
  const[stores,setStores]=useState<PlatformStoreSummary[]>([]);
  const[settings,setSettings]=useState<PlatformSettings>({demoEnabled:true,demoDurationDays:30,demoWarningDays:7});
  const[error,setError]=useState('');
  useEffect(()=>{void Promise.all([platformApi.dashboard(),platformApi.listStores(),platformApi.getPlatformSettings()]).then(([s,storesResult,platformSettings])=>{setStats(s);setStores(storesResult);setSettings(platformSettings)}).catch((e)=>setError(e instanceof Error?e.message:'Falha ao carregar indicadores.'))},[]);

  const trialWarnings=useMemo(()=>stores.filter((store)=>store.planCode==='DEMO'&&store.subscriptionStatus==='trial'&&!trialExpired(store.expiresAt)&&daysUntil(store.expiresAt)<=settings.demoWarningDays).sort((a,b)=>daysUntil(a.expiresAt)-daysUntil(b.expiresAt)),[stores,settings.demoWarningDays]);
  const payingStores=useMemo(()=>stores.filter((store)=>store.planCode!=='DEMO'&&store.subscriptionStatus==='active'&&store.accessStatus==='online'),[stores]);
  const averageRevenue=payingStores.length?(stats?.monthlyRecurringRevenue||0)/payingStores.length:0;
  const annualRecurringRevenue=(stats?.monthlyRecurringRevenue||0)*12;
  const onboardingPending=useMemo(()=>stores.filter((store)=>store.accessStatus==='online'&&store.activeProductCount===0),[stores]);
  const upcomingBilling=useMemo(()=>stores.filter((store)=>store.planCode!=='DEMO'&&store.subscriptionStatus==='active'&&store.nextDueDate&&daysUntil(store.nextDueDate)>=0&&daysUntil(store.nextDueDate)<=7).sort((a,b)=>daysUntil(a.nextDueDate)-daysUntil(b.nextDueDate)),[stores]);
  const planDistribution=useMemo(()=>{
    const counts=new Map<string,number>();
    for(const store of payingStores){const label=store.planName||store.planCode||'Sem plano';counts.set(label,(counts.get(label)||0)+1)}
    return [...counts.entries()].sort((a,b)=>b[1]-a[1]);
  },[payingStores]);

  if(!stats)return <LoadingState label={error||'Carregando gestão da plataforma...'}/>;
  const cards=[
    {label:'Lojas cadastradas',value:stats.storesTotal,icon:Building2},
    {label:'Online',value:stats.storesOnline,icon:Power},
    {label:'Clientes pagantes',value:payingStores.length,icon:UsersRound},
    {label:'Em demonstração',value:stats.storesTrial,icon:Clock3},
    {label:'MRR estimado',value:currency.format(stats.monthlyRecurringRevenue),icon:CircleDollarSign},
    {label:'Ticket mensal médio',value:currency.format(averageRevenue),icon:TrendingUp},
  ];
  return <>
    <div className="admin-page-title"><div><span className="eyebrow">PLATAFORMA</span><h1>Gestão comercial do Food Service SaaS</h1><p>Acompanhe aquisição, demonstrações, clientes ativos e receita recorrente em uma única visão.</p></div><Link className="primary-button" to="/admin-master/lojas">Gerenciar lojas</Link></div>
    <div className="stat-grid master-stat-grid">{cards.map(({label,value,icon:Icon})=><article className="stat-card" key={label}><div className="stat-icon"><Icon size={20}/></div><span>{label}</span><strong>{value}</strong></article>)}</div>

    <div className="master-commercial-grid">
      <section className="admin-card master-commercial-summary"><span className="eyebrow">RECEITA RECORRENTE</span><h2>{currency.format(annualRecurringRevenue)} / ano</h2><p>ARR projetado a partir do MRR atual. Valores de setup não entram nesta projeção.</p><div><span>MRR atual</span><strong>{currency.format(stats.monthlyRecurringRevenue)}</strong></div><div><span>Clientes pagantes</span><strong>{payingStores.length}</strong></div><div><span>Ticket mensal médio</span><strong>{currency.format(averageRevenue)}</strong></div></section>
      <section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">MIX COMERCIAL</span><h2>Clientes por plano</h2></div><Store size={21}/></div>{planDistribution.length?<div className="master-plan-distribution">{planDistribution.map(([plan,count])=><div key={plan}><span>{plan}</span><strong>{count}</strong></div>)}</div>:<p className="analytics-empty">Ainda não há clientes pagantes ativos.</p>}</section>
    </div>

    {trialWarnings.length>0&&<section className="admin-card master-trial-alerts"><div className="admin-card__header"><div><span className="eyebrow">OPORTUNIDADE DE CONVERSÃO</span><h2>Demonstrações próximas do vencimento</h2></div><AlertTriangle size={23}/></div><p>Priorize contato comercial antes do encerramento automático. O aviso considera os {settings.demoWarningDays} dias definidos na plataforma.</p><div className="trial-alert-list">{trialWarnings.map((store)=>{const days=daysUntil(store.expiresAt);return <Link key={store.id} to="/admin-master/lojas"><div><strong>{store.name}</strong><span>{store.ownerEmail||'Responsável sem e-mail'} · {store.activeProductCount} produtos ativos</span></div><b>{days===0?'Vence hoje':days===1?'Vence amanhã':`${days} dias`}</b></Link>})}</div></section>}

    <div className="master-commercial-grid">
      <section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">ONBOARDING</span><h2>Lojas que ainda não publicaram produtos</h2></div><PackageX size={22}/></div>{onboardingPending.length?<div className="master-action-list">{onboardingPending.slice(0,8).map((store)=><Link key={store.id} to="/admin-master/lojas"><div><strong>{store.name}</strong><span>{store.ownerEmail||'Responsável sem e-mail'} · {store.planName||'Sem plano'}</span></div><b>0 ativos</b></Link>)}</div>:<p className="analytics-empty">Todas as lojas online possuem pelo menos um produto ativo.</p>}</section>
      <section className="admin-card"><div className="admin-card__header"><div><span className="eyebrow">COBRANÇA</span><h2>Vencimentos nos próximos 7 dias</h2></div><CalendarClock size={22}/></div>{upcomingBilling.length?<div className="master-action-list">{upcomingBilling.slice(0,8).map((store)=><Link key={store.id} to="/admin-master/lojas"><div><strong>{store.name}</strong><span>{store.planName||'Plano'} · {currency.format(store.billingAmount||0)}</span></div><b>{daysUntil(store.nextDueDate)===0?'Hoje':`${daysUntil(store.nextDueDate)}d`}</b></Link>)}</div>:<p className="analytics-empty">Nenhum vencimento cadastrado para os próximos 7 dias.</p>}</section>
    </div>

    {stats.storesSuspended>0&&<section className="admin-card master-status-note"><AlertTriangle size={20}/><div><strong>{stats.storesSuspended} {stats.storesSuspended===1?'loja suspensa':'lojas suspensas'}</strong><span>Os dados continuam preservados, mas vitrine e painel do cliente permanecem bloqueados até a reativação.</span></div></section>}
  </>;
}
