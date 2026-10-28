import './products-mobile.css';
import './catalog-quick.css';
import { Copy, Edit3, Eye, EyeOff, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ProductMedia } from '../../components/ProductMedia';
import { ErrorState, LoadingState } from '../../components/ui/AsyncState';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import type { Product } from '../../types';
import { currency } from '../../utils/format';
import { getBusinessSegment } from '../../segments/businessSegments';

type QuickDraft = { id: string; storeId: string; price: string; promotion: string; availability: Product['availabilityStatus'] };

export default function ProductsAdmin() {
  const { products, categories, settings, deleteProduct, updateProductCommercial, planUsage, loading, error, reloadAdmin } = useStore();
  const segment = getBusinessSegment(settings.visualTheme);
  const segmentPresentation = segment.id !== 'food' && settings.visualTheme.preset !== 'doce_lua';
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [busyId, setBusyId] = useState('');
  const savingRef = useRef(false);
  const [draft, setDraft] = useState<QuickDraft | null>(null);
  const editorRef = useRef<HTMLFormElement>(null);
  const [saveError, setSaveError] = useState('');
  const activeStoreRef = useRef(settings.id);
  activeStoreRef.current = settings.id;
  useEffect(() => { setDraft(null); setSaveError(''); setQuery(''); setStatus('all'); }, [settings.id]);
  useEffect(() => { if (draft) editorRef.current?.querySelector<HTMLInputElement>('input')?.focus(); }, [draft?.id]);
  const filtered = useMemo(() => products.filter(product => product.name.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))
    && (status === 'all' || (status === 'active' ? product.active : status === 'hidden' ? !product.active : product.availabilityStatus !== 'available' || product.stockStatus === 'unavailable'))), [products, query, status]);

  const toggle = async (product: Product) => {
    if (savingRef.current || (segment.id === 'fitness' && !product.active)) return;
    savingRef.current = true;
    setBusyId(product.id);
    try {
      await updateProductCommercial(product.id, { active: !product.active });
      if (activeStoreRef.current === product.storeId) showToast(`Produto ${product.active ? 'ocultado' : 'ativado'}.`, 'success');
    } catch (e) { showToast(e instanceof Error ? e.message : 'Erro ao atualizar.', 'error'); }
    finally { savingRef.current = false; setBusyId(''); }
  };
  const remove = async (product: Product) => {
    if (savingRef.current || !confirm(`Excluir ${product.name}? Esta ação também removerá imagens e vínculos de personalização do banco.`)) return;
    savingRef.current = true;
    setBusyId(product.id);
    try { await deleteProduct(product.id); showToast('Produto removido.', 'success'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Erro ao excluir produto.', 'error'); }
    finally { savingRef.current = false; setBusyId(''); }
  };
  const openEditor = (product: Product) => {
    setSaveError('');
    setDraft({ id: product.id, storeId: settings.id, price: String(product.price), promotion: product.promotionalPrice == null ? '' : String(product.promotionalPrice), availability: product.availabilityStatus });
  };
  const saveQuick = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || savingRef.current) return;
    const current = products.find(product => product.id === draft.id && product.storeId === draft.storeId);
    if (!current || draft.storeId !== settings.id) { setSaveError('A loja selecionada mudou. Abra o produto novamente.'); return; }
    const price = Number(draft.price);
    const promotionalPrice = draft.promotion === '' ? undefined : Number(draft.promotion);
    if (!draft.price.trim() || !Number.isFinite(price) || price < 0 || (promotionalPrice != null && (!Number.isFinite(promotionalPrice) || promotionalPrice < 0 || promotionalPrice > price))) {
      setSaveError('Revise os preços: a promoção deve ser menor ou igual ao preço normal.'); return;
    }
    savingRef.current = true;
    setBusyId(draft.id);
    setSaveError('');
    try {
      const availabilityStatus = current.availabilityStatus === draft.availability ? undefined : draft.availability;
      if (current.partyOrderConfig?.enabled && availabilityStatus === undefined) { setDraft(null); return; }
      await updateProductCommercial(draft.id, current.partyOrderConfig?.enabled
        ? { availabilityStatus }
        : { price, promotionalPrice, availabilityStatus });
      if (activeStoreRef.current === draft.storeId) { setDraft(null); showToast('Preço e disponibilidade atualizados.', 'success'); }
    } catch (e) { if (activeStoreRef.current === draft.storeId) setSaveError(e instanceof Error ? e.message : 'Erro ao salvar. Seus valores foram preservados.'); }
    finally { savingRef.current = false; setBusyId(''); }
  };

  if (loading) return <LoadingState label="Carregando produtos..."/>;
  if (error) return <ErrorState message={error} onRetry={() => void reloadAdmin()}/>;
  const activeCount = products.filter(product => product.active).length;
  const limit = planUsage.plan.productLimit;
  const editedProduct = draft && products.find(product => product.id === draft.id && product.storeId === settings.id);
  const actions = (product: Product) => <>
    <button disabled={Boolean(busyId) || (segment.id === 'fitness' && !product.active)} className={`status-toggle ${product.active ? 'on' : 'off'}`} onClick={() => void toggle(product)} title={segment.id === 'fitness' && !product.active ? 'Publicação Fitness depende da revisão comercial.' : undefined}>{product.active ? <Eye size={14}/> : <EyeOff size={14}/>} {product.active ? 'Ocultar' : 'Publicar'}</button>
    <button className="secondary-button" disabled={Boolean(busyId)} onClick={() => openEditor(product)} aria-label={`Editar preço e disponibilidade de ${product.name}`}>Ajuste rápido</button>
  </>;
  return <>
    <div className="admin-page-title"><div><span className="eyebrow">CATÁLOGO</span><h1>{segmentPresentation ? segment.catalogLabel : 'Produtos'}</h1><p>Ajuste preço e disponibilidade aqui. Abra o produto para fotos, descrição e personalizações.</p></div><Link className="primary-button" to="/admin/produtos/novo"><Plus size={18}/>{segmentPresentation ? `Adicionar ${segment.productLabel.toLocaleLowerCase('pt-BR')}` : 'Novo produto'}</Link></div>
    <div className="catalog-limit-banner"><div><strong>{activeCount}/{limit ?? '∞'} produtos ativos</strong><span>{limit == null ? 'Sem limite de publicação neste plano.' : planUsage.canActivateProduct ? `Você ainda pode publicar ${Math.max(0, limit - activeCount)} produto(s).` : 'Limite de publicação atingido. Cadastre novos produtos como ocultos ou desative um item ativo.'}</span></div>{limit != null && <div className="catalog-limit-track"><span style={{ width: `${Math.min(100, (activeCount / Math.max(1, limit)) * 100)}%` }}/></div>}</div>
    <section className="admin-card no-padding">
      <div className="table-toolbar catalog-toolbar"><div className="admin-search"><Search size={18}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder={segmentPresentation ? segment.searchPlaceholder : 'Buscar produto...'} aria-label={segmentPresentation ? segment.searchPlaceholder : 'Buscar produto...'}/></div><label className="catalog-status-filter"><span>Mostrar</span><select aria-label="Filtrar produtos por status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">Todos</option><option value="active">Publicados</option><option value="hidden">Ocultos</option><option value="unavailable">Indisponíveis</option></select></label><span aria-live="polite">{filtered.length} itens</span></div>
      {draft && editedProduct && <form ref={editorRef} className="catalog-quick-editor" onSubmit={saveQuick} aria-label={`Ajuste rápido de ${editedProduct.name}`}>
        <div><h2>Ajuste rápido</h2><p>{editedProduct.name}</p></div>
        {editedProduct.partyOrderConfig?.enabled ? <p className="muted">O preço desta encomenda depende da gramatura. <Link to={`/admin/produtos/${editedProduct.id}`}>Editar regra de preço</Link></p> : <div className="form-grid"><label>Preço<input required type="number" inputMode="decimal" min="0" step="0.01" value={draft.price} onChange={event => setDraft({ ...draft, price: event.target.value })}/></label><label>Preço promocional (opcional)<input type="number" inputMode="decimal" min="0" step="0.01" value={draft.promotion} onChange={event => setDraft({ ...draft, promotion: event.target.value })}/></label></div>}
        <label>Disponibilidade<select value={draft.availability} onChange={event => setDraft({ ...draft, availability: event.target.value as Product['availabilityStatus'] })}><option value="available">Disponível</option><option value="unavailable">Indisponível temporariamente</option><option value="sold_out">Esgotado</option></select></label>
        <small>O estoque e as reservas continuam sendo validados. Este ajuste não altera quantidades.</small>{editedProduct.stockStatus === 'unavailable' && <p className="catalog-save-error">Este produto tem um bloqueio de estoque. <Link to="/admin/estoque">Revisar estoque e insumos</Link></p>}
        {saveError && <p role="alert" className="catalog-save-error">{saveError}</p>}
        <div className="catalog-quick-editor__actions"><button type="button" className="secondary-button" disabled={Boolean(busyId)} onClick={() => setDraft(null)}>Cancelar</button><button className="primary-button" disabled={Boolean(busyId)}>{busyId ? 'Salvando…' : 'Salvar ajuste'}</button></div>
      </form>}
      {!filtered.length && <div className="catalog-empty"><h2>{products.length ? 'Nenhum produto encontrado' : 'Seu catálogo começa aqui'}</h2><p>{products.length ? 'Tente outro nome ou remova o filtro de status.' : 'Adicione o primeiro produto ou serviço para começar.'}</p>{products.length ? <button className="secondary-button" onClick={() => { setQuery(''); setStatus('all'); }}>Limpar busca e filtros</button> : <Link className="primary-button" to="/admin/produtos/novo">Adicionar primeiro item</Link>}</div>}
      <div className="responsive-table products-desktop-table"><table><thead><tr><th>Produto</th><th>Categoria</th><th>Preço</th><th>Ações rápidas</th><th><span className="sr-only">Mais ações</span></th></tr></thead><tbody>{filtered.map(product => <tr key={product.id}><td><div className="product-cell"><ProductMedia src={product.imageUrl} emoji={product.visualEmoji} imageCount={product.images.length} alt={product.name} emojiClassName="admin-product-emoji-v060"/><div><strong>{product.name}</strong><span>{product.availabilityStatus !== 'available' || product.stockStatus === 'unavailable' ? 'Indisponível' : product.optionGroups.length ? `${product.optionGroups.length} grupo(s) de opções` : 'Disponível'}</span><small>{product.active ? 'Publicado' : 'Oculto'}</small></div></div></td><td>{categories.find(category => category.id === product.categoryId)?.name ?? '—'}</td><td><strong>{currency.format(product.promotionalPrice ?? product.price)}</strong>{product.promotionalPrice != null && <small><del>{currency.format(product.price)}</del></small>}</td><td><div className="catalog-row-quick">{actions(product)}</div></td><td><div className="row-actions"><Link to={`/admin/produtos/${product.id}`} aria-label={`Editar ${product.name}`}><Edit3 size={17}/></Link><Link to={`/admin/produtos/novo?duplicar=${encodeURIComponent(product.id)}`} aria-label={`Duplicar ${product.name}`} title="Duplicar produto"><Copy size={17}/></Link><button disabled={Boolean(busyId)} onClick={() => void remove(product)} aria-label={`Excluir ${product.name}`}><Trash2 size={17}/></button></div></td></tr>)}</tbody></table></div>
      <div className="products-mobile-list" aria-label="Produtos cadastrados">{filtered.map(product => {
        const unavailable = product.availabilityStatus !== 'available' || product.stockStatus === 'unavailable';
        return <article className="products-mobile-card" key={product.id}><div className="products-mobile-card__top"><ProductMedia src={product.imageUrl} emoji={product.visualEmoji} imageCount={product.images.length} alt={product.name} emojiClassName="admin-product-emoji-v060"/><div><strong>{product.name}</strong><small>{categories.find(category => category.id === product.categoryId)?.name ?? 'Sem categoria'}</small></div><span className={`products-mobile-card__state ${product.active ? 'is-active' : 'is-hidden'}`}>{product.active ? 'Publicado' : 'Oculto'}</span></div><div className="products-mobile-card__meta"><span><small>Preço</small><strong>{currency.format(product.promotionalPrice ?? product.price)}</strong></span><span><small>Disponibilidade</small><strong>{unavailable ? 'Indisponível' : product.trackStock ? `${Number(product.stockQuantity || 0) - Number(product.stockReservedQuantity || 0)} disponíveis` : 'Disponível'}</strong>{product.trackStock && <small>{Number(product.stockQuantity || 0)} físico · {-Number(product.stockReservedQuantity || 0)} reservado(s)</small>}</span></div><div className="products-mobile-card__actions">{actions(product)}<Link className="secondary-button" to={`/admin/produtos/${product.id}`}><Edit3 size={15}/>Editar</Link><Link className="icon-button" to={`/admin/produtos/novo?duplicar=${encodeURIComponent(product.id)}`} aria-label={`Duplicar ${product.name}`} title="Duplicar produto"><Copy size={16}/></Link><button className="icon-button" disabled={Boolean(busyId)} onClick={() => void remove(product)} aria-label={`Excluir ${product.name}`}><Trash2 size={16}/></button></div></article>;
      })}</div>
    </section>
  </>;
}
