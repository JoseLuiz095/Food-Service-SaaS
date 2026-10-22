import { ArrowRight, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { loadPublicLanding } from '../services/landingApi';
import { PLATFORM_BRAND, PLATFORM_URL } from '../lib/brand';

const FALLBACK_TRIAL_DAYS = 14;

type FooterOffer = {
  enabled: boolean;
  trialDays: number;
};

export function StorePlatformFooter() {
  const [offer, setOffer] = useState<FooterOffer>({ enabled: true, trialDays: FALLBACK_TRIAL_DAYS });

  useEffect(() => {
    let active = true;

    void loadPublicLanding()
      .then((landing) => {
        if (!active) return;
        setOffer({
          enabled: landing.demoEnabled,
          trialDays: Math.max(1, landing.demoDurationDays),
        });
      })
      .catch(() => {
        // A vitrine continua utilizável mesmo quando a configuração comercial estiver indisponível.
      });

    return () => {
      active = false;
    };
  }, []);

  const trialMessage = offer.enabled ? ` Teste grátis por ${offer.trialDays} dias.` : '';

  return (
    <footer className="store-platform-footer" aria-label={`Conheça a ${PLATFORM_BRAND}`}>
      <div className="store-platform-footer__inner container">
        <div className="store-platform-footer__content">
          <span className="store-platform-footer__eyebrow"><Sparkles size={15} /> GOSTOU DA EXPERIÊNCIA?</span>
          <strong>Que tal ter uma loja assim?</strong>
          <p>Venha conhecer a {PLATFORM_BRAND} e crie sua própria vitrine agora.{trialMessage}</p>
        </div>
        <a className="store-platform-footer__action" href={PLATFORM_URL}>
          Quero me cadastrar <ArrowRight size={16} />
        </a>
      </div>
      <div className="store-platform-footer__base container">
        <a href="https://portifolio-jl095.netlify.app/" target="_blank" rel="noopener noreferrer">Feito por Joseluiz095</a>
        <a href="/admin/login">Área do estabelecimento</a>
      </div>
    </footer>
  );
}
