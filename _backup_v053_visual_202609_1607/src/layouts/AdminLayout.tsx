import { AlertTriangle, BarChart3, BadgeDollarSign, CircleCheckBig, Clock3, ExternalLink, LayoutDashboard, LogOut, Menu, Package, Rocket, Settings, ShoppingBag, Tags, Truck, WalletCards, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useStore } from '../contexts/StoreContext';
import { ImageWithFallback } from '../components/ui/ImageWithFallback';
import { planHasFeature } from '../utils/plan';
import { PlatformHelpButton } from '../components/PlatformHelpButton';
import { billingApi, type StoreBillingOverview } from '../services/billingApi';
import { getBillingVisualStatus } from '../utils/billingStatus';

const navSections = [
  {label:'Operação',items:[
    {to:'/admin',label:'Visão geral',icon:LayoutDashboard,end:true},
    {to:'/admin/primeiros-passos',label:'Primeiros passos',icon:Rocket},
    {to:'/admin/analytics',label:'Analytics',icon:BarChart3,requiresFeature:'analytics'},
    {to:'/admin/pedidos',label:'Pedidos',icon:ShoppingBag},
    {to:'/admin/financeiro',label:'Financeiro',icon:WalletCards,requiresFeature:'finance'},
  ]},
  {label:'Catálogo',items:[
    {to:'/admin/produtos',label:'Produtos',icon:Package},
    {to:'/admin/categorias',label:'Categorias',icon:Tags},
    {to:'/admin/entregas',label:'Entregas',icon:Truck},
  ]},
  {label:'Conta',items:[
    {to:'/admin/plano',label:'Meu plano',icon:BadgeDollarSign},
    {to:'/admin/configuracoes',label:'Configurações',icon:Settings},
  ]},
];

const dateBr=(value?:string)=>value?new Date(`${value.slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR'):'—';
const BILLING_WARNING_DAYS=7;
const daysUntil=(value?:string)=>{if(!value)return undefined;const target=new Date(`${value.slice(0,10)}T12:00:00`);const today=new Date();today.setHours(12,0,0,0);return Math.round((target.getTime()-today.getTime())/86400000)};

export default function AdminLayout(){
  const {settings,planUsage,dataMode}=useStore();
  const {user,signOut,membership,memberships,selectStore}=useAuth();
  const navigate=useNavigate(); const location=useLocation(); const [open,setOpen]=useState(false);
  const[billingOverview,setBillingOverview]=useState<StoreBillingOverview|null>(null);
  const logout=async()=>{await signOut();navigate('/admin/login',{replace:true})};
  const storeOnline=settings.active&&settings.accessStatus!=='suspended';

  useEffect(()=>{
    let active=true;
    if(!settings.id){setBillingOverview(null);return()=>{active=false}};
    const refresh=()=>void billingApi.getOverview(settings.id).then((overview)=>{if(active)setBillingOverview(overview)}).catch(()=>{if(active)setBillingOverview(null)});
    refresh();
    const interval=window.setInterval(refresh,120000);
    const onFocus=()=>refresh();
    window.addEventListener('focus',onFocus);
    return()=>{active=false;window.clearInterval(interval);window.removeEventListener('focus',onFocus)};
  },[settings.id,location.pathname]);

  const billingStatus=getBillingVisualStatus({billingState:billingOverview?.subscription?.billingState,nextDueDate:billingOverview?.subscription?.nextDueDate,dueDay:billingOverview?.subscription?.dueDay,warningDays:BILLING_WARNING_DAYS});
  const billingVisible=billingStatus.visible;
  const billingOverdue=billingStatus.overdue;
  const billingDueSoon=billingStatus.dueSoon;
  const billingLabel=billingStatus.label;
  const billingCaption=billingStatus.caption;

  return <div className="admin-shell">
    <button className="admin-mobile-menu" onClick={()=>setOpen(true)} aria-label="Abrir menu"><Menu size={21}/></button>
    {open&&<button className="admin-backdrop" onClick={()=>setOpen(false)} aria-label="Fechar menu"/>}
    <aside className={`admin-sidebar ${open?'is-open':''}`}>
      <button className="admin-sidebar-close" onClick={()=>setOpen(false)} aria-label="Fechar"><X/></button>
      <div className="admin-brand"><ShoppingBag size={24}/><div><strong>FoodWeb</strong><span>Gestão do restaurante</span></div></div>
      <div className="admin-store-mini"><ImageWithFallback src={settings.logoUrl} alt={`Logo ${settings.name}`}/><div><strong>{settings.name}</strong><span>{settings.city} · {settings.state}</span></div></div>
      {memberships.length>1&&<label className="admin-store-switcher"><span>Loja ativa</span><select value={membership?.storeId||''} onChange={(event)=>selectStore(event.target.value)}>{memberships.map((item)=><option value={item.storeId} key={item.storeId}>{item.storeName||item.storeId}</option>)}</select></label>}
      <nav className="admin-nav">{navSections.map((section)=>{const items=section.items.filter((item)=>!item.requiresFeature||planHasFeature(planUsage.plan,item.requiresFeature));if(!items.length)return null;return <div className="admin-nav__group" key={section.label}><span className="admin-nav__label">{section.label}</span>{items.map(({to,label,icon:Icon,end})=><NavLink key={to} to={to} end={end} onClick={()=>setOpen(false)}><Icon size={18}/>{label}</NavLink>)}</div>})}</nav>
      <div className="admin-sidebar__bottom"><a href={`/${settings.slug}`} target="_blank" rel="noreferrer"><ExternalLink size={18}/> Ver loja pública</a><button onClick={()=>void logout()}><LogOut size={18}/> Sair</button></div>
    </aside>
    <section className="admin-content">
      <header className="admin-topbar">
        <div className="admin-topbar__context"><span className="eyebrow">{dataMode==='demo'?'MODO DEMONSTRAÇÃO':'SUPABASE ATIVO'}</span><div className="admin-topbar__meta"><strong>Plano {planUsage.plan.name} · {planUsage.plan.productLimit==null?'produtos ilimitados':`até ${planUsage.plan.productLimit} produtos`}</strong><span className={`admin-live-status ${storeOnline?'is-online':'is-offline'}`}><CircleCheckBig size={14}/>{storeOnline?'Loja online':'Loja indisponível'}</span></div></div>
        <div className="admin-topbar__actions">
          {billingVisible&&<NavLink to="/admin/plano#vencimento" aria-label={`${billingLabel}. ${billingCaption}. Abrir Meu plano.`} className={`admin-billing-status-v047 ${billingOverdue?'is-overdue':billingDueSoon?'is-warning':'is-current'}`}>{billingOverdue?<AlertTriangle size={17}/>:billingDueSoon?<Clock3 size={17}/>:<CircleCheckBig size={17}/>}<span><strong>{billingLabel}</strong><small>{billingCaption}</small></span></NavLink>}
          <a className="admin-topbar__store-link" href={`/${settings.slug}`} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Abrir vitrine</a><div className="admin-user"><span>{(user?.email||'AD').slice(0,2).toUpperCase()}</span><div><strong>{membership?.storeName||'Administrador'}</strong><small>{user?.email}</small></div></div>
        </div>
      </header>
      <div className="admin-page"><div key={`${location.pathname}:${membership?.storeId||'none'}`}><Outlet/></div></div>
    </section>
    <PlatformHelpButton/>
  </div>;
}
