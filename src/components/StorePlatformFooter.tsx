import { ArrowRight, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { loadPublicLanding } from '../services/landingApi';

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
    <footer className="store-platform-footer" aria-label="Conheça o FoodWeb">
      <div className="store-platform-footer__inner container">
        <div className="store-platform-footer__content">
          <span className="store-platform-footer__eyebrow"><Sparkles size={15} /> GOSTOU DA EXPERIÊNCIA?</span>
          <strong>Que tal ter uma loja assim?</strong>
          <p>Venha conhecer o FoodWeb e crie sua própria vitrine agora.{trialMessage}</p>
        </div>
        <a className="store-platform-footer__action" href="/cadastro?plan=DEMO">
          Criar minha loja <ArrowRight size={16} />
        </a>
      </div>
      <div className="store-platform-footer__base container">
        <span>Feito com FoodWeb</span>
        <a href="/admin/login">Área do estabelecimento</a>
      </div>
    </footer>
  );
}
