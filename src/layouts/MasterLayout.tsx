import { Activity, Building2, ExternalLink, LayoutDashboard, LogOut, Menu, PanelLeftClose, PanelLeftOpen, ShieldCheck, SlidersHorizontal, UserPlus, WalletCards, type LucideIcon, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PlatformHelpButton } from '../components/PlatformHelpButton';
import { useAuth } from '../contexts/AuthContext';
import { PLATFORM_BRAND } from '../lib/brand';
import { useAdminMobileNavigation } from '../hooks/useAdminMobileNavigation';
import '../components/admin/admin-navigation.css';
import '../segments/segments.css';
import '../pages/master/master-refinements.css';
import './operational-navigation.css';
import { usePwaIdentity } from '../services/pwaIdentity';
import { PwaAccessCard } from '../components/PwaAccessCard';

type MasterNavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };
const navSections: Array<{ label: string; items: MasterNavItem[] }> = [
  { label: 'Visão geral', items: [{ to: '/admin-master', label: 'Painel', icon: LayoutDashboard, end: true }] },
  { label: 'Negócios', items: [
    { to: '/admin-master/lojas', label: 'Lojas', icon: Building2 },
    { to: '/admin-master/demonstracao', label: 'Demonstração', icon: Building2 },
    { to: '/admin-master/solicitacoes', label: 'Solicitações', icon: UserPlus },
    { to: '/admin-master/pagamentos', label: 'Pagamentos', icon: WalletCards },
  ] },
  { label: 'Configuração', items: [
    { to: '/admin-master/planos', label: 'Planos', icon: SlidersHorizontal },
    { to: '/admin-master/modulos', label: 'Módulos opcionais', icon: Building2 },
    { to: '/admin-master/segmentos', label: 'Segmentos e permissões', icon: SlidersHorizontal },
  ] },
  { label: 'Plataforma', items: [{ to: '/admin-master/diagnostico', label: 'Diagnóstico', icon: Activity }] },
];
const nav: MasterNavItem[] = navSections.flatMap(({ items }) => items);

export default function MasterLayout() {
  usePwaIdentity({kind:'master'});
  const { platformAdmin, user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { triggerRef, sidebarRef } = useAdminMobileNavigation(open, setOpen);
  useEffect(() => {
    try { setSidebarCollapsed(window.localStorage.getItem('vendeweb_admin_master_sidebar_collapsed') === '1'); } catch { /* storage indisponível */ }
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem('vendeweb_admin_master_sidebar_collapsed', sidebarCollapsed ? '1' : '0'); } catch { /* storage indisponível */ }
  }, [sidebarCollapsed]);
  const initials = (platformAdmin?.name || 'VW').slice(0, 2).toUpperCase();
  const currentSection = nav.find(({ to, end }) => end ? location.pathname === to : location.pathname.startsWith(to))?.label || 'Gestão da plataforma';

  const logout = async () => {
    await signOut();
    navigate('/admin-master/login', { replace: true });
  };

  return (
    <div className={`admin-shell master-shell platform-business-shell ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}>
      <a className="master-skip-link" href="#master-main">Ir para o conteúdo</a>
      <button ref={triggerRef} type="button" className="admin-mobile-menu" onClick={() => setOpen(true)} aria-label="Abrir menu" aria-expanded={open} aria-controls="master-sidebar"><Menu size={21} /></button>
      {open && <button type="button" className="admin-backdrop" onClick={() => setOpen(false)} aria-label="Fechar menu" tabIndex={-1} aria-hidden="true" />}

      <aside ref={sidebarRef} id="master-sidebar" className={`admin-sidebar master-sidebar ${open ? 'is-open' : ''}`} role={open ? 'dialog' : undefined} aria-label={open ? 'Menu do Admin Master' : undefined} aria-modal={open || undefined}>
        <button className="admin-sidebar-close" onClick={() => setOpen(false)} aria-label="Fechar"><X /></button>
        <button type="button" className="admin-sidebar-collapse" onClick={() => setSidebarCollapsed((current) => !current)} aria-pressed={sidebarCollapsed} aria-label={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'} title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}>{sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
        <div className="admin-brand"><img className="platform-brand-icon" src="/assets/vendeweb-mark.svg" alt=""/><div><strong>{PLATFORM_BRAND}</strong><span>Admin da plataforma</span></div></div>

        <div className="master-admin-mini" title={user?.email || platformAdmin?.name || 'Administrador'}>
          <span>{initials}</span>
          <div>
            <strong>{platformAdmin?.name || 'Administrador'}</strong>
            <small>{user?.email}</small>
          </div>
        </div>

        <nav id="master-navigation" className="admin-nav" aria-label="Navegação do Admin Master">
          {navSections.map((section) => <div className="admin-nav__group" key={section.label}>
            <span className="admin-nav__label">{section.label}</span>
            {section.items.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} title={label} aria-label={`${section.label}: ${label}`} onClick={() => setOpen(false)}>
                <Icon size={18} /><span className="master-nav-text">{label}</span>
              </NavLink>
            ))}
          </div>)}
        </nav>

        <div className="admin-sidebar__bottom">
          <a href="/" target="_blank" rel="noreferrer"><ExternalLink size={18} /> Página comercial</a>
          <button onClick={() => void logout()}><LogOut size={18} /> Sair</button>
        </div>
      </aside>

      <section className="admin-content">
        <header className="admin-topbar">
          <div className="master-section-context"><strong>{currentSection}</strong><span><ShieldCheck size={14} aria-hidden="true"/>Admin Master · todas as lojas</span></div>
          <div className="admin-user" title={user?.email || platformAdmin?.name || 'Administrador da plataforma'}>
            <span>{initials}</span>
            <div>
              <strong>{platformAdmin?.name || 'Administrador da plataforma'}</strong>
              <small>{user?.email}</small>
            </div>
          </div>
        </header>
        <main id="master-main" tabIndex={-1} className="admin-page"><PwaAccessCard role="master" scope={user?.id||''} name="Admin Master" notifications/><div key={location.pathname}><Outlet /></div></main>
      </section>
      <PlatformHelpButton/>
    </div>
  );
}
