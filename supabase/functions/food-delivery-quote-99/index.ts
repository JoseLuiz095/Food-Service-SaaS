type Coordinates = { lat?: unknown; lng?: unknown };
type QuoteRequest = {
  store_id?: unknown;
  origin?: Coordinates;
  destination?: Coordinates;
  category?: unknown;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  Vary: 'Origin',
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, ...extra },
});

// A chave e o endpoint, sozinhos, nunca ativam o provedor. Isso evita que uma
// credencial adicionada para testes libere consultas publicas acidentalmente.
// A loja continua no fluxo manual ate a ativacao explicita do ambiente.
const ninetyNineEnabled = () => Deno.env.get('NINETY_NINE_ENABLED')?.trim().toLowerCase() === 'true';

const asCoordinate = (value: unknown, min: number, max: number) => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
};

const extractAmount = (payload: unknown): number | null => {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload as Record<string, unknown>;
  const nested = (candidate: unknown): number | null => {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) return candidate;
    if (typeof candidate === 'string' && candidate.trim() && Number.isFinite(Number(candidate)) && Number(candidate) >= 0) return Number(candidate);
    return null;
  };
  const candidates = [
    value.price,
    value.amount,
    value.estimatedFare,
    value.estimated_fee,
    value.cost,
    (value.fare as Record<string, unknown> | undefined)?.total,
    (value.data as Record<string, unknown> | undefined)?.price,
    (value.data as Record<string, unknown> | undefined)?.amount,
  ];
  for (const candidate of candidates) {
    const amount = nested(candidate);
    if (amount != null) return Math.round(amount * 100) / 100;
  }
  return null;
};

const quote = async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  if (!ninetyNineEnabled()) {
    return json({
      error: 'Cotação 99 desativada. Continue com a confirmação manual da entrega.',
      code: 'NINETY_NINE_DISABLED',
      fallback: 'manual',
    }, 503);
  }

  const endpointTemplate = Deno.env.get('NINETY_NINE_ESTIMATE_URL')?.trim() || '';
  const apiKey = Deno.env.get('NINETY_NINE_API_KEY')?.trim() || '';
  if (!endpointTemplate || !apiKey) {
    return json({ error: 'Cotação 99 ainda não configurada.', code: 'NINETY_NINE_NOT_CONFIGURED' }, 503);
  }

  let body: QuoteRequest;
  try { body = await request.json() as QuoteRequest; } catch { return json({ error: 'JSON inválido.' }, 400); }
  const storeId = typeof body.store_id === 'string' ? body.store_id.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storeId)) {
    return json({ error: 'Loja inválida.', code: 'INVALID_STORE' }, 400);
  }

  const fromLat = asCoordinate(body.origin?.lat, -90, 90);
  const fromLng = asCoordinate(body.origin?.lng, -180, 180);
  const toLat = asCoordinate(body.destination?.lat, -90, 90);
  const toLng = asCoordinate(body.destination?.lng, -180, 180);
  if (fromLat == null || fromLng == null || toLat == null || toLng == null) {
    return json({ error: 'Origem e destino precisam de latitude e longitude válidas.', code: 'INVALID_COORDINATES' }, 400);
  }

  const employeeId = Deno.env.get('NINETY_NINE_EMPLOYEE_ID')?.trim() || '';
  const endpoint = endpointTemplate.replace('{employeeId}', encodeURIComponent(employeeId));
  let target: URL;
  try {
    target = new URL(endpoint);
  } catch {
    return json({ error: 'Endpoint da cotação 99 inválido.', code: 'INVALID_PROVIDER_ENDPOINT' }, 500);
  }
  target.searchParams.set('fromLat', String(fromLat));
  target.searchParams.set('fromLng', String(fromLng));
  target.searchParams.set('toLat', String(toLat));
  target.searchParams.set('toLng', String(toLng));
  if (typeof body.category === 'string' && body.category.trim()) target.searchParams.set('category', body.category.trim());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const providerResponse = await fetch(target, {
      method: 'GET',
      headers: { Accept: 'application/json', 'x-api-key': apiKey },
      signal: controller.signal,
    });
    const raw = await providerResponse.text();
    let payload: unknown = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
    if (!providerResponse.ok) {
      console.warn('Cotação 99 recusada:', providerResponse.status);
      return json({ error: 'A 99 não conseguiu calcular a entrega agora.', code: 'PROVIDER_ERROR' }, 502);
    }
    const amount = extractAmount(payload);
    if (amount == null) {
      console.warn('Resposta da 99 sem valor reconhecido. Ajuste o adaptador após confirmar o contrato.');
      return json({ error: 'A resposta da 99 não trouxe um valor reconhecido.', code: 'PROVIDER_RESPONSE_UNSUPPORTED' }, 502);
    }
    return json({ provider: '99', available: true, estimated_fee: amount, currency: 'BRL', expires_in_seconds: 60 });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return json({ error: 'A cotação da 99 demorou mais que o esperado.', code: 'PROVIDER_TIMEOUT' }, 504);
    return json({ error: 'Não foi possível consultar a 99 agora.', code: 'PROVIDER_UNAVAILABLE' }, 502);
  } finally {
    clearTimeout(timeout);
  }
};

Deno.serve(quote);
