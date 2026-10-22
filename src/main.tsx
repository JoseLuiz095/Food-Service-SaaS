import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { StoreProvider } from './contexts/StoreContext';
import { ToastProvider } from './contexts/ToastContext';
import { installGlobalInteractionTelemetry } from './services/interactionTelemetry';
import './styles.css';

installGlobalInteractionTelemetry();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js?v=20261022', { updateViaCache: 'none' }).catch(() => {
      // O app continua funcionando normalmente mesmo sem o modo instalável.
    });
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado.');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <StoreProvider>
            <CartProvider>
              <App />
            </CartProvider>
          </StoreProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);

const splash = document.getElementById('foodweb-splash-screen');
if (splash) {
  const startedAt = performance.now();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const minimumVisibleMs = reducedMotion ? 180 : 520;
  const splashImage = splash.querySelector<HTMLImageElement>('img');
  let imageReady = !splashImage || splashImage.complete;
  let dismissed = false;

  const dismissSplash = (force = false) => {
    if (dismissed || !splash.isConnected || (!imageReady && !force)) return;
    dismissed = true;
    const wait = Math.max(0, minimumVisibleMs - (performance.now() - startedAt));
    window.setTimeout(() => {
      if (!splash.isConnected) return;
      splash.classList.add('is-ready');
      window.setTimeout(() => splash.remove(), reducedMotion ? 0 : 280);
    }, wait);
  };

  // Aguarda a primeira pintura do React para evitar um flash vazio entre a arte e o app.
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => dismissSplash()));
  if (splashImage && !imageReady) {
    splashImage.addEventListener('load', () => { imageReady = true; dismissSplash(); }, { once: true });
    splashImage.addEventListener('error', () => { imageReady = true; dismissSplash(); }, { once: true });
  }
  // Fallback para redes lentas ou erros de carregamento de algum recurso externo.
  window.setTimeout(() => dismissSplash(true), 2200);
}
