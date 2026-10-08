import { ArrowLeft, Banknote, Bell, Check, CheckCircle2, Copy, CreditCard, MessageCircle, QrCode, Store } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import type { OrderConfirmation } from '../../types';
import { copyText } from '../../utils/clipboard';
import { currency } from '../../utils/format';
import { formatOrderNumber, readOrderConfirmation } from '../../utils/orderConfirmation';
import { buildPostOrderWhatsAppMessage, getWhatsAppUrl } from '../../utils/whatsapp';
import { storefrontPath } from '../../utils/storefrontRoute';
import { getStorefrontThemeStyle } from '../../utils/storeVisualTheme';
import { customerOrderNotificationStatus, enableCustomerOrderNotifications, type CustomerOrderNotificationStatus } from '../../services/pwaNotifications';

export default function OrderSuccess() {
  const { orderId = '' } = useParams();
  const location = useLocation();
  const { markOrderWhatsAppClicked, settings, storeBasePath } = useStore();
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [pixQrCode, setPixQrCode] = useState('');
  const [whatsappMarkState, setWhatsappMarkState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [customerNotificationState, setCustomerNotificationState] = useState<CustomerOrderNotificationStatus>('unsupported');
  const [customerNotificationBusy, setCustomerNotificationBusy] = useState(false);
  const storefrontThemeStyle = getStorefrontThemeStyle(settings.visualTheme);

  const confirmation = useMemo(() => {
    const fromState = location.state as OrderConfirmation | null;
    if (fromState?.orderId === orderId) return fromState;
    return readOrderConfirmation(orderId);
  }, [location.state, orderId]);

  useEffect(() => {
    let cancelled = false;
    const payload = confirmation?.pixPayload || '';
    if (!payload) {
      setPixQrCode('');
      return () => { cancelled = true; };
    }
    void QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 2, width: 260 })
      .then((dataUrl) => { if (!cancelled) setPixQrCode(dataUrl); })
      .catch(() => { if (!cancelled) setPixQrCode(''); });
    return () => { cancelled = true; };
  }, [confirmation?.pixPayload]);

  useEffect(() => {
    if (!confirmation) return;
    setCustomerNotificationState(customerOrderNotificationStatus(confirmation.orderId));
  }, [confirmation]);

  if (!confirmation) {
    return (
      <main className="order-success-page food-storefront-theme" style={storefrontThemeStyle}>
        <section className="order-success-card order-success-card--missing">
          <div className="success-icon"><CheckCircle2 size={50} /></div>
          <h1>Pedido não disponível nesta sessão</h1>
          <p>Por segurança, os dados de confirmação ficam somente nesta sessão do navegador.</p>
          <a className="primary-button" href={storefrontPath(storeBasePath)}><ArrowLeft size={18} />Voltar para o cardápio</a>
        </section>
      </main>
    );
  }

  const isPix = confirmation.paymentMethod === 'pix' && confirmation.pixEnabled;
  const isPixCopyPaste = isPix && confirmation.pixReceiptMode === 'copy_paste' && Boolean(confirmation.pixCopyPaste.trim());
  const isPixKey = isPix && confirmation.pixReceiptMode === 'key' && Boolean(confirmation.pixKey.trim());
  const hasPixPayload = isPix && Boolean(confirmation.pixPayload?.trim());
  const isCard = confirmation.paymentMethod === 'card';
  const isCash = confirmation.paymentMethod === 'cash';
  const hasWhatsApp = Boolean(confirmation.storeWhatsapp?.trim());
  const whatsappMessage = buildPostOrderWhatsAppMessage(confirmation);
  const whatsappUrl = hasWhatsApp ? getWhatsAppUrl(confirmation.storeWhatsapp, whatsappMessage) : '';
  const pixValue = isPixCopyPaste ? (confirmation.pixPayload || confirmation.pixCopyPaste) : confirmation.pixKey;
  const confirmationStatus = isPix ? 'Aguardando confirmação do PIX pela loja' : isCard ? 'Aguardando recebimento na entrega ou retirada' : isCash ? 'Aguardando recebimento em dinheiro' : 'Aguardando confirmação da loja';

  const handleCopyPix = async () => {
    try {
      await copyText(pixValue);
      setCopied(true);
      showToast(isPixCopyPaste ? 'PIX Copia e Cola copiado.' : 'Chave PIX copiada.', 'success');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast('Não foi possível copiar o PIX.', 'error');
    }
  };

  const handleWhatsAppClick = () => {
    setWhatsappMarkState('sending');
    void markOrderWhatsAppClicked(confirmation.orderId)
      .then(() => setWhatsappMarkState('done'))
      .catch((error) => {
        console.error('Não foi possível atualizar o status do WhatsApp:', error);
        setWhatsappMarkState('error');
        showToast('O pedido está registrado, mas não foi possível marcar a abertura do WhatsApp. Você pode tentar o botão novamente.', 'error');
      });
  };

  const enableOrderNotifications = async () => {
    if (!confirmation) return;
    setCustomerNotificationBusy(true);
    try {
      const status = await enableCustomerOrderNotifications({
        orderId: confirmation.orderId,
        orderNumber: confirmation.orderNumber,
        url: location.pathname,
      });
      setCustomerNotificationState(status);
      if (status === 'enabled') showToast('Notificações autorizadas neste aparelho.', 'success');
      else if (status === 'blocked') showToast('As notificações estão bloqueadas nas configurações do navegador.', 'error');
      else if (status === 'unsupported') showToast('Este navegador não oferece notificações para este app.', 'error');
    } catch {
      showToast('Não foi possível ativar as notificações neste aparelho.', 'error');
    } finally {
      setCustomerNotificationBusy(false);
    }
  };

  return (
    <main className="order-success-page food-storefront-theme" style={storefrontThemeStyle}>
      <section className="order-success-card">
        <div className="success-icon"><CheckCircle2 size={54} strokeWidth={2.2} /></div>

        <h1>Pedido recebido</h1>
        <p className="order-success-number">Pedido <strong>#{formatOrderNumber(confirmation.orderNumber)}</strong></p>
        <div className="order-success-status" role="status"><span className="order-success-status__dot" />{confirmationStatus}</div>

        <div className="order-registration-proof" role="status">
          <CheckCircle2 size={20} />
          <div><strong>Pedido salvo no sistema</strong><span>{hasWhatsApp ? 'O pedido já existe e pode ser acompanhado pela loja. O WhatsApp é apenas um canal adicional de contato.' : 'O pedido já existe e será acompanhado pela loja diretamente no painel, sem depender de WhatsApp.'}</span></div>
        </div>

        <div className="order-success-payment">
          <div className="order-success-payment__title">
            {isCash ? <Banknote size={22} /> : isCard ? <CreditCard size={22} /> : isPixCopyPaste ? <QrCode size={22} /> : <CreditCard size={22} />}
            <strong>{isCash ? 'Pagamento em dinheiro' : isCard ? 'Pagamento por cartão' : isPix ? 'PIX' : 'Aguardando confirmação'}</strong>
          </div>

          {isPix ? (
            <>
              <p>{isPixCopyPaste ? 'Copie o PIX Copia e Cola abaixo. Ele já contém o valor deste pedido.' : hasWhatsApp ? 'Efetue o pagamento via PIX e envie o comprovante pelo WhatsApp para a loja confirmar seu pedido.' : 'Efetue o pagamento via PIX. A loja fará a confirmação pelo sistema.'}</p>
              <strong className="order-success-total">Total: {currency.format(confirmation.total)}</strong>
            </>
          ) : isCard ? (
            <>
              <p>Seu pedido foi registrado para pagamento por cartão na entrega ou retirada. A cobrança será realizada pela loja no momento combinado.</p>
              <strong className="order-success-total">Total: {currency.format(confirmation.total)}</strong>
            </>
          ) : isCash ? (
            <>
              <p>Seu pedido foi registrado para pagamento em dinheiro. Se houver troco solicitado, o valor já ficou registrado no pedido.</p>
              <strong className="order-success-total">Total: {currency.format(confirmation.total)}</strong>
            </>
          ) : (
            <>
              <p>{hasWhatsApp ? 'Seu pedido foi registrado. Use o WhatsApp apenas se quiser falar diretamente com a loja.' : 'Seu pedido foi registrado. A loja acompanhará a confirmação pelo sistema.'}</p>
              <strong className="order-success-total">Total: {currency.format(confirmation.total)}</strong>
            </>
          )}
        </div>

        {(isPixCopyPaste || isPixKey) && (
          <div className="pix-confirmation-box">
              <p>{isPixCopyPaste ? `Copie o código abaixo e cole na opção “PIX Copia e Cola” do seu banco. O valor de ${currency.format(confirmation.total)} já está preenchido.` : hasWhatsApp ? `Copie a chave PIX, informe o valor de ${currency.format(confirmation.total)} no banco e depois envie o comprovante para ${confirmation.storeName}.` : `Copie a chave PIX e informe o valor de ${currency.format(confirmation.total)} no banco. A loja fará a confirmação pelo painel.`}</p>
            <span className="pix-key-label">{isPixCopyPaste ? 'PIX Copia e Cola · valor automático' : `Chave PIX · ${confirmation.pixKeyType || 'Chave cadastrada'}`}</span>
            <div className="pix-key-row">
              <code>{pixValue}</code>
              <button type="button" onClick={() => void handleCopyPix()} aria-label="Copiar PIX" title="Copiar PIX">
                {copied ? <Check size={21} /> : <Copy size={21} />}
              </button>
            </div>
          {hasPixPayload && <div className="pix-qr-code"><span className="pix-key-label">QR Code PIX · valor preenchido</span>{pixQrCode ? <img src={pixQrCode} alt={`QR Code PIX no valor de ${currency.format(confirmation.total)}`} /> : <small>Gerando QR Code…</small>}<small>Escaneie com o aplicativo do seu banco.</small></div>}
            {confirmation.pixReceiver && <small>Recebedor: {confirmation.pixReceiver}</small>}
          </div>
        )}
        {isPix && confirmation.pixGenerationError && !hasPixPayload && !isPixKey && !isPixCopyPaste && (
          <div className="pix-generation-warning" role="alert">
            <strong>PIX com valor não gerado</strong>
            <span>{confirmation.pixGenerationError} A loja precisa revisar a chave PIX, o titular e a cidade nas configurações.</span>
          </div>
        )}

        {isCard && (
          <div className="card-link-info-box">
            <CreditCard size={24} />
            <div><strong>Pagamento na entrega ou retirada.</strong><span>O pedido já está salvo. A loja realizará a cobrança por cartão quando você receber ou retirar o pedido.</span></div>
          </div>
        )}

        <div className="order-success-store">
          <Store size={20} />
          <span>{confirmation.storeName}</span>
        </div>

        {customerNotificationState !== 'unsupported' && (
          <section className={`customer-order-notifications is-${customerNotificationState}`} aria-live="polite">
            <div><Bell size={19} /><strong>{customerNotificationState === 'enabled' ? 'Notificações autorizadas neste aparelho' : 'Receba avisos deste pedido'}</strong></div>
            {customerNotificationState === 'enabled' ? (
              <p>Este aparelho está pronto para receber os avisos do pedido quando a loja disponibilizar o acompanhamento por notificações.</p>
            ) : customerNotificationState === 'blocked' ? (
              <p>As notificações foram bloqueadas. Libere-as nas configurações do navegador para ativar este recurso.</p>
            ) : (
              <>
                <p>A permissão é solicitada somente agora, depois de o pedido ter sido registrado.</p>
                <button type="button" className="secondary-button" disabled={customerNotificationBusy} onClick={() => void enableOrderNotifications()}>
                  <Bell size={17} />{customerNotificationBusy ? 'Ativando...' : 'Permitir notificações'}
                </button>
                <small>O aviso automático de mudanças de status ainda depende da ativação desse acompanhamento pela loja.</small>
              </>
            )}
          </section>
        )}

        {hasWhatsApp && <a
          className="whatsapp-confirmation-button"
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleWhatsAppClick}
        >
          <MessageCircle size={21} />
          {isPix ? 'Abrir WhatsApp e enviar comprovante' : 'Abrir WhatsApp'}
        </a>}
        {hasWhatsApp && <div className={`whatsapp-sync-state is-${whatsappMarkState}`} aria-live="polite">
          {whatsappMarkState === 'sending' && <span>Registrando a abertura do WhatsApp no pedido...</span>}
          {whatsappMarkState === 'done' && <span>A abertura do WhatsApp foi vinculada ao pedido #{formatOrderNumber(confirmation.orderNumber)}.</span>}
          {whatsappMarkState === 'error' && <span>O pedido continua salvo; apenas o status do WhatsApp não foi atualizado. Toque no botão novamente quando voltar.</span>}
        </div>}

        {isPix && hasWhatsApp && <p className="order-success-hint">O WhatsApp abrirá com a mensagem pronta. Depois do pagamento, anexe a imagem do comprovante na conversa.</p>}
        {isCard && <p className="order-success-hint">A loja fará a cobrança por cartão na entrega ou retirada. Nunca envie número completo do cartão, CVV ou senha pelo WhatsApp.</p>}
        {isCash && <p className="order-success-hint">{confirmation.changeAmount != null ? `Troco previsto: ${currency.format(confirmation.changeAmount)}.` : 'Pagamento em dinheiro sem troco solicitado.'}</p>}

        <a className="order-success-back" href={storefrontPath(storeBasePath)}><ArrowLeft size={19} />Voltar para o cardápio</a>
      </section>
    </main>
  );
}
