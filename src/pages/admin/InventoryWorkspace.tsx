import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { LoadingState } from '../../components/ui/AsyncState';
import { useStore } from '../../contexts/StoreContext';
import { useStockMode } from '../../hooks/useStockMode';
import './inventory-workspace.css';

const Inventory = lazy(() => import('./Inventory'));
const StockLocations = lazy(() => import('./StockLocations'));
type View = 'locais' | 'produtos';

export function LegacyStockLocations() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set('visao', 'locais');
  return <Navigate replace to={`/admin/estoque?${params}${location.hash}`} />;
}

function Workspace({ storeName, multiLocation }: { storeName: string; multiLocation: boolean | null }) {
  const [params] = useSearchParams();
  const location = useLocation();
  const requested = params.get('visao');
  const view: View = requested === 'locais' || requested === 'produtos'
    ? requested : multiLocation === true ? 'locais' : 'produtos';
  const [visited, setVisited] = useState<View[]>([view]);
  useEffect(() => { setVisited(current => current.includes(view) ? current : [...current, view]); }, [view]);
  const destination = (next: View) => {
    const search = new URLSearchParams(params);
    search.set('visao', next);
    return { pathname: '/admin/estoque', search: `?${search}`, hash: location.hash };
  };
  return <div className="inventory-workspace-shell">
    <div className="inventory-workspace__context"><span>Loja ativa: <strong>{storeName}</strong></span></div>
    <nav className="inventory-workspace__navigation" aria-label="Visões do estoque">
      <Link to={destination('locais')} aria-current={view === 'locais' ? 'page' : undefined}>
        {multiLocation === true ? 'Saldos por local' : 'Locais e pontos'}
      </Link>
      <Link to={destination('produtos')} aria-current={view === 'produtos' ? 'page' : undefined}>Produtos e insumos</Link>
    </nav>
    {(view === 'locais' || visited.includes('locais')) && <div className="inventory-workspace__pane" hidden={view !== 'locais'}>
      <Suspense fallback={<LoadingState label="Carregando saldos por local..." />}><StockLocations /></Suspense>
    </div>}
    {(view === 'produtos' || visited.includes('produtos')) && <div className="inventory-workspace__pane" hidden={view !== 'produtos'}>
      <Suspense fallback={<LoadingState label="Carregando produtos e insumos..." />}><Inventory /></Suspense>
    </div>}
  </div>;
}

export default function InventoryWorkspace() {
  const { settings } = useStore();
  const { enabled, loading } = useStockMode(settings.id);
  if (loading) return <LoadingState label="Carregando configuração do estoque..." />;
  // Cada loja recebe uma instância nova; respostas e rascunhos da anterior não são reutilizados.
  return <Workspace key={settings.id} storeName={settings.name} multiLocation={enabled} />;
}
