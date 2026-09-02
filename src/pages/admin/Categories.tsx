import { CheckCircle2, Edit3, EyeOff, Layers, PackageCheck, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useStore } from '../../contexts/StoreContext';
import { ErrorState, LoadingState } from '../../components/ui/AsyncState';
import { useToast } from '../../contexts/ToastContext';
import type { Category } from '../../types';
import { slugify } from '../../utils/format';
import { createId } from '../../utils/id';

const empty = (storeId: string, sortOrder: number): Category => ({ id: createId(), storeId, name: '', slug: '', description: '', active: true, sortOrder });

export default function CategoriesAdmin() {
  const { categories, products, settings, saveCategory, deleteCategory, loading, error, reloadAdmin } = useStore();
  const { showToast } = useToast();
  const [selected, setSelected] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const form = selected ?? empty(settings.id, (categories.length + 1) * 10);

  const stats = useMemo(() => ({
    total: categories.length,
    active: categories.filter((category) => category.active).length,
    linkedProducts: products.filter((product) => categories.some((category) => category.id === product.categoryId)).length,
  }), [categories, products]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return categories;
    return categories.filter((category) => [category.name, category.slug, category.description].some((value) => value?.toLowerCase().includes(normalized)));
  }, [categories, query]);

  if (loading) return <LoadingState label="Carregando categorias..." />;
  if (error) return <ErrorState message={error} onRetry={() => void reloadAdmin()} />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const formEl = event.currentTarget as HTMLFormElement;
    const fd = new FormData(formEl);
    const category: Category = {
      ...form,
      name: String(fd.get('name') || '').trim(),
      slug: String(fd.get('slug') || '').trim() || slugify(String(fd.get('name') || '')),
      description: String(fd.get('description') || '').trim(),
      active: fd.get('active') === 'on',
      sortOrder: Number(fd.get('sortOrder') || 0),
    };
    setBusy(true);
    try {
      await saveCategory(category);
      showToast(selected ? 'Categoria atualizada.' : 'Categoria cadastrada.', 'success');
      setSelected(null);
      formEl.reset();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao salvar categoria.', 'error');
    } finally { setBusy(false); }
  };

  const remove = async (category: Category) => {
    const count = products.filter((product) => product.categoryId === category.id).length;
    if (count) {
      showToast(`A categoria possui ${count} produto(s). Recategorize-os antes de excluir.`, 'error');
      return;
    }
    if (!confirm(`Excluir a categoria ${category.name}?`)) return;
    try {
      await deleteCategory(category.id);
      showToast('Categoria removida.', 'success');
      if (selected?.id === category.id) setSelected(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao excluir categoria.', 'error');
    }
  };

  return <>
    <div className="admin-page-title admin-page-title--categories">
      <div>
        <span className="eyebrow">ORGANIZAÇÃO</span>
        <h1>Categorias</h1>
        <p>Organize a vitrine sem poluir o catálogo. Categorias ocultas deixam de aparecer para o cliente.</p>
      </div>
      <button className="primary-button category-new-mobile" type="button" onClick={() => setSelected(null)}><Plus size={18}/>Nova categoria</button>
    </div>

    <div className="category-stat-grid">
      <article><span><Layers size={18}/></span><div><small>Total</small><strong>{stats.total}</strong><p>categorias cadastradas</p></div></article>
      <article><span><CheckCircle2 size={18}/></span><div><small>Publicadas</small><strong>{stats.active}</strong><p>visíveis no catálogo</p></div></article>
      <article><span><PackageCheck size={18}/></span><div><small>Produtos</small><strong>{stats.linkedProducts}</strong><p>itens organizados</p></div></article>
    </div>

    <div className="categories-workspace">
      <section className="admin-card category-list-card">
        <div className="category-list-toolbar">
          <div>
            <span className="eyebrow">CATÁLOGO</span>
            <h2>Suas categorias</h2>
          </div>
          <div className="admin-search category-search"><Search size={17}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Buscar categoria..."/></div>
        </div>

        <div className="category-table-head" aria-hidden="true"><span>Categoria</span><span>Produtos</span><span>Status</span><span>Ordem</span><span>Ações</span></div>
        <div className="category-modern-list">
          {filtered.length === 0 && <div className="category-empty"><Search size={22}/><strong>Nenhuma categoria encontrada</strong><span>Tente outro termo de pesquisa.</span></div>}
          {filtered.map((category) => {
            const count = products.filter((product) => product.categoryId === category.id).length;
            return <article className={selected?.id === category.id ? 'is-selected' : ''} key={category.id}>
              <div className="category-main-cell"><div className="category-avatar">{category.name.slice(0, 1).toUpperCase()}</div><div><strong>{category.name}</strong><span>/{category.slug}</span>{category.description && <small>{category.description}</small>}</div></div>
              <div className="category-count-cell"><strong>{count}</strong><span>{count === 1 ? 'produto' : 'produtos'}</span></div>
              <div><span className={`category-status ${category.active ? 'is-active' : 'is-hidden'}`}>{category.active ? <CheckCircle2 size={14}/> : <EyeOff size={14}/>} {category.active ? 'Ativa' : 'Oculta'}</span></div>
              <div className="category-order-cell">{category.sortOrder}</div>
              <div className="row-actions category-row-actions"><button onClick={() => setSelected(structuredClone(category))} title="Editar"><Edit3 size={16}/></button><button onClick={() => void remove(category)} title={count ? 'Remova ou recategorize os produtos primeiro' : 'Excluir'}><Trash2 size={16}/></button></div>
            </article>;
          })}
        </div>
      </section>

      <section className="admin-card category-editor-card">
        <div className="admin-card__header">
          <div><span className="eyebrow">{selected ? 'EDITAR' : 'NOVA'} CATEGORIA</span><h2>{selected ? 'Atualizar categoria' : 'Adicionar categoria'}</h2><p>{selected ? 'As alterações refletem no catálogo após salvar.' : 'Crie grupos simples para o cliente encontrar os produtos.'}</p></div>
          {selected && <button className="icon-button" type="button" onClick={() => setSelected(null)} aria-label="Cancelar edição"><X size={18}/></button>}
        </div>
        <form className="stack-form category-form" key={selected?.id ?? 'new'} onSubmit={submit}>
          <label>Nome<input name="name" required defaultValue={form.name} placeholder="Ex.: Orquídeas" /></label>
          <label>Slug <small>Endereço amigável da categoria</small><input name="slug" defaultValue={form.slug} placeholder="Gerado automaticamente" /></label>
          <label>Descrição <small>Opcional</small><textarea name="description" rows={3} defaultValue={form.description} placeholder="Ex.: Arranjos e vasos com orquídeas selecionadas." /></label>
          <div className="category-form-inline"><label>Ordem<input name="sortOrder" type="number" min="0" defaultValue={form.sortOrder} /></label><label className="switch-row category-active-switch"><span><strong>Categoria ativa</strong><small>Aparece na loja pública</small></span><input name="active" type="checkbox" defaultChecked={form.active}/></label></div>
          <button className="primary-button" disabled={busy} type="submit">{selected ? <Save size={18}/> : <Plus size={18}/>} {busy ? 'Salvando...' : selected ? 'Salvar alterações' : 'Adicionar categoria'}</button>
        </form>
      </section>
    </div>
  </>;
}
