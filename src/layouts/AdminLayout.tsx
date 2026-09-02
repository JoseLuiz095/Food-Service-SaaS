import { BarChart3, BadgeDollarSign, CircleCheckBig, ExternalLink, LayoutDashboard, LogOut, Menu, Package, Rocket, Settings, ShoppingBag, Tags, Truck, WalletCards, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useStore } from '../contexts/StoreContext';
import { ImageWithFallback } from '../components/ui/ImageWithFallback';
import { planHasFeature } from '../utils/plan';

const navSections = [
  {
    label: 'Operação',
    items: [
      {to:'/admin',label:'Visão geral',icon:LayoutDashboard,end:true},
      {to:'/admin/primeiros-passos',label:'Primeiros passos',icon:Rocket},
      {to:'/admin/analytics',label:'Analytics',icon:BarChart3,requiresFeature:'analytics'},
      {to:'/admin/pedidos',label:'Pedidos',icon:ShoppingBag},
      {to:'/admin/financeiro',label:'Financeiro',icon:WalletCards,requiresFeature:'finance'},
    ],
  },
  {
    label: 'Catálogo',
    items: [
      {to:'/admin/produtos',label:'Produtos',icon:Package},
      {to:'/admin/categorias',label:'Categorias',icon:Tags},
      {to:'/admin/entregas',label:'Entregas',icon:Truck},
    ],
  },
  {
    label: 'Conta',
    items: [
      {to:'/admin/plano',label:'Meu plano',icon:BadgeDollarSign},
      {to:'/admin/configuracoes',label:'Configurações',icon:Settings},
    ],
  },
];

export default function AdminLayout(){
  const {settings,planUsage,dataMode}=useStore();
  const {user,signOut,platformAdmin,membership,memberships,selectStore}=useAuth();
  const navigate=useNavigate(); const location=useLocation(); const [open,setOpen]=useState(false);
  const logout=async()=>{await signOut();navigate('/admin/login',{replace:true})};
  const storeOnline=settings.active&&settings.accessStatus!=='suspended';
  return <div className="admin-shell">
    <button className="admin-mobile-menu" onClick={()=>setOpen(true)} aria-label="Abrir menu"><Menu size={21}/></button>
    {open&&<button className="admin-backdrop" onClick={()=>setOpen(false)} aria-label="Fechar menu"/>}
    <aside className={`admin-sidebar ${open?'is-open':''}`}>
      <button className="admin-sidebar-close" onClick={()=>setOpen(false)} aria-label="Fechar"><X/></button>
      <div className="admin-brand"><ShoppingBag size={24}/><div><strong>Food Service SaaS</strong><span>Administração</span></div></div>
      <div className="admin-store-mini"><ImageWithFallback src={settings.logoUrl} alt={`Logo ${settings.name}`}/><div><strong>{settings.name}</strong><span>{settings.city} · {settings.state}</span></div></div>
      {memberships.length>1&&<label className="admin-store-switcher"><span>Loja ativa</span><select value={membership?.storeId||''} onChange={(event)=>selectStore(event.target.value)}>{memberships.map((item)=><option value={item.storeId} key={item.storeId}>{item.storeName||item.storeId}</option>)}</select></label>}
      <nav className="admin-nav">{navSections.map((section)=>{
        const items=section.items.filter((item)=>!item.requiresFeature||planHasFeature(planUsage.plan,item.requiresFeature));
        if(!items.length)return null;
        return <div className="admin-nav__group" key={section.label}><span className="admin-nav__label">{section.label}</span>{items.map(({to,label,icon:Icon,end})=><NavLink key={to} to={to} end={end} onClick={()=>setOpen(false)}><Icon size={18}/>{label}</NavLink>)}</div>;
      })}</nav>
      <div className="admin-sidebar__bottom"><a href={`/${settings.slug}`} target="_blank" rel="noreferrer"><ExternalLink size={18}/> Ver loja pública</a>{platformAdmin&&<a href="/admin-master"><LayoutDashboard size={18}/> Admin Master</a>}<button onClick={()=>void logout()}><LogOut size={18}/> Sair</button></div>
    </aside>
    <section className="admin-content">
      <header className="admin-topbar">
        <div className="admin-topbar__context"><span className="eyebrow">{dataMode==='demo'?'MODO DEMONSTRAÇÃO':'SUPABASE ATIVO'}</span><div className="admin-topbar__meta"><strong>Plano {planUsage.plan.name} · {planUsage.plan.productLimit==null?'produtos ilimitados':`até ${planUsage.plan.productLimit} produtos`}</strong><span className={`admin-live-status ${storeOnline?'is-online':'is-offline'}`}><CircleCheckBig size={14}/>{storeOnline?'Loja online':'Loja indisponível'}</span></div></div>
        <div className="admin-topbar__actions"><a className="admin-topbar__store-link" href={`/${settings.slug}`} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Abrir vitrine</a><div className="admin-user"><span>{(user?.email||'AD').slice(0,2).toUpperCase()}</span><div><strong>{membership?.storeName||'Administrador'}</strong><small>{user?.email}</small></div></div></div>
      </header>
      <div className="admin-page"><div key={`${location.pathname}:${membership?.storeId||'none'}`}><Outlet/></div></div>
    </section>
  </div>;
}
