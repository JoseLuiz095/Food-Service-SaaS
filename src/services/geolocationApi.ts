export type CurrentLocationAddress = {
  zipCode: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
};

type BrowserPositionError = { code?: number };
type NominatimResponse = {
  address?: {
    postcode?: string;
    road?: string;
    pedestrian?: string;
    neighbourhood?: string;
    suburb?: string;
    quarter?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    'ISO3166-2-lvl4'?: string;
  };
};

const reverseCache = new Map<string, CurrentLocationAddress>();
let lastReverseLookupAt = 0;

const positionFromBrowser = () => new Promise<GeolocationPosition>((resolve, reject) => {
  if (!('geolocation' in navigator)) {
    reject(new Error('Este navegador não oferece localização. Informe o CEP manualmente.'));
    return;
  }
  navigator.geolocation.getCurrentPosition(resolve, (error: BrowserPositionError) => {
    if (error.code === 1) reject(new Error('A localização foi bloqueada. Você pode informar o CEP manualmente.'));
    else if (error.code === 3) reject(new Error('A localização demorou para responder. Tente novamente ou informe o CEP.'));
    else reject(new Error('Não foi possível obter sua localização agora. Informe o CEP manualmente.'));
  }, { enableHighAccuracy: true, timeout: 10_000, maximumAge: 300_000 });
});

/**
 * Uso pontual, iniciado pelo cliente, para sugerir endereço no checkout.
 * As coordenadas não são persistidas no pedido, no cookie ou no navegador.
 */
export async function lookupCurrentLocationAddress(): Promise<CurrentLocationAddress> {
  const position = await positionFromBrowser();
  const { latitude, longitude } = position.coords;
  const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  const cached = reverseCache.get(cacheKey);
  if (cached) return cached;

  // Mantém o uso pontual do serviço de geocodificação bem abaixo de 1 requisição/s.
  const waitFor = 1_050 - (Date.now() - lastReverseLookupAt);
  if (waitFor > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, waitFor));

  const endpoint = new URL('https://nominatim.openstreetmap.org/reverse');
  endpoint.searchParams.set('format', 'jsonv2');
  endpoint.searchParams.set('addressdetails', '1');
  endpoint.searchParams.set('zoom', '18');
  endpoint.searchParams.set('lat', String(latitude));
  endpoint.searchParams.set('lon', String(longitude));

  lastReverseLookupAt = Date.now();
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error('Não foi possível sugerir o endereço pela localização. Informe o CEP manualmente.');
  const data = await response.json() as NominatimResponse;
  const address = data.address;
  if (!address) throw new Error('Não encontramos um endereço para sua localização. Informe o CEP manualmente.');

  const stateCode = (address['ISO3166-2-lvl4'] || '').split('-').pop() || address.state || '';
  const result: CurrentLocationAddress = {
    zipCode: String(address.postcode || '').replace(/\D/g, '').slice(0, 8),
    street: address.road || address.pedestrian || '',
    neighborhood: address.neighbourhood || address.suburb || address.quarter || '',
    city: address.city || address.town || address.village || address.municipality || '',
    state: stateCode,
  };
  reverseCache.set(cacheKey, result);
  return result;
}
