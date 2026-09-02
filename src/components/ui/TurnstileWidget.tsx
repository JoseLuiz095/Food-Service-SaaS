import { useEffect, useRef, useState } from 'react';

type TurnstileApi = {
  render: (container: HTMLElement, options: {
    sitekey: string;
    theme?: 'light' | 'dark' | 'auto';
    size?: 'normal' | 'compact' | 'flexible';
    action?: string;
    callback?: (token: string) => void;
    'error-callback'?: () => void;
    'expired-callback'?: () => void;
    'timeout-callback'?: () => void;
  }) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = 'foodservice-turnstile-script';
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

const ensureScript = () => new Promise<void>((resolve, reject) => {
  if (window.turnstile) { resolve(); return; }
  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    existing.addEventListener('load', () => resolve(), { once: true });
    existing.addEventListener('error', () => reject(new Error('Falha ao carregar a proteção anti-spam.')), { once: true });
    return;
  }
  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.src = SCRIPT_URL;
  script.async = true;
  script.defer = true;
  script.onload = () => resolve();
  script.onerror = () => reject(new Error('Falha ao carregar a proteção anti-spam.'));
  document.head.appendChild(script);
});

export function TurnstileWidget({
  siteKey,
  onToken,
  resetSignal = 0,
}: {
  siteKey: string;
  onToken: (token: string) => void;
  resetSignal?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string>('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;
    void ensureScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: 'auto',
        size: 'flexible',
        action: 'checkout',
        callback: (token) => { setError(''); onToken(token); },
        'error-callback': () => { onToken(''); setError('Não foi possível validar a proteção anti-spam. Tente novamente.'); },
        'expired-callback': () => { onToken(''); },
        'timeout-callback': () => { onToken(''); setError('A validação expirou. Conclua novamente antes de finalizar o pedido.'); },
      });
    }).catch((scriptError: unknown) => {
      if (!cancelled) setError(scriptError instanceof Error ? scriptError.message : 'Falha ao carregar a proteção anti-spam.');
    });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = '';
      }
    };
  }, [siteKey, onToken]);

  useEffect(() => {
    if (!resetSignal || !widgetIdRef.current || !window.turnstile) return;
    onToken('');
    window.turnstile.reset(widgetIdRef.current);
  }, [resetSignal, onToken]);

  if (!siteKey) return null;
  return <div className="turnstile-shell"><div ref={containerRef} className="turnstile-container" />{error && <small className="turnstile-error">{error}</small>}</div>;
}
