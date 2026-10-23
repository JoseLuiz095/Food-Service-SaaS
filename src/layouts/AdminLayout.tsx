import {
  AlertTriangle,
  BadgeDollarSign,
  BarChart3,
  Boxes,
  CircleCheckBig,
  Clock3,
  ExternalLink,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Rocket,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Smartphone,
  Tags,
  Truck,
  UtensilsCrossed,
  X,
  Warehouse,
} from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PlatformHelpButton } from '../components/PlatformHelpButton';
import { AdminNotifications } from '../components/admin/AdminNotifications';
import { AdminStoreShare } from '../components/admin/AdminStoreShare';
import { ImageWithFallback } from '../components/ui/ImageWithFallback';
import { useAuth } from '../contexts/AuthContext';
import { useStore } from '../contexts/StoreContext';
import { billingApi, type StoreBillingOverview } from '../services/billingApi';
import { getBillingVisualStatus } from '../utils/billingStatus';
import { planHasFeature } from '../utils/plan';
import { publicStorefrontPath } from '../utils/storefrontRoute';
import { getBusinessSegment, resolveBusinessTheme, isDefaultStoreImage } from '../segments/businessSegments';
import { PLATFORM_BRAND } from '../lib/brand';
import '../segments/segments.css';
import { useBusinessStatus } from '../platform/useBusinessStatus';
import { useAdminMobileNavigation } from '../hooks/useAdminMobileNavigation';
import { moduleIsActive } from '../platform/api';
import '../components/admin/admin-navigation.css';

const navSections = [
  {
    label: 'Operação',
    items: [
      { to: '/admin', label: 'Visão geral', icon: LayoutDashboard, end: true },
      { to: '/admin/primeiros-passos', label: 'Primeiros passos', icon: Rocket },
      { to: '/admin/analytics', label: 'Análises', icon: BarChart3, requiresFeature: 'analytics' },
      { to: '/admin/pedidos', label: 'Pedidos', icon: ShoppingBag },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      { to: '/admin/produtos', label: 'Produtos', icon: Package },
      { to: '/admin/estoque', label: 'Estoque e insumos', icon: Boxes },
      { to: '/admin/estoque-locais', label: 'Locais de estoque', icon: Warehouse },
      { to: '/admin/categorias', label: 'Categorias', icon: Tags },
      { to: '/admin/entregas', label: 'Entregas', icon: Truck },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { to: '/admin/financeiro', label: 'Financeiro', icon: Landmark, requiresFeature: 'finance' },
    ],
  },
  {
    label: 'Conta',
    items: [
      { to: '/admin/plano', label: 'Meu plano', icon: BadgeDollarSign },
      { to: '/admin/configuracoes', label: 'Configurações', icon: Settings },
      { to: '/admin/modulos', label: 'Módulos opcionais', icon: Boxes },
      { to: '/admin/negocio', label: 'Segmento e permissões', icon: ShieldCheck },
    ],
  },
];

