import { Activity, Building2, ExternalLink, LayoutDashboard, LogOut, Menu, ShieldCheck, SlidersHorizontal, WalletCards, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PlatformHelpButton } from '../components/PlatformHelpButton';
import { useAuth } from '../contexts/AuthContext';

const nav = [
  { to: '/admin-master', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: '/admin-master/lojas', label: 'Lojas e clientes', icon: Building2 },
  { to: '/admin-master/planos', label: 'Planos', icon: SlidersHorizontal },
  { to: '/admin-master/pagamentos', label: 'Pagamentos', icon: WalletCards },
  { to: '/admin-master/diagnostico', label: 'Diagnóstico', icon: Activity },
];

export default function MasterLayout() {
  const { platformAdmin, user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const initials = (platformAdmin?.name || 'FW').slice(0, 2).toUpperCase();

  const logout = async () => {
    await signOut();
    navigate('/admin-master/login', { replace: true });
  };

  return (
    <div className="admin-shell master-shell">
      <button className="admin-mobile-menu" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu size={21} /></button>
      {open && <button className="admin-backdrop" onClick={() => setOpen(false)} aria-label="Fechar menu" />}

      <aside className={`admin-sidebar master-sidebar ${open ? 'is-open' : ''}`}>
        <button className="admin-sidebar-close" onClick={() => setOpen(false)} aria-label="Fechar"><X /></button>
        <div className="admin-brand"><ShieldCheck size={24} /><div><strong>FoodWeb</strong><span>Admin da plataforma</span></div></div>

        <div className="master-admin-mini" title={user?.email || platformAdmin?.name || 'Administrador'}>
          <span>{initials}</span>
          <div>
            <strong>{platformAdmin?.name || 'Administrador'}</strong>
            <small>{user?.email}</small>
          </div>
        </div>

        <nav>
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}>
              <Icon size={18} />{label}
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar__bottom">
          <a href="/" target="_blank" rel="noreferrer"><ExternalLink size={18} /> Abrir catálogo</a>
          <button onClick={() => void logout()}><LogOut size={18} /> Sair</button>
        </div>
      </aside>

      <section className="admin-content">
        <header className="admin-topbar">
          <div><span className="eyebrow">ADMIN MASTER</span><strong>Gestão central dos estabelecimentos</strong></div>
          <div className="admin-user" title={user?.email || platformAdmin?.name || 'Administrador da plataforma'}>
            <span>{initials}</span>
            <div>
              <strong>{platformAdmin?.name || 'Administrador da plataforma'}</strong>
              <small>{user?.email}</small>
            </div>
          </div>
        </header>
        <div className="admin-page"><div key={location.pathname}><Outlet /></div></div>
      </section>
      <PlatformHelpButton/>
    </div>
  );
}
