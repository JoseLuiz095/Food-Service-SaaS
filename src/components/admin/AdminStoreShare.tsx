import '../store-share-target.css';
import { Copy, Download, QrCode, Share2, X } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import { useStoreShareTarget } from '../useStoreShareTarget';
import { useModalAccessibility } from '../useModalAccessibility';
import { copyText } from '../../utils/clipboard';
import { downloadQrImage, sharePixQrImage } from '../../utils/pixShare';
import { getBusinessSegment } from '../../segments/businessSegments';

export function AdminStoreShare() {
  const { settings } = useStore();
  const catalogLabel = getBusinessSegment(settings.visualTheme).catalogLabel;
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [qrState, setQrState] = useState({url:'',data:''});
  const target = useStoreShareTarget(settings.id, settings.slug, open);
  const shareUrl = target.url;
  const qrCode = !target.loading && qrState.url===shareUrl ? qrState.data : '';
  const targetName = target.point ? `${settings.name} · ${target.point.name}` : settings.name;
  const fileName = `qr-code-${settings.slug || 'loja'}${target.point ? '-'+target.point.short_code.toLowerCase() : ''}.png`;
  const linkRef = useRef<HTMLInputElement>(null);
  const [sharing, setSharing] = useState(false);
  const [copied,setCopied]=useState(false);
  useEffect(()=>setCopied(false),[shareUrl]);
  const dialogRef=useRef<HTMLElement>(null);
  useModalAccessibility(open,dialogRef,()=>setOpen(false),!sharing);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);


  useEffect(() => {
    if (!open || target.loading) return;
    let current = true;
    void QRCode.toDataURL(shareUrl, { errorCorrectionLevel:'M', margin:2, width:320 })
      .then(data=>{if(current)setQrState({url:shareUrl,data});}).catch(()=>{if(current)setQrState({url:shareUrl,data:''});});
    return ()=>{current=false;};
  },[open,shareUrl,target.loading]);
  const copyLink = async () => {
    try {
      if(target.loading)return;
      await copyText(shareUrl);setCopied(true);
      showToast(target.point?'Link do ponto de retirada copiado.':'Link da loja copiado.', 'success');
    } catch {
      linkRef.current?.focus(); linkRef.current?.select();
      showToast('O navegador bloqueou a cópia. Selecione o link e copie manualmente.', 'error');
    }
  };

  const shareWithDevice = async () => {
    if (!qrCode || sharing) return;
    setSharing(true);
    try {
      const result = await sharePixQrImage({
        dataUrl: qrCode,
        title: `${catalogLabel} da ${targetName}`,
        text: `Confira o ${catalogLabel.toLowerCase()} da ${targetName}:\n${shareUrl}`,
        fileName: fileName,
      });
      if (result === 'image') showToast('QR Code e link prontos para compartilhar.', 'success');
      else if (result === 'text') showToast('Compartilhamento de texto aberto; este aparelho não aceita imagem.', 'success');
      else if (downloadQrImage(qrCode, fileName)) showToast('QR Code baixado. Anexe a imagem no aplicativo de sua preferência.', 'success');
      else showToast('Copie o link para compartilhar a loja.', 'info');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        if (downloadQrImage(qrCode, fileName)) showToast('O compartilhamento direto falhou, então o QR Code foi baixado para você enviar manualmente.', 'info');
        else showToast('Não foi possível compartilhar o QR Code. Copie o link e tente novamente.', 'error');
      }
    } finally {
      setSharing(false);
    }
  };

  const dialog = open && typeof document !== 'undefined' ? createPortal(
    <div className="admin-store-share-overlay" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget && !sharing) { event.preventDefault(); setOpen(false); } }}>
      <section ref={dialogRef} tabIndex={-1} className="admin-store-share-card" role="dialog" aria-modal="true" aria-labelledby="admin-store-share-title">
        <button ref={closeButtonRef} type="button" className="icon-button admin-store-share-card__close" onClick={() => setOpen(false)} aria-label="Fechar compartilhamento"><X size={18} /></button>
        <div className="admin-store-share-card__icon"><QrCode size={21} /></div>
        <span className="eyebrow">DIVULGUE SUA VITRINE</span>
        <h2 id="admin-store-share-title">Compartilhe {settings.name}</h2>
        <p>Envie o link ou mostre o QR Code para o cliente abrir o {catalogLabel.toLowerCase()}.</p>
        <label className="share-target-field">Página para compartilhar<select aria-label="Página para compartilhar" disabled={target.loading||sharing} value={target.point?.id||''} onChange={event=>target.select(event.target.value)}><option value="">Página da loja</option>{target.points.map(point=><option key={point.id} value={point.id}>Ponto: {point.name}</option>)}</select></label>
        {target.loading&&<p role="status">Carregando pontos de retirada…</p>}
        {target.error&&<div role="alert"><p>{target.error}</p><button type="button" className="secondary-button" onClick={target.retry}>Tentar carregar pontos</button></div>}
        {target.point&&<p>Retirada em <strong>{target.point.name}</strong>. A disponibilidade será confirmada no pedido.</p>}
        {qrCode ? <img className="admin-store-share-card__qr" src={qrCode} alt={`QR Code de ${targetName}`} /> : <div className="admin-store-share-card__qr-placeholder">Gerando QR Code…</div>}
        <div className="admin-store-share-card__link"><input ref={linkRef} aria-label="Link para compartilhar" readOnly value={shareUrl} onClick={event=>event.currentTarget.select()}/><button type="button" className="secondary-button compact-button" disabled={target.loading} onClick={() => void copyLink()}><Copy size={15} />{copied?'Copiado':'Copiar link'}</button></div>
        {copied&&<p role="status">Link copiado.</p>}
        <div className="admin-store-share-card__actions">
          {typeof navigator !== 'undefined' && 'share' in navigator && <button type="button" className="primary-button admin-store-share-card__native" disabled={!qrCode || sharing} onClick={() => void shareWithDevice()}><Share2 size={16} />{sharing ? 'Preparando compartilhamento...' : 'Compartilhar pelo telefone'}</button>}
          {qrCode && <button type="button" className="secondary-button admin-store-share-card__download" onClick={() => { if (downloadQrImage(qrCode, fileName)) showToast('QR Code baixado.', 'success'); else showToast('Não foi possível baixar o QR Code.', 'error'); }}><Download size={16} />Baixar QR Code</button>}
        </div>
      </section>
    </div>,
    document.body,
  ) : null;

  return <>
    <button type="button" className="admin-share-store-button" onClick={() => setOpen(true)} title="Compartilhar loja" aria-label="Compartilhar loja com QR Code e link">
      <Share2 size={16} /><span><strong>Compartilhar</strong><small>QR Code e link</small></span>
    </button>
    {dialog}
  </>;
}
