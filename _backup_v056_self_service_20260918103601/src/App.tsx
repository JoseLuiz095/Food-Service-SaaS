import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';
import MasterLayout from './layouts/MasterLayout';
import StoreLayout from './layouts/StoreLayout';
import { useAuth } from './contexts/AuthContext';
import { LoadingState } from './components/ui/AsyncState';

const Analytics=lazy(()=>import('./pages/admin/Analytics'));
const Finance=lazy(()=>import('./pages/admin/Finance'));
const CategoriesAdmin=lazy(()=>import('./pages/admin/Categories'));
const Dashboard=lazy(()=>import('./pages/admin/Dashboard'));
const AdminLogin=lazy(()=>import('./pages/admin/Login'));
const ForgotPassword=lazy(()=>import('./pages/admin/ForgotPassword'));
const ResetPassword=lazy(()=>import('./pages/admin/ResetPassword'));
const FirstAccessPassword=lazy(()=>import('./pages/admin/FirstAccessPassword'));
const OrdersAdmin=lazy(()=>import('./pages/admin/Orders'));
const Onboarding=lazy(()=>import('./pages/admin/Onboarding'));
const ProductForm=lazy(()=>import('./pages/admin/ProductForm'));
const ProductsAdmin=lazy(()=>import('./pages/admin/Products'));
const SettingsAdmin=lazy(()=>import('./pages/admin/Settings'));
const DeliveryZonesAdmin=lazy(()=>import('./pages/admin/DeliveryZones'));
const AdminPlan=lazy(()=>import('./pages/admin/Plan'));
const MasterLogin=lazy(()=>import('./pages/master/Login'));
const MasterMfa=lazy(()=>import('./pages/master/Mfa'));
const MasterDashboard=lazy(()=>import('./pages/master/Dashboard'));
const MasterStores=lazy(()=>import('./pages/master/Stores'));
const MasterPlans=lazy(()=>import('./pages/master/Plans'));
const MasterPayments=lazy(()=>import('./pages/master/Payments'));
const MasterDiagnostics=lazy(()=>import('./pages/master/Diagnostics'));
const Cart=lazy(()=>import('./pages/store/Cart'));
const Checkout=lazy(()=>import('./pages/store/Checkout'));
const Home=lazy(()=>import('./pages/store/Home'));
const ProductDetail=lazy(()=>import('./pages/store/ProductDetail'));
const OrderSuccess=lazy(()=>import('./pages/store/OrderSuccess'));
const NotFound=lazy(()=>import('./pages/NotFound'));

function ProtectedAdmin() {
  const { user, membership, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="page-center"><LoadingState label="Validando acesso..."/></div>;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  if (!membership) return <div className="access-denied"><h1>Acesso indisponível</h1><p>Este usuário não possui vínculo administrativo ativo ou a loja está temporariamente indisponível.</p><a href="/admin/login">Voltar ao login</a></div>;
  if (membership.mustChangePassword && location.pathname !== '/admin/primeiro-acesso') return <Navigate to="/admin/primeiro-acesso" replace />;
  return <AdminLayout />;
}

function ProtectedMaster() {
  const { user, platformAdmin, mfaLevel, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="page-center"><LoadingState label="Validando Admin Master..."/></div>;
  if (!user) return <Navigate to="/admin-master/login" replace state={{ from: location.pathname }} />;
  if (!platformAdmin) return <div className="access-denied"><h1>Acesso restrito</h1><p>Seu usuário não possui permissão de administrador da plataforma.</p><a href="/admin/login">Ir para o painel da loja</a></div>;
  if (location.pathname === '/admin-master/mfa') return <Outlet/>;
  if (mfaLevel !== 'aal2') return <Navigate to="/admin-master/mfa" replace state={{ from: location.pathname }} />;
  return <MasterLayout />;
}

const fallback=<div className="page-center"><LoadingState label="Carregando interface..."/></div>;

export default function App() {
  return <Suspense fallback={fallback}><Routes>
    <Route element={<StoreLayout />}>
      <Route path="/" element={<Home />} />
      <Route path="/produto/:slug" element={<ProductDetail />} />
      <Route path="/carrinho" element={<Cart />} />
      <Route path="/finalizar" element={<Checkout />} />
      <Route path="/:storeSlug" element={<Home />} />
      <Route path="/:storeSlug/produto/:slug" element={<ProductDetail />} />
      <Route path="/:storeSlug/carrinho" element={<Cart />} />
      <Route path="/:storeSlug/finalizar" element={<Checkout />} />
    </Route>
    <Route path="/pedido/:orderId" element={<OrderSuccess />} />
    <Route path="/:storeSlug/pedido/:orderId" element={<OrderSuccess />} />

    <Route path="/admin/login" element={<AdminLogin />} />
    <Route path="/admin/esqueci-senha" element={<ForgotPassword />} />
    <Route path="/admin/redefinir-senha" element={<ResetPassword />} />
    <Route element={<ProtectedAdmin />}>
      <Route path="/admin/primeiro-acesso" element={<FirstAccessPassword />} />
      <Route path="/admin" element={<Dashboard />} />
      <Route path="/admin/primeiros-passos" element={<Onboarding />} />
      <Route path="/admin/analytics" element={<Analytics />} />
      <Route path="/admin/financeiro" element={<Finance />} />
      <Route path="/admin/produtos" element={<ProductsAdmin />} />
      <Route path="/admin/produtos/novo" element={<ProductForm />} />
      <Route path="/admin/produtos/:id" element={<ProductForm />} />
      <Route path="/admin/categorias" element={<CategoriesAdmin />} />
      <Route path="/admin/pedidos" element={<OrdersAdmin />} />
      <Route path="/admin/entregas" element={<DeliveryZonesAdmin />} />
      <Route path="/admin/configuracoes" element={<SettingsAdmin />} />
      <Route path="/admin/plano" element={<AdminPlan />} />
    </Route>

    <Route path="/admin-master/login" element={<MasterLogin />} />
    <Route element={<ProtectedMaster />}>
      <Route path="/admin-master/mfa" element={<MasterMfa />} />
      <Route path="/admin-master" element={<MasterDashboard />} />
      <Route path="/admin-master/lojas" element={<MasterStores />} />
      <Route path="/admin-master/planos" element={<MasterPlans />} />
      <Route path="/admin-master/pagamentos" element={<MasterPayments />} />
      <Route path="/admin-master/diagnostico" element={<MasterDiagnostics />} />
    </Route>

    <Route path="/404" element={<NotFound/>}/>
    <Route path="*" element={<NotFound />} />
  </Routes></Suspense>;
}
