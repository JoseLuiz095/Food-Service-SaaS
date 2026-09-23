import {
  BarChart3,
  BadgeDollarSign,
  Check,
  Clock3,
  Copy,
  Globe2,
  Images,
  MessageCircleMore,
  Package,
  Puzzle,
  QrCode,
  Save,
  ShieldCheck,
  Tags,
  WalletCards,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { LoadingState } from '../../components/ui/AsyncState';
import { useToast } from '../../contexts/ToastContext';
import { trackInteraction } from '../../services/interactionTelemetry';
import { platformApi } from '../../services/platformApi';
import type { Plan, PlatformSettings } from '../../types';
import { copyText } from '../../utils/clipboard';
import { currency } from '../../utils/format';
import { planHasFeature } from '../../utils/plan';

type PlanFeature = {
  key: string;
  label: string;
  icon: typeof Package;
};

const limitText = (value: number | null | undefined, singular: string, plural: string) => {
  if (value == null) return `${plural} ilimitados`;
  return `${value} ${value === 1 ? singular : plural}`;
};

const getPlanFeatures = (plan: Plan): PlanFeature[] => [
  { key: 'products', label: limitText(plan.productLimit, 'produto ativo', 'produtos ativos'), icon: Package },
  { key: 'categories', label: limitText(plan.categoryLimit, 'categoria', 'categorias'), icon: Tags },
  { key: 'images', label: limitText(plan.imageLimitPerProduct, 'foto por produto', 'fotos por produto'), icon: Images },
  { key: 'addons', label: limitText(plan.addonLimit, 'adicional', 'adicionais'), icon: Puzzle },
  { key: 'domain', label: plan.customDomain ? 'Domínio próprio incluído' : 'Endereço padrão FoodWeb', icon: Globe2 },
  { key: 'reports', label: plan.reports ? 'Relatórios comerciais' : 'Visão geral operacional', icon: BarChart3 },
  { key: 'prioritySupport', label: plan.prioritySupport ? 'Suporte prioritário' : 'Suporte padrão', icon: MessageCircleMore },
];

const planHighlightCopy = (plan: Plan) => {
  if (plan.code === 'DEMO') {
    return {
      eyebrow: 'TESTE',
      title: 'Período de avaliação',
      description: 'Configuração inicial para degustação do FoodWeb antes da contratação.',
    };
  }

  if (plan.code === 'PREMIUM') {
    return {
      eyebrow: 'PLANO',
      title: 'Operação mais completa',
      description: 'Ideal para lojas com fluxo maior, catálogo amplo e necessidade de controle reforçado.',
    };
  }

  if (plan.code === 'PROFESSIONAL') {
    return {
      eyebrow: 'PLANO',
      title: 'Equilíbrio entre operação e crescimento',
      description: 'Pensado para operações com mais volume e necessidade de recursos adicionais.',
    };
  }

  return {
    eyebrow: 'PLANO',
    title: 'Entrada organizada',
    description: 'Estrutura essencial para começar a vender com apresentação profissional.',
  };
};

export default function MasterPlans() {
  const { showToast } = useToast();
  const [draftPlans, setDraftPlans] = useState<Plan[]>([]);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoEnabled, setDemoEnabled] = useState(true);
  const [demoDays, setDemoDays] = useState(7);
  const [demoWarningDays, setDemoWarningDays] = useState(2);
  const [savingKey, setSavingKey] = useState('');
  const [billing, setBilling] = useState<PlatformSettings | null>(null);
  const [billingSaving, setBillingSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const [nextPlans, settings] = await Promise.all([
          platformApi.listPlans(),
          platformApi.getPlatformSettings(),
        ]);
        if (!mounted) return;
        setDraftPlans([...nextPlans].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
        setPlatformSettings(settings);
        setBilling(settings);
        setDemoEnabled(settings.demoEnabled ?? true);
        setDemoDays(settings.demoDurationDays ?? 7);
        setDemoWarningDays(settings.demoWarningDays ?? 2);
      } catch (error) {
        if (mounted) showToast(error instanceof Error ? error.message : 'Não foi possível carregar os planos.', 'error');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [showToast]);

  const orderedPlans = useMemo(
    () => [...draftPlans].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [draftPlans],
  );

  if (loading || !billing || !platformSettings) return <LoadingState label="Carregando planos..." />;

  const updatePlan = (planId: string, patch: Partial<Plan>) => {
    setDraftPlans((current) => current.map((plan) => (plan.id === planId ? { ...plan, ...patch } : plan)));
  };

  const saveDemoConfig = async () => {
    if (demoWarningDays >= demoDays) {
      showToast('O aviso deve ser menor que o período de avaliação.', 'error');
      return;
    }

    setSavingKey('demo-config');
    try {
      const saved = await trackInteraction(
        'master_save_demo_settings',
        () => platformApi.savePlatformSettings({
          ...platformSettings,
          demoEnabled,
          demoDurationDays: demoDays,
          demoWarningDays,
        }),
        { successKind: 'audit' },
      );
      setPlatformSettings(saved);
      setBilling(saved);
      showToast('Configuração da degustação atualizada.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível salvar a configuração Demo.', 'error');
    } finally {
      setSavingKey('');
    }
  };

  const saveBilling = async () => {
    if (!billing.billingPixKey?.trim() && !billing.billingPixCopyPaste?.trim()) {
      showToast('Informe a chave PIX ou o PIX copia e cola base.', 'error');
      return;
    }
    if (!billing.billingPixHolderName?.trim()) {
      showToast('Informe o favorecido do PIX.', 'error');
      return;
    }
    if (!billing.billingPixCity?.trim()) {
      showToast('Informe a cidade do recebedor do PIX.', 'error');
      return;
    }
    if (!billing.billingWhatsapp?.trim()) {
      showToast('Informe o WhatsApp financeiro.', 'error');
      return;
    }

    setBillingSaving(true);
    try {
      const saved = await trackInteraction('master_save_billing_config', () => platformApi.savePlatformSettings(billing), { successKind: 'audit' });
      setBilling(saved);
      setPlatformSettings(saved);
      showToast('Configuração de cobrança salva com sucesso.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível salvar a configuração de cobrança.', 'error');
    } finally {
      setBillingSaving(false);
    }
  };

  const savePlanCard = async (plan: Plan) => {
    setSavingKey(plan.id);
    try {
      const saved = await trackInteraction('master_plan_save', () => platformApi.savePlan(plan), { successKind: 'audit' });
      setDraftPlans((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      showToast(`Plano ${saved.name} salvo com sucesso.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível salvar o plano.', 'error');
    } finally {
      setSavingKey('');
    }
  };

  const proofRequired = billing.billingProofRequired ?? true;
  const autoRenew = billing.billingAutoRenew ?? false;

  return (
    <>
      <div className="admin-page-title plan-page-heading">
        <div>
          <span className="eyebrow">PLANOS</span>
          <h1>Planos e cobrança</h1>
          <p>Centralize degustação, planos pagos e configuração do PIX com o mesmo padrão visual do FloriWeb.</p>
        </div>
        <a className="secondary-button" href="/admin-master/pagamentos">
          <WalletCards size={16} />
          Ver pagamentos
        </a>
      </div>

      <section className="master-settings-pair">
        <section className="admin-card demo-trial-settings food-master-demo-card">
          <div className="admin-card__header">
            <div>
              <span className="eyebrow">PLANO DEMO</span>
              <h2>Período de avaliação</h2>
            </div>
            <Clock3 size={18} />
          </div>
          <p>
            Controle quantos dias o FoodWeb fica com os recursos liberados na degustação e quando o aviso de encerramento deve aparecer.
          </p>
          <div className="demo-settings-grid">
            <label>
              Duração da Demo
              <input value={demoDays} onChange={(event) => setDemoDays(Math.max(1, Number(event.target.value) || 0))} type="number" min={1} max={90} />
              <small>Quantidade de dias com acesso liberado.</small>
            </label>
            <label>
              Aviso antecipado
              <input value={demoWarningDays} onChange={(event) => setDemoWarningDays(Math.max(0, Number(event.target.value) || 0))} type="number" min={0} max={30} />
              <small>Quantos dias antes do fim o sistema começa a alertar.</small>
            </label>
            <label className="demo-enabled-select">
              Disponibilidade
              <select value={demoEnabled ? 'enabled' : 'disabled'} onChange={(event) => setDemoEnabled(event.target.value === 'enabled')}>
                <option value="enabled">Habilitada</option>
                <option value="disabled">Desabilitada</option>
              </select>
            </label>
          </div>
          <div className="demo-settings-preview">
            <span><strong>{demoEnabled ? 'Ativa' : 'Desativada'}</strong> para novas lojas</span>
            <span><strong>{demoDays} dia(s)</strong> de degustação</span>
            <span><strong>{demoWarningDays} dia(s)</strong> de aviso antes do encerramento</span>
          </div>
          <button className="primary-button master-save-commercial" type="button" onClick={saveDemoConfig} disabled={savingKey === 'demo-config'}>
            <Save size={16} />
            {savingKey === 'demo-config' ? 'Salvando configuração Demo...' : 'Salvar configuração Demo'}
          </button>
        </section>

        <section className="admin-card food-master-billing-card">
          <div className="admin-card__header">
            <div>
              <span className="eyebrow">PIX DA PLATAFORMA</span>
              <h2>Mensalidade via PIX</h2>
            </div>
            <QrCode size={18} />
          </div>
          <p>
            Cadastro usado para gerar o copia e cola com valor dinâmico das mensalidades do FoodWeb. Conferência manual do comprovante permanece obrigatória antes da liberação.
          </p>

          <div className="food-master-billing-toggles">
            <label className="switch-row">
              <span>
                <strong>Comprovante obrigatório</strong>
                <small>O cliente precisa enviar o comprovante pelo WhatsApp financeiro.</small>
              </span>
              <input
                type="checkbox"
                checked={proofRequired}
                onChange={(event) => setBilling((current) => current ? { ...current, billingProofRequired: event.target.checked } : current)}
              />
            </label>
            <label className="switch-row">
              <span>
                <strong>Renovação automática</strong>
                <small>Permite reaproveitar a mesma regra de cobrança em renovações futuras.</small>
              </span>
              <input
                type="checkbox"
                checked={autoRenew}
                onChange={(event) => setBilling((current) => current ? { ...current, billingAutoRenew: event.target.checked } : current)}
              />
            </label>
          </div>

          <div className="food-master-billing-fields">
            <label>
              Tipo da chave PIX
              <select
                value={billing.billingPixKeyType ?? 'email'}
                onChange={(event) => setBilling((current) => current ? { ...current, billingPixKeyType: event.target.value as PlatformSettings['billingPixKeyType'] } : current)}
              >
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
                <option value="email">E-mail</option>
                <option value="phone">Telefone</option>
                <option value="random">Aleatória</option>
              </select>
            </label>
            <label>
              Chave PIX
              <input value={billing.billingPixKey ?? ''} onChange={(event) => setBilling((current) => current ? { ...current, billingPixKey: event.target.value } : current)} />
            </label>
            <label>
              Favorecido
              <input value={billing.billingPixHolderName ?? ''} onChange={(event) => setBilling((current) => current ? { ...current, billingPixHolderName: event.target.value } : current)} />
            </label>
            <label>
              Cidade
              <input value={billing.billingPixCity ?? ''} onChange={(event) => setBilling((current) => current ? { ...current, billingPixCity: event.target.value } : current)} />
            </label>
            <label>
              WhatsApp para comprovantes
              <input value={billing.billingWhatsapp ?? ''} onChange={(event) => setBilling((current) => current ? { ...current, billingWhatsapp: event.target.value } : current)} />
            </label>
            <label>
              WhatsApp comercial
              <input value={billing.marketingWhatsapp ?? ''} onChange={(event) => setBilling((current) => current ? { ...current, marketingWhatsapp: event.target.value } : current)} />
            </label>
            <label>
              WhatsApp de suporte
              <input value={billing.supportWhatsapp ?? ''} onChange={(event) => setBilling((current) => current ? { ...current, supportWhatsapp: event.target.value } : current)} />
            </label>
            <label>
              Dias de tolerância
              <input
                type="number"
                min={0}
                max={60}
                value={billing.billingGraceDays ?? 7}
                onChange={(event) => setBilling((current) => current ? { ...current, billingGraceDays: Math.max(0, Number(event.target.value) || 0) } : current)}
              />
            </label>
            <label className="full">
              PIX copia e cola base
              <textarea
                rows={5}
                value={billing.billingPixCopyPaste ?? ''}
                onChange={(event) => setBilling((current) => current ? { ...current, billingPixCopyPaste: event.target.value } : current)}
                placeholder="Cole aqui o PIX estático base usado para gerar a cobrança com valor."
              />
            </label>
          </div>

          {(billing.billingPixCopyPaste ?? '').trim() && (
            <div className="food-master-billing-preview">
              <div>
                <ShieldCheck size={17} />
                <span>PIX base carregado para gerar o copia e cola com valor.</span>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void copyText(billing.billingPixCopyPaste ?? '').then(() => showToast('PIX copiado.', 'success'))}
              >
                <Copy size={15} />
                Copiar base
              </button>
            </div>
          )}

          <button className="primary-button master-save-commercial" type="button" onClick={saveBilling} disabled={billingSaving}>
            <Save size={16} />
            {billingSaving ? 'Salvando cobrança...' : 'Salvar cobrança'}
          </button>
        </section>
      </section>

      <div className="master-plan-grid master-plan-grid-food-unified">
        {orderedPlans.map((plan) => {
          const summary = planHighlightCopy(plan);
          const featured = plan.code === 'PREMIUM';
          const isDemo = plan.code === 'DEMO';
          const chips = getPlanFeatures(plan);

          return (
            <article className={`admin-card master-plan-card ${featured ? 'featured' : ''} ${isDemo ? 'is-demo' : ''}`} key={plan.id}>
              {featured && <span className="plan-featured-badge">Mais robusto</span>}
              {isDemo && <span className="plan-featured-badge neutral">Acesso temporário</span>}

              <div className="master-plan-title">
                <div>
                  <span className="eyebrow">{summary.eyebrow}</span>
                  <input value={plan.name} onChange={(event) => updatePlan(plan.id, { name: event.target.value })} />
                  <p>{summary.description}</p>
                </div>
                <label className="plan-active-toggle">
                  <input type="checkbox" checked={plan.active} onChange={(event) => updatePlan(plan.id, { active: event.target.checked })} />
                  Ativo
                </label>
              </div>

              <div className="food-master-plan-headline">
                <strong>{summary.title}</strong>
                <span>{isDemo ? 'A degustação usa a configuração acima para duração e alertas.' : `${currency.format(plan.monthlyPrice ?? 0)}/mês`}</span>
              </div>

              <div className="master-price-row">
                <label>
                  Mensalidade
                  <input
                    value={plan.monthlyPrice ?? 0}
                    onChange={(event) => updatePlan(plan.id, { monthlyPrice: Number(event.target.value) || 0 })}
                    type="number"
                    step="0.01"
                    min="0"
                  />
                  <small>{isDemo ? 'Pode permanecer zerado na degustação.' : 'Valor cobrado por renovação mensal.'}</small>
                </label>
                <label>
                  Implantação
                  <input
                    value={plan.setupPrice ?? 0}
                    onChange={(event) => updatePlan(plan.id, { setupPrice: Number(event.target.value) || 0 })}
                    type="number"
                    step="0.01"
                    min="0"
                  />
                  <small>Taxa opcional de ativação.</small>
                </label>
              </div>

              <div className="master-plan-limits">
                <label>
                  Produtos ativos
                  <input
                    value={plan.productLimit ?? ''}
                    onChange={(event) => updatePlan(plan.id, { productLimit: event.target.value === '' ? null : Number(event.target.value) })}
                    type="number"
                    min="0"
                  />
                </label>
                <label>
                  Fotos por produto
                  <input
                    value={plan.imageLimitPerProduct ?? ''}
                    onChange={(event) => updatePlan(plan.id, { imageLimitPerProduct: event.target.value === '' ? null : Number(event.target.value) })}
                    type="number"
                    min="0"
                  />
                </label>
                <label>
                  Categorias
                  <input
                    value={plan.categoryLimit ?? ''}
                    onChange={(event) => updatePlan(plan.id, { categoryLimit: event.target.value === '' ? null : Number(event.target.value) })}
                    type="number"
                    min="0"
                  />
                </label>
                <label>
                  Adicionais
                  <input
                    value={plan.addonLimit ?? ''}
                    onChange={(event) => updatePlan(plan.id, { addonLimit: event.target.value === '' ? null : Number(event.target.value) })}
                    type="number"
                    min="0"
                  />
                </label>
                <label>
                  Ordem de exibição
                  <input
                    value={plan.sortOrder ?? 0}
                    onChange={(event) => updatePlan(plan.id, { sortOrder: Number(event.target.value) || 0 })}
                    type="number"
                    min="0"
                  />
                </label>
                <label>
                  Código interno
                  <input value={plan.code} disabled />
                </label>
              </div>

              <div className="master-plan-features">
                <label>
                  <input type="checkbox" checked={planHasFeature(plan, 'analytics')} disabled />
                  Analytics
                </label>
                <label>
                  <input type="checkbox" checked={planHasFeature(plan, 'finance')} disabled />
                  Financeiro
                </label>
                <label>
                  <input type="checkbox" checked={plan.customDomain} onChange={(event) => updatePlan(plan.id, { customDomain: event.target.checked })} />
                  Domínio próprio
                </label>
                <label>
                  <input type="checkbox" checked={plan.reports} onChange={(event) => updatePlan(plan.id, { reports: event.target.checked })} />
                  Relatórios
                </label>
                <label>
                  <input type="checkbox" checked={plan.prioritySupport} onChange={(event) => updatePlan(plan.id, { prioritySupport: event.target.checked })} />
                  Suporte prioritário
                </label>
                <label>
                  <input type="checkbox" checked={planHasFeature(plan, 'custom_banner')} disabled />
                  Banner personalizado
                </label>
              </div>

              <div className="master-marketing-benefits-v062">
                <label>
                  Benefícios comerciais extras
                  <textarea
                    rows={5}
                    value={(plan.marketingBenefits ?? []).join('\n')}
                    onChange={(event) => updatePlan(plan.id, { marketingBenefits: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean).slice(0, 20) })}
                    placeholder={'Um benefício por linha\nEx.: Recuperação de vendas\nEx.: KDS com aviso ao cliente'}
                  />
                  <small>Itens adicionais exibidos na página comercial. Use para destacar novidades sem precisar alterar o código da landing.</small>
                </label>
              </div>

              <div className="food-master-chip-list">
                {chips.map((chip) => {
                  const Icon = chip.icon;
                  return (
                    <span key={chip.key}>
                      <Icon size={15} />
                      {chip.label}
                    </span>
                  );
                })}
              </div>

              <button className="primary-button full-button" type="button" onClick={() => void savePlanCard(plan)} disabled={savingKey === plan.id}>
                <Save size={16} />
                {savingKey === plan.id ? 'Salvando...' : `Salvar plano ${plan.name}`}
              </button>
            </article>
          );
        })}
      </div>

      <section className="admin-card food-business-plan-v051 master-business-v051 unified-business-card">
        <div className="food-business-plan-head-v051">
          <div>
            <span className="eyebrow">BUSINESS E SOB MEDIDA</span>
            <h2>Valor sob consulta</h2>
          </div>
          <span><BadgeDollarSign size={15} />Projeto personalizado</span>
        </div>
        <div className="food-business-price-v051">
          <strong>Sob consulta</strong>
          <small>Escopo, implantação e mensalidade definidos após levantamento da operação.</small>
        </div>
        <div className="food-business-features-v051">
          <span><Globe2 size={17} />Domínio próprio incluído</span>
          <span><BarChart3 size={17} />Relatórios e fluxos personalizados</span>
          <span><Puzzle size={17} />Integrações com ERP, PDV, financeiro e APIs</span>
          <span><Check size={17} />Módulos e automações sob medida</span>
          <span><ShieldCheck size={17} />Acompanhamento técnico dedicado</span>
        </div>
        <p>
          O plano Business continua preservando as regras comerciais do FoodWeb: a contratação ocorre sob análise do suporte e não entra na configuração padrão de cobrança automática.
        </p>
      </section>
    </>
  );
}
