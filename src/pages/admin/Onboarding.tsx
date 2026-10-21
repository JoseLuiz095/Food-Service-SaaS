import {
  ArrowUpRight,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Copy,
  Download,
  ExternalLink,
  QrCode,
  Rocket,
  Send,
  Share2,
  ShoppingBag,
} from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorState, LoadingState } from '../../components/ui/AsyncState';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import { copyText } from '../../utils/clipboard';
import { getStoreReadiness } from '../../utils/storeReadiness';
import { publicStorefrontPath, publicStorefrontUrl } from '../../utils/storefrontRoute';
import { getBusinessSegment } from '../../segments/businessSegments';

export default function Onboarding() {
  const { settings, categories, products, deliveryZones, orders, loading, error, reloadAdmin } = useStore();
  const { showToast } = useToast();
  const [storeQrCode, setStoreQrCode] = useState('');
  const [storeQrCodeError, setStoreQrCodeError] = useState('');
  const publicPath = publicStorefrontPath(settings.slug);
  const publicUrl = publicStorefrontUrl(settings.slug);
  const segment = getBusinessSegment(settings.visualTheme);
  const segmentPresentation = segment.id !== 'food' && settings.visualTheme.preset !== 'doce_lua';

  useEffect(() => {
    let cancelled = false;
    setStoreQrCode('');
    setStoreQrCodeError('');
    void QRCode.toDataURL(publicUrl, { errorCorrectionLevel: 'M', margin: 2, width: 320 })
      .then((dataUrl) => {
        if (!cancelled) setStoreQrCode(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setStoreQrCodeError('Não foi possível gerar o QR Code neste aparelho. O link continua disponível para copiar.');
      });
    return () => {
      cancelled = true;
    };
  }, [publicUrl]);

  if (loading) return <LoadingState label="Preparando primeiros passos..." />;
  if (error) return <ErrorState message={error} onRetry={() => void reloadAdmin()} />;

  const readiness = getStoreReadiness(settings, categories, products, deliveryZones);
  const hasOrderFlow = orders.length > 0;

  const copyStoreUrl = async () => {
    try {
      await copyText(publicUrl);
      showToast('Link da loja copiado.', 'success');
    } catch {
      showToast('Não foi possível copiar o link.', 'error');
    }
  };

  const shareStore = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: settings.name, text: `Acesse a loja ${settings.name} e faça seu pedido.`, url: publicUrl });
        return;
      }
      await copyText(publicUrl);
      showToast('Link da loja copiado.', 'success');
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
      showToast('Não foi possível compartilhar o link.', 'error');
    }
  };

  return <>
    <div className="admin-page-title onboarding-title">
      <div>
        <span className="eyebrow">PRIMEIROS PASSOS</span>
        <h1>{segmentPresentation?'Deixe seu catálogo pronto para vender':'Coloque sua loja pronta para receber pedidos'}</h1>
        <p>{segmentPresentation?'Configure a identidade e os itens do catálogo. Confira como o cliente compra antes de compartilhar a vitrine.':'Finalize a configuração essencial, simule um pedido e só depois divulgue o catálogo aos clientes.'}</p>
      </div>
      <div className="onboarding-title__actions">
        <button type="button" className="secondary-button" onClick={() => void copyStoreUrl()}><Copy size={17}/>Copiar link</button>
        <a className="primary-button" href={publicPath} target="_blank" rel="noreferrer"><ExternalLink size={17}/>Abrir vitrine</a>
      </div>
    </div>

    <section className={`admin-card onboarding-hero ${readiness.launchReady ? 'is-ready' : ''}`}>
      <div className="onboarding-hero__main">
        <span className="onboarding-hero__icon"><Rocket size={25}/></span>
        <div>
          <span className="eyebrow">IMPLANTAÇÃO COMERCIAL</span>
          <h2>{readiness.launchReady ? 'Configuração essencial concluída' : 'Sua loja ainda precisa de alguns ajustes'}</h2>
          <p>{readiness.launchReady
            ? 'A vitrine já possui os requisitos mínimos para receber pedidos. Faça uma compra de teste antes de compartilhar o endereço.'
            : 'Conclua os itens pendentes abaixo. Cada atalho leva diretamente à tela que precisa ser configurada.'}</p>
        </div>
      </div>
      <div className="onboarding-score"><strong>{readiness.percent}%</strong><span>{readiness.readyCount}/{readiness.total} concluídos</span></div>
      <div className="progress-track onboarding-progress"><div style={{ width: `${readiness.percent}%` }}/></div>
    </section>

    <div className="onboarding-layout">
      <section className="admin-card onboarding-checklist">
        <div className="admin-card__header"><div><span className="eyebrow">ETAPA 1</span><h2>Configuração obrigatória</h2></div><ClipboardCheck size={22}/></div>
        <div className="onboarding-step-list">
          {readiness.steps.map((step) => <Link key={step.key} to={step.to} className={step.ready ? 'is-done' : ''}>
            {step.ready ? <CheckCircle2 size={21}/> : <Circle size={21}/>} 
            <div><strong>{step.label}</strong><span>{step.ready ? 'Configurado' : step.help}</span></div>
            <ArrowUpRight size={17}/>
          </Link>)}
        </div>
      </section>

      <aside className="onboarding-side">
        <section className={`admin-card onboarding-test ${readiness.launchReady ? '' : 'is-disabled'}`}>
          <div className="admin-card__header"><div><span className="eyebrow">ETAPA 2</span><h2>Teste um pedido real</h2></div><ShoppingBag size={22}/></div>
          {!readiness.launchReady ? <p>O teste será liberado quando os {readiness.total} itens essenciais estiverem configurados.</p> : hasOrderFlow ? <>
            <div className="onboarding-done-note"><CheckCircle2 size={20}/><div><strong>Já existem pedidos registrados</strong><span>O fluxo de checkout já chegou ao banco ao menos uma vez.</span></div></div>
            <a className="secondary-button full-button" href={publicPath} target="_blank" rel="noreferrer">Testar novamente <ExternalLink size={16}/></a>
          </> : <>
            <p>Abra a vitrine como cliente, adicione um produto, finalize e confirme se o WhatsApp abre com a mensagem correta.</p>
            <a className="primary-button full-button" href={publicPath} target="_blank" rel="noreferrer"><ShoppingBag size={17}/>Fazer pedido de teste</a>
          </>}
        </section>

        <section className={`admin-card onboarding-share ${readiness.launchReady && hasOrderFlow ? 'is-ready' : ''}`}>
          <div className="admin-card__header"><div><span className="eyebrow">ETAPA 3</span><h2>Divulgue sua loja</h2></div><Send size={22}/></div>
          <p>{readiness.launchReady && hasOrderFlow
            ? 'Configuração e fluxo de pedido já possuem evidências mínimas. Você pode começar a divulgar o catálogo.'
            : 'Recomendamos divulgar somente depois de concluir a configuração e testar um pedido do início ao fim.'}</p>
          <div className="onboarding-url"><span>Endereço público</span><code>{publicUrl}</code></div>
          <div className="onboarding-store-qr">
            <div className="onboarding-store-qr__visual">
              {storeQrCode ? <img src={storeQrCode} alt={`QR Code para abrir a loja ${settings.name}`} /> : <span className="onboarding-store-qr__loading"><QrCode size={28}/>{storeQrCodeError ? 'QR Code indisponível' : 'Gerando QR Code…'}</span>}
            </div>
            <div className="onboarding-store-qr__copy"><strong>QR Code da loja</strong><span>O cliente escaneia, abre a vitrine e monta o próprio pedido.</span>{storeQrCodeError && <small>{storeQrCodeError}</small>}</div>
          </div>
          <div className="onboarding-share-actions">
            <button type="button" className="secondary-button" onClick={() => void shareStore()}><Share2 size={17}/>Compartilhar loja</button>
            {storeQrCode ? <a className="secondary-button" href={storeQrCode} download={`${settings.slug || 'loja'}-qr-code.png`}><Download size={17}/>Baixar QR Code</a> : <button type="button" className="secondary-button" onClick={() => void copyStoreUrl()}><Copy size={17}/>Copiar endereço</button>}
          </div>
          <small className="onboarding-nfc-note">Para pagamento PIX por aproximação, é necessário um provedor ou terminal compatível com NFC. Este QR Code já agiliza o acesso à loja sem exigir esse equipamento.</small>
        </section>
      </aside>
    </div>
  </>;
}
