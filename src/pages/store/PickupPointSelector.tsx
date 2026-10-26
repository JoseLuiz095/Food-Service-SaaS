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
  compact?: boolean;
};

export function PickupPointSelector({ points, value, onChange, loading, error, invalidQr, compact }: Props) {
  if (!loading && !error && !points.length) return null;
  const selected = points.find((point) => point.id === value);
  return <div className={`store-point-selector${compact ? ' store-point-selector--compact' : ''}`}>
    <label><MapPin size={18} aria-hidden="true"/><span>Ponto de retirada</span>
      <select value={selected?.id || ''} onChange={(event) => onChange(event.target.value)} disabled={loading || Boolean(error)}>
        <option value="">Selecione um ponto</option>
        {points.map((point) => <option key={point.id} value={point.id}>{point.name}{point.address ? ` · ${point.address}` : ''}</option>)}
      </select>
    </label>
    {loading && <small role="status">Consultando pontos de retirada…</small>}
    {error && <small role="alert">{error}</small>}
    {invalidQr && <small role="alert">O QR Code deste ponto não está mais válido. Escolha um ponto da lista.</small>}
    {selected?.instructions && <small>{selected.instructions}</small>}
  </div>;
}

export function PointStockNotice({ product, pointName, row, quantity = 1 }: { product: Product; pointName: string; row?: PointAvailability; quantity?: number }) {
  if (!product.trackStock) return null;
  if (!row) return <p className="store-point-stock">Estoque em {pointName}: consulte ao finalizar.</p>;
  const available = Math.max(0, Number(row.available) || 0);
  if (available >= quantity) return <p className="store-point-stock">{available} un. em {pointName}. Sujeito à confirmação do pedido.</p>;
  return <p className="store-point-stock store-point-stock--warning" role="status">{available ? `Só ${available} un. em ${pointName}.` : `Sem estoque em ${pointName}.`}{row.available_elsewhere ? ' Há unidades em outro local. Consulte as opções de atendimento.' : ' Escolha outro item ou ajuste a quantidade.'}</p>;
}
