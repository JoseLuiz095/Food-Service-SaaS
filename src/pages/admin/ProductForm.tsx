import { ArrowLeft, ChevronDown, ImagePlus, Plus, Save, Star, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { LoadingState } from '../../components/ui/AsyncState';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import type { OptionGroup, OptionGroupKind, OptionItem, Product, ProductImage } from '../../types';
import { currency, slugify } from '../../utils/format';
import { createId } from '../../utils/id';

const emptyProduct = (storeId: string): Product => ({
  id: createId(), storeId, categoryId: '', name: '', slug: '', description: '', price: 0,
  imageUrl: '/assets/placeholder-food.svg', gallery: [], images: [], featured: false, active: true,
  madeToOrder: false, productionDays: 0, stockStatus: 'available', availabilityStatus: 'available',
  trackStock: false, stockQuantity: undefined, preparationTimeMinutes: 0, sortOrder: 0,
  optionGroups: [], variations: [], addons: [],
});

const kindLabel: Record<OptionGroupKind, string> = {
  variant: 'Variação / tamanho',
  choice: 'Escolha simples',
  addon: 'Adicional',
  removal: 'Remoção',
};

const newGroup = (storeId: string, index: number): OptionGroup => ({
  id: createId(), storeId, name: '', kind: 'addon', minChoices: 0, maxChoices: 3, active: true,
  sortOrder: (index + 1) * 10, items: [],
});

const newOption = (storeId: string, groupId: string, index: number): OptionItem => ({
  id: createId(), groupId, storeId, name: '', priceDelta: 0, active: true, sortOrder: (index + 1) * 10,
});

export default function ProductForm() {
  const { id } = useParams();
  const { products, categories, settings, saveProduct, uploadProductImages, deleteProductImage, setPrimaryImage, planUsage, loading } = useStore();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const existing = products.find((product) => product.id === id);
  const [product, setProduct] = useState<Product>(() => existing ? structuredClone(existing) : emptyProduct(settings.id));
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (id && existing) {
      setProduct(structuredClone(existing));
      setOpenGroups(Object.fromEntries(existing.optionGroups.map((group) => [group.id, true])));
    } else if (!id) setProduct((current) => current.storeId === settings.id ? current : emptyProduct(settings.id));
  }, [id, existing, settings.id]);

  const imageLimit = planUsage.plan.imageLimitPerProduct;
  const totalImages = product.images.length + files.length;
  const activeCategories = useMemo(() => categories.filter((category) => category.active || category.id === product.categoryId), [categories, product.categoryId]);
  const update = <K extends keyof Product>(key: K, value: Product[K]) => setProduct((current) => ({ ...current, [key]: value }));

  const updateGroup = (groupId: string, patch: Partial<OptionGroup>) => update('optionGroups', product.optionGroups.map((group) => group.id === groupId ? { ...group, ...patch } : group));
  const updateOption = (groupId: string, optionId: string, patch: Partial<OptionItem>) => update('optionGroups', product.optionGroups.map((group) => group.id === groupId ? { ...group, items: group.items.map((item) => item.id === optionId ? { ...item, ...patch } : item) } : group));

  const addGroup = () => {
    const group = newGroup(settings.id, product.optionGroups.length);
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
      showToast('O preço promocional não pode ser maior que o preço normal.', 'error');
      return;
    }
    const groupError = validateGroups();
    if (groupError) { showToast(groupError, 'error'); return; }

    setSaving(true);
    try {
      const normalized: Product = {
        ...product,
        storeId: settings.id,
        slug: product.slug || slugify(product.name),
        preparationTimeMinutes: Math.max(0, Math.trunc(product.preparationTimeMinutes || 0)),
        trackStock: false,
        stockQuantity: undefined,
        optionGroups: product.optionGroups.map((group, groupIndex) => ({
          ...group,
          storeId: settings.id,
          name: group.name.trim(),
          sortOrder: (groupIndex + 1) * 10,
          items: group.items.filter((item) => item.name.trim()).map((item, itemIndex) => ({ ...item, storeId: settings.id, groupId: group.id, name: item.name.trim(), priceDelta: group.kind === 'removal' ? 0 : item.priceDelta, sortOrder: (itemIndex + 1) * 10 })),
        })),
      };
      await saveProduct(normalized);
      if (files.length) { await uploadProductImages(normalized.id, files, normalized.images); setFiles([]); }
      showToast(existing ? 'Produto atualizado.' : 'Produto cadastrado.', 'success');
      navigate('/admin/produtos');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao salvar produto.', 'error');
    } finally { setSaving(false); }
  };

  const removeImage = async (image: ProductImage) => {
    if (!confirm('Excluir esta imagem?')) return;
    try { await deleteProductImage(image); setProduct((current) => ({ ...current, images: current.images.filter((item) => item.id !== image.id) })); showToast('Imagem removida.', 'success'); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Erro ao remover imagem.', 'error'); }
  };

  const primary = async (image: ProductImage) => {
    try { await setPrimaryImage(product.id, image.id); setProduct((current) => ({ ...current, images: current.images.map((item) => ({ ...item, isPrimary: item.id === image.id })), imageUrl: image.url })); showToast('Imagem principal atualizada.', 'success'); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Erro ao definir imagem.', 'error'); }
  };

  if (loading) return <LoadingState label="Carregando produto..."/>;
  if (id && !existing) return <div className="admin-card"><h2>Produto não encontrado</h2><Link to="/admin/produtos">Voltar</Link></div>;

  return <>
    <div className="admin-page-title"><div><Link to="/admin/produtos" className="back-link"><ArrowLeft size={16}/>Produtos</Link><h1>{existing ? 'Editar produto' : 'Novo produto'}</h1><p>Cadastre o item e monte as regras de tamanho, escolhas, adicionais e remoções.</p></div></div>
    <form className="admin-form-layout" onSubmit={submit}>
      <section className="admin-card form-section">
        <div className="admin-card__header"><div><span className="eyebrow">INFORMAÇÕES</span><h2>Dados principais</h2></div></div>
        <div className="form-grid">
          <label className="full">Nome do produto<input required value={product.name} onChange={(event) => update('name', event.target.value)} placeholder="Ex.: X-Bacon Artesanal"/></label>
          <label>Categoria<select required value={product.categoryId} onChange={(event) => update('categoryId', event.target.value)}><option value="">Selecione</option>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label>Código interno<input value={product.internalCode || ''} onChange={(event) => update('internalCode', event.target.value)} placeholder="Ex.: XB001"/></label>
          <label>Preço<input required type="number" min="0" step="0.01" value={product.price} onChange={(event) => update('price', Number(event.target.value))}/></label>
          <label>Preço promocional<input type="number" min="0" step="0.01" value={product.promotionalPrice ?? ''} onChange={(event) => update('promotionalPrice', event.target.value ? Number(event.target.value) : undefined)}/></label>
          <label>Tempo adicional de preparo (min)<input type="number" min="0" step="1" value={product.preparationTimeMinutes} onChange={(event) => update('preparationTimeMinutes', Number(event.target.value))}/></label>
          <label>Status<select value={product.availabilityStatus} onChange={(event) => update('availabilityStatus', event.target.value as Product['availabilityStatus'])}><option value="available">Disponível</option><option value="unavailable">Indisponível temporariamente</option><option value="sold_out">Esgotado</option></select></label>
          <label className="full">Descrição<textarea required rows={5} value={product.description} onChange={(event) => update('description', event.target.value)} placeholder="Descreva ingredientes e características principais."/></label>
        </div>

        <div className="subform-section">
          <div className="subform-title"><div><span className="eyebrow">PERSONALIZAÇÃO</span><h3>Grupos de opções</h3><p className="muted">Um único modelo atende tamanho, ponto da carne, adicionais e remoções.</p></div><button type="button" className="secondary-button" onClick={addGroup}><Plus size={16}/>Adicionar grupo</button></div>
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
                  {group.items.map((item, index) => <div className="variation-row option-item-row" key={item.id}>
                    <input aria-label={`Opção ${index + 1}`} value={item.name} onChange={(event) => updateOption(group.id, item.id, { name: event.target.value })} placeholder={group.kind === 'removal' ? 'Ex.: Cebola' : 'Ex.: Bacon'}/>
                    <div className="money-input"><span>R$</span><input aria-label={`Preço da opção ${index + 1}`} type="number" step="0.01" disabled={group.kind === 'removal'} value={group.kind === 'removal' ? 0 : item.priceDelta} onChange={(event) => updateOption(group.id, item.id, { priceDelta: Number(event.target.value) })}/></div>
                    <label className="mini-check"><input type="checkbox" checked={item.active} onChange={(event) => updateOption(group.id, item.id, { active: event.target.checked })}/>Ativa</label>
                    <button type="button" className="row-delete" onClick={() => removeOption(group.id, item.id)}><Trash2 size={16}/></button>
                  </div>)}
                </div>
              </div>}
            </section>)}
          </div>}
        </div>

        <div className="subform-section"><div className="subform-title"><div><span className="eyebrow">IMAGENS</span><h3>Galeria do produto</h3></div><span className="muted">{totalImages}/{imageLimit ?? '∞'} imagens</span></div><label className="upload-drop"><ImagePlus size={24}/><strong>Selecionar imagens</strong><span>JPG, PNG ou WEBP · até 5 MB cada</span><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => selectFiles(event.target.files)}/></label>{files.length > 0 && <div className="pending-files">{files.map((file, index) => <span key={`${file.name}-${index}`}>{file.name}<button type="button" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={14}/></button></span>)}</div>}{product.images.length > 0 && <div className="image-admin-grid">{product.images.map((image) => <article key={image.id} className={image.isPrimary ? 'is-primary' : ''}><ImageWithFallback src={image.url} alt={image.altText || product.name}/><div><button type="button" onClick={() => void primary(image)} title="Definir como principal"><Star size={16}/>{image.isPrimary ? 'Principal' : 'Tornar principal'}</button><button type="button" onClick={() => void removeImage(image)} title="Excluir imagem"><Trash2 size={16}/></button></div></article>)}</div>}</div>
      </section>

      <aside>
        <section className="admin-card form-section"><span className="eyebrow">PUBLICAÇÃO</span><h2>Disponibilidade</h2><label className="switch-row"><span><strong>Produto ativo</strong><small>Aparece no cardápio público</small></span><input type="checkbox" checked={product.active} onChange={(event) => update('active', event.target.checked)}/></label><label className="switch-row"><span><strong>Destaque</strong><small>Produto em evidência</small></span><input type="checkbox" checked={product.featured} onChange={(event) => update('featured', event.target.checked)}/></label><div className="product-form-preview"><span>Preço atual</span><strong>{currency.format(product.promotionalPrice ?? product.price)}</strong><small>{product.optionGroups.length} grupo(s) de personalização</small></div></section>
        <button className="primary-button full-button" disabled={saving} type="submit"><Save size={18}/>{saving ? 'Salvando...' : 'Salvar produto'}</button>
      </aside>
    </form>
  </>;
}
