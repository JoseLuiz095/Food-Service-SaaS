import { MapPin } from 'lucide-react';
import type { PickupPoint } from './usePickupAvailability';
import type { PointAvailability } from './usePickupAvailability';
import type { Product } from '../../types';
import './pickup-point.css';

type Props = {
  points: PickupPoint[];
  value: string;
  onChange: (id: string) => void;
  loading?: boolean;
  error?: string;
  invalidQr?: boolean;
  identifiedByQr?: boolean;
  compact?: boolean;
};

export function PickupPointSelector({ points, value, onChange, loading, error, invalidQr, identifiedByQr, compact }: Props) {
  if (!loading && !error && !invalidQr && !points.length) return null;
  const selected = loading ? undefined : points.find((point) => point.id === value);
  const selection = <label><MapPin size={18} aria-hidden="true"/><span>Ponto de retirada</span>
    <select value={selected?.id || ''} onChange={(event) => onChange(event.target.value)} disabled={loading || Boolean(error)}>
      <option value="">Selecione um ponto</option>
      {points.map((point) => <option key={point.id} value={point.id}>{point.name}{point.address ? ` · ${point.address}` : ''}</option>)}
    </select>
  </label>;
  return <div className={`store-point-selector${compact ? ' store-point-selector--compact' : ''}`}>
    {selected ? <>
      <div className="store-point-context" role="status"><MapPin size={18} aria-hidden="true"/><span><strong>{identifiedByQr ? 'Local identificado' : 'Ponto escolhido'}: {selected.name}</strong>{selected.address && <small>{selected.address}</small>}</span></div>
      {points.length > 1 && <details className="store-point-change" key={selected.id}><summary>Trocar ponto</summary>{selection}</details>}
    </> : !loading && !error && points.length ? selection : null}
    {loading && <small role="status">Consultando pontos de retirada…</small>}
    {error && <small role="alert">{error}</small>}
    {invalidQr && <small role="alert">O QR Code deste ponto não está mais válido. Escolha um ponto da lista.</small>}
    {selected?.instructions && <small>{selected.instructions}</small>}
  </div>;
}

export function PointStockNotice({ product, pointName, row, quantity = 1 }: { product: Product; pointName: string; row?: PointAvailability; quantity?: number }) {
  if (!product.trackStock || !row) return null;
  const available = Math.max(0, Number(row.available) || 0);
  const label = `${available} ${available === 1 ? 'disponível' : 'disponíveis'}`;
  const insufficient = available < quantity;
  return <p className={`store-point-stock${insufficient ? ' store-point-stock--warning' : ''}`} role="status" aria-label={`Disponibilidade em ${pointName}: ${label}`}>{label}</p>;
}
