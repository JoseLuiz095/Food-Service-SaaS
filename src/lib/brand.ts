export const PLATFORM_BRAND = 'VendeWeb';
export const PLATFORM_DOMAIN = 'vendeweb.com.br';
export const PLATFORM_URL = `https://${PLATFORM_DOMAIN}`;
export const PLATFORM_PUBLIC_ORIGINS = [
  PLATFORM_URL,
  `https://www.${PLATFORM_DOMAIN}`,
] as const;

// Mantido enquanto lojas e instalações antigas continuam usando o endereço
// inicial da plataforma. Não use este valor em textos ou links novos.
export const LEGACY_PLATFORM_ORIGIN = 'https://foodweb.joseluizacama.workers.dev';
