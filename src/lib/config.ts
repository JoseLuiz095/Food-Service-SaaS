const trimSlash = (value: string) => value.replace(/\/+$/, '');

export const appConfig = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ? trimSlash(import.meta.env.VITE_SUPABASE_URL) : '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
  defaultStoreSlug: import.meta.env.VITE_DEFAULT_STORE_SLUG || 'central-food-demo',
  appEnv: import.meta.env.VITE_APP_ENV || 'development',
  analyticsEnabled: String(import.meta.env.VITE_ANALYTICS_ENABLED || '').toLowerCase() === 'true',
  turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY || '',
};

export const isSupabaseConfigured = Boolean(appConfig.supabaseUrl && appConfig.supabaseAnonKey);
// Demonstração local só é permitida no ambiente de desenvolvimento. Em produção,
// ausência das variáveis deve aparecer como erro de configuração, nunca como uma loja demo silenciosa.
export const isDemoMode = import.meta.env.DEV && !isSupabaseConfigured;
