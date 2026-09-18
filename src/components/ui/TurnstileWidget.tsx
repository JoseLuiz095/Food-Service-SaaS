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

const SCRIPT_ID = 'foodweb-turnstile-script';
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

const ensureScript = () => new Promise<void>((resolve, reject) => {
  if (window.turnstile) { resolve(); return; }
  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    existing.addEventListener('load', () => resolve(), { once: true });
    existing.addEventListener('error', () => reject(new Error('Falha ao carregar a proteção anti-robô.')), { once: true });
    return;
  }
  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.src = SCRIPT_URL;
  script.async = true;
  script.defer = true;
  script.onload = () => resolve();
  script.onerror = () => reject(new Error('Falha ao carregar a proteção anti-robô.'));
  document.head.appendChild(script);
});

export function TurnstileWidget({
  siteKey,
  onToken,
  resetSignal = 0,
  action = 'checkout',
  compact = false,
}: {
  siteKey: string;
  onToken: (token: string) => void;
  resetSignal?: number;
  action?: string;
  compact?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string>('');
  const onTokenRef = useRef(onToken);
  const [error, setError] = useState('');

  useEffect(() => { onTokenRef.current = onToken; }, [onToken]);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;
    void ensureScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: 'auto',
        size: compact ? 'compact' : 'flexible',
        action,
        callback: (token) => { setError(''); onTokenRef.current(token); },
        'error-callback': () => { onTokenRef.current(''); setError('Não foi possível validar a proteção anti-robô. Tente novamente.'); },
        'expired-callback': () => { onTokenRef.current(''); },
        'timeout-callback': () => { onTokenRef.current(''); setError('A validação expirou. Faça a verificação novamente.'); },
      });
    }).catch((scriptError: unknown) => {
      if (!cancelled) setError(scriptError instanceof Error ? scriptError.message : 'Falha ao carregar a proteção anti-robô.');
    });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = '';
      }
    };
  }, [siteKey, action, compact]);

  useEffect(() => {
    if (!resetSignal || !widgetIdRef.current || !window.turnstile) return;
    onTokenRef.current('');
    window.turnstile.reset(widgetIdRef.current);
  }, [resetSignal]);

  if (!siteKey) return null;
  return <div className={`turnstile-shell ${compact ? 'is-compact' : ''}`}><div ref={containerRef} className="turnstile-container" />{error && <small className="turnstile-error">{error}</small>}</div>;
}
