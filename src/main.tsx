import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App, { CanonicalPlatformBoundary } from './App';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { StoreProvider } from './contexts/StoreContext';
import { ToastProvider } from './contexts/ToastContext';
import { installGlobalInteractionTelemetry } from './services/interactionTelemetry';
import { startInstallCapture } from './services/pwaInstall';
import './styles.css';
import './segments/doce-lua-accessibility.css';
import './layouts/mobile-workspace.css';

const OrderPayment = lazy(() => import('./pages/store/OrderPayment'));
const isPaymentPage = /^\/pagamento\/pix\/?$/.test(window.location.pathname);
if (!isPaymentPage) installGlobalInteractionTelemetry();
startInstallCapture();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js?v=20261022-pwa2', { scope: '/', updateViaCache: 'none' }).catch(() => {
      // O app continua funcionando normalmente mesmo sem o modo instalável.
    });
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado.');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      {isPaymentPage ? <Suspense fallback={<main role="status">Conferindo pagamento…</main>}><OrderPayment/></Suspense> : <CanonicalPlatformBoundary>
        <ToastProvider>
          <AuthProvider>
            <StoreProvider>
              <CartProvider>
                <App />
              </CartProvider>
            </StoreProvider>
          </AuthProvider>
        </ToastProvider>
      </CanonicalPlatformBoundary>}
    </BrowserRouter>
  </StrictMode>,
);

const splash = document.getElementById('foodweb-splash-screen');
if (splash) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const splashImage = splash.querySelector<HTMLImageElement>('img');
  let imageReady = !splashImage || splashImage.complete;
  let dismissed = false;

  const dismissSplash = (force = false) => {
    if (dismissed || !splash.isConnected || (!imageReady && !force)) return;
    dismissed = true;
    const wait = 0;
    window.setTimeout(() => {
      if (!splash.isConnected) return;
      splash.classList.add('is-ready');
      window.setTimeout(() => splash.remove(), reducedMotion ? 0 : 280);
    }, wait);
  };

  // Aguarda a primeira pintura do React para evitar um flash vazio entre a arte e o app.
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => dismissSplash(true)));
  if (splashImage && !imageReady) {
    splashImage.addEventListener('load', () => { imageReady = true; dismissSplash(); }, { once: true });
    splashImage.addEventListener('error', () => { imageReady = true; dismissSplash(); }, { once: true });
  }
  // Fallback para redes lentas ou erros de carregamento de algum recurso externo.
  window.setTimeout(() => dismissSplash(true), 2200);
}
