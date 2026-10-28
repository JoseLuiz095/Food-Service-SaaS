import { getStorefrontThemeStyle } from '../utils/storeVisualTheme';
import './dismissible-panels.css';
import './store-share-target.css';
import { ChevronDown, Clock3, Copy, Download, Info, MapPin, MessageCircle, QrCode, Share2, ShieldCheck, ShoppingBag, Store, Truck, X } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useCart } from '../contexts/CartContext';
import { useStore } from '../contexts/StoreContext';
import { useToast } from '../contexts/ToastContext';
import { storefrontPath } from '../utils/storefrontRoute';
import { downloadQrImage, sharePixQrImage } from '../utils/pixShare';
import { normalizeInstagramHandle, sanitizeWhatsAppNumber } from '../utils/format';
import { getOpeningScheduleOverview, getStoreOpenStatus } from '../utils/storeHours';
import { loadFulfillmentPreference, saveFulfillmentPreference } from '../utils/fulfillmentPreference';
import { ImageWithFallback } from './ui/ImageWithFallback';
import { getBusinessSegment, isDefaultStoreImage } from '../segments/businessSegments';
import './store-header-simple.css';
import { PLATFORM_BRAND } from '../lib/brand';
import { useStoreShareTarget } from './useStoreShareTarget';
import { useModalAccessibility } from './useModalAccessibility';
import { copyText } from '../utils/clipboard';

