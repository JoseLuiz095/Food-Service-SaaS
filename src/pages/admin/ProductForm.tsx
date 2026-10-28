import { ArrowLeft, ChevronDown, ImagePlus, Plus, Star, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { LoadingState } from '../../components/ui/AsyncState';
import { FloatingSaveBar } from '../../components/admin/FloatingSaveBar';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import type { OptionGroup, OptionGroupKind, OptionItem, PartyOrderConfig, Product, ProductImage } from '../../types';
import { currency, roundMoney, slugify } from '../../utils/format';
import { createId } from '../../utils/id';
import { createProductCopy } from '../../utils/productCopy';
import { getBusinessSegment, type BusinessSegment } from '../../segments/businessSegments';
import './product-form-simplified.css';

const emptyProduct = (storeId: string, segment: BusinessSegment = 'food'): Product => ({
  id: createId(), storeId, categoryId: '', name: '', slug: '', description: '', price: 0,
  imageUrl: '/assets/placeholder-food.svg', visualEmoji: segment === 'food' ? '🍔' : segment === 'confectionery' ? '🍰' : segment === 'printing3d' ? '🧩' : segment === 'rentals' ? '🎪' : '📦', gallery: [], images: [], featured: false, active: true,
  madeToOrder: false, productionDays: 0, stockStatus: 'available', availabilityStatus: 'available',
  trackStock: !['services', 'personal', 'nutrition', 'creator'].includes(segment), stockQuantity: 0, preparationTimeMinutes: 0, sortOrder: 0,
  optionGroups: [], variations: [], addons: [],
});

const kindLabel: Record<OptionGroupKind, string> = {
  variant: 'Variação / tamanho',
  choice: 'Escolha simples',
  addon: 'Adicional',
  removal: 'Remoção',
};

const productEmojiOptions = ['🍔','🍕','🍟','🌭','🥪','🌮','🍗','🥩','🍖','🥗','🍝','🍜','🍣','🍤','🍚','🥟','🍰','🍫','🍦','🍓','🍌','🥤','☕','🧃'];

type GroupPreset = {
  label: string;
  name: string;
  kind: OptionGroupKind;
  minChoices: number;
  maxChoices: number;
  description: string;
  items: Array<{ name: string; priceDelta: number }>;
};

const groupPresets: GroupPreset[] = [
  {label:'Adicionais',name:'Adicionais',kind:'addon',minChoices:0,maxChoices:4,description:'Escolha até 4 adicionais. Você pode repetir o mesmo adicional.',items:[{name:'Bacon extra',priceDelta:5},{name:'Queijo extra',priceDelta:4},{name:'Ovo',priceDelta:3},{name:'Banana',priceDelta:4}]},
  {label:'Remover ingredientes',name:'Remover ingredientes',kind:'removal',minChoices:0,maxChoices:4,description:'Retire ingredientes sem custo.',items:[{name:'Cebola',priceDelta:0},{name:'Tomate',priceDelta:0},{name:'Alface',priceDelta:0},{name:'Molho',priceDelta:0}]},
  {label:'Tamanho',name:'Tamanho',kind:'variant',minChoices:1,maxChoices:1,description:'Escolha o tamanho.',items:[{name:'Padrão',priceDelta:0},{name:'Grande',priceDelta:8}]},
  {label:'Ponto da carne',name:'Ponto da carne',kind:'choice',minChoices:1,maxChoices:1,description:'Escolha o ponto de preparo.',items:[{name:'Ao ponto',priceDelta:0},{name:'Bem passado',priceDelta:0}]},
];

const newGroup = (storeId: string, index: number): OptionGroup => ({
  id: createId(), storeId, name: '', kind: 'addon', minChoices: 0, maxChoices: 3, active: true,
  sortOrder: (index + 1) * 10, items: [],
});

const newOption = (storeId: string, groupId: string, index: number): OptionItem => ({
  id: createId(), groupId, storeId, name: '', priceDelta: 0, active: true, sortOrder: (index + 1) * 10,
});

// Compatibilidade para produtos que tenham sido salvos durante o rollout
// inicial. Produtos novos usam os campos dedicados da migration de festa;
// grupos técnicos antigos continuam sendo lidos e não aparecem na tela.
const PARTY_CONFIG_GROUP = '__foodweb_party_order_config__';
const defaultPartyConfig = (): PartyOrderConfig => ({
  enabled: false,
  pricePerGram: 0,
  packageWeightGrams: 100,
  minimumPackages: 1,
  leadTimeDays: 2,
  artworkInstructions: '',
});
const isPartyConfigGroup = (group: OptionGroup) => group.name === PARTY_CONFIG_GROUP;
const readPartyConfig = (groups: OptionGroup[]): PartyOrderConfig => {
  const raw = groups.find(isPartyConfigGroup)?.description;
  if (!raw) return defaultPartyConfig();
  try {
    const parsed = JSON.parse(raw) as Partial<PartyOrderConfig>;
    return {
      ...defaultPartyConfig(),
      ...parsed,
      enabled: Boolean(parsed.enabled),
      pricePerGram: Math.max(0, Number(parsed.pricePerGram) || 0),
      packageWeightGrams: Math.max(1, Math.trunc(Number(parsed.packageWeightGrams) || 100)),
      minimumPackages: Math.max(1, Math.trunc(Number(parsed.minimumPackages) || 1)),
      leadTimeDays: Math.max(0, Math.trunc(Number(parsed.leadTimeDays) || 0)),
      artworkInstructions: String(parsed.artworkInstructions || ''),
    };
  } catch {
    return defaultPartyConfig();
  }
};
const productForEditor = (product: Product): Product => ({
  ...structuredClone(product),
  optionGroups: product.optionGroups.filter((group) => !isPartyConfigGroup(group)),
});

const mediaFields = (images: ProductImage[]): Pick<Product, 'images' | 'gallery' | 'imageUrl'> => {
  const primary = images.find((image) => image.isPrimary) || images[0];
  const ordered = primary ? [primary, ...images.filter((image) => image.id !== primary.id)] : [];
  return { images: ordered, gallery: ordered.map((image) => image.url), imageUrl: primary?.url || '/assets/placeholder-food.svg' };
};

export default function ProductForm() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const duplicateId = id ? null : searchParams.get('duplicar');
  const { products, categories, settings, saveProduct, uploadProductImages, deleteProductImage, setPrimaryImage, planUsage, loading } = useStore();
  const businessProfile = getBusinessSegment(settings.visualTheme);
  const foodPresentation = businessProfile.id === 'food' || businessProfile.id === 'confectionery';
  const emojiChoices = foodPresentation ? productEmojiOptions : ['📦','🎁','🧩','🔧','🎨','🏷️','🛍️','🎪','🎈','🪑','💡','⭐'];
  const optionPresets: GroupPreset[] = foodPresentation ? groupPresets : [
    {label:'Tamanho',name:'Tamanho',kind:'variant',minChoices:1,maxChoices:1,description:'Escolha o tamanho.',items:[{name:'Pequeno',priceDelta:0},{name:'Médio',priceDelta:0},{name:'Grande',priceDelta:0}]},
    {label:'Cor',name:'Cor',kind:'choice',minChoices:1,maxChoices:1,description:'Escolha a cor disponível.',items:[{name:'Branco',priceDelta:0},{name:'Preto',priceDelta:0}]},
  ];
  const { showToast } = useToast();
  const navigate = useNavigate();
  const existing = products.find((product) => product.id === id && product.storeId === settings.id);
  const duplicateSource = products.find((product) => product.id === duplicateId && product.storeId === settings.id);
  const editorKey = `${settings.id}:${id || 'novo'}:${duplicateId || ''}`;
  const initializedEditorKey = useRef('');
  const moreDetailsRef = useRef<HTMLDetailsElement>(null);
  const optionsDetailsRef = useRef<HTMLDetailsElement>(null);
  const [product, setProduct] = useState<Product>(() => existing ? productForEditor(existing) : duplicateSource ? productForEditor(createProductCopy(duplicateSource, products)) : emptyProduct(settings.id,businessProfile.id));
  const [partyConfig, setPartyConfig] = useState<PartyOrderConfig>(() => {
    const source = existing || duplicateSource;
    return source?.partyOrderConfig || (source ? readPartyConfig(source.optionGroups) : defaultPartyConfig());
  });
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Background catalog refreshes (including image mutations) must not erase
    // fields that the merchant is editing. Hydrate once per route/store only.
    if (initializedEditorKey.current === editorKey || (id && !existing) || (duplicateId && !duplicateSource)) return;
    initializedEditorKey.current = editorKey;
    const source = existing || duplicateSource;
    setFiles([]);
    if (source) {
      setProduct(productForEditor(existing || createProductCopy(source, products)));
      setPartyConfig(source.partyOrderConfig || readPartyConfig(source.optionGroups));
      // Comece recolhido para que o cadastro seja escaneável no celular;
      // o lojista abre apenas o grupo que deseja editar.
      setOpenGroups({});
    } else {
      setProduct(emptyProduct(settings.id,businessProfile.id));
      setPartyConfig(defaultPartyConfig());
    }
  }, [editorKey, id, existing, duplicateId, duplicateSource, products, settings.id, businessProfile.id]);

  useEffect(() => {
    if (!existing || initializedEditorKey.current !== editorKey) return;
    // Images are persisted immediately, unlike the other fields in this form.
    // Merge their server state without replacing the merchant's unsaved draft.
    setProduct((current) => current.id === existing.id ? { ...current, ...mediaFields(structuredClone(existing.images)) } : current);
  }, [existing, editorKey]);

  const imageLimit = planUsage.plan.imageLimitPerProduct;
  const totalImages = product.images.length + files.length;
  const activeCategories = useMemo(() => categories.filter((category) => category.active || category.id === product.categoryId), [categories, product.categoryId]);
  const pristineProduct = useMemo(() => existing ? productForEditor(existing) : null, [existing]);
  const hasProductChanges = existing ? JSON.stringify(product) !== JSON.stringify(pristineProduct) : Boolean(product.name.trim() || product.description.trim() || product.categoryId || product.price || product.optionGroups.length || product.images.length || partyConfig.enabled);
  const hasUnsavedChanges = files.length > 0 || hasProductChanges || JSON.stringify(partyConfig) !== JSON.stringify(existing?.partyOrderConfig || (existing ? readPartyConfig(existing.optionGroups) : defaultPartyConfig()));
  const update = <K extends keyof Product>(key: K, value: Product[K]) => setProduct((current) => ({ ...current, [key]: value }));

  const updateGroup = (groupId: string, patch: Partial<OptionGroup>) => update('optionGroups', product.optionGroups.map((group) => group.id === groupId ? { ...group, ...patch } : group));
  const updateOption = (groupId: string, optionId: string, patch: Partial<OptionItem>) => update('optionGroups', product.optionGroups.map((group) => group.id === groupId ? { ...group, items: group.items.map((item) => item.id === optionId ? { ...item, ...patch } : item) } : group));

  const addGroup = () => {
    const group = newGroup(settings.id, product.optionGroups.length);
    update('optionGroups', [...product.optionGroups, group]);
    setOpenGroups((current) => ({ ...current, [group.id]: true }));
  };

  const addPresetGroup = (preset: GroupPreset) => {
    const groupId = createId();
    const group: OptionGroup = {
      id: groupId,
      storeId: settings.id,
      name: preset.name,
      kind: preset.kind,
      minChoices: preset.minChoices,
      maxChoices: preset.maxChoices,
      description: preset.description,
      active: true,
      sortOrder: (product.optionGroups.length + 1) * 10,
      items: preset.items.map((item, index) => ({
        id: createId(),
        groupId,
        storeId: settings.id,
        name: item.name,
        priceDelta: item.priceDelta,
        active: true,
        sortOrder: (index + 1) * 10,
      })),
    };
    update('optionGroups', [...product.optionGroups, group]);
    setOpenGroups((current) => ({ ...current, [group.id]: true }));
  };

  const removeGroup = (groupId: string) => update('optionGroups', product.optionGroups.filter((group) => group.id !== groupId));
  const addOption = (group: OptionGroup) => updateGroup(group.id, { items: [...group.items, newOption(settings.id, group.id, group.items.length)] });
  const removeOption = (groupId: string, optionId: string) => updateGroup(groupId, { items: product.optionGroups.find((group) => group.id === groupId)?.items.filter((item) => item.id !== optionId) || [] });

  const selectFiles = (list: FileList | null) => {
    if (!list) return;
    const next = Array.from(list);
    if (imageLimit != null && totalImages + next.length > imageLimit) {
      showToast(`Seu plano permite até ${imageLimit} imagens por produto.`, 'error');
      return;
    }
    setFiles((current) => [...current, ...next]);
  };

  const validateGroups = () => {
    for (const group of product.optionGroups) {
      if (!group.name.trim()) return 'Informe o nome de todos os grupos de opções.';
      if (group.minChoices < 0 || group.maxChoices < 1 || group.minChoices > group.maxChoices) return `Revise os limites do grupo “${group.name}”.`;
      if (group.maxChoices === 1 && group.minChoices > 1) return `O grupo “${group.name}” aceita apenas uma escolha.`;
      const names = group.items.filter((item) => item.name.trim());
      if (!names.length) return `Adicione pelo menos uma opção ao grupo “${group.name}”.`;
      if (group.minChoices > names.length) return `O grupo “${group.name}” exige mais escolhas do que possui opções.`;
      if (group.kind === 'removal' && group.items.some((item) => item.priceDelta !== 0)) return `Remoções do grupo “${group.name}” devem ter preço R$ 0,00.`;
    }
    return '';
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const activationConsumesSlot = product.active && (!existing || !existing.active);
    if (activationConsumesSlot && !planUsage.canActivateProduct) {
      showToast(`Seu plano permite até ${planUsage.plan.productLimit} produtos ativos.`, 'error');
      return;
    }
    if (product.promotionalPrice != null && product.promotionalPrice > product.price) {
      if (moreDetailsRef.current) moreDetailsRef.current.open = true;
      showToast('O preço promocional não pode ser maior que o preço normal.', 'error');
      return;
    }
    const groupError = validateGroups();
    if (groupError) { if (optionsDetailsRef.current) optionsDetailsRef.current.open = true; setOpenGroups(Object.fromEntries(product.optionGroups.map((group) => [group.id, true]))); showToast(groupError, 'error'); return; }

    setSaving(true);
    try {
      const partyPackagePrice = partyConfig.enabled && partyConfig.pricePerGram > 0
        ? roundMoney(partyConfig.pricePerGram * partyConfig.packageWeightGrams)
        : undefined;
      const normalized: Product = {
        ...product,
        storeId: settings.id,
        slug: product.slug || slugify(product.name),
        // Mantém o preço-base do catálogo alinhado ao valor por pacote. A
        // vitrine exibe o preço por grama, mas o servidor também recalcula o
        // item usando este preço seguro caso o cliente altere o carrinho.
        price: partyPackagePrice ?? product.price,
        preparationTimeMinutes: Math.max(0, Math.trunc(product.preparationTimeMinutes || 0)),
        trackStock: product.trackStock,
        stockQuantity: product.trackStock ? Math.max(0, Math.trunc(product.stockQuantity ?? 0)) : undefined,
        optionGroups: product.optionGroups.map((group, groupIndex) => ({
          ...group,
          storeId: settings.id,
          name: group.name.trim(),
          sortOrder: (groupIndex + 1) * 10,
          items: group.items.filter((item) => item.name.trim()).map((item, itemIndex) => ({ ...item, storeId: settings.id, groupId: group.id, name: item.name.trim(), priceDelta: group.kind === 'removal' ? 0 : item.priceDelta, sortOrder: (itemIndex + 1) * 10 })),
        })),
        partyOrderConfig: partyConfig.enabled ? partyConfig : undefined,
      };
      await saveProduct(normalized, { isNew: !existing });
      if (files.length) { const images = await uploadProductImages(normalized.id, files, normalized.images); setProduct((current) => ({ ...current, ...mediaFields(images) })); setFiles([]); }
      showToast(existing ? 'Produto atualizado.' : 'Produto cadastrado.', 'success');
      navigate('/admin/produtos');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao salvar produto.', 'error');
    } finally { setSaving(false); }
  };

  const removeImage = async (image: ProductImage) => {
    if (!confirm('Excluir esta imagem?')) return;
    try {
      await deleteProductImage(image);
      setProduct((current) => {
        let images = current.images.filter((item) => item.id !== image.id);
        if (image.isPrimary && images.length && !images.some((item) => item.isPrimary)) images = images.map((item, index) => ({ ...item, isPrimary: index === 0 }));
        return { ...current, ...mediaFields(images) };
      });
      showToast('Imagem removida.', 'success');
    }
    catch (error) { showToast(error instanceof Error ? error.message : 'Erro ao remover imagem.', 'error'); }
  };

  const primary = async (image: ProductImage) => {
    try { await setPrimaryImage(product.id, image.id); setProduct((current) => ({ ...current, ...mediaFields(current.images.map((item) => ({ ...item, isPrimary: item.id === image.id }))) })); showToast('Imagem principal atualizada.', 'success'); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Erro ao definir imagem.', 'error'); }
  };

  if (loading) return <LoadingState label="Carregando produto..."/>;
  if (id && !existing) return <div className="admin-card"><h2>Produto não encontrado</h2><Link to="/admin/produtos">Voltar</Link></div>;
  if (duplicateId && !duplicateSource) return <div className="admin-card"><h2>Produto para duplicar não encontrado</h2><p>Abra a cópia a partir do catálogo da loja selecionada.</p><Link to="/admin/produtos">Voltar ao catálogo</Link></div>;

  return <>
    <div className="admin-page-title"><div><Link to="/admin/produtos" className="back-link"><ArrowLeft size={16}/>Produtos</Link><h1>{existing ? 'Editar produto' : duplicateSource ? 'Duplicar produto' : 'Novo produto'}</h1><p>{duplicateSource ? 'Revise a cópia antes de salvar. Ela começa oculta, sem estoque, reservas, imagens ou código interno. As opções são independentes do produto original.' : 'Cadastre o item e monte as regras de tamanho, escolhas, adicionais e remoções.'}</p></div></div>
    <form id="product-form" className="admin-form-layout" onSubmit={submit}>
      <section className="admin-card form-section product-form-main">
        <div className="admin-card__header"><div><span className="eyebrow">INFORMAÇÕES</span><h2>Dados principais</h2></div></div>
        <div className="form-grid">
          <label className="full">Nome do produto<input required value={product.name} onChange={(event) => update('name', event.target.value)} placeholder="Ex.: X-Bacon Artesanal"/></label>
          <label>Categoria<select required value={product.categoryId} onChange={(event) => update('categoryId', event.target.value)}><option value="">Selecione</option>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label>Preço<input required type="number" min="0" step="0.01" value={product.price} onChange={(event) => update('price', Number(event.target.value))}/></label>
          <label className="switch-row full"><span><strong>Controlar estoque deste produto</strong><small>Pedidos ficam pré-vendidos e só baixam do estoque quando o recebimento for confirmado.</small></span><input type="checkbox" checked={product.trackStock} onChange={(event) => update('trackStock', event.target.checked)} /></label>
          {product.trackStock && <div className="stock-physical-summary"><label>{existing ? 'Estoque físico atual' : 'Estoque físico inicial'}<input type="number" min="0" step="1" value={product.stockQuantity ?? 0} onChange={(event) => update('stockQuantity', Math.max(0, Math.trunc(Number(event.target.value) || 0)))} readOnly={Boolean(existing)}/></label>{existing ? <small className="muted">{Number(existing.stockReservedQuantity || 0)} reservado(s) · {Math.max(0, Number(existing.stockQuantity || 0) - Number(existing.stockReservedQuantity || 0))} disponível(is). Para ajustar o saldo físico e registrar o motivo, use <Link to="/admin/estoque">Estoque e insumos</Link>.</small> : <small className="muted">O disponível começa igual ao físico. Pedidos pendentes são descontados automaticamente; produtos sem saldo poderão ser agendados conforme as regras da loja.</small>}</div>}
          <details ref={moreDetailsRef} className="product-form-more full"><summary><strong>Mais detalhes</strong><small>Código, promoção, preparo, disponibilidade e personalizações especiais</small></summary><div className="form-grid">
          <label>Código interno<input value={product.internalCode || ''} onChange={(event) => update('internalCode', event.target.value)} placeholder="Ex.: XB001"/></label>
          <label className="full product-emoji-field-v060"><span>Visual sem foto</span><div className="product-emoji-input-v060"><input value={product.visualEmoji || ''} onChange={(event) => update('visualEmoji', event.target.value.slice(0, 16))} placeholder={foodPresentation ? 'Ex.: 🍔' : 'Ex.: 📦'}/><div className="product-emoji-picker-v060" aria-label="Sugestões de emoji">{emojiChoices.map((emoji) => <button type="button" key={emoji} className={product.visualEmoji === emoji ? 'selected' : ''} onClick={() => update('visualEmoji', emoji)}>{emoji}</button>)}</div></div><small>Se o produto não tiver imagem, a VendeWeb usa este emoji no {businessProfile.catalogLabel.toLowerCase()}.</small></label>
          <label>Preço promocional<input type="number" min="0" step="0.01" value={product.promotionalPrice ?? ''} onChange={(event) => update('promotionalPrice', event.target.value ? Number(event.target.value) : undefined)}/></label>
          <label>Tempo adicional de preparo (min)<input type="number" min="0" step="1" value={product.preparationTimeMinutes} onChange={(event) => update('preparationTimeMinutes', Number(event.target.value))}/></label>
          <label>Status<select value={product.availabilityStatus} onChange={(event) => update('availabilityStatus', event.target.value as Product['availabilityStatus'])}><option value="available">Disponível</option><option value="unavailable">Indisponível temporariamente</option><option value="sold_out">Esgotado</option></select></label>
          <label>Status inicial do pedido<select value={product.defaultOrderStatus || 'received'} onChange={(event) => update('defaultOrderStatus', event.target.value as Product['defaultOrderStatus'])}><option value="received">Recebido</option><option value="confirmed">Confirmado</option><option value="preparing">Em preparo</option><option value="ready">Pronto</option><option value="out_for_delivery">Saiu para entrega</option></select><small>Usado como sugestão em lançamentos deste produto. Pedidos existentes não são alterados.</small></label>
          <div className="party-order-editor full">
            <label className="switch-row"><span><strong>Encomenda para festas</strong><small>Use este produto para pedidos programados de eventos, com cálculo por gramatura e referência de arte.</small></span><input type="checkbox" checked={partyConfig.enabled} onChange={(event) => setPartyConfig((current) => ({ ...current, enabled: event.target.checked }))} /></label>
            {partyConfig.enabled && <div className="form-grid party-order-editor__fields">
              <label>Preço por grama (R$)<input type="number" min="0" step="0.001" value={partyConfig.pricePerGram || ''} onChange={(event) => setPartyConfig((current) => ({ ...current, pricePerGram: Math.max(0, Number(event.target.value) || 0) }))}/><small>Ex.: 0,08 para R$ 8,00 a cada 100 g.</small></label>
              <label>Peso de cada pacote (g)<input type="number" min="1" step="1" value={partyConfig.packageWeightGrams} onChange={(event) => setPartyConfig((current) => ({ ...current, packageWeightGrams: Math.max(1, Math.trunc(Number(event.target.value) || 1)) }))}/></label>
              <label>Mínimo de pacotes<input type="number" min="1" step="1" value={partyConfig.minimumPackages} onChange={(event) => setPartyConfig((current) => ({ ...current, minimumPackages: Math.max(1, Math.trunc(Number(event.target.value) || 1)) }))}/></label>
              <label>Antecedência mínima (dias)<input type="number" min="0" step="1" value={partyConfig.leadTimeDays} onChange={(event) => setPartyConfig((current) => ({ ...current, leadTimeDays: Math.max(0, Math.trunc(Number(event.target.value) || 0)) }))}/></label>
              <label className="full">Arte ou referência da festa<textarea rows={3} value={partyConfig.artworkInstructions} onChange={(event) => setPartyConfig((current) => ({ ...current, artworkInstructions: event.target.value }))} placeholder="Ex.: informe tema, cores e data. Para detalhes, fale com a loja pelo Instagram."/><small>O cliente verá essa orientação no produto e poderá enviar os detalhes pelo Instagram.</small></label>
            </div>}
          </div>
          <label className="full">Descrição<textarea rows={5} value={product.description} onChange={(event) => update('description', event.target.value)} placeholder="Descreva ingredientes e características principais."/></label>
        </div></details>

        </div>

        <details ref={optionsDetailsRef} className="product-form-options"><summary><strong>Personalizações</strong><small>{product.optionGroups.length} grupo(s) de opções</small></summary><div className="subform-section">
          <div className="subform-title"><div><span className="eyebrow">PERSONALIZAÇÃO</span><h3>Grupos de opções</h3><p className="muted">Um único modelo atende tamanho, ponto da carne, adicionais e remoções.</p></div><button type="button" className="secondary-button" onClick={addGroup}><Plus size={16}/>Adicionar grupo</button></div>
          <div className="option-preset-bar-v060"><span>Adicionar rapidamente:</span><div>{optionPresets.map((preset) => <button type="button" key={preset.label} onClick={() => addPresetGroup(preset)}><Plus size={14}/>{preset.label}</button>)}</div></div>
                    {product.optionGroups.length === 0 ? <div className="option-builder-empty"><p>Este produto não possui personalizações.</p><button type="button" className="secondary-button" onClick={addGroup}><Plus size={16}/>Criar primeiro grupo</button></div> : <div className="option-builder-list">
            {product.optionGroups.map((group) => <section className="option-builder-group" key={group.id}>
              <header><button type="button" className="option-builder-toggle" onClick={() => setOpenGroups((current) => ({ ...current, [group.id]: !current[group.id] }))}><ChevronDown size={17} className={openGroups[group.id] ? 'is-open' : ''}/><strong>{group.name || 'Novo grupo'}</strong><span>{kindLabel[group.kind]} · {group.minChoices}-{group.maxChoices} escolha(s)</span></button><button type="button" className="row-delete" onClick={() => removeGroup(group.id)} aria-label="Excluir grupo"><Trash2 size={16}/></button></header>
              {openGroups[group.id] && <div className="option-builder-body">
                <div className="form-grid option-group-config">
                  <label>Nome do grupo<input value={group.name} onChange={(event) => updateGroup(group.id, { name: event.target.value })} placeholder="Ex.: Adicionais"/></label>
                  <label>Tipo<select value={group.kind} onChange={(event) => { const kind = event.target.value as OptionGroupKind; updateGroup(group.id, { kind, ...(kind === 'variant' || kind === 'choice' ? { maxChoices: 1, minChoices: 1 } : kind === 'removal' ? { minChoices: 0, maxChoices: Math.max(1, group.items.length || 4) } : {}) }); }}><option value="variant">Variação / tamanho</option><option value="choice">Escolha simples</option><option value="addon">Adicional</option><option value="removal">Remoção</option></select></label>
                  <label>Mínimo<input type="number" min="0" value={group.minChoices} onChange={(event) => updateGroup(group.id, { minChoices: Math.max(0, Number(event.target.value)) })}/></label>
                  <label>Máximo<input type="number" min="1" value={group.maxChoices} onChange={(event) => updateGroup(group.id, { maxChoices: Math.max(1, Number(event.target.value)) })}/></label>
                  <label className="full">Orientação ao cliente<input value={group.description || ''} onChange={(event) => updateGroup(group.id, { description: event.target.value })} placeholder="Ex.: Escolha até 3 adicionais"/></label>
                </div>
                <div className="option-builder-items">
                  <div className="option-builder-items__head"><strong>Opções</strong><button type="button" className="secondary-button" onClick={() => addOption(group)}><Plus size={15}/>Adicionar opção</button></div>
                  {group.items.length === 0 && <p className="muted">Adicione pelo menos uma opção.</p>}
                  {group.items.map((item, index) => <div className="variation-row option-item-row option-item-row-v060" key={item.id}>
                    <input aria-label={`Opção ${index + 1}`} value={item.name} onChange={(event) => updateOption(group.id, item.id, { name: event.target.value })} placeholder={group.kind === 'removal' ? 'Ex.: Cebola' : 'Ex.: Bacon'}/>
                    <input className="option-item-description-v060" aria-label={`Descrição da opção ${index + 1}`} value={item.description || ''} onChange={(event) => updateOption(group.id, item.id, { description: event.target.value })} placeholder="Descrição opcional"/>
                    <div className="money-input"><span>R$</span><input aria-label={`Preço da opção ${index + 1}`} type="number" step="0.01" disabled={group.kind === 'removal'} value={group.kind === 'removal' ? 0 : item.priceDelta} onChange={(event) => updateOption(group.id, item.id, { priceDelta: Number(event.target.value) })}/></div>
                    <label className="mini-check"><input type="checkbox" checked={item.active} onChange={(event) => updateOption(group.id, item.id, { active: event.target.checked })}/>Ativa</label>
                    <button type="button" className="row-delete" onClick={() => removeOption(group.id, item.id)}><Trash2 size={16}/></button>
                  </div>)}
                </div>
              </div>}
            </section>)}
          </div>}
        </div></details>

        <div className="subform-section product-form-images"><div className="subform-title"><div><span className="eyebrow">IMAGENS</span><h3>Galeria do produto</h3></div><span className="muted">{totalImages}/{imageLimit ?? '∞'} imagens</span></div><p className="product-media-note-v060">Imagem tem prioridade. Sem imagem cadastrada, o emoji escolhido acima aparece automaticamente para o cliente.</p><label className="upload-drop"><ImagePlus size={24}/><strong>Selecionar imagens</strong><span>JPG, PNG ou WEBP · até 5 MB cada</span><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => selectFiles(event.target.files)}/></label>{files.length > 0 && <div className="pending-files">{files.map((file, index) => <span key={`${file.name}-${index}`}>{file.name}<button type="button" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={14}/></button></span>)}</div>}{product.images.length > 0 && <div className="image-admin-grid">{product.images.map((image) => <article key={image.id} className={image.isPrimary ? 'is-primary' : ''}><ImageWithFallback src={image.url} alt={image.altText || product.name}/><div><button type="button" onClick={() => void primary(image)} title="Definir como principal"><Star size={16}/>{image.isPrimary ? 'Principal' : 'Tornar principal'}</button><button type="button" onClick={() => void removeImage(image)} title="Excluir imagem"><Trash2 size={16}/></button></div></article>)}</div>}</div>
      </section>

      <aside>
        <section className="admin-card form-section"><span className="eyebrow">PUBLICAÇÃO</span><h2>Disponibilidade</h2><label className="switch-row"><span><strong>Produto ativo</strong><small>Aparece no {businessProfile.catalogLabel.toLowerCase()} público</small></span><input type="checkbox" checked={product.active} onChange={(event) => update('active', event.target.checked)}/></label><label className="switch-row"><span><strong>Destaque</strong><small>Produto em evidência</small></span><input type="checkbox" checked={product.featured} onChange={(event) => update('featured', event.target.checked)}/></label><div className="product-form-preview"><span>Preço atual</span><strong>{partyConfig.enabled && partyConfig.pricePerGram > 0 ? `${currency.format(partyConfig.pricePerGram)}/g` : currency.format(product.promotionalPrice ?? product.price)}</strong>{product.visualEmoji && <span className="product-form-emoji-preview-v060" aria-label="Emoji do produto">{product.visualEmoji}</span>}{partyConfig.enabled && <small>Encomenda para festas · mínimo de {partyConfig.minimumPackages} pacote(s)</small>}<small>{product.optionGroups.length} grupo(s) de personalização</small></div></section>
        <div className="product-form-save-hint">{hasUnsavedChanges ? 'Alterações pendentes. Use o botão flutuante para salvar.' : 'Tudo salvo.'}</div>
      </aside>
    </form>
    {hasUnsavedChanges && <FloatingSaveBar label="Salvar produto" description="O produto tem alterações pendentes." saving={saving} onSave={() => { const form = document.getElementById('product-form'); if (form instanceof HTMLFormElement) form.requestSubmit(); }} onCancel={() => { setFiles([]); setProduct(existing ? productForEditor(existing) : duplicateSource ? productForEditor(createProductCopy(duplicateSource, products)) : emptyProduct(settings.id,businessProfile.id)); const source = existing || duplicateSource; setPartyConfig(source?.partyOrderConfig || (source ? readPartyConfig(source.optionGroups) : defaultPartyConfig())); }} />}
  </>;
}
