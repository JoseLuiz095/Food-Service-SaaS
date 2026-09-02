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
