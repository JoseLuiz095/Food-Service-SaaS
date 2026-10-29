import { CloudCog, Copy, ExternalLink, Eye, EyeOff, KeyRound, Plus, Search, TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { DEFAULT_PLATFORM_SETTINGS } from '../../data/platformDefaults';
import { platformApi } from '../../services/platformApi';
import { trackInteraction } from '../../services/interactionTelemetry';
import type { Plan, PlatformSettings, PlatformStoreSummary, StoreAccessStatus, StoreCredentialMode } from '../../types';
import { currency, slugify } from '../../utils/format';
import { copyText } from '../../utils/clipboard';
import { emailValidationMessage, normalizeEmail, temporaryPasswordValidationMessage } from '../../utils/email';
import { BusinessSegmentPicker } from '../../segments/BusinessSegmentPicker';
import { BUSINESS_SEGMENTS, getBusinessSegment, type BusinessSegment } from '../../segments/businessSegments';
import { saveNewStorePresentation } from '../../services/businessPresentation';
import { platformOrigin } from '../../lib/brand';
import { customStorefrontUrl, publicStorefrontUrl } from '../../utils/storefrontRoute';
import { ErrorState, LoadingState } from '../../components/ui/AsyncState';
import { firstChargeAfterFreeMonths } from '../../utils/introBilling';

const publicUrlFor = (store: PlatformStoreSummary) => customStorefrontUrl(store.customDomain) || publicStorefrontUrl(store.slug, platformOrigin());
const dateOnly = (value?: string) => value ? value.slice(0,10) : '';
const daysUntil = (value?: string) => value ? Math.max(0, Math.ceil((new Date(value).getTime()-Date.now())/86_400_000)) : Number.POSITIVE_INFINITY;
const trialExpired = (value?: string) => Boolean(value) && new Date(value as string).getTime() <= Date.now();
const addDaysDate = (days:number) => { const d=new Date(); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); };
const dateBr=(value?:string)=>value?new Date(`${value.slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR'):'—';
const isPastDate=(value?:string)=>{if(!value)return false;const now=new Date();const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');return value.slice(0,10)<today;};

const trialLabel=(store:PlatformStoreSummary)=>{
  if(store.planCode!=='DEMO'||store.subscriptionStatus!=='trial'||!store.expiresAt)return '';
  if(trialExpired(store.expiresAt))return 'Demo vencida';
  const days=daysUntil(store.expiresAt);
  if(days===0)return 'Demo vence hoje';
  if(days===1)return 'Demo vence amanhã';
  return `Demo vence em ${days} dias`;
};

type StoreFilter='all'|'paying'|'courtesy'|'trial'|'onboarding'|'attention'|'suspended';
const STORE_PAGE_SIZE=20;
const searchableText=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
const storeCommercialStage=(store:PlatformStoreSummary,warningDays:number)=>{
  if(store.accessStatus==='suspended')return {key:'suspended' as const,label:'Suspensa',tone:'danger'};
  if(store.planCode==='DEMO'&&store.subscriptionStatus==='trial'&&(trialExpired(store.expiresAt)||daysUntil(store.expiresAt)<=warningDays))return {key:'attention' as const,label:'Atenção comercial',tone:'warning'};
  if(store.billingMode==='complimentary')return {key:'courtesy' as const,label:'Isenção comercial',tone:'info'};
  if(store.billingMode==='introductory'&&store.introFirstChargeOn&&store.introFirstChargeOn>new Date().toISOString().slice(0,10))return {key:'courtesy' as const,label:'Cortesia temporária',tone:'info'};
  if(store.activeProductCount===0)return {key:'onboarding' as const,label:'Implantação',tone:'neutral'};
  if(store.planCode==='DEMO'&&store.subscriptionStatus==='trial')return {key:'trial' as const,label:'Demonstração',tone:'info'};
  return {key:'paying' as const,label:'Cliente ativo',tone:'success'};
};

export default function MasterStores(){
  const {showToast}=useToast();
  const [searchParams,setSearchParams]=useSearchParams();
  const[stores,setStores]=useState<PlatformStoreSummary[]>([]);
  const[plans,setPlans]=useState<Plan[]>([]);
  const[platformSettings,setPlatformSettings]=useState<PlatformSettings>(DEFAULT_PLATFORM_SETTINGS);
  const[loading,setLoading]=useState(true);
  const[loadError,setLoadError]=useState('');
  const[query,setQuery]=useState(()=>searchParams.get('q')||'');
  const[filter,setFilter]=useState<StoreFilter>(()=>{const value=searchParams.get('stage');return ['paying','trial','onboarding','attention','suspended'].includes(value||'')?value as StoreFilter:'all'});
  const[segmentFilter,setSegmentFilter]=useState<BusinessSegment|'all'>('all');
  const[page,setPage]=useState(1);
  const[expandedStoreId,setExpandedStoreId]=useState('');
  const[editing,setEditing]=useState<PlatformStoreSummary|null>(null);
  const[creating,setCreating]=useState(false);
  const[saving,setSaving]=useState(false);
  const[rowSaving,setRowSaving]=useState('');
  const rowBusy=useRef(false);
  const[createFunctionReady,setCreateFunctionReady]=useState<boolean|null>(null);
  const[createFunctionError,setCreateFunctionError]=useState('');
  const[credentialFunctionReady,setCredentialFunctionReady]=useState<boolean|null>(null);
  const[credentialFunctionError,setCredentialFunctionError]=useState('');
  const[credentialSaving,setCredentialSaving]=useState(false);
  const modalBusy=useRef(false);
  modalBusy.current=saving||credentialSaving;
  const[showPassword,setShowPassword]=useState(false);
  const[showEditPassword,setShowEditPassword]=useState(false);
  const[confirmTemporaryPassword,setConfirmTemporaryPassword]=useState('');
  const[editAccessForm,setEditAccessForm]=useState({email:'',password:'',confirmPassword:'',forcePasswordChange:true,linkOwner:false});
  const[createForm,setCreateForm]=useState({
    businessSegment:'food' as BusinessSegment,
    name:'',slug:'',city:'',state:'',ownerName:'',ownerEmail:'',planId:'',accessStatus:'online' as StoreAccessStatus,
    dueDay:10,customDomain:'',credentialMode:'invite' as StoreCredentialMode,temporaryPassword:'',forcePasswordChange:true,billingExempt:false,
  });

  const reload=async()=>{
    setLoading(true);
    setLoadError('');
    try{
      const[p,s,settings]=await Promise.all([platformApi.listPlans(),platformApi.listStores(),platformApi.getPlatformSettings()]);
      setPlans(p);setStores(s);setPlatformSettings(settings);
      const selectablePlans=p.filter((plan)=>plan.active&&(settings.demoEnabled||plan.code!=='DEMO'));
      setCreateForm((f)=>({...f,planId:selectablePlans.some((plan)=>plan.id===f.planId)?f.planId:(selectablePlans.find((x)=>x.code==='ESSENTIAL')?.id||selectablePlans[0]?.id||'')}));
    }catch(e){setLoadError(e instanceof Error?e.message:'Falha ao carregar lojas.')}
    finally{setLoading(false)}
  };

  const refreshStores=async()=>{
    try { setStores(await platformApi.listStores()); }
    catch { showToast('Alteração salva. Não foi possível atualizar a lista; confira os dados ao reabrir esta página.','info'); }
  };

  useEffect(()=>{
    const next=new URLSearchParams(searchParams);
    if(query.trim())next.set('q',query);else next.delete('q');
    if(filter!=='all')next.set('stage',filter);else next.delete('stage');
    if(next.toString()!==searchParams.toString())setSearchParams(next,{replace:true});
  },[query,filter,searchParams,setSearchParams]);

  const checkCreateFunction=async()=>{
    try{
      const health=await platformApi.createStoreFunctionHealth();
      setCreateFunctionReady(Boolean(health.ok&&health.configured));
      setCreateFunctionError(health.ok&&health.configured?'':'A função está publicada, mas as variáveis internas do Supabase não estão disponíveis.');
    }catch(e){setCreateFunctionReady(false);setCreateFunctionError(e instanceof Error?e.message:'Edge Function indisponível.')}
  };

  const checkCredentialFunction=async()=>{
    try{
      const health=await platformApi.manageStoreUserFunctionHealth();
      setCredentialFunctionReady(Boolean(health.ok&&health.configured));
      setCredentialFunctionError(health.ok&&health.configured?'':'A função de gestão de acesso está publicada, mas as variáveis internas do Supabase não estão disponíveis.');
    }catch(e){setCredentialFunctionReady(false);setCredentialFunctionError(e instanceof Error?e.message:'Edge Function de gestão de acesso indisponível.')}
  };

  useEffect(()=>{void reload();void checkCreateFunction();void checkCredentialFunction()},[]);

  useEffect(()=>{
    if(!creating&&!editing)return;
    const previous=document.activeElement as HTMLElement|null;
    const dialog=document.querySelector<HTMLElement>('.master-shell [role="dialog"]');
    const controls=()=>Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')||[]).filter(element=>element.getClientRects().length>0);
    controls()[0]?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&!modalBusy.current){setCreating(false);setEditing(null);return}
      if(event.key!=='Tab')return;
      const items=controls();const first=items[0];const last=items[items.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
    };
    document.addEventListener('keydown',onKey);
    return()=>{document.removeEventListener('keydown',onKey);previous?.focus()};
  },[creating,Boolean(editing)]);

  const commercialCounts=useMemo(()=>{
    const counts:Record<StoreFilter,number>={all:stores.length,paying:0,courtesy:0,trial:0,onboarding:0,attention:0,suspended:0};
    for(const store of stores)counts[storeCommercialStage(store,platformSettings.demoWarningDays).key]++;
    return counts;
  },[stores,platformSettings.demoWarningDays]);

  const filtered=useMemo(()=>{
    const terms=searchableText(query.trim()).split(/\s+/).filter(Boolean);
    return stores.filter((store)=>{
      const segment=getBusinessSegment(store.businessSegment);
      const haystack=searchableText([store.name,store.slug,store.city,store.state,store.ownerName,store.ownerEmail,store.planName,segment.label].filter(Boolean).join(' '));
      const matchesQuery=terms.every(term=>haystack.includes(term));
      const stage=storeCommercialStage(store,platformSettings.demoWarningDays);
      return matchesQuery&&(filter==='all'||stage.key===filter)&&(segmentFilter==='all'||segment.id===segmentFilter);
    });
  },[stores,query,filter,segmentFilter,platformSettings.demoWarningDays]);
  const pageCount=Math.max(1,Math.ceil(filtered.length/STORE_PAGE_SIZE));
  const currentPage=Math.min(page,pageCount);
  const firstResult=(currentPage-1)*STORE_PAGE_SIZE;
  const pageStores=filtered.slice(firstResult,firstResult+STORE_PAGE_SIZE);
  const hasFilters=Boolean(query.trim()||filter!=='all'||segmentFilter!=='all');
  const clearFilters=()=>{setQuery('');setFilter('all');setSegmentFilter('all');setPage(1)};

  const selectableCreatePlans=plans.filter((plan)=>plan.active&&(platformSettings.demoEnabled||plan.code!=='DEMO'));
  const selectedCreatePlan=plans.find((plan)=>plan.id===createForm.planId);
  const selectedEditPlan=editing?plans.find((plan)=>plan.id===editing.planId):undefined;
  const emailError=createForm.ownerEmail?emailValidationMessage(createForm.ownerEmail):'';
  const passwordError=createForm.credentialMode==='temporary_password'&&createForm.temporaryPassword?temporaryPasswordValidationMessage(createForm.temporaryPassword):'';
  const editEmailError=editAccessForm.email?emailValidationMessage(editAccessForm.email):'';
  const editPasswordError=editAccessForm.password?temporaryPasswordValidationMessage(editAccessForm.password):'';
  const introPreview=(()=>{
    if(editing?.billingMode!=='introductory')return '';
    try { const original=stores.find(store=>store.id===editing.id);if(original?.billingMode==='introductory'&&original.planId===editing.planId&&original.dueDay===editing.dueDay&&original.introFreeMonths===editing.introFreeMonths&&original.introFirstChargeOn)return original.introFirstChargeOn;
      const now=new Date();return firstChargeAfterFreeMonths(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`,editing.introFreeMonths||0,editing.dueDay??0); }
    catch { return ''; }
  })();

  const openEdit=(store:PlatformStoreSummary)=>{
    setEditing({...store,billingMode:store.billingMode||(store.billingAmount===0?'complimentary':'standard')});
    setEditAccessForm({email:store.ownerEmail||'',password:'',confirmPassword:'',forcePasswordChange:true,linkOwner:store.adminUserCount===0});
    setShowEditPassword(false);
  };

  const saveCredentials=async()=>{
    if(!editing||credentialSaving)return;
    const validation=emailValidationMessage(editAccessForm.email);
    if(validation){showToast(validation,'error');return;}
    if(editAccessForm.password){
      const passValidation=temporaryPasswordValidationMessage(editAccessForm.password);
      if(passValidation){showToast(passValidation,'error');return;}
      if(editAccessForm.password!==editAccessForm.confirmPassword){showToast('A confirmação da nova senha não confere.','error');return;}
    }
    setCredentialSaving(true);
    try{
      const result=await trackInteraction('store_credentials_update',()=>platformApi.updateStoreCredentials({
        storeId:editing.id,
        email:normalizeEmail(editAccessForm.email),
        password:editAccessForm.password||undefined,
        forcePasswordChange:editAccessForm.forcePasswordChange,
        linkOwner:editAccessForm.linkOwner,
      }),{storeId:editing.id,successKind:'audit'});
      setEditing((current)=>current?{...current,ownerEmail:result.email}:current);
      setEditAccessForm((current)=>({...current,email:result.email,password:'',confirmPassword:'',linkOwner:false}));
      showToast(result.passwordChanged?'E-mail e/ou senha do lojista atualizados.':'E-mail de acesso atualizado.','success');
      if((result.linkedStoreCount||0)>1)showToast(`Este login está vinculado a ${result.linkedStoreCount} lojas; a alteração de acesso vale para todas elas.`,'info');
      await refreshStores();
    }catch(e){showToast(e instanceof Error?e.message:'Falha ao atualizar e-mail/senha do lojista.','error')}
    finally{setCredentialSaving(false)}
  };

  const saveEdit=async()=>{
    if(!editing)return;
    setSaving(true);
    try{
      const plan=plans.find((p)=>p.id===editing.planId);
      const original=stores.find(store=>store.id===editing.id);
      if (!original) throw new Error('Reabra a loja para atualizar os dados.');
      const commercialFields=['planId','accessStatus','billingAmount','billingMode','introFreeMonths','dueDay','nextDueDate','expiresAt','customDomain','suspensionReason'] as const;
      const commercialChanged=commercialFields.some(key=>(editing[key]??'')!==(original[key]??''));
      if (commercialChanged) await trackInteraction('store_subscription_settings_update',()=>platformApi.updateStore({
        storeId:editing.id,planId:editing.planId||'',accessStatus:editing.accessStatus,billingAmount:editing.billingMode==='complimentary'?0:(editing.billingAmount??plan?.monthlyPrice??0),billingMode:editing.billingMode,introFreeMonths:editing.introFreeMonths,
        dueDay:editing.billingMode==='introductory'?(editing.dueDay??0):editing.dueDay||10,nextDueDate:editing.nextDueDate,expiresAt:editing.expiresAt,customDomain:editing.customDomain,suspensionReason:editing.suspensionReason,
      }),{storeId:editing.id,successKind:'audit'});
      const warning=editing.businessSegment!==original.businessSegment
        ? await saveNewStorePresentation(editing.id,editing.businessSegment,true) : undefined;
      showToast(warning || 'Loja atualizada.',warning?'info':'success');setEditing(null);await refreshStores();
    }catch(e){showToast(e instanceof Error?e.message:'Falha ao atualizar loja.','error')}
    finally{setSaving(false)}
  };

  const quickUpdate=async(store:PlatformStoreSummary,patch:Partial<PlatformStoreSummary>)=>{
    if(rowBusy.current)return;
    const next={...store,...patch};
    if(patch.accessStatus==='suspended'&&store.accessStatus!=='suspended'&&!window.confirm(`Suspender ${store.name}? A vitrine e o painel do cliente ficarão indisponíveis. A loja, pedidos, produtos e vínculos de usuários serão preservados para uma futura reativação.`))return;
    if(patch.accessStatus==='online'&&store.planCode==='DEMO'&&trialExpired(store.expiresAt)){
      if(!window.confirm(`A demonstração de ${store.name} já venceu. Reativar por mais ${platformSettings.demoDurationDays} dias?`))return;
      next.expiresAt=addDaysDate(platformSettings.demoDurationDays);
    }
    rowBusy.current=true;
    setRowSaving(store.id);
    try{
      const plan=plans.find((p)=>p.id===next.planId);
      const billingAmount=next.billingMode==='complimentary'?0:(patch.planId!==undefined?(plan?.monthlyPrice??next.billingAmount??0):(next.billingAmount??plan?.monthlyPrice??0));
      await platformApi.updateStore({
        storeId:store.id,planId:next.planId||'',accessStatus:next.accessStatus,billingAmount,billingMode:next.billingMode,introFreeMonths:next.introFreeMonths,dueDay:next.dueDay||10,nextDueDate:next.nextDueDate,
        expiresAt:next.expiresAt,customDomain:next.customDomain,suspensionReason:next.suspensionReason,
      });
      showToast(patch.planId!==undefined?'Plano atualizado.':'Status da loja atualizado.','success');await refreshStores();
    }catch(e){showToast(e instanceof Error?e.message:'Falha ao atualizar loja.','error')}
    finally{rowBusy.current=false;setRowSaving('')}
  };

  const createStore=async(e:FormEvent)=>{
    e.preventDefault();if(saving)return;
    const validation=emailValidationMessage(createForm.ownerEmail);
    if(validation){showToast(validation,'error');return;}
    if(createForm.credentialMode==='temporary_password'){
      const passValidation=temporaryPasswordValidationMessage(createForm.temporaryPassword);
      if(passValidation){showToast(passValidation,'error');return;}
      if(createForm.temporaryPassword!==confirmTemporaryPassword){showToast('A confirmação da senha temporária não confere.','error');return;}
    }
    setSaving(true);
    try{
      const result=await platformApi.createStore({...createForm,ownerEmail:normalizeEmail(createForm.ownerEmail),slug:createForm.slug||slugify(createForm.name),appOrigin:platformOrigin()});
      if(result.warning)showToast(result.warning,'info');
      else if(result.existingUser)showToast('Loja criada e vinculada ao usuário que já existia no Supabase Auth.','success');
      else if(result.createdWithPassword)showToast('Loja e usuário criados com senha temporária. O cliente deverá trocá-la no primeiro acesso.','success');
      else if(result.invited)showToast('Loja criada e convite enviado ao responsável.','success');
      else showToast('Loja criada.','success');
      setCreating(false);setConfirmTemporaryPassword('');
      setCreateForm((f)=>({...f,name:'',slug:'',ownerName:'',ownerEmail:'',customDomain:'',temporaryPassword:'',credentialMode:'invite',forcePasswordChange:true,billingExempt:false}));
      await reload();
    }catch(err){showToast(err instanceof Error?err.message:'Falha ao criar loja.','error')}
    finally{setSaving(false)}
  };

  return <>
    <div className="admin-page-title master-store-page-title"><div><span className="eyebrow">CLIENTES</span><h1>Lojas e assinaturas</h1><p>Crie estabelecimentos, escolha o plano e suspenda o acesso sem apagar nenhum dado.</p></div><button type="button" className="primary-button" onClick={()=>setCreating(true)}><Plus size={18}/>Nova loja</button></div>

    {createFunctionReady===false&&<section className="admin-card master-service-alert"><TriangleAlert size={22}/><div><strong>Criação automática de lojas indisponível</strong><p>{createFunctionError}</p><small>O frontend está publicado, mas a Edge Function do Supabase não está disponível. Vá em <b>Diagnóstico</b> para ver o comando de deploy.</small></div></section>}
    {createFunctionReady===true&&<div className="master-service-ok"><CloudCog size={16}/> Serviço de criação de lojas disponível</div>}

    <section className="admin-card no-padding master-store-table">
      <div className="master-client-toolbar"><div className="table-toolbar"><div className="admin-search"><Search size={18}/><input aria-label="Buscar lojas" type="search" value={query} onChange={(e)=>{setQuery(e.target.value);setPage(1)}} placeholder="Buscar loja, responsável, plano ou cidade..."/></div><span aria-live="polite">{loading?'Atualizando lojas…':loadError?'Lista indisponível':`${filtered.length} de ${stores.length} lojas`}</span></div><div className="master-store-refinements"><label>Segmento principal<select value={segmentFilter} onChange={(event)=>{setSegmentFilter(event.target.value as BusinessSegment|'all');setPage(1)}}><option value="all">Todos os segmentos</option>{BUSINESS_SEGMENTS.map(segment=><option key={segment.id} value={segment.id}>{segment.label}</option>)}</select></label>{hasFilters&&filtered.length>0&&<button type="button" className="secondary-button compact-button" onClick={clearFilters}>Limpar filtros</button>}</div><div className="master-client-filters" role="group" aria-label="Filtrar clientes por etapa comercial">{([['all','Todas'],['paying','Clientes ativos'],['courtesy','Cortesias'],['trial','Demos'],['onboarding','Implantação'],['attention','Atenção'],['suspended','Suspensas']] as [StoreFilter,string][]).map(([key,label])=><button type="button" key={key} aria-pressed={filter===key} className={filter===key?'active':''} onClick={()=>{setFilter(key);setPage(1)}}><span>{label}</span><b>{commercialCounts[key]}</b></button>)}</div></div>
      {loading?<div role="status"><LoadingState label="Carregando lojas e assinaturas…"/></div>:loadError?<div role="alert"><ErrorState message={loadError} onRetry={()=>void reload()}/></div>:filtered.length===0?<div className="master-store-empty"><h2>{stores.length?'Nenhuma loja corresponde aos filtros':'Sua primeira loja começa aqui'}</h2><p>{stores.length?'Tente outro nome ou remova os filtros para ver todas as lojas.':'Cadastre o estabelecimento e o acesso de quem vai administrá-lo.'}</p><button className="secondary-button" onClick={()=>{if(stores.length){clearFilters()}else setCreating(true)}}>{stores.length?'Limpar filtros':'Criar primeira loja'}</button></div>:<><p className="master-table-scroll-note master-store-card-note">Em telas menores, abra os detalhes de uma loja para ver plano, cobrança e endereço.</p><p className="master-table-scroll-note master-store-wide-note">Deslize a tabela para consultar todas as colunas e ações.</p><div className="responsive-table" role="region" aria-label="Lojas e uso" tabIndex={0}><table><thead><tr><th scope="col">Loja</th><th scope="col">Plano</th><th scope="col">Acesso</th><th scope="col">Uso</th><th scope="col">Mensalidade</th><th scope="col">Vencimento</th><th scope="col">URL</th><th scope="col">Ações</th></tr></thead><tbody>{pageStores.map((store)=>{
        const warning=trialLabel(store);const isWarning=store.planCode==='DEMO'&&store.subscriptionStatus==='trial'&&!trialExpired(store.expiresAt)&&daysUntil(store.expiresAt)<=platformSettings.demoWarningDays;
        const stage=storeCommercialStage(store,platformSettings.demoWarningDays);
        const paymentOverdue=store.planCode!=='DEMO'&&store.billingMode!=='complimentary'&&isPastDate(store.nextDueDate);
        const expanded=expandedStoreId===store.id;
        return <tr key={store.id} className={`${isWarning?'trial-warning-row ':''}${expanded?'is-expanded':''}`}>
          <td><div className="master-store-cell"><span className={`master-store-dot ${store.accessStatus}`}/><div><strong>{store.name}</strong><small>{getBusinessSegment(store.businessSegment).label}</small><small>{store.city}/{store.state} · {store.ownerName||store.ownerEmail||'sem responsável'}</small>{store.ownerName&&store.ownerEmail&&<small>{store.ownerEmail}</small>}<span className={`commercial-stage-badge ${stage.tone}`}>{stage.label}</span>{warning&&<span className={`trial-expiry-badge ${isWarning?'warning':''}`}>{warning}</span>}</div></div></td>
          <td data-label="Plano"><select className="master-inline-select" aria-label={`Plano de ${store.name}`} value={store.planId||''} disabled={Boolean(rowSaving)||store.billingMode==='introductory'} title={store.billingMode==='introductory'?'Abra Gerenciar para mudar o plano e revisar o acordo.':undefined} onChange={(e)=>void quickUpdate(store,{planId:e.target.value})}>{plans.filter((p)=>(p.active||p.id===store.planId)&&(platformSettings.demoEnabled||p.code!=='DEMO'||p.id===store.planId)).map((p)=><option value={p.id} key={p.id}>{p.name}</option>)}</select><small>{store.subscriptionStatus==='trial'?'Teste':store.subscriptionStatus||'—'}</small></td>
          <td data-label="Acesso"><select className={`master-inline-select access-select ${store.accessStatus}`} aria-label={`Status de ${store.name}`} value={store.accessStatus} disabled={Boolean(rowSaving)} onChange={(e)=>void quickUpdate(store,{accessStatus:e.target.value as StoreAccessStatus})}><option value="online">Online</option><option value="suspended">Desativada</option></select></td>
          <td data-label="Uso"><strong>{store.activeProductCount} ativos</strong><small>{store.productCount} cadastrados · {store.adminUserCount>0?'acesso ativo vinculado':store.ownerEmail?'sem usuário vinculado':'sem acesso principal'}</small></td>
          <td data-label="Mensalidade"><strong>{store.planCode==='DEMO'?'Grátis':store.billingMode==='complimentary'?'Isenta':store.billingMode==='introductory'&&store.introFirstChargeOn&&store.introFirstChargeOn>new Date().toISOString().slice(0,10)?'Cortesia ativa':currency.format(store.billingAmount||0)}</strong><small>{store.planCode==='DEMO'&&store.expiresAt?`até ${new Date(store.expiresAt).toLocaleDateString('pt-BR')}`:store.billingMode==='complimentary'?'acordo individual':store.billingMode==='introductory'?`${currency.format(store.billingAmount||0)}/mês após ${dateBr(store.introFirstChargeOn)}`:'mensal'}</small></td>
          <td data-label="Vencimento"><div className={`master-due-cell-v046 ${paymentOverdue?'is-overdue':''}`}><strong>{store.planCode==='DEMO'||store.billingMode==='complimentary'?'—':store.dueDay?`Dia ${store.dueDay}`:'Não definido'}</strong><small>{store.planCode==='DEMO'?'Demonstração':store.billingMode==='complimentary'?'Sem cobrança recorrente':store.billingMode==='introductory'&&store.introFirstChargeOn&&store.introFirstChargeOn>new Date().toISOString().slice(0,10)?`Primeira cobrança em ${dateBr(store.introFirstChargeOn)}`:store.nextDueDate?`${paymentOverdue?'Atrasado desde':'Próximo'} ${dateBr(store.nextDueDate)}`:'Sem próxima data'}</small></div></td>
          <td data-label="URL"><div className="master-url-cell"><a href={publicUrlFor(store)} target="_blank" rel="noreferrer"><ExternalLink size={15}/>{store.customDomain?'Domínio próprio':`/${store.slug}`}</a><button onClick={()=>void copyText(publicUrlFor(store)).then(()=>showToast('Link copiado.','success'))} aria-label={`Copiar URL de ${store.name}`}><Copy size={14}/></button></div></td>
          <td><div className="master-store-row-actions"><button type="button" className="secondary-button compact-button" onClick={()=>openEdit(store)}>Gerenciar</button><button type="button" className="secondary-button compact-button master-mobile-details" aria-expanded={expanded} aria-label={`Detalhes de ${store.name}`} onClick={()=>setExpandedStoreId(expanded?'':store.id)}>{expanded?'Ocultar detalhes':'Detalhes'}</button></div></td>
        </tr>})}</tbody></table></div><nav className="master-store-pagination" aria-label="Paginação de lojas"><span aria-live="polite">Mostrando {firstResult+1}–{Math.min(firstResult+STORE_PAGE_SIZE,filtered.length)} de {filtered.length} lojas</span><div><button type="button" className="secondary-button compact-button" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>Anterior</button><span>Página {currentPage} de {pageCount}</span><button type="button" className="secondary-button compact-button" disabled={currentPage===pageCount} onClick={()=>setPage(currentPage+1)}>Próxima</button></div></nav></>}
    </section>

    {creating&&<div className="modal-overlay"><form className="master-modal master-modal--wide" role="dialog" aria-modal="true" aria-labelledby="master-create-title" onSubmit={createStore}><button type="button" className="modal-close" aria-label="Fechar criação de loja" disabled={saving} onClick={()=>setCreating(false)}><X/></button><h2 id="master-create-title">Criar loja e acesso do responsável</h2><p>Escolha como o responsável receberá o acesso. O catálogo, os pedidos e a equipe ficam separados por loja.</p>
      {createFunctionReady===false&&<div className="master-warning"><TriangleAlert size={18}/><span>Não será possível concluir enquanto <code>food-platform-create-store</code> não estiver publicada no Supabase.</span></div>}
      <div className="form-grid">
        <label className="full">Nome da loja<input required minLength={2} maxLength={120} value={createForm.name} onChange={(e)=>setCreateForm((f)=>({...f,name:e.target.value,slug:f.slug||slugify(e.target.value)}))}/></label>
        <div className="full"><BusinessSegmentPicker compact value={createForm.businessSegment} onChange={(businessSegment)=>setCreateForm((current)=>({...current,businessSegment,credentialMode:businessSegment==='fitness'?'invite':current.credentialMode,planId:businessSegment==='fitness'?(selectableCreatePlans.find(plan=>plan.code==='PROFESSIONAL')?.id||current.planId):current.planId,billingExempt:businessSegment==='fitness'?true:false}))}/></div>
        <label>Slug / endereço<input required value={createForm.slug} onChange={(e)=>setCreateForm((f)=>({...f,slug:slugify(e.target.value)}))}/></label>
        <label>Plano<select value={createForm.planId} onChange={(e)=>{const plan=plans.find((p)=>p.id===e.target.value);setCreateForm((f)=>({...f,planId:e.target.value,customDomain:plan?.customDomain?f.customDomain:''}))}}>{selectableCreatePlans.map((p)=><option value={p.id} key={p.id}>{p.name} · {p.code==='DEMO'?'grátis':`${currency.format(p.monthlyPrice||0)}/mês`}</option>)}</select></label>
        {!platformSettings.demoEnabled&&<div className="full demo-plan-create-note demo-disabled-note"><strong>Novas Demos estão desabilitadas</strong><span>Você pode habilitar novamente em Admin Master → Planos. Clientes que já estão em Demo continuam normalmente.</span></div>}
        {selectedCreatePlan?.code==='DEMO'&&<div className="full demo-plan-create-note"><strong>Demonstração por {platformSettings.demoDurationDays} dias</strong><span>O Admin Master será avisado {platformSettings.demoWarningDays} dias antes do vencimento. Ao vencer, vitrine e painel serão pausados automaticamente, preservando todos os dados.</span></div>}
        <label>Responsável<input required value={createForm.ownerName} onChange={(e)=>setCreateForm((f)=>({...f,ownerName:e.target.value}))}/></label>
        <label>E-mail do responsável<input required type="email" value={createForm.ownerEmail} onChange={(e)=>setCreateForm((f)=>({...f,ownerEmail:e.target.value}))} placeholder="nome@gmail.com"/><small className={emailError?'field-help-error':''}>{emailError||'Aceita Gmail, Outlook/Hotmail e domínios corporativos. Formato, domínios de teste/temporários e erros comuns são validados; o convite confirma a caixa postal.'}</small></label>
        <label>Cidade<input required value={createForm.city} onChange={(e)=>setCreateForm((f)=>({...f,city:e.target.value}))}/></label>
        <label>UF<input required maxLength={2} value={createForm.state} onChange={(e)=>setCreateForm((f)=>({...f,state:e.target.value.toUpperCase()}))}/></label>
        {createForm.businessSegment==='fitness'&&selectedCreatePlan?.code!=='DEMO'&&<label className="full checkbox-row"><input type="checkbox" checked={createForm.billingExempt} onChange={(e)=>setCreateForm((f)=>({...f,billingExempt:e.target.checked}))}/>Isentar integralmente este piloto de cobrança do plano selecionado</label>}
        {selectedCreatePlan?.code!=='DEMO'&&!createForm.billingExempt&&<label>Vencimento mensal<input type="number" min="1" max="31" value={createForm.dueDay} onChange={(e)=>setCreateForm((f)=>({...f,dueDay:Number(e.target.value)}))}/></label>}
        <label>Status<select value={createForm.accessStatus} onChange={(e)=>setCreateForm((f)=>({...f,accessStatus:e.target.value as StoreAccessStatus}))}><option value="online">Online</option><option value="suspended">Desativada</option></select></label>
        <label className="full">Domínio próprio <span className="optional-label">{selectedCreatePlan?.customDomain?'opcional':'não incluído no plano'}</span><input value={createForm.customDomain} disabled={!selectedCreatePlan?.customDomain} onChange={(e)=>setCreateForm((f)=>({...f,customDomain:e.target.value}))} placeholder="pedidos.sualoja.com.br"/><small>{selectedCreatePlan?.customDomain?`Se vazio, será usada a URL padrão /${createForm.slug||'nome-da-loja'}.`:'Selecione um plano que inclua domínio próprio para habilitar este campo.'}</small></label>
      </div>

      <div className="credential-setup-card"><span className="eyebrow">ACESSO DO RESPONSÁVEL</span><div className="credential-choice-grid"><label className={createForm.credentialMode==='invite'?'selected':''}><input type="radio" name="credentialMode" checked={createForm.credentialMode==='invite'} onChange={()=>setCreateForm((f)=>({...f,credentialMode:'invite',temporaryPassword:''}))}/><div><strong>Enviar convite por e-mail</strong><span>Recomendado. O cliente recebe o link e define a própria senha.</span></div></label><label className={createForm.credentialMode==='temporary_password'?'selected':''}><input type="radio" name="credentialMode" checked={createForm.credentialMode==='temporary_password'} disabled={createForm.businessSegment==='fitness'} onChange={()=>setCreateForm((f)=>({...f,credentialMode:'temporary_password'}))}/><div><strong>Cadastrar senha temporária</strong><span>{createForm.businessSegment==='fitness'?'Fitness/Academia usa apenas convite seguro.':'Útil quando você estiver fazendo a implantação junto com o cliente. Confirme o e-mail diretamente com o responsável, pois sem envio não é possível provar que a caixa postal específica existe.'}</span></div></label></div>
        {createForm.credentialMode==='temporary_password'&&<div className="temporary-password-grid"><label>Senha temporária<div className="input-with-icon"><KeyRound size={17}/><input required minLength={10} value={createForm.temporaryPassword} onChange={(e)=>setCreateForm((f)=>({...f,temporaryPassword:e.target.value}))} type={showPassword?'text':'password'} autoComplete="new-password"/><button type="button" onClick={()=>setShowPassword((v)=>!v)} aria-label="Mostrar senha">{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div><small className={passwordError?'field-help-error':''}>{passwordError||'Mínimo 10 caracteres, com maiúscula, minúscula e número.'}</small></label><label>Confirmar senha<input required minLength={10} value={confirmTemporaryPassword} onChange={(e)=>setConfirmTemporaryPassword(e.target.value)} type={showPassword?'text':'password'} autoComplete="new-password"/></label><label className="full checkbox-row"><input type="checkbox" checked={createForm.forcePasswordChange} onChange={(e)=>setCreateForm((f)=>({...f,forcePasswordChange:e.target.checked}))}/>Exigir troca da senha no primeiro acesso</label></div>}
      </div>

      <div className="master-modal-actions"><button type="button" className="secondary-button" onClick={()=>setCreating(false)}>Cancelar</button><button className="primary-button" disabled={saving||createFunctionReady===false||Boolean(emailError)||Boolean(passwordError)}>{saving?'Criando...':createForm.credentialMode==='invite'?'Criar loja e enviar convite':'Criar loja e usuário'}</button></div>
    </form></div>}

    {editing&&<div className="modal-overlay"><div className="master-modal master-modal--wide" role="dialog" aria-modal="true" aria-labelledby="master-edit-title"><button type="button" className="modal-close" aria-label="Fechar gestão da loja" disabled={saving||credentialSaving} onClick={()=>setEditing(null)}><X/></button><h2 id="master-edit-title">{editing.name}</h2><div className="master-store-identity"><strong>Administrando esta loja</strong><a href={publicUrlFor(editing)} target="_blank" rel="noreferrer">/{editing.slug}</a><span>{[editing.city,editing.state].filter(Boolean).join(' / ')||'Localização não informada'}</span></div><p>Suspender acesso não apaga a loja, produtos, pedidos nem vínculos de usuários. Ao reativar, os acessos anteriores voltam a funcionar.</p>
    <div className="master-client-section-label-v048"><span>PLANO E COBRANÇA</span><small>Configurações comerciais e situação de acesso desta loja.</small></div>
    <div className="form-grid">
      <label>Plano<select value={editing.planId||''} onChange={(e)=>{const plan=plans.find((p)=>p.id===e.target.value);setEditing((s)=>s?{...s,planId:e.target.value,planName:plan?.name,planCode:plan?.code,billingMode:'standard',introFreeMonths:undefined,introFirstChargeOn:undefined,billingAmount:plan?.monthlyPrice??s.billingAmount,expiresAt:plan?.code==='DEMO'?addDaysDate(platformSettings.demoDurationDays):undefined,customDomain:plan?.customDomain?s.customDomain:''}:s)}}>{plans.filter((p)=>platformSettings.demoEnabled||p.code!=='DEMO'||p.id===editing.planId).map((p)=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
      <label>Acesso<select value={editing.accessStatus} onChange={(e)=>setEditing((s)=>s?{...s,accessStatus:e.target.value as StoreAccessStatus}:s)}><option value="online">Online</option><option value="suspended">Desativada / sem acesso</option></select></label>
      {editing.planCode==='DEMO'?<label className="full">Fim da demonstração<input type="date" value={dateOnly(editing.expiresAt)} onChange={(e)=>setEditing((s)=>s?{...s,expiresAt:e.target.value}:s)}/><small>Prazo global atual: {platformSettings.demoDurationDays} dias. Você pode estender ou reduzir este cliente individualmente.</small></label>:<>
        <label className="full">Regra de cobrança<select value={editing.billingMode||'standard'} onChange={(e)=>setEditing((s)=>{if(!s)return s;const billingMode=e.target.value as NonNullable<PlatformStoreSummary['billingMode']>;const plan=plans.find((item)=>item.id===s.planId);return {...s,billingMode,introFreeMonths:billingMode==='introductory'?(s.introFreeMonths||2):undefined,introFirstChargeOn:billingMode==='introductory'?s.introFirstChargeOn:undefined,billingAmount:billingMode==='complimentary'?0:(s.billingAmount||plan?.monthlyPrice||0)};})}>
          <option value="standard">Valor padrão do plano</option><option value="negotiated">Valor negociado para esta loja</option><option value="introductory">Meses grátis, depois valor negociado</option><option value="complimentary">Isenta / não cobrar esta loja</option>
        </select><small>A regra comercial vale só para esta loja e não altera os valores públicos.</small></label>
        {editing.billingMode==='introductory'&&<div className="full master-intro-offer" role="group" aria-label="Cortesia temporária">
          <div><span className="eyebrow">ACORDO DE ENTRADA</span><strong>Cortesia com cobrança programada</strong><p>A loja usa o plano durante o período gratuito. O valor negociado passa a ser cobrado na primeira data indicada abaixo.</p></div>
          <label>Meses grátis<input type="number" min="1" max="24" value={editing.introFreeMonths||''} onChange={(e)=>setEditing((s)=>s?{...s,introFreeMonths:Number(e.target.value)}:s)}/></label>
          <div className="master-intro-offer__preview"><span>Primeira cobrança</span><strong>{introPreview?dateBr(introPreview):'Revise meses e vencimento'}</strong><small>Sem cobrança antes desta data</small></div>
        </div>}
        {editing.billingMode!=='complimentary'&&<label>Mensalidade {editing.billingMode==='introductory'?'após a cortesia':''}<input type="number" min="0.01" step="0.01" value={editing.billingAmount||0} onChange={(e)=>setEditing((s)=>s?{...s,billingAmount:Number(e.target.value),billingMode:s.billingMode==='introductory'?'introductory':'negotiated'}:s)}/><small>O valor será usado nas renovações deste plano.</small></label>}
        <label>Dia de vencimento<input type="number" min="1" max={editing.billingMode==='introductory'?28:31} disabled={editing.billingMode==='complimentary'} value={editing.dueDay??10} onChange={(e)=>setEditing((s)=>s?{...s,dueDay:Number(e.target.value)}:s)}/><small>{editing.billingMode==='complimentary'?'Sem vencimento enquanto houver isenção.':editing.billingMode==='introductory'?'O primeiro vencimento será neste dia, após completar os meses grátis.':'O próximo vencimento será realinhado para este dia.'}</small></label>
      </>}
      <label className="full">Domínio próprio <span className="optional-label">{selectedEditPlan?.customDomain?'opcional':'não incluído no plano'}</span><input value={editing.customDomain||''} disabled={!selectedEditPlan?.customDomain} onChange={(e)=>setEditing((s)=>s?{...s,customDomain:e.target.value}:s)} placeholder="pedidos.sualoja.com.br"/><small>{selectedEditPlan?.customDomain?'Domínio provisionado manualmente no Cloudflare nesta primeira versão.':'Ao salvar um plano sem este recurso, o domínio próprio ativo será removido.'}</small></label>
      {editing.accessStatus==='suspended'&&<label className="full">Motivo interno da suspensão<textarea value={editing.suspensionReason||''} onChange={(e)=>setEditing((s)=>s?{...s,suspensionReason:e.target.value}:s)} placeholder="Visível somente para o Admin Master."/></label>}
    </div>
    <details className="operational-details master-segment-details"><summary>Segmento da loja: {getBusinessSegment(editing.businessSegment).label}</summary><div className="master-segment-disclosure"><BusinessSegmentPicker compact value={editing.businessSegment || 'food'} onChange={(businessSegment)=>setEditing(current=>current?{...current,businessSegment}:current)}/></div></details>
    <details className="operational-details master-access-details"><summary>Alterar e-mail ou senha do lojista</summary><div className="credential-setup-card master-credential-edit-v048">
      <div className="master-credential-edit-head-v048"><KeyRound size={21}/><div><span className="eyebrow">ACESSO DO LOJISTA</span><strong>E-mail e senha de acesso</strong><small>Use esta área quando o lojista perder o acesso ou precisar trocar o e-mail. A senha só será alterada se você preencher os dois campos de nova senha.</small></div></div>
      {editing.adminUserCount===0&&<div className="master-warning"><TriangleAlert size={18}/><span>Esta loja não tem usuário ativo vinculado. Confirme que o e-mail acima pertence ao responsável cadastrado; ao salvar, a conta existente receberá acesso de proprietário.</span></div>}
      {credentialFunctionReady===false&&<div className="master-warning"><TriangleAlert size={18}/><span>{credentialFunctionError||'Publique food-platform-manage-store-user antes de alterar o acesso.'}</span></div>}
      <div className="master-credential-grid-v048">
        <label className="full">E-mail de acesso<input type="email" value={editAccessForm.email} onChange={(e)=>setEditAccessForm((f)=>({...f,email:e.target.value}))}/><small className={editEmailError?'field-help-error':''}>{editEmailError||'Este será o e-mail usado no login do painel do lojista.'}</small></label>
        {editing.adminUserCount===0&&<label className="full checkbox-row"><input type="checkbox" checked={editAccessForm.linkOwner} onChange={(e)=>setEditAccessForm((f)=>({...f,linkOwner:e.target.checked}))}/>Confirmo que devo vincular este e-mail como proprietário desta loja</label>}
        <label>Nova senha <span className="optional-label">opcional</span><div className="input-with-icon"><KeyRound size={17}/><input minLength={10} value={editAccessForm.password} onChange={(e)=>setEditAccessForm((f)=>({...f,password:e.target.value}))} type={showEditPassword?'text':'password'} autoComplete="new-password" placeholder="Deixe vazio para manter a atual"/><button type="button" onClick={()=>setShowEditPassword((v)=>!v)} aria-label="Mostrar nova senha">{showEditPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div><small className={editPasswordError?'field-help-error':''}>{editPasswordError||'Mínimo 10 caracteres, com maiúscula, minúscula e número.'}</small></label>
        <label>Confirmar nova senha<input minLength={10} value={editAccessForm.confirmPassword} onChange={(e)=>setEditAccessForm((f)=>({...f,confirmPassword:e.target.value}))} type={showEditPassword?'text':'password'} autoComplete="new-password" disabled={!editAccessForm.password}/></label>
        <label className="full checkbox-row"><input type="checkbox" checked={editAccessForm.forcePasswordChange} onChange={(e)=>setEditAccessForm((f)=>({...f,forcePasswordChange:e.target.checked}))} disabled={!editAccessForm.password}/>Exigir troca da senha no próximo acesso</label>
      </div>
      <div className="master-credential-edit-action-v048"><button type="button" className="primary-button" disabled={credentialSaving||credentialFunctionReady===false||Boolean(editEmailError)||Boolean(editPasswordError)||Boolean(editAccessForm.password&&editAccessForm.password!==editAccessForm.confirmPassword)} onClick={()=>void saveCredentials()}>{credentialSaving?'Atualizando acesso...':'Salvar e-mail / senha'}</button></div>
    </div></details>
    <div className="master-modal-actions"><button className="secondary-button" onClick={()=>setEditing(null)}>Cancelar</button><button className="primary-button" disabled={saving} onClick={()=>void saveEdit()}>{saving?'Salvando...':'Salvar alterações'}</button></div></div></div>}
  </>;
}
