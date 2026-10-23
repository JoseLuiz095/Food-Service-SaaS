import { Activity, Building2, ExternalLink, LayoutDashboard, LogOut, Menu, ShieldCheck, SlidersHorizontal, UserPlus, WalletCards, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PlatformHelpButton } from '../components/PlatformHelpButton';
import { useAuth } from '../contexts/AuthContext';
import { PLATFORM_BRAND } from '../lib/brand';
import '../segments/segments.css';
import '../pages/master/master-refinements.css';

const nav = [
  { to: '/admin-master', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: '/admin-master/lojas', label: 'Lojas e clientes', icon: Building2 },
  { to: '/admin-master/solicitacoes', label: 'Solicitações', icon: UserPlus },
  { to: '/admin-master/planos', label: 'Planos', icon: SlidersHorizontal },
  { to: '/admin-master/pagamentos', label: 'Pagamentos', icon: WalletCards },
  { to: '/admin-master/diagnostico', label: 'Diagnóstico', icon: Activity },
  { to: '/admin-master/modulos', label: 'Módulos opcionais', icon: Building2 },
  { to: '/admin-master/segmentos', label: 'Segmentos e permissões', icon: SlidersHorizontal },
];

export default function MasterLayout() {
  const { platformAdmin, user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const initials = (platformAdmin?.name || 'VW').slice(0, 2).toUpperCase();
  const currentSection = nav.find(({ to, end }) => end ? location.pathname === to : location.pathname.startsWith(to))?.label || 'Gestão da plataforma';

  const logout = async () => {
    await signOut();
    navigate('/admin-master/login', { replace: true });
  };

  return (
    <div className="admin-shell master-shell platform-business-shell">
      <a className="master-skip-link" href="#master-main">Ir para o conteúdo</a>
      <button className="admin-mobile-menu" onClick={() => setOpen(true)} aria-label="Abrir menu" aria-expanded={open} aria-controls="master-navigation"><Menu size={21} /></button>
      {open && <button className="admin-backdrop" onClick={() => setOpen(false)} aria-label="Fechar menu" />}

      <aside className={`admin-sidebar master-sidebar ${open ? 'is-open' : ''}`}>
        <button className="admin-sidebar-close" onClick={() => setOpen(false)} aria-label="Fechar"><X /></button>
        <div className="admin-brand"><img className="platform-brand-icon" src="/assets/vendeweb-mark.svg" alt=""/><div><strong>{PLATFORM_BRAND}</strong><span>Admin da plataforma</span></div></div>

        <div className="master-admin-mini" title={user?.email || platformAdmin?.name || 'Administrador'}>
          <span>{initials}</span>
          <div>
            <strong>{platformAdmin?.name || 'Administrador'}</strong>
            <small>{user?.email}</small>
          </div>
        </div>

        <nav id="master-navigation" aria-label="Navegação do Admin Master">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}>
              <Icon size={18} />{label}
            </NavLink>
          ))}
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
        <main id="master-main" tabIndex={-1} className="admin-page"><div key={location.pathname}><Outlet /></div></main>
      </section>
      <PlatformHelpButton/>
    </div>
  );
}
