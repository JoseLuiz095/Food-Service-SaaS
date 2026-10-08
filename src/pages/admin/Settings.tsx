import { ArrowDown, ArrowUp, Banknote, Clock3, CreditCard, ImagePlus, Info, QrCode, RotateCcw, Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { ErrorState, LoadingState } from '../../components/ui/AsyncState';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import type { PaymentMethod, StoreSettings, StoreVisualTheme } from '../../types';
import { buildPixCopyPasteWithAmount, validatePixCopyPasteBase } from '../../utils/pix';
import { formatOpeningSchedule, openingDayName } from '../../utils/storeHours';
import { PasswordChangeCard } from '../../components/admin/PasswordChangeCard';
import { planHasFeature } from '../../utils/plan';
import { DEFAULT_CUSTOMER_MESSAGE_TEMPLATES, ensureCustomerMessageVariables, normalizeCustomerMessageTemplates } from '../../utils/customerSales';
import { DEFAULT_STORE_VISUAL_THEME, getStorefrontThemeStyle, isStoreVisualColor, STORE_VISUAL_THEME_PRESETS } from '../../utils/storeVisualTheme';
import { requestPwaNotificationPermission } from '../../services/pwaNotifications';

const isDoceLuaStore = (store: Pick<StoreSettings, 'slug' | 'name'>) =>
  `${store.slug} ${store.name}`.toLowerCase().replace(/[^a-z0-9]/g, '').includes('docelua');

const cloneSettingsForForm = (settings: StoreSettings) => {
  const next = structuredClone(settings);
  if (!isDoceLuaStore(next) && next.visualTheme.preset === 'doce_lua') next.visualTheme = { ...DEFAULT_STORE_VISUAL_THEME };
  return next;
};

export default function SettingsAdmin() {
  const { settings, saveSettings, resetDemo, uploadStoreAsset, dataMode, loading, error, reloadAdmin, planUsage } = useStore();
  const { showToast } = useToast();
  const [form, setForm] = useState<StoreSettings>(() => cloneSettingsForForm(settings));
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const pixCopyPasteRef = useRef<HTMLTextAreaElement | null>(null);
  const canCustomBanner = planHasFeature(planUsage.plan, 'custom_banner');
  const canUseDoceLua = isDoceLuaStore(form);
  const messageTemplates = normalizeCustomerMessageTemplates(form.messageTemplates);

  useEffect(() => setForm(cloneSettingsForForm(settings)), [settings]);
  const logoPreview = useMemo(() => logoFile ? URL.createObjectURL(logoFile) : form.logoUrl, [logoFile, form.logoUrl]);
  const coverPreview = useMemo(() => coverFile ? URL.createObjectURL(coverFile) : form.heroUrl, [coverFile, form.heroUrl]);
  useEffect(() => () => { if (logoFile) URL.revokeObjectURL(logoPreview); }, [logoFile, logoPreview]);
  useEffect(() => () => { if (coverFile) URL.revokeObjectURL(coverPreview); }, [coverFile, coverPreview]);

  const update = <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) => setForm((current) => ({ ...current, [key]: value }));
  const updateVisualTheme = <K extends keyof StoreVisualTheme>(key: K, value: StoreVisualTheme[K]) => setForm((current) => ({
    ...current,
    visualTheme: { ...current.visualTheme, [key]: value, preset: key === 'preset' ? value as StoreVisualTheme['preset'] : 'custom' },
  }));
  const applyVisualPreset = (preset: keyof typeof STORE_VISUAL_THEME_PRESETS) => setForm((current) => ({ ...current, visualTheme: { ...STORE_VISUAL_THEME_PRESETS[preset] } }));
  const updateMessageTemplate = (key: keyof NonNullable<StoreSettings['messageTemplates']>, value: string) => setForm((current) => ({ ...current, messageTemplates: { ...normalizeCustomerMessageTemplates(current.messageTemplates), [key]: ensureCustomerMessageVariables(key, value) } }));
  const toggleDesktopNotifications = (enabled: boolean) => {
    update('notificationsDesktopEnabled', enabled);
    if (enabled) void requestPwaNotificationPermission();
  };
  const activatePixReceiptMode = (mode: StoreSettings['pixReceiptMode']) => {
    update('pixReceiptMode', mode);
    if (mode === 'copy_paste') {
      window.setTimeout(() => {
        pixCopyPasteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        pixCopyPasteRef.current?.focus();
      }, 80);
    }
  };
  const movePaymentMethod = (method: PaymentMethod, direction: -1 | 1) => setForm((current) => {
    const order = [...current.paymentMethodOrder];
    const index = order.indexOf(method);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return current;
    [order[index], order[target]] = [order[target], order[index]];
    return { ...current, paymentMethodOrder: order };
  });

  const updateOpeningDay = (day: number, patch: Partial<StoreSettings['openingSchedule']['days'][number]>) => setForm((current) => {
    const openingSchedule = { ...current.openingSchedule, days: current.openingSchedule.days.map((item) => item.day === day ? { ...item, ...patch } : item) };
    return { ...current, openingSchedule, openingHours: formatOpeningSchedule(openingSchedule) };
  });

  if (loading) return <LoadingState label="Carregando configurações..." />;
  if (error) return <ErrorState message={error} onRetry={() => void reloadAdmin()} />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.deliveryEnabled && !form.pickupEnabled) {
      showToast('Mantenha pelo menos uma opção ativa: Entrega ou Retirada.', 'error');
      return;
    }

    if (form.averagePreparationMax < form.averagePreparationMin) {
      showToast('O tempo máximo de preparo não pode ser menor que o tempo mínimo.', 'error');
      return;
    }

    if (form.cardPaymentEnabled && (form.showWhatsApp === false || !form.whatsapp.trim())) {
      showToast('Para liberar cartão por aproximação, mantenha um WhatsApp cadastrado e visível na vitrine.', 'error');
      return;
    }

    const visualColors = [form.visualTheme.primaryColor, form.visualTheme.accentColor, form.visualTheme.highlightColor, form.visualTheme.backgroundColor, form.visualTheme.surfaceColor, form.visualTheme.textColor, form.visualTheme.mutedColor, form.visualTheme.borderColor];
    if (!visualColors.every(isStoreVisualColor) || !Number.isInteger(form.visualTheme.radius) || form.visualTheme.radius < 8 || form.visualTheme.radius > 32) {
      showToast('Revise a aparência: use cores válidas e raio de card entre 8 e 32 pixels.', 'error');
      return;
    }

    const hasPaymentMethod = form.confirmationPaymentEnabled
      || (form.pixEnabled && form.showPixBeforeConfirmation)
      || form.cardPaymentEnabled
      || form.cashPaymentEnabled;
    if (!hasPaymentMethod) {
      showToast('Mantenha pelo menos uma forma de pagamento ativa.', 'error');
      return;
    }

    if (form.pixEnabled && form.showPixBeforeConfirmation) {
      if (!form.pixReceiver.trim()) {
        showToast('Informe o nome do recebedor do PIX.', 'error');
        return;
      }
      if (form.pixReceiptMode === 'key' && !form.pixKey.trim()) {
        showToast('Informe a chave PIX.', 'error');
        return;
      }
      if (form.pixReceiptMode === 'copy_paste') {
        try {
          validatePixCopyPasteBase(form.pixCopyPaste);
          buildPixCopyPasteWithAmount(form.pixCopyPaste, 1);
        } catch (pixError) {
          showToast(pixError instanceof Error ? pixError.message : 'PIX Copia e Cola inválido.', 'error');
          return;
        }
      }
    }

    setSaving(true);
    try {
      let next = { ...form, openingHours: formatOpeningSchedule(form.openingSchedule), messageTemplates: normalizeCustomerMessageTemplates(messageTemplates) };
      if (!canUseDoceLua && next.visualTheme.preset === 'doce_lua') next = { ...next, visualTheme: { ...DEFAULT_STORE_VISUAL_THEME } };
      if (logoFile) {
        const upload = await uploadStoreAsset(logoFile, 'logo');
        next = { ...next, logoUrl: upload.url, logoStoragePath: upload.path };
      }
      if (coverFile && !canCustomBanner) throw new Error('Seu plano atual não inclui banner personalizado.');
      if (coverFile) {
        const upload = await uploadStoreAsset(coverFile, 'cover');
        next = { ...next, heroUrl: upload.url, heroStoragePath: upload.path };
      }
      await saveSettings(next);
      setLogoFile(null);
      setCoverFile(null);
      showToast('Configurações salvas.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao salvar configurações.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="admin-page-title">
        <div><span className="eyebrow">LOJA</span><h1>Configurações</h1><p>Identidade, horários, recebimento e formas de pagamento do estabelecimento.</p></div>
        {dataMode === 'demo' && (
          <button className="secondary-button" onClick={() => void (async () => {
            if (confirm('Restaurar todos os dados da demonstração?')) {
              await resetDemo();
              showToast('Demonstração restaurada.', 'success');
            }
          })()}><RotateCcw size={17} />Restaurar demo</button>
        )}
      </div>

      <form className="admin-form-layout" onSubmit={submit}>
        <section className="admin-card form-section">
          <div className="admin-card__header"><div><span className="eyebrow">IDENTIDADE</span><h2>Dados do estabelecimento</h2></div></div>
          <div className="form-grid">
            <label className="full">Nome<input required value={form.name} onChange={(e) => update('name', e.target.value)} /></label>
            <label className="full">Frase da loja<input value={form.tagline} onChange={(e) => update('tagline', e.target.value)} /></label>
            <label>Cidade<input value={form.city} onChange={(e) => update('city', e.target.value)} /></label>
            <label>UF<input value={form.state} onChange={(e) => update('state', e.target.value.toUpperCase())} maxLength={2} /></label>
            <label>CEP<input value={form.zipCode ?? ''} onChange={(e) => update('zipCode', e.target.value)} /></label>
            <label>Pedido mínimo<input type="number" min="0" step="0.01" value={form.minimumOrder} onChange={(e) => update('minimumOrder', Number(e.target.value))} /></label>
            <label className="full">Endereço<input value={form.address} onChange={(e) => update('address', e.target.value)} /></label>
            <label>WhatsApp (opcional)<input value={form.whatsapp} onChange={(e) => update('whatsapp', e.target.value)} placeholder="55 + DDD + número" /><small className="field-help">Não é obrigatório para registrar pedidos, mas é essencial para agilizar confirmações, comprovantes e dúvidas dos clientes.</small></label>
            <label className="switch-row"><span><strong>Exibir WhatsApp na vitrine</strong><small>Opcional no piloto, mas essencial para confirmar pagamentos e manter um atendimento rápido. O cartão por aproximação depende deste canal.</small></span><input type="checkbox" checked={form.showWhatsApp !== false} onChange={(e) => setForm((current) => ({ ...current, showWhatsApp: e.target.checked, cardPaymentEnabled: e.target.checked ? current.cardPaymentEnabled : false }))} /></label>
            <label>Instagram<input value={form.instagram} onChange={(e) => update('instagram', e.target.value)} /></label>
            <label>CPF/CNPJ de cobrança<input value={form.billingDocument ?? ''} onChange={(e) => update('billingDocument', e.target.value)} placeholder="Necessário para PIX automático" /></label>
            <label>Telefone de cobrança<input value={form.billingPhone ?? ''} onChange={(e) => update('billingPhone', e.target.value)} placeholder="55 + DDD + número" /></label>
            <div className="full opening-hours-admin">
              <div className="opening-hours-admin__heading"><div><Clock3 size={19}/><span><strong>Horário de atendimento</strong><small>O status Aberto/Fechado da loja será calculado automaticamente.</small></span></div><span className="opening-hours-preview">{formatOpeningSchedule(form.openingSchedule)}</span></div>
              <div className="opening-hours-scroll-note">Em telas menores, deslize horizontalmente para editar todos os horários.</div><div className="opening-hours-grid">{form.openingSchedule.days.map((day)=><div className={`opening-day-row ${day.enabled?'is-enabled':''}`} key={day.day}>
                <label className="opening-day-toggle"><input type="checkbox" checked={day.enabled} onChange={(e)=>updateOpeningDay(day.day,{enabled:e.target.checked})}/><span>{openingDayName(day.day)}</span></label>
                <label>Abre<input type="time" disabled={!day.enabled} value={day.open} onChange={(e)=>updateOpeningDay(day.day,{open:e.target.value})}/></label>
                <label>Fecha<input type="time" disabled={!day.enabled} value={day.close} onChange={(e)=>updateOpeningDay(day.day,{close:e.target.value})}/></label>
                <label className="opening-break-toggle"><input type="checkbox" disabled={!day.enabled} checked={Boolean(day.breakStart && day.breakEnd)} onChange={(e)=>updateOpeningDay(day.day,e.target.checked?{breakStart:day.breakStart||'12:00',breakEnd:day.breakEnd||'13:00'}:{breakStart:'',breakEnd:''})}/><span>Fechar para almoço</span></label>
                <label>Início da pausa<input type="time" disabled={!day.enabled || !(day.breakStart && day.breakEnd)} value={day.breakStart || ''} onChange={(e)=>updateOpeningDay(day.day,{breakStart:e.target.value})}/></label>
                <label>Fim da pausa<input type="time" disabled={!day.enabled || !(day.breakStart && day.breakEnd)} value={day.breakEnd || ''} onChange={(e)=>updateOpeningDay(day.day,{breakEnd:e.target.value})}/></label>
              </div>)}</div>
              <label className="timezone-field">Fuso horário<select value={form.openingSchedule.timezone} onChange={(e)=>setForm((current)=>({...current,openingSchedule:{...current.openingSchedule,timezone:e.target.value}}))}><option value="America/Sao_Paulo">Brasília / São Paulo</option><option value="America/Manaus">Manaus</option><option value="America/Belem">Belém</option><option value="America/Fortaleza">Fortaleza</option><option value="America/Recife">Recife</option><option value="America/Bahia">Salvador / Bahia</option></select></label>
            </div>
          </div>

          <div className="store-assets-editor">
            <div><span className="eyebrow">LOGO</span><ImageWithFallback src={logoPreview} alt="Prévia da logo" /><label className="secondary-button"><ImagePlus size={16} />Selecionar logo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} /></label></div>
            <div><span className="eyebrow">CAPA</span><ImageWithFallback src={coverPreview} alt="Prévia da capa" />{canCustomBanner?<label className="secondary-button"><ImagePlus size={16} />Selecionar capa<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} /></label>:<div className="plan-locked-inline"><strong>Banner disponível no Starter</strong><span>Seu banner atual é preservado, mas novas alterações ficam bloqueadas no Essencial.</span></div>}</div>
          </div>

          <section className="subform-section">
            <span className="eyebrow">APARÊNCIA DA VITRINE</span>
            <h3>Uma identidade que parece sua</h3>
            <p className="muted">Escolha uma base pronta ou refine as cores. A prévia vale apenas para a vitrine pública desta loja.</p>
            <div style={{ display: 'grid', gap: 8, marginTop: 14 }} role="radiogroup" aria-label="Tema visual da vitrine">
              <label className="switch-row"><span><strong>FoodWeb clássico</strong><small>Neutro, versátil e pronto para qualquer cardápio.</small></span><input type="radio" name="visual-theme-preset" checked={form.visualTheme.preset === 'foodweb'} onChange={() => applyVisualPreset('foodweb')} /></label>
              {canUseDoceLua && <label className="switch-row"><span><strong>Doce Lua</strong><small>Creme, chocolate, pêssego e dourado para uma vitrine delicada.</small></span><input type="radio" name="visual-theme-preset" checked={form.visualTheme.preset === 'doce_lua'} onChange={() => applyVisualPreset('doce_lua')} /></label>}
            </div>
            <div style={{ marginTop: 16, padding: 18, border: `1px solid ${form.visualTheme.borderColor}`, borderRadius: form.visualTheme.radius, background: form.visualTheme.backgroundColor, color: form.visualTheme.textColor }}>
               <div className="settings-storefront-preview" style={{ ...getStorefrontThemeStyle(form.visualTheme), borderRadius: form.visualTheme.radius, background: form.visualTheme.backgroundColor, color: form.visualTheme.textColor }}>
                 <div className="settings-storefront-preview__bar"><strong>{form.name || 'Sua loja'}</strong><span>Pedido direto</span></div>
                 <div className="settings-storefront-preview__hero" style={{ background: form.visualTheme.surfaceColor, borderColor: form.visualTheme.borderColor }}>
                   <span style={{ color: form.visualTheme.accentColor }}>ENCOMENDAS ONLINE</span>
                   <strong>{form.tagline || 'Sabores que dão vontade de voltar'}</strong>
                   <small>{form.storefrontNotice || 'Encomendas confirmadas conforme o horário da loja.'}</small>
                 </div>
                 <div className="settings-storefront-preview__body">
                   <div className="settings-storefront-preview__section-title"><span>DESTAQUES</span><small>Prévia enquanto você edita</small></div>
                   <div className="settings-storefront-preview__products">
                     {['Doce especial', 'Caixa para compartilhar', 'Favorito da casa'].map((product, index) => <div className="settings-storefront-preview__product" key={product} style={{ background: form.visualTheme.surfaceColor, borderColor: form.visualTheme.borderColor }}><span style={{ background: index === 1 ? form.visualTheme.highlightColor : form.visualTheme.accentColor }} /> <strong>{product}</strong><small>R$ {(18 + index * 7).toFixed(2).replace('.', ',')}</small></div>)}
                   </div>
                   <div className="settings-storefront-preview__pickup" style={{ borderColor: form.visualTheme.borderColor, color: form.visualTheme.mutedColor }}>{form.pickupInstructions || 'Retirada combinada após a confirmação do pedido.'}</div>
                 </div>
               </div>
               <small className="muted">A prévia acompanha as alterações sem sair desta tela. Salve as configurações para publicar na vitrine.</small>
            </div>
            <div className="form-grid" style={{ marginTop: 16 }}>
              <label>Cor principal<input type="color" value={form.visualTheme.primaryColor} onChange={(e) => updateVisualTheme('primaryColor', e.target.value)} /></label>
              <label>Cor de apoio<input type="color" value={form.visualTheme.accentColor} onChange={(e) => updateVisualTheme('accentColor', e.target.value)} /></label>
              <label>Destaques dourados<input type="color" value={form.visualTheme.highlightColor} onChange={(e) => updateVisualTheme('highlightColor', e.target.value)} /></label>
              <label>Fundo da página<input type="color" value={form.visualTheme.backgroundColor} onChange={(e) => updateVisualTheme('backgroundColor', e.target.value)} /></label>
              <label>Fundo dos cards<input type="color" value={form.visualTheme.surfaceColor} onChange={(e) => updateVisualTheme('surfaceColor', e.target.value)} /></label>
              <label>Texto principal<input type="color" value={form.visualTheme.textColor} onChange={(e) => updateVisualTheme('textColor', e.target.value)} /></label>
              <label>Texto secundário<input type="color" value={form.visualTheme.mutedColor} onChange={(e) => updateVisualTheme('mutedColor', e.target.value)} /></label>
              <label>Bordas e divisórias<input type="color" value={form.visualTheme.borderColor} onChange={(e) => updateVisualTheme('borderColor', e.target.value)} /></label>
              <label>Arredondamento dos cards (px)<input type="number" min="8" max="32" value={form.visualTheme.radius} onChange={(e) => updateVisualTheme('radius', Number(e.target.value))} /></label>
            </div>
          </section>

          <section className="subform-section">
            <span className="eyebrow">COMUNICAÇÃO DA VITRINE</span>
            <h3>Orientações antes de pedir</h3>
            <div className="form-grid">
              <label className="full">Aviso operacional<textarea rows={3} maxLength={240} value={form.storefrontNotice ?? ''} onChange={(e) => update('storefrontNotice', e.target.value)} placeholder="Ex.: Encomendas confirmadas a partir das 18h." /></label>
              <label className="full">Instruções para retirada<textarea rows={3} maxLength={240} value={form.pickupInstructions ?? ''} onChange={(e) => update('pickupInstructions', e.target.value)} placeholder="Ex.: Retirada no local de trabalho, combinada após a confirmação do pedido." /></label>
              <label className="switch-row full"><span><strong>Ocultar endereço público</strong><small>O endereço não aparece na vitrine nem no checkout. Use as instruções de retirada para orientar o cliente.</small></span><input type="checkbox" checked={form.hidePublicAddress} onChange={(e) => update('hidePublicAddress', e.target.checked)} /></label>
            </div>
          </section>
        </section>

        <aside>
          <section className="admin-card form-section">
            <span className="eyebrow">ATENDIMENTO</span>
            <h2>Pedido e recebimento</h2>
            <label className="switch-row"><span><strong>Entrega</strong><small>Permitir pedido para entrega</small></span><input type="checkbox" checked={form.deliveryEnabled} onChange={(e) => update('deliveryEnabled', e.target.checked)} /></label>
            <label className="switch-row"><span><strong>Retirada</strong><small>Permitir retirada na loja</small></span><input type="checkbox" checked={form.pickupEnabled} onChange={(e) => update('pickupEnabled', e.target.checked)} /></label>
            {form.deliveryEnabled && <label><span>Início das entregas <small className="muted">opcional</small></span><input type="time" value={form.deliveryStartTime || ''} onChange={(e) => update('deliveryStartTime', e.target.value || undefined)} /><small>Antes deste horário, o delivery fica bloqueado. A retirada continua disponível.</small></label>}
            <div className="form-grid preparation-config"><label>Preparo mínimo (min)<input type="number" min="0" max="600" value={form.averagePreparationMin} onChange={(e)=>update('averagePreparationMin',Math.max(0,Number(e.target.value)))} /></label><label>Preparo máximo (min)<input type="number" min="0" max="600" value={form.averagePreparationMax} onChange={(e)=>update('averagePreparationMax',Math.max(0,Number(e.target.value)))} /></label></div>
            <label className="switch-row"><span><strong>Permitir pedido agendado</strong><small>Quando a loja estiver fechada, o cliente poderá selecionar um horário futuro.</small></span><input type="checkbox" checked={form.allowScheduledOrders} onChange={(e)=>update('allowScheduledOrders',e.target.checked)} /></label>
            <label className="switch-row"><span><strong>Modo cozinha / KDS</strong><small>Exibe um quadro operacional dentro de Pedidos e libera mensagens prontas de atualização para o cliente.</small></span><input type="checkbox" checked={form.kdsEnabled} onChange={(e)=>update('kdsEnabled',e.target.checked)} /></label>
            {form.kdsEnabled && <label className="switch-row"><span><strong>Preparar mensagem ao mudar status</strong><small>Ao avançar o pedido, abre o WhatsApp com uma mensagem pronta para o lojista apenas confirmar o envio.</small></span><input type="checkbox" checked={form.kdsNotifyCustomer} onChange={(e)=>update('kdsNotifyCustomer',e.target.checked)} /></label>}
          </section>

          <section className="admin-card form-section">
            <span className="eyebrow">ALERTAS DA OPERAÇÃO</span>
            <h2>Notificações do painel</h2>
            <p className="muted">Receba avisos no painel e na barra de notificações do celular quando o Admin estiver instalado como PWA. O navegador solicitará permissão na primeira ativação.</p>
            <label className="switch-row"><span><strong>Novo pedido</strong><small>Avisa assim que um pedido novo for registrado.</small></span><input type="checkbox" checked={form.notificationsNewOrderEnabled} onChange={(e)=>update('notificationsNewOrderEnabled',e.target.checked)} /></label>
            <label className="switch-row"><span><strong>Pedido agendado próximo</strong><small>Avisa antes do horário de um pedido agendado para você se preparar.</small></span><input type="checkbox" checked={form.notificationsScheduledEnabled} onChange={(e)=>update('notificationsScheduledEnabled',e.target.checked)} /></label>
            {form.notificationsScheduledEnabled && <label>Antecedência do lembrete (minutos)<input type="number" min="5" max="1440" step="5" value={form.notificationsScheduledLeadMinutes} onChange={(e)=>update('notificationsScheduledLeadMinutes',Math.min(1440,Math.max(5,Number(e.target.value)||5)))} /><small>Ex.: 30 avisa quando faltarem aproximadamente 30 minutos.</small></label>}
            <label className="switch-row"><span><strong>Avisos no celular / PWA</strong><small>Usa a barra de notificações do dispositivo quando a permissão estiver disponível.</small></span><input type="checkbox" checked={form.notificationsDesktopEnabled} onChange={(e)=>toggleDesktopNotifications(e.target.checked)} /></label>
            <label className="switch-row"><span><strong>Som do alerta</strong><small>Toca um aviso discreto junto com a notificação, quando permitido pelo navegador.</small></span><input type="checkbox" checked={form.notificationsSoundEnabled} onChange={(e)=>update('notificationsSoundEnabled',e.target.checked)} /></label>
            <div className="admin-info-box"><Info size={17}/><span>Com o PWA aberto ou instalado, novos pedidos e lembretes aparecem como notificação do sistema. A confirmação de pagamento continua sendo uma ação separada.</span></div>
          </section>

          <section className="admin-card form-section growth-settings-v062">
            <span className="eyebrow">VENDAS E RELACIONAMENTO</span>
            <h2>Recorrência e aumento de ticket</h2>
            <label className="switch-row"><span><strong>Recuperação de vendas</strong><small>Lista pedidos salvos cujo contato ainda não foi concluído.</small></span><input type="checkbox" checked={form.salesRecoveryEnabled} onChange={(e)=>update('salesRecoveryEnabled',e.target.checked)} /></label>
            {form.salesRecoveryEnabled && <div className="form-grid"><label>Considerar oportunidade após (min)<input type="number" min="5" max="1440" step="5" value={form.salesRecoveryMinutes} onChange={(e)=>update('salesRecoveryMinutes',Math.min(1440,Math.max(5,Number(e.target.value)||5)))} /></label><label>Manter oportunidade por (horas)<input type="number" min="1" max="168" value={form.salesRecoveryWindowHours ?? 48} onChange={(e)=>update('salesRecoveryWindowHours',Math.min(168,Math.max(1,Number(e.target.value)||1)))} /></label></div>}
            <label className="switch-row"><span><strong>CRM simples</strong><small>Agrupa clientes pelo telefone usando os pedidos já registrados.</small></span><input type="checkbox" checked={form.crmEnabled} onChange={(e)=>update('crmEnabled',e.target.checked)} /></label>{form.crmEnabled&&<label>Sugerir recompra após (dias)<input type="number" min="1" max="365" value={form.crmComeBackDays ?? 21} onChange={(e)=>update('crmComeBackDays',Math.min(365,Math.max(1,Number(e.target.value)||1)))} /></label>}
            <label className="switch-row"><span><strong>Pedir novamente</strong><small>Permite reconstruir o último pedido salvo no dispositivo do cliente.</small></span><input type="checkbox" checked={form.repeatOrderEnabled} onChange={(e)=>update('repeatOrderEnabled',e.target.checked)} /></label>{form.repeatOrderEnabled&&<label>Manter último pedido por (dias)<input type="number" min="1" max="365" value={form.repeatOrderMaxAgeDays ?? 90} onChange={(e)=>update('repeatOrderMaxAgeDays',Math.min(365,Math.max(1,Number(e.target.value)||1)))} /></label>}
            <label className="switch-row"><span><strong>Upsell no carrinho</strong><small>Sugere outros produtos disponíveis antes do checkout.</small></span><input type="checkbox" checked={form.upsellEnabled} onChange={(e)=>update('upsellEnabled',e.target.checked)} /></label>
            {form.upsellEnabled && <label>Quantidade de sugestões<select value={form.upsellLimit} onChange={(e)=>update('upsellLimit',Number(e.target.value))}><option value={1}>1 produto</option><option value={2}>2 produtos</option><option value={3}>3 produtos</option><option value={4}>4 produtos</option><option value={6}>6 produtos</option></select></label>}
            <div className="admin-info-box"><Info size={17}/><span>Esses recursos usam os dados operacionais que o FoodWeb já possui e não criam uma nova área de ERP.</span></div>
          </section>

          <section className="admin-card form-section message-templates-v063">
            <span className="eyebrow">COMUNICAÇÃO</span>
            <h2>Mensagens programadas</h2>
            <p>Edite as mensagens abertas manualmente no WhatsApp. As variáveis entre chaves são protegidas: se alguma for apagada, ela será recolocada automaticamente e também será corrigida ao salvar.</p>
            <div className="message-template-variables-v063"><code>{'{cliente}'}</code><code>{'{pedido}'}</code><code>{'{loja}'}</code><code>{'{total}'}</code><code>{'{previsao}'}</code><code>{'{status}'}</code></div>
            <details open><summary>Status do pedido</summary><div className="message-template-grid-v063">
              <label>Recebido<textarea rows={3} value={messageTemplates.received} onChange={(e)=>updateMessageTemplate('received',e.target.value)} /></label>
              <label>Confirmado<textarea rows={3} value={messageTemplates.confirmed} onChange={(e)=>updateMessageTemplate('confirmed',e.target.value)} /></label>
              <label>Em preparação<textarea rows={3} value={messageTemplates.preparing} onChange={(e)=>updateMessageTemplate('preparing',e.target.value)} /></label>
              <label>Pronto<textarea rows={3} value={messageTemplates.ready} onChange={(e)=>updateMessageTemplate('ready',e.target.value)} /></label>
              <label>Saiu para entrega<textarea rows={3} value={messageTemplates.outForDelivery} onChange={(e)=>updateMessageTemplate('outForDelivery',e.target.value)} /></label>
              <label>Entregue<textarea rows={3} value={messageTemplates.delivered} onChange={(e)=>updateMessageTemplate('delivered',e.target.value)} /></label>
              <label>Retirado<textarea rows={3} value={messageTemplates.pickedUp} onChange={(e)=>updateMessageTemplate('pickedUp',e.target.value)} /></label>
              <label>Cancelado<textarea rows={3} value={messageTemplates.cancelled} onChange={(e)=>updateMessageTemplate('cancelled',e.target.value)} /></label>
            </div></details>
            <details><summary>Relacionamento</summary><div className="message-template-grid-v063"><label>Recuperação de venda<textarea rows={4} value={messageTemplates.salesRecovery} onChange={(e)=>updateMessageTemplate('salesRecovery',e.target.value)} /></label><label>Recompra / retorno<textarea rows={4} value={messageTemplates.comeBack} onChange={(e)=>updateMessageTemplate('comeBack',e.target.value)} /></label></div></details>
            <button type="button" className="secondary-button" onClick={()=>setForm((current)=>({...current,messageTemplates:normalizeCustomerMessageTemplates(DEFAULT_CUSTOMER_MESSAGE_TEMPLATES)}))}>Restaurar mensagens padrão</button>
          </section>

          <section className="admin-card form-section payment-admin-section">
            <div className="admin-card__header"><div><span className="eyebrow">PAGAMENTOS</span><h2>Confirmação manual</h2></div><Info size={21} /></div>
            <label className="switch-row"><span><strong>Confirmar com a loja</strong><small>Permite finalizar sem escolher PIX, cartão ou dinheiro. A loja combina o pagamento pelo WhatsApp.</small></span><input type="checkbox" checked={form.confirmationPaymentEnabled} onChange={(e) => update('confirmationPaymentEnabled', e.target.checked)} /></label>
          </section>

          <section className="admin-card form-section payment-admin-section">
            <div className="admin-card__header"><div><span className="eyebrow">PAGAMENTOS</span><h2>PIX</h2></div><QrCode size={21} /></div>
            <label className="switch-row"><span><strong>PIX habilitado</strong><small>Mostrar PIX como opção no checkout</small></span><input type="checkbox" checked={form.pixEnabled} onChange={(e) => update('pixEnabled', e.target.checked)} /></label>

            {form.pixEnabled && (
              <>
                <label className="switch-row"><span><strong>Permitir pagamento direto por PIX</strong><small>Exibe o PIX no checkout e na confirmação</small></span><input type="checkbox" checked={form.showPixBeforeConfirmation} onChange={(e) => update('showPixBeforeConfirmation', e.target.checked)} /></label>

                <div className="pix-mode-admin">
                  <span className="admin-field-label">Como o cliente receberá o PIX?</span>
                  <button type="button" className={form.pixReceiptMode === 'copy_paste' ? 'pix-mode-option selected' : 'pix-mode-option'} onClick={() => activatePixReceiptMode('copy_paste')}>
                    <QrCode size={22} />
                    <span><strong>PIX Copia e Cola <em>Recomendado</em></strong><small>O sistema coloca automaticamente o total do carrinho no código PIX.</small></span>
                  </button>
                  <button type="button" className={form.pixReceiptMode === 'key' ? 'pix-mode-option selected' : 'pix-mode-option'} onClick={() => activatePixReceiptMode('key')}>
                    <CreditCard size={22} />
                    <span><strong>Chave PIX</strong><small>O cliente copia a chave e informa o valor manualmente no banco.</small></span>
                  </button>
                </div>

                {form.pixReceiptMode === 'copy_paste' ? (
                  <>
                    <label className="pix-copy-paste-field">PIX Copia e Cola base<textarea ref={pixCopyPasteRef} rows={5} value={form.pixCopyPaste} onChange={(e) => update('pixCopyPaste', e.target.value)} placeholder="Cole aqui o código PIX Copia e Cola gerado pelo seu banco" /></label>
                    <details className="payment-help">
                      <summary><Info size={16} />Como obter este código no banco?</summary>
                      <div>
                        <p>No aplicativo ou internet banking, procure por <strong>PIX → Receber/Cobrar → QR Code ou PIX Copia e Cola</strong>.</p>
                        <p>Prefira gerar um <strong>PIX estático sem valor fixo</strong>. Copie o código completo e cole acima. A plataforma adicionará o total do pedido e recalculará o código automaticamente.</p>
                        <p>Se o banco gerar um PIX dinâmico com cobrança/expiração controlada pelo próprio banco, use a opção <strong>Chave PIX</strong> nesta versão.</p>
                      </div>
                    </details>
                  </>
                ) : (
                  <>
                    <label>Tipo da chave PIX<input value={form.pixKeyType} onChange={(e) => update('pixKeyType', e.target.value)} placeholder="CPF, CNPJ, telefone, e-mail ou aleatória" /></label>
                    <label>Chave PIX<input value={form.pixKey} onChange={(e) => update('pixKey', e.target.value)} /></label>
                  </>
                )}
                <label>Nome do recebedor<input value={form.pixReceiver} onChange={(e) => update('pixReceiver', e.target.value)} /></label>
              </>
            )}
          </section>

          <section className="admin-card form-section payment-admin-section">
            <div className="admin-card__header"><div><span className="eyebrow">PAGAMENTOS</span><h2>Cartão</h2></div><CreditCard size={21} /></div>
            <label className="switch-row"><span><strong>Pagamento por cartão por aproximação (NFC)</strong><small>Permite cartão de crédito ou débito na entrega/retirada, com o WhatsApp disponível para confirmação.</small></span><input type="checkbox" checked={form.cardPaymentEnabled} disabled={form.showWhatsApp === false || !form.whatsapp.trim()} onChange={(e) => update('cardPaymentEnabled', e.target.checked)} /></label>
            {form.cardPaymentEnabled && <div className="admin-info-box"><Info size={17} /><span>A plataforma não captura dados do cartão. A cobrança é presencial pela loja e o WhatsApp permanece disponível para orientar o cliente.</span></div>}
            {(!form.whatsapp.trim() || form.showWhatsApp === false) && <div className="admin-info-box"><Info size={17} /><span>Cadastre um WhatsApp e deixe a exibição ativa para liberar esta forma de pagamento.</span></div>}
          </section>

          <section className="admin-card form-section payment-admin-section">
            <div className="admin-card__header"><div><span className="eyebrow">PAGAMENTOS</span><h2>Dinheiro</h2></div><Banknote size={21} /></div>
            <label className="switch-row"><span><strong>Pagamento em dinheiro</strong><small>Permitir que o cliente escolha pagar em dinheiro na entrega ou retirada.</small></span><input type="checkbox" checked={form.cashPaymentEnabled} onChange={(e) => update('cashPaymentEnabled', e.target.checked)} /></label>
            {form.cashPaymentEnabled && <div className="admin-info-box"><Info size={17} /><span>O pedido será registrado como pagamento em dinheiro. Se o cliente precisar de troco, o valor informado ficará registrado no pedido.</span></div>}
          </section>

          <section className="admin-card form-section payment-admin-section">
            <div className="admin-card__header"><div><span className="eyebrow">EXIBIÇÃO</span><h2>Ordem no checkout</h2></div></div>
            <p>Defina a sequência das formas de pagamento mostradas ao cliente. Opções desativadas ficam ocultas, mas mantêm sua posição.</p>
            <div className="payment-order-admin">
              {form.paymentMethodOrder.map((method, index) => {
                const labels: Record<PaymentMethod, string> = { confirm: 'Confirmar com a loja', pix: 'PIX', card: 'Cartão', cash: 'Dinheiro' };
                const enabled = (method === 'confirm' && form.confirmationPaymentEnabled) || (method === 'pix' && form.pixEnabled && form.showPixBeforeConfirmation) || (method === 'card' && form.cardPaymentEnabled && form.showWhatsApp !== false && Boolean(form.whatsapp.trim())) || (method === 'cash' && form.cashPaymentEnabled);
                return <div key={method} className={enabled ? 'is-enabled' : 'is-disabled'}>
                  <span><b>{index + 1}</b><strong>{labels[method]}</strong><small>{enabled ? 'Visível no checkout' : 'Desativada'}</small></span>
                  <div><button type="button" disabled={index === 0} onClick={() => movePaymentMethod(method, -1)} aria-label="Mover para cima"><ArrowUp size={15}/></button><button type="button" disabled={index === form.paymentMethodOrder.length - 1} onClick={() => movePaymentMethod(method, 1)} aria-label="Mover para baixo"><ArrowDown size={15}/></button></div>
                </div>;
              })}
            </div>
          </section>

          <button className="primary-button full-button" disabled={saving} type="submit"><Save size={18} />{saving ? 'Salvando...' : 'Salvar configurações'}</button>
        </aside>
      </form>
      <PasswordChangeCard />
    </>
  );
}
