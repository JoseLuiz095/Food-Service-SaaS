import { Copy, QrCode, Share2, X } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import { publicStorefrontUrl } from '../../utils/storefrontRoute';

export function AdminStoreShare() {
  const { settings } = useStore();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [qrCode, setQrCode] = useState('');
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
    if (!navigator.share) return;
    try {
      await navigator.share({ title: settings.name, text: `Confira o cardápio da ${settings.name}`, url: shareUrl });
    } catch {
      // Cancelamentos do compartilhamento nativo não precisam gerar alerta.
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
        {typeof navigator !== 'undefined' && 'share' in navigator && <button type="button" className="primary-button admin-store-share-card__native" onClick={() => void shareWithDevice()}><Share2 size={16} />Compartilhar pelo telefone</button>}
      </section>
    </div>}
  </>;
}
