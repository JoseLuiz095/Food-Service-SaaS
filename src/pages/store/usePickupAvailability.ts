import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';
import { useStore } from '../../contexts/StoreContext';
import { restFetch } from '../../lib/supabaseRest';
import { saveFulfillmentPreference } from '../../utils/fulfillmentPreference';

export type PickupPoint = { id: string; name: string; short_code: string; address?: string; instructions?: string };
export type PointAvailability = { product_id: string; available: number; available_elsewhere: boolean | number };

export function usePickupAvailability(enabled = true) {
  const { settings, dataMode } = useStore();
  const { pickupLocationId, setPickupLocationId } = useCart();
  const [searchParams] = useSearchParams();
  const pointCode = searchParams.get('ponto');
  const [points, setPoints] = useState<PickupPoint[]>([]);
  const [pointsLoading, setPointsLoading] = useState(false);
  const [pointsError, setPointsError] = useState('');
  const [availability, setAvailability] = useState<PointAvailability[] | null>(null);
  const [availabilityPointId, setAvailabilityPointId] = useState('');
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [invalidQr, setInvalidQr] = useState(false);

  useEffect(() => {
    if (!enabled || !settings.id || dataMode === 'demo') { setPoints([]); setPointsLoading(false); return; }
    let active = true;
    setPointsLoading(true);
    setPointsError('');
    void restFetch<PickupPoint[]>('rpc/food_get_public_pickup_locations_v1', {
      method: 'POST', body: { p_store_id: settings.id },
    }).then((result) => {
      if (!active) return;
      const valid = Array.isArray(result) ? result : [];
      setPoints(valid);
      const qrPoint = pointCode ? valid.find((point) => point.short_code === pointCode) : undefined;
      setInvalidQr(Boolean(pointCode && !qrPoint));
      if (qrPoint) { setPickupLocationId(qrPoint.id); saveFulfillmentPreference(settings.id, 'pickup'); }
      else if (pointCode) setPickupLocationId('');
      else if (pickupLocationId && !valid.some((point) => point.id === pickupLocationId)) setPickupLocationId('');
    }).catch(() => {
      if (active) { setPoints([]); setPointsError('Não foi possível consultar os pontos de retirada. Tente recarregar a página.'); }
    }).finally(() => { if (active) setPointsLoading(false); });
    return () => { active = false; };
  }, [enabled, settings.id, dataMode, pointCode]);

  useEffect(() => {
    if (!enabled || !settings.id || !pickupLocationId || !points.some((point) => point.id === pickupLocationId) || dataMode === 'demo') {
      setAvailability(null);
      setAvailabilityPointId('');
      setAvailabilityLoading(false);
      return;
    }
    let active = true;
    setAvailability(null);
    setAvailabilityPointId(pickupLocationId);
    setAvailabilityLoading(true);
    setAvailabilityError('');
    void restFetch<PointAvailability[]>('rpc/food_get_public_location_availability_v1', {
      method: 'POST', body: { p_store_id: settings.id, p_pickup_location_id: pickupLocationId },
    }).then((result) => { if (active) setAvailability(Array.isArray(result) ? result : null); })
      .catch(() => { if (active) setAvailabilityError('Não foi possível consultar o estoque deste ponto. A confirmação dependerá da validação no servidor.'); })
      .finally(() => { if (active) setAvailabilityLoading(false); });
    return () => { active = false; };
  }, [enabled, settings.id, pickupLocationId, points, dataMode]);

  const revalidate = async (id: string) => {
    let currentPoints: PickupPoint[];
    try {
      currentPoints = await restFetch<PickupPoint[]>('rpc/food_get_public_pickup_locations_v1', {
        method: 'POST', body: { p_store_id: settings.id },
      });
    } catch { throw new Error('Não foi possível confirmar o ponto de retirada. Tente novamente antes de registrar o pedido.'); }
    if (!Array.isArray(currentPoints) || !currentPoints.some((point) => point.id === id)) {
      setPickupLocationId('');
      throw new Error('O ponto de retirada escolhido não está mais disponível. Selecione outro ponto.');
    }
    let result: PointAvailability[];
    try {
      result = await restFetch<PointAvailability[]>('rpc/food_get_public_location_availability_v1', {
        method: 'POST', body: { p_store_id: settings.id, p_pickup_location_id: id },
      });
    } catch { throw new Error('Não foi possível confirmar o estoque deste ponto. Tente novamente antes de registrar o pedido.'); }
    if (!Array.isArray(result)) throw new Error('Não foi possível confirmar o estoque deste ponto. Tente novamente.');
    setPoints(currentPoints);
    setAvailabilityPointId(id);
    setAvailability(result);
    return result;
  };

  const selectPoint = (id: string) => { setInvalidQr(false); setPickupLocationId(id); if (id) saveFulfillmentPreference(settings.id, 'pickup'); };
  const selectedPoint = points.find((point) => point.id === pickupLocationId);
  return { points, pointsLoading, pointsError, pickupLocationId, setPickupLocationId: selectPoint, selectedPoint, identifiedByQr: Boolean(pointCode && selectedPoint?.short_code === pointCode && !invalidQr), availability: availabilityPointId === pickupLocationId ? availability : null, availabilityLoading, availabilityError, invalidQr, revalidate };
}

export const pointStock = (rows: PointAvailability[] | null, productId: string): PointAvailability | undefined =>
  rows === null ? undefined : rows.find((row) => row.product_id === productId) || { product_id: productId, available: 0, available_elsewhere: false };
