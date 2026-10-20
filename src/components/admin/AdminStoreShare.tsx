import { Copy, QrCode, Share2, X } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import { publicStorefrontUrl } from '../../utils/storefrontRoute';
import { sharePixQrImage } from '../../utils/pixShare';

export function AdminStoreShare() {
  const { settings } = useStore();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [sharing, setSharing] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const shareUrl = publicStorefrontUrl(settings.slug);

  useEffect(() => {
    if (!open) return;
    void QRCode.toDataURL(shareUrl, { errorCorrectionLevel: 'M', margin: 2, width: 320 })
      .then(setQrCode)
      .catch(() => setQrCode(''));
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, shareUrl]);

  const copyLink = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(shareUrl);
      showToast('Link da loja copiado.', 'success');
    } catch {
      showToast('O navegador bloqueou a cópia. Selecione o link e copie manualmente.', 'error');
    }
  };

  const shareWithDevice = async () => {
    if (!qrCode || sharing) return;
    setSharing(true);
    try {
      const result = await sharePixQrImage({
        dataUrl: qrCode,
        title: `Cardápio da ${settings.name}`,
        text: `Confira o cardápio da ${settings.name}:\n${shareUrl}`,
        fileName: `qr-code-${settings.slug || 'loja'}.png`,
      });
      if (result === 'image') showToast('QR Code e link prontos para compartilhar.', 'success');
      else if (result === 'text') showToast('Compartilhamento de texto aberto; este aparelho não aceita imagem.', 'success');
      else showToast('O navegador não oferece compartilhamento neste aparelho.', 'error');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) showToast('Não foi possível compartilhar o QR Code.', 'error');
    } finally {
      setSharing(false);
    }
  };

  return <>
    <button type="button" className="admin-share-store-button" onClick={() => setOpen(true)} title="Compartilhar loja" aria-label="Compartilhar loja com QR Code e link">
      <Share2 size={16} /><span><strong>Compartilhar</strong><small>QR Code e link</small></span>
    </button>
    {open && <div className="admin-store-share-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="admin-store-share-card" role="dialog" aria-modal="true" aria-labelledby="admin-store-share-title">
        <button ref={closeButtonRef} type="button" className="icon-button admin-store-share-card__close" onClick={() => setOpen(false)} aria-label="Fechar compartilhamento"><X size={18} /></button>
        <div className="admin-store-share-card__icon"><QrCode size={21} /></div>
        <span className="eyebrow">DIVULGUE SUA VITRINE</span>
        <h2 id="admin-store-share-title">Compartilhe {settings.name}</h2>
        <p>Envie o link ou mostre o QR Code para o cliente abrir o cardápio.</p>
        {qrCode ? <img className="admin-store-share-card__qr" src={qrCode} alt={`QR Code da loja ${settings.name}`} /> : <div className="admin-store-share-card__qr-placeholder">Gerando QR Code…</div>}
        <div className="admin-store-share-card__link"><span title={shareUrl}>{shareUrl}</span><button type="button" className="secondary-button compact-button" onClick={() => void copyLink()}><Copy size={15} />Copiar link</button></div>
        {typeof navigator !== 'undefined' && 'share' in navigator && <button type="button" className="primary-button admin-store-share-card__native" disabled={!qrCode || sharing} onClick={() => void shareWithDevice()}><Share2 size={16} />{sharing ? 'Preparando compartilhamento...' : 'Compartilhar pelo telefone'}</button>}
      </section>
    </div>}
  </>;
}
