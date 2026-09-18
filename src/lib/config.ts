const trimSlash = (value: string) => value.replace(/\/+$/, '');

// Esses dois identificadores sao publicos por natureza e ja fazem parte do bundle
// do navegador. Variaveis VITE_* continuam tendo prioridade para permitir troca
// de projeto sem alterar codigo.
export const FOODWEB_DEFAULT_SUPABASE_URL = 'https://elttryavkeartoxgdgse.supabase.co';
export const FOODWEB_DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_zBBXeb_s0IPTQgN283z9tw_-MisrJpl';

export const appConfig = {
  supabaseUrl: trimSlash(import.meta.env.VITE_SUPABASE_URL || FOODWEB_DEFAULT_SUPABASE_URL),
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? FOODWEB_DEFAULT_SUPABASE_PUBLISHABLE_KEY,
  defaultStoreSlug: import.meta.env.VITE_DEFAULT_STORE_SLUG || 'central-food-demo',
  appEnv: import.meta.env.VITE_APP_ENV || 'development',
  analyticsEnabled: String(import.meta.env.VITE_ANALYTICS_ENABLED || 'true').toLowerCase() === 'true',
  turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY || '',
};

export const isSupabaseConfigured = Boolean(appConfig.supabaseUrl && appConfig.supabaseAnonKey);
export const isDemoMode = import.meta.env.DEV && !isSupabaseConfigured;

const PLATFORM_HOSTS = new Set([
  'foodweb.joseluizacama.workers.dev',
  'localhost',
  '127.0.0.1',
]);

export const isFoodWebPlatformHost = (hostname: string) => PLATFORM_HOSTS.has(String(hostname || '').trim().toLowerCase());
export const isFoodWebMarketingRoot = (pathname: string, hostname: string) => pathname === '/' && isFoodWebPlatformHost(hostname);
