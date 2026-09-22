import { ArrowDown, ArrowUp, Banknote, Clock3, CreditCard, ImagePlus, Info, QrCode, RotateCcw, Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { ErrorState, LoadingState } from '../../components/ui/AsyncState';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import type { PaymentMethod, StoreSettings } from '../../types';
import { buildPixCopyPasteWithAmount, validatePixCopyPasteBase } from '../../utils/pix';
import { formatOpeningSchedule, openingDayName } from '../../utils/storeHours';
import { PasswordChangeCard } from '../../components/admin/PasswordChangeCard';
import { planHasFeature } from '../../utils/plan';

export default function SettingsAdmin() {
  const { settings, saveSettings, resetDemo, uploadStoreAsset, dataMode, loading, error, reloadAdmin, planUsage } = useStore();
  const { showToast } = useToast();
  const [form, setForm] = useState<StoreSettings>(structuredClone(settings));
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const pixCopyPasteRef = useRef<HTMLTextAreaElement | null>(null);
  const canCustomBanner = planHasFeature(planUsage.plan, 'custom_banner');

  useEffect(() => setForm(structuredClone(settings)), [settings]);
  const logoPreview = useMemo(() => logoFile ? URL.createObjectURL(logoFile) : form.logoUrl, [logoFile, form.logoUrl]);
  const coverPreview = useMemo(() => coverFile ? URL.createObjectURL(coverFile) : form.heroUrl, [coverFile, form.heroUrl]);
  useEffect(() => () => { if (logoFile) URL.revokeObjectURL(logoPreview); }, [logoFile, logoPreview]);
  useEffect(() => () => { if (coverFile) URL.revokeObjectURL(coverPreview); }, [coverFile, coverPreview]);

  const update = <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) => setForm((current) => ({ ...current, [key]: value }));
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
      let next = { ...form, openingHours: formatOpeningSchedule(form.openingSchedule) };
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
            <label>WhatsApp<input required value={form.whatsapp} onChange={(e) => update('whatsapp', e.target.value)} placeholder="55 + DDD + número" /></label>
            <label>Instagram<input value={form.instagram} onChange={(e) => update('instagram', e.target.value)} /></label>
            <label>CPF/CNPJ de cobrança<input value={form.billingDocument ?? ''} onChange={(e) => update('billingDocument', e.target.value)} placeholder="Necessário para PIX automático" /></label>
            <label>Telefone de cobrança<input value={form.billingPhone ?? ''} onChange={(e) => update('billingPhone', e.target.value)} placeholder="55 + DDD + número" /></label>
            <div className="full opening-hours-admin">
              <div className="opening-hours-admin__heading"><div><Clock3 size={19}/><span><strong>Horário de atendimento</strong><small>O status Aberto/Fechado da loja será calculado automaticamente.</small></span></div><span className="opening-hours-preview">{formatOpeningSchedule(form.openingSchedule)}</span></div>
              <div className="opening-hours-grid">{form.openingSchedule.days.map((day)=><div className={`opening-day-row ${day.enabled?'is-enabled':''}`} key={day.day}>
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
        </section>

        <aside>
          <section className="admin-card form-section">
            <span className="eyebrow">ATENDIMENTO</span>
            <h2>Pedido e recebimento</h2>
            <label className="switch-row"><span><strong>Entrega</strong><small>Permitir pedido para entrega</small></span><input type="checkbox" checked={form.deliveryEnabled} onChange={(e) => update('deliveryEnabled', e.target.checked)} /></label>
            <label className="switch-row"><span><strong>Retirada</strong><small>Permitir retirada na loja</small></span><input type="checkbox" checked={form.pickupEnabled} onChange={(e) => update('pickupEnabled', e.target.checked)} /></label>
            <div className="form-grid preparation-config"><label>Preparo mínimo (min)<input type="number" min="0" max="600" value={form.averagePreparationMin} onChange={(e)=>update('averagePreparationMin',Math.max(0,Number(e.target.value)))} /></label><label>Preparo máximo (min)<input type="number" min="0" max="600" value={form.averagePreparationMax} onChange={(e)=>update('averagePreparationMax',Math.max(0,Number(e.target.value)))} /></label></div>
            <label className="switch-row"><span><strong>Permitir pedido agendado</strong><small>Quando a loja estiver fechada, o cliente poderá selecionar um horário futuro.</small></span><input type="checkbox" checked={form.allowScheduledOrders} onChange={(e)=>update('allowScheduledOrders',e.target.checked)} /></label>
            <label className="switch-row"><span><strong>Modo cozinha / KDS</strong><small>Exibe um quadro operacional dentro de Pedidos e libera mensagens prontas de atualização para o cliente.</small></span><input type="checkbox" checked={form.kdsEnabled} onChange={(e)=>update('kdsEnabled',e.target.checked)} /></label>
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
            <label className="switch-row"><span><strong>Pagamento por cartão</strong><small>Permite pagamento com cartão no momento da entrega ou retirada.</small></span><input type="checkbox" checked={form.cardPaymentEnabled} onChange={(e) => update('cardPaymentEnabled', e.target.checked)} /></label>
            {form.cardPaymentEnabled && <div className="admin-info-box"><Info size={17} /><span>A plataforma não captura dados do cartão. A cobrança é realizada pela loja na entrega ou retirada.</span></div>}
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
                const enabled = (method === 'confirm' && form.confirmationPaymentEnabled) || (method === 'pix' && form.pixEnabled && form.showPixBeforeConfirmation) || (method === 'card' && form.cardPaymentEnabled) || (method === 'cash' && form.cashPaymentEnabled);
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
