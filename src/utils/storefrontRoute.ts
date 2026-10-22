import { isLocalPlatformHost, isPlatformDomain, PLATFORM_URL } from '../lib/brand';

const RESERVED_ROOT_SEGMENTS = new Set([
  'admin',
  'admin-master',
  'produto',
  'carrinho',
  'finalizar',
  'pedido',
  '404',
  'cadastro',
  'modulos',
]);

export const storeSlugFromPath = (pathname: string): string | null => {
  const [first] = pathname.split('/').filter(Boolean);
  if (!first || RESERVED_ROOT_SEGMENTS.has(first.toLowerCase())) return null;
  try { return decodeURIComponent(first); } catch { return null; }
};

export const storeBasePathFromPath = (pathname: string): string => {
  const slug = storeSlugFromPath(pathname);
  return slug ? `/${encodeURIComponent(slug)}` : '';
};

export const storefrontPath = (basePath: string, suffix = ''): string => {
  const base = basePath.replace(/\/$/, '');
  if (!suffix || suffix === '/') return base || '/';
  const normalized = suffix.startsWith('/') ? suffix : `/${suffix}`;
  return `${base}${normalized}` || '/';
};

/**
 * Caminho canônico da vitrine da loja ativa.
 *
 * Não derive este valor da URL atual: no painel administrativo a rota começa
 * em /admin e, portanto, não carrega o slug público da loja.
 */
export const publicStorefrontPath = (storeSlug?: string | null): string => {
  const slug = storeSlug?.trim();
  return slug ? `/${encodeURIComponent(slug)}` : '/';
};

/** URL completa usada em QR Codes, cópia e compartilhamento nativo. */
export const publicStorefrontUrl = (storeSlug?: string | null, currentOrigin = typeof window === 'undefined' ? PLATFORM_URL : window.location.origin): string => {
  const path = publicStorefrontPath(storeSlug);
  try {
    const origin = new URL(currentOrigin);
    if (/^https?:$/.test(origin.protocol)) {
      if (isLocalPlatformHost(origin.hostname)) return new URL(path, origin.origin).toString();
      // Uma loja atendida por domínio próprio usa a raiz desse domínio.
      if (!isPlatformDomain(origin.hostname)) return new URL('/', origin.origin).toString();
    }
  } catch { /* Dados inválidos nunca se tornam destino do compartilhamento. */ }
  return new URL(path, PLATFORM_URL).toString();
};

/** Produto compartilhado usa o mesmo domínio oficial da vitrine, sem carregar tokens da URL atual. */
export const publicProductUrl = (storeSlug: string | null | undefined, productSlug: string, currentOrigin?: string): string => {
  const storefront = publicStorefrontUrl(storeSlug, currentOrigin);
  return new URL(`produto/${encodeURIComponent(productSlug)}`, `${storefront.replace(/\/$/, '')}/`).toString();
};

/** Domínios configurados pelo Master aceitam somente um hostname DNS, sem credenciais ou caminhos. */
export const customStorefrontUrl = (customDomain?: string | null): string | null => {
  if (!customDomain?.trim()) return null;
  try {
    const raw = customDomain.trim();
    if (/^[\/\\]|[\s\\]/.test(raw)) return null;
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) return null;
    if (isPlatformDomain(url.hostname) || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(url.hostname)) return null;
    return `https://${url.hostname}/`;
  } catch { return null; }
};