function InstagramGlyph({ size = 17 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".7" fill="currentColor" stroke="none"/></svg>;
}

export function StoreHeader(){
  const {settings,storeBasePath}=useStore();
  const catalogLabel = getBusinessSegment(settings.visualTheme).catalogLabel;
  const neutralPresentation = getBusinessSegment(settings.visualTheme).id !== 'food' && settings.visualTheme.preset !== 'doce_lua';
  const logoUrl = neutralPresentation && isDefaultStoreImage(settings.logoUrl) ? '/assets/placeholder-catalog.svg' : settings.logoUrl;
  const heroUrl = neutralPresentation && settings.heroUrl.split('?')[0] === '/assets/food-hero.svg' ? '/assets/placeholder-catalog.svg' : settings.heroUrl;
  const {totalItems}=useCart();
  const {showToast}=useToast();
  const whatsapp=sanitizeWhatsAppNumber(settings.whatsapp);
  const instagramHandle=normalizeInstagramHandle(settings.instagram);
  const instagramUrl=instagramHandle ? `https://www.instagram.com/${encodeURIComponent(instagramHandle)}/` : '';
  const status=useMemo(()=>getStoreOpenStatus(settings.openingSchedule, new Date(), { start: settings.pickupStartTime || '07:00', end: settings.pickupEndTime || '22:00' }),[settings.openingSchedule,settings.pickupStartTime,settings.pickupEndTime]);
  const scheduleOverview=useMemo(()=>getOpeningScheduleOverview(settings.openingSchedule, new Date(), { start: settings.pickupStartTime || '07:00', end: settings.pickupEndTime || '22:00' }),[settings.openingSchedule,settings.pickupStartTime,settings.pickupEndTime]);
  const todaySchedule = scheduleOverview.today?.summary || 'Consulte os horários';
  const [hoursOpen,setHoursOpen]=useState(false);
  const hoursDialogRef=useRef<HTMLDivElement>(null);
  useModalAccessibility(hoursOpen,hoursDialogRef,()=>setHoursOpen(false));
  const [shareOpen,setShareOpen]=useState(false);
  const shareDialogRef=useRef<HTMLElement>(null);
  useModalAccessibility(shareOpen,shareDialogRef,()=>setShareOpen(false));
  const [qrState,setQrState]=useState({url:'',data:''});
  const [searchParams]=useSearchParams();
  const target=useStoreShareTarget(settings.id,settings.slug,shareOpen,searchParams.get('ponto')||'');
  const shareUrl=target.url;
  const shareQr=!target.loading&&qrState.url===shareUrl?qrState.data:'';
  const targetName=target.point?`${settings.name} · ${target.point.name}`:settings.name;
  const shareFileName=`qr-code-${settings.slug||'loja'}${target.point?'-'+target.point.short_code.toLowerCase():''}.png`;
  const shareLinkRef=useRef<HTMLInputElement>(null);
  const [shareCopied,setShareCopied]=useState(false);
  const [preferredFulfillment,setPreferredFulfillment]=useState<'delivery'|'pickup'|null>(null);
  const hoursRef=useRef<HTMLDivElement|null>(null);
  const shareCloseRef=useRef<HTMLButtonElement|null>(null);
  useEffect(()=>{document.title=`${settings.name} · ${PLATFORM_BRAND}`;},[settings.name]);
  useEffect(()=>{setPreferredFulfillment(loadFulfillmentPreference(settings.id));},[settings.id]);

  useEffect(()=>{if(!shareOpen||target.loading)return;let current=true;setShareCopied(false);void QRCode.toDataURL(shareUrl,{errorCorrectionLevel:'M',margin:2,width:320}).then(data=>{if(current)setQrState({url:shareUrl,data});}).catch(()=>{if(current)setQrState({url:shareUrl,data:''});});return()=>{current=false;};},[shareOpen,shareUrl,target.loading]);
  const fulfillment=settings.deliveryEnabled&&settings.pickupEnabled?'Delivery e retirada':settings.deliveryEnabled?'Delivery':'Retirada';
  const pickupWindowLabel=`${settings.pickupStartTime || '07:00'}–${settings.pickupEndTime || '22:00'}`;
  const locationLabel=settings.hidePublicAddress ? 'Atendimento por encomenda' : ([settings.city,settings.state].filter(Boolean).join(' · ') || 'Atendimento online');
  const profileDescription=settings.description?.trim() && settings.description.trim() !== settings.tagline.trim() ? settings.description.trim() : '';
  const copyShareUrl=async()=>{
    try{
      if(target.loading)return;
      await copyText(shareUrl);
      setShareCopied(true);
      showToast(target.point?'Link do ponto de retirada copiado.':'Link da loja copiado.','success');
    }catch{
      shareLinkRef.current?.focus();shareLinkRef.current?.select();
      showToast('O navegador bloqueou a cópia. Copie o link manualmente.','error');
    }
  };
  const shareStoreWithDevice=async()=>{
    if(!shareQr)return;
    try{
      const result=await sharePixQrImage({
        dataUrl:shareQr,
        title:`${catalogLabel} da ${targetName}`,
        text:`Confira o ${catalogLabel.toLowerCase()} da ${targetName}:\n${shareUrl}`,
        fileName:shareFileName,
      });
      if(result==='image')showToast('QR Code e link prontos para compartilhar.','success');
      else if(result==='text')showToast('Compartilhamento de texto aberto; este aparelho não aceita imagem.','success');
       else if(downloadQrImage(shareQr,shareFileName))showToast('QR Code baixado. Anexe a imagem no aplicativo de sua preferência.','success');
       else showToast('Copie o link para compartilhar a loja.','info');
    }catch(error){
       if(!(error instanceof DOMException&&error.name==='AbortError')){
         if(downloadQrImage(shareQr,shareFileName))showToast('O compartilhamento direto falhou, então o QR Code foi baixado.','info');
         else showToast('Não foi possível compartilhar o QR Code. Copie o link e tente novamente.','error');
       }
    }
  };
  return <header className="food-storefront-header food-storefront-header-v43">
    <div className="food-platform-bar"><div className="container"><Link className="foodweb-wordmark" to={storefrontPath(storeBasePath)} aria-label={PLATFORM_BRAND}><img src="/assets/vendeweb-mark.svg" alt=""/><strong>{PLATFORM_BRAND}</strong></Link><div className="food-platform-trust"><ShieldCheck size={15}/><span>Pedido direto com o estabelecimento</span></div><Link className="food-platform-cart" to={storefrontPath(storeBasePath,'/carrinho')}><ShoppingBag size={18}/><span>Sacola</span>{totalItems>0&&<b>{totalItems}</b>}</Link></div></div>
    <div className="food-store-hero-v43" style={{backgroundImage:`linear-gradient(90deg,rgba(18,10,8,.62),rgba(18,10,8,.18) 48%,rgba(18,10,8,.18)),url(${heroUrl})`}}><div className="container"><span>Pedido online</span><strong>{settings.tagline||'Seu pedido, do seu jeito.'}</strong></div></div>
    <section className="container food-store-profile-v43">
      <ImageWithFallback loading="eager" className="food-store-profile-logo" fallbackSrc={neutralPresentation ? '/assets/placeholder-catalog.svg' : undefined} src={logoUrl} alt={`Logo ${settings.name}`}/>
      <div className="food-store-profile-main">
        <div className="food-store-profile-title"><h1>{settings.name}</h1><span className={`open-pill ${status.open?'is-open':'is-closed'}`}>{status.label}</span></div>
        <div className="food-store-profile-location"><MapPin size={14}/>{locationLabel}</div>
        {profileDescription&&<p>{profileDescription}</p>}
        <div className="food-store-profile-meta">
          <div className="food-hours-popover" ref={hoursRef}><button type="button" className="food-hours-button food-hours-button--compact" aria-expanded={hoursOpen} onClick={()=>setHoursOpen((current)=>!current)}><Clock3 size={15}/><span><small>Hoje</small><strong>{todaySchedule}</strong></span><ChevronDown size={15} aria-hidden="true"/></button>
            {hoursOpen&&createPortal(<div className="dismissible-panel-overlay" style={getStorefrontThemeStyle(settings.visualTheme)} onPointerDown={event=>{if(event.target===event.currentTarget){event.preventDefault();setHoursOpen(false);}}}><div ref={hoursDialogRef} tabIndex={-1} className="hours-details-list food-hours-list food-hours-flyout" role="dialog" aria-modal="true" aria-label="Horários da semana"><div className="food-hours-flyout__header"><div><strong>Horários da loja</strong><span>Confira os dias de atendimento</span></div><button type="button" className="food-hours-flyout__close" aria-label="Fechar horários" onClick={()=>setHoursOpen(false)}><X size={16}/></button></div><div className="food-hours-flyout__days">{scheduleOverview.days.map((day)=><div key={day.day} className={`hours-details-item ${day.isToday?'is-today':''}`}><strong>{day.shortLabel}</strong><span>{day.summary}</span></div>)}</div></div></div>,document.body)}
          </div>
          {settings.minimumOrder>0&&<span><Store size={14}/>Mínimo R$ {settings.minimumOrder.toFixed(2).replace('.',',')}</span>}
        </div>
      </div>
      <details className="food-store-profile-more"><summary>Entrega e contato da loja</summary><div className="food-store-profile-actions">
        <div className="food-open-details"><span className={`open-pill ${status.open?'is-open':'is-closed'}`}>{status.label}</span><small>{status.detail}</small><span className="food-service-summary"><Truck size={13}/>{fulfillment}</span></div>
        {settings.deliveryEnabled&&<a className={`food-fulfillment-pill ${preferredFulfillment==='delivery'?'active':''}`} href="#cardapio" onClick={()=>{saveFulfillmentPreference(settings.id,'delivery');setPreferredFulfillment('delivery');}}><Truck size={16}/><span><strong>Delivery</strong><small>Escolher endereço depois</small></span></a>}
        {settings.pickupEnabled&&<a className={`food-fulfillment-pill ${preferredFulfillment==='pickup'?'active':''}`} href="#cardapio" onClick={()=>{saveFulfillmentPreference(settings.id,'pickup');setPreferredFulfillment('pickup');}}><ShoppingBag size={16}/><span><strong>Retirada</strong><small>Disponível {pickupWindowLabel}</small></span></a>}
        {instagramUrl&&<a className="food-social-link food-social-link--instagram" href={instagramUrl} target="_blank" rel="noopener noreferrer" aria-label={`Abrir Instagram ${instagramHandle}`}><InstagramGlyph/><span><strong>Instagram</strong><small>@{instagramHandle}</small></span></a>}
        {settings.showWhatsApp !== false && whatsapp&&<a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer"><MessageCircle size={17}/>Falar com a loja</a>}
        <button type="button" className="food-share-store-button" onClick={()=>setShareOpen(true)}><Share2 size={17}/><span><strong>Compartilhar loja</strong><small>QR Code e link</small></span></button>
      </div></details>
    </section>
    {settings.storefrontNotice?.trim() && <section className="container food-store-operation-notices" aria-label="Informações importantes da loja">
      {settings.storefrontNotice?.trim() && <div><Info size={18}/><span><strong>Antes de pedir</strong>{settings.storefrontNotice.trim()}</span></div>}
    </section>}
    {shareOpen&&typeof document!=='undefined'&&createPortal(<div className="store-share-overlay" role="presentation" onPointerDown={(event)=>{if(event.target===event.currentTarget){event.preventDefault();setShareOpen(false);}}}><section ref={shareDialogRef} tabIndex={-1} className="store-share-card" role="dialog" aria-modal="true" aria-labelledby="store-share-title"><button ref={shareCloseRef} type="button" className="icon-button store-share-card__close" onClick={()=>setShareOpen(false)} aria-label="Fechar compartilhamento"><X size={19}/></button><div className="store-share-card__icon"><QrCode size={22}/></div><span className="eyebrow">COMPARTILHE</span><h2 id="store-share-title">Leve a {settings.name} com você</h2><p>Escaneie o QR Code ou copie o link para enviar o {catalogLabel.toLowerCase()}.</p><label className="share-target-field">Página para compartilhar<select aria-label="Página para compartilhar" disabled={target.loading} value={target.point?.id||''} onChange={event=>target.select(event.target.value)}><option value="">Página da loja</option>{target.points.map(point=><option key={point.id} value={point.id}>Ponto: {point.name}</option>)}</select></label>{target.loading&&<p role="status">Carregando pontos de retirada…</p>}{target.error&&<div role="alert"><p>{target.error}</p><button type="button" className="secondary-button" onClick={target.retry}>Tentar carregar pontos</button></div>}{target.point&&<p>Retirada em <strong>{target.point.name}</strong>. A disponibilidade será confirmada no pedido.</p>}{shareQr?<img className="store-share-card__qr" src={shareQr} alt={`QR Code de ${targetName}`}/>:<div className="store-share-card__qr-placeholder">Gerando QR Code…</div>}<div className="store-share-card__link"><input ref={shareLinkRef} aria-label="Link para compartilhar" readOnly value={shareUrl} onClick={event=>event.currentTarget.select()}/><button type="button" className="secondary-button compact-button" disabled={target.loading} onClick={()=>void copyShareUrl()}><Copy size={15}/>{shareCopied?'Copiado':'Copiar link'}</button></div><div className="store-share-card__actions">{typeof navigator !== 'undefined' && 'share' in navigator&&<button type="button" className="primary-button store-share-card__native" disabled={!shareQr} onClick={()=>void shareStoreWithDevice()}><Share2 size={16}/>Compartilhar pelo telefone</button>}{shareQr&&<button type="button" className="secondary-button store-share-card__download" onClick={()=>{if(downloadQrImage(shareQr,shareFileName))showToast('QR Code baixado.','success');else showToast('Não foi possível baixar o QR Code.','error')}}><Download size={16}/>Baixar QR Code</button>}</div></section></div>,document.body)}
  </header>;
}