const BILLING_WARNING_DAYS = 7;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export default function AdminLayout() {
  const { settings, planUsage, dataMode, products } = useStore();
  const { user, signOut, platformAdmin, membership, memberships, selectStore } = useAuth();
  const {state:business}=useBusinessStatus(membership?.storeId||'');
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const { triggerRef, sidebarRef } = useAdminMobileNavigation(open, setOpen);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [billingOverview, setBillingOverview] = useState<StoreBillingOverview | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const segment = getBusinessSegment(business?.profile?.primary_segment || settings.visualTheme);
  const segmentPresentation = segment.id !== 'food' && settings.visualTheme.preset !== 'doce_lua';
  const logoUrl = segmentPresentation && isDefaultStoreImage(settings.logoUrl) ? '/assets/placeholder-catalog.svg' : settings.logoUrl;
  const theme = resolveBusinessTheme(settings.visualTheme);
  const segmentStyle = segmentPresentation ? { '--segment-primary': theme.primaryColor, '--segment-accent': theme.accentColor } as CSSProperties : undefined;

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    try { setSidebarCollapsed(window.localStorage.getItem('foodweb_admin_sidebar_collapsed') === '1'); } catch { /* storage indisponível */ }
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem('foodweb_admin_sidebar_collapsed', sidebarCollapsed ? '1' : '0'); } catch { /* storage indisponível */ }
  }, [sidebarCollapsed]);

  const installAdminApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const logout = async () => {
    await signOut();
    navigate('/admin/login', { replace: true });
  };

  useEffect(() => {
    let active = true;
    if (!settings.id) {
      setBillingOverview(null);
      return () => { active = false; };
    }

    const refresh = () => void billingApi.getOverview(settings.id)
      .then((overview) => { if (active) setBillingOverview(overview); })
      .catch(() => { if (active) setBillingOverview(null); });

    refresh();
    const interval = window.setInterval(refresh, 120_000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [settings.id]);

  const storeOnline = settings.active && settings.accessStatus !== 'suspended';
  const storefrontHref = publicStorefrontPath(settings.slug);
  const billingStatus = getBillingVisualStatus({
    billingState: billingOverview?.subscription?.billingState,
    nextDueDate: billingOverview?.subscription?.nextDueDate,
    dueDay: billingOverview?.subscription?.dueDay,
    warningDays: BILLING_WARNING_DAYS,
  });
  const subscription = billingOverview?.subscription;
  const planIdentity = `${billingOverview?.currentPlan?.name || ''} ${planUsage.plan.name || ''}`;
  const isComplimentaryPlan = subscription?.billingState === 'complimentary'
    || (subscription?.billingMode === 'complimentary' && subscription.billingState !== 'trial')
    || (subscription?.status === 'active' && subscription.billingAmount === 0 && planUsage.subscriptionStatus !== 'trial')
    || /vital[ií]cio|cortesia|isenta|sem cobrança/i.test(planIdentity);

  return (
    <div data-business-segment={segment.id} data-visual-preset={settings.visualTheme.preset} style={segmentStyle} className={`admin-shell food-admin-parity-v054 ${segmentPresentation ? 'admin-business-theme' : ''} ${sidebarCollapsed ? "is-sidebar-collapsed" : ""}`}>
      <button ref={triggerRef} type="button" className="admin-mobile-menu" onClick={() => setOpen(true)} aria-label="Abrir menu" aria-expanded={open} aria-controls="admin-sidebar"><Menu size={21} /></button>
      {open && <button type="button" className="admin-backdrop" onClick={() => setOpen(false)} aria-label="Fechar menu" tabIndex={-1} aria-hidden="true" />}

      <aside ref={sidebarRef} id="admin-sidebar" className={`admin-sidebar ${open ? 'is-open' : ''}`} role={open ? 'dialog' : undefined} aria-label={open ? 'Menu do negócio' : undefined} aria-modal={open || undefined}>
        <button className="admin-sidebar-close" onClick={() => setOpen(false)} aria-label="Fechar"><X /></button>
        <button type="button" className="admin-sidebar-collapse" onClick={() => setSidebarCollapsed((current) => !current)} aria-pressed={sidebarCollapsed} aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"} title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}>{sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
        <div className="admin-brand">{segmentPresentation?<Store size={24}/>:<img className="platform-brand-icon" src="/assets/vendeweb-mark.svg" alt=""/>}<div><strong>{PLATFORM_BRAND}</strong><span>{segmentPresentation?segment.adminTitle:'Administração'}</span></div></div>
        <div className="admin-store-mini"><ImageWithFallback src={logoUrl} fallbackSrc={segmentPresentation?'/assets/placeholder-catalog.svg':undefined} alt={`Logo ${settings.name}`} /><div><strong>{settings.name}</strong><span>{settings.city} · {settings.state}</span></div></div>

        {memberships.length > 1 && (
          <label className="admin-store-switcher">
            <span>Loja ativa</span>
            <select value={membership?.storeId || ''} onChange={(event) => selectStore(event.target.value)}>
              {memberships.map((item) => <option value={item.storeId} key={item.storeId}>{item.storeName || item.storeId}</option>)}
            </select>
          </label>
        )}

        <nav id="admin-navigation" className="admin-nav" aria-label="Navegação do negócio">
          {business?.profile&&['clients','appointments','creator','training','nutrition'].some(code=>moduleIsActive(business,code as 'clients'|'appointments'|'creator'|'training'|'nutrition'))&&!membership?.limitedAccess&&<div className="admin-nav__group"><span className="admin-nav__label">Rotina do negócio</span><NavLink to="/admin/operacao" onClick={()=>setOpen(false)}><LayoutDashboard size={18}/><span className="admin-nav-text">{getBusinessSegment(business.profile.primary_segment).adminTitle}</span></NavLink></div>}
          {navSections.map((section) => {
            const preparationNavAllowed = new Set(['/admin','/admin/primeiros-passos','/admin/produtos','/admin/estoque','/admin/categorias','/admin/entregas','/admin/configuracoes','/admin/negocio']);
            const deliverySegments = ['food', 'confectionery', 'retail', 'printing3d', 'rentals', 'florist'];
            const items = section.items.filter((item) => (!item.requiresFeature || planHasFeature(planUsage.plan, item.requiresFeature))
              && (!membership?.limitedAccess || preparationNavAllowed.has(item.to))
              && (item.to !== '/admin/entregas' || deliverySegments.includes(segment.id))
              && (item.to !== '/admin/estoque' || deliverySegments.includes(segment.id) || products.some((product) => product.trackStock)));
            if (!items.length) return null;
            return (
              <div className="admin-nav__group" key={section.label}>
                <span className="admin-nav__label">{section.label==='Catálogo'&&segmentPresentation?segment.catalogLabel:section.label}</span>
                {items.map(({ to, label, icon: Icon, end }) => (
                  <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}><Icon size={18} /><span className="admin-nav-text">{segmentPresentation&&to==='/admin/produtos'?segment.catalogLabel:label}</span></NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="admin-sidebar__bottom">
          {installPrompt && <button onClick={() => void installAdminApp()}><Smartphone size={18} /><span className="admin-sidebar-text">Instalar app no celular</span></button>}
          <a href={storefrontHref} target="_blank" rel="noreferrer"><ExternalLink size={18} /><span className="admin-sidebar-text">Ver loja pública</span></a>
          {platformAdmin && <a href="/admin-master"><LayoutDashboard size={18} /><span className="admin-sidebar-text">Admin Master</span></a>}
          <button onClick={() => void logout()}><LogOut size={18} /><span className="admin-sidebar-text">Sair</span></button>
        </div>
      </aside>

      <section className="admin-content">
        <header className="admin-topbar">
          <div className="admin-topbar__context">
            <span className="eyebrow">{segmentPresentation?segment.label:dataMode === 'demo' ? 'MODO DEMONSTRAÇÃO' : 'SUPABASE ATIVO'}</span>
            <div className="admin-topbar__meta">
              <strong>Plano {planUsage.plan.name}</strong>
              <span className={`admin-live-status ${storeOnline ? 'is-online' : 'is-offline'}`}><CircleCheckBig size={14} />{storeOnline ? 'Loja online' : 'Loja indisponível'}</span>
            </div>
          </div>

          <div className="admin-topbar__actions">
            <AdminNotifications />
            {!isComplimentaryPlan && billingStatus.visible && (
              <button
                type="button"
                className={`admin-billing-status-v047 admin-billing-status-rc66 ${billingStatus.overdue ? 'is-overdue' : billingStatus.dueSoon ? 'is-warning' : 'is-current'}`}
                onClick={() => navigate('/admin/plano#vencimento')}
                title={`${billingStatus.label}. ${billingStatus.caption}. Abrir Meu plano.`}
                aria-label={`${billingStatus.label}. ${billingStatus.caption}. Abrir Meu plano.`}
              >
                {billingStatus.overdue ? <AlertTriangle size={18} /> : billingStatus.dueSoon ? <Clock3 size={18} /> : <CircleCheckBig size={18} />}
                <span><strong>{billingStatus.label}</strong><small>{billingStatus.caption}</small></span>
              </button>
            )}
            <div className="admin-topbar__store-actions">
              <AdminStoreShare />
              <a className="admin-topbar__store-link" href={storefrontHref} target="_blank" rel="noreferrer"><ExternalLink size={15} />Abrir vitrine</a>
            </div>
            <div className="admin-user"><span>{(user?.email || 'AD').slice(0, 2).toUpperCase()}</span><div><strong>{membership?.storeName || 'Administrador'}</strong><small>{user?.email}</small></div></div>
          </div>
        </header>
        {membership?.approvalStatus === 'pending' && <div className={`self-service-approval-banner ${membership.limitedAccess?'is-limited':'is-trial'}`}><ShieldCheck size={18}/><div><strong>{membership.limitedAccess?'Cadastro em preparação':'Cadastro em análise'}</strong><span>{membership.limitedAccess?'Você pode configurar cardápio, identidade, entregas e configurações. Pedidos, Analytics, Financeiro, cobrança e a vitrine ficam bloqueados até a aprovação do Admin Master.':'Seu Demo está disponível enquanto o Admin Master revisa o cadastro.'}</span></div></div>}
        <div className="admin-page"><div key={`${location.pathname}:${membership?.storeId || 'none'}`}><Outlet /></div></div>
      </section>
      <PlatformHelpButton />
    </div>
  );
}
