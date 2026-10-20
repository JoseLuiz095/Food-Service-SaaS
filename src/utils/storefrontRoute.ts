const RESERVED_ROOT_SEGMENTS = new Set([
  'admin',
  'admin-master',
  'produto',
  'carrinho',
  'finalizar',
  'pedido',
  '404',
]);

export const storeSlugFromPath = (pathname: string): string | null => {
  const [first] = pathname.split('/').filter(Boolean);
  if (!first || RESERVED_ROOT_SEGMENTS.has(first.toLowerCase())) return null;
  return decodeURIComponent(first);
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
export const publicStorefrontUrl = (storeSlug?: string | null): string => {
  const path = publicStorefrontPath(storeSlug);
  return typeof window === 'undefined' ? path : new URL(path, window.location.origin).toString();
};
