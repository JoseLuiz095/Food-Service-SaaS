export const PLATFORM_BRAND = 'VendeWeb';
export const PLATFORM_APEX_DOMAIN = 'vendeweb.com.br';
export const PLATFORM_DOMAIN = `www.${PLATFORM_APEX_DOMAIN}`;
export const PLATFORM_URL = `https://${PLATFORM_DOMAIN}`;
export const PLATFORM_PUBLIC_ORIGINS = [
  PLATFORM_URL,
  `https://${PLATFORM_APEX_DOMAIN}`,
] as const;

// Mantido enquanto lojas e instalações antigas continuam usando o endereço
// inicial da plataforma. Não use este valor em textos ou links novos.
export const LEGACY_PLATFORM_ORIGIN = 'https://foodweb.joseluizacama.workers.dev';

const PLATFORM_HOSTS = new Set([PLATFORM_DOMAIN, PLATFORM_APEX_DOMAIN, new URL(LEGACY_PLATFORM_ORIGIN).hostname]);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '172.26.224.1']);

export const isPlatformDomain = (hostname: string): boolean => PLATFORM_HOSTS.has(hostname.toLowerCase());
export const isLocalPlatformHost = (hostname: string): boolean => LOCAL_HOSTS.has(hostname.toLowerCase());

/** Convites e recuperação usam o domínio oficial; o ambiente local continua testável. */
export const platformOrigin = (currentOrigin = typeof window === 'undefined' ? '' : window.location.origin): string => {
  try {
    const url = new URL(currentOrigin);
    if (/^https?:$/.test(url.protocol) && isLocalPlatformHost(url.hostname)) return url.origin;
  } catch { /* Sem uma origem válida, usa o endereço público oficial. */ }
  return PLATFORM_URL;
};

/** Confirmações e carrinhos dependem de armazenamento privado da origem anterior. */
export const isOriginBoundShoppingPath = (pathname: string): boolean => /(?:^|\/)(?:pedido|carrinho|finalizar)(?:\/|$)/i.test(pathname);

type ShoppingStorage = Pick<Storage, 'length' | 'key' | 'getItem'>;
/** O código PKCE só pode ser trocado onde seu verificador privado foi criado. */
export const hasOriginBoundAuthCallback = (href: string, storage: ShoppingStorage): boolean => {
  try {
    if (!new URL(href).searchParams.has('code')) return false;
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index) || '';
      if (key.startsWith('foodservice.auth.v1') && key.endsWith('-code-verifier') && storage.getItem(key)) return true;
    }
    return false;
  } catch { return true; }
};

export const hasOriginBoundShoppingState = (storage: ShoppingStorage): boolean => {
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index) || '';
      if (!key.startsWith('foodservice_cart_v1:') && !key.startsWith('foodweb_checkout_draft_v1:')) continue;
      const raw = storage.getItem(key);
      if (!raw) continue;
      try {
        const value: unknown = JSON.parse(raw);
        if (Array.isArray(value) ? value.length > 0 : Boolean(value && typeof value === 'object' && Object.keys(value).length)) return true;
      } catch { return true; }
    }
    return false;
  } catch { return true; }
};

/** Só migra aliases conhecidos. Nunca usa parâmetros do visitante como destino. */
export const canonicalPlatformRedirect = (href: string, preserveShoppingSession = false): string | null => {
  try {
    const source = new URL(href);
    if (!/^https?:$/.test(source.protocol) || !isPlatformDomain(source.hostname)) return null;
    if (source.origin === PLATFORM_URL) return null;
    if (preserveShoppingSession || isOriginBoundShoppingPath(source.pathname)) return null;
    const target = new URL(PLATFORM_URL);
    target.pathname = source.pathname;
    target.search = source.search;
    target.hash = source.hash;
    return target.toString();
  } catch { return null; }
};
