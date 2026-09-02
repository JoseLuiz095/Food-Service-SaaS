import { CloudCog, Copy, ExternalLink, Eye, EyeOff, KeyRound, Plus, Search, TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { platformApi } from '../../services/platformApi';
import type { Plan, PlatformSettings, PlatformStoreSummary, StoreAccessStatus, StoreCredentialMode } from '../../types';
import { currency, slugify } from '../../utils/format';
import { copyText } from '../../utils/clipboard';
import { emailValidationMessage, normalizeEmail, temporaryPasswordValidationMessage } from '../../utils/email';

const publicUrlFor = (store: PlatformStoreSummary) => store.customDomain ? `https://${store.customDomain}` : `${window.location.origin}/${store.slug}`;
const dateOnly = (value?: string) => value ? value.slice(0,10) : '';
const daysUntil = (value?: string) => value ? Math.max(0, Math.ceil((new Date(value).getTime()-Date.now())/86_400_000)) : Number.POSITIVE_INFINITY;
const trialExpired = (value?: string) => Boolean(value) && new Date(value as string).getTime() <= Date.now();
const addDaysDate = (days:number) => { const d=new Date(); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); };

const trialLabel=(store:PlatformStoreSummary)=>{
  if(store.planCode!=='DEMO'||store.subscriptionStatus!=='trial'||!store.expiresAt)return '';
  if(trialExpired(store.expiresAt))return 'Demo vencida';
  const days=daysUntil(store.expiresAt);
  if(days===0)return 'Demo vence hoje';
  if(days===1)return 'Demo vence amanhã';
  return `Demo vence em ${days} dias`;
};

const defaultSettings: PlatformSettings={demoEnabled:true,demoDurationDays:30,demoWarningDays:7};

type StoreFilter='all'|'paying'|'trial'|'onboarding'|'attention'|'suspended';
const storeCommercialStage=(store:PlatformStoreSummary,warningDays:number)=>{
  if(store.accessStatus==='suspended')return {key:'suspended' as const,label:'Suspensa',tone:'danger'};
  if(store.planCode==='DEMO'&&store.subscriptionStatus==='trial'&&(trialExpired(store.expiresAt)||daysUntil(store.expiresAt)<=warningDays))return {key:'attention' as const,label:'Atenção comercial',tone:'warning'};
  if(store.activeProductCount===0)return {key:'onboarding' as const,label:'Implantação',tone:'neutral'};
  if(store.planCode==='DEMO'&&store.subscriptionStatus==='trial')return {key:'trial' as const,label:'Demonstração',tone:'info'};
  return {key:'paying' as const,label:'Cliente ativo',tone:'success'};
};

export default function MasterStores(){
  const {showToast}=useToast();
  const[stores,setStores]=useState<PlatformStoreSummary[]>([]);
  const[plans,setPlans]=useState<Plan[]>([]);
  const[platformSettings,setPlatformSettings]=useState<PlatformSettings>(defaultSettings);
  const[loading,setLoading]=useState(true);
  const[query,setQuery]=useState('');
  const[filter,setFilter]=useState<StoreFilter>('all');
  const[editing,setEditing]=useState<PlatformStoreSummary|null>(null);
  const[creating,setCreating]=useState(false);
  const[saving,setSaving]=useState(false);
  const[rowSaving,setRowSaving]=useState('');
  const[createFunctionReady,setCreateFunctionReady]=useState<boolean|null>(null);
  const[createFunctionError,setCreateFunctionError]=useState('');
  const[showPassword,setShowPassword]=useState(false);
  const[confirmTemporaryPassword,setConfirmTemporaryPassword]=useState('');
  const[createForm,setCreateForm]=useState({
    name:'',slug:'',city:'Linhares',state:'ES',ownerName:'',ownerEmail:'',planId:'',accessStatus:'online' as StoreAccessStatus,
    dueDay:10,customDomain:'',credentialMode:'invite' as StoreCredentialMode,temporaryPassword:'',forcePasswordChange:true,
  });

  const reload=async()=>{
    setLoading(true);
    try{
      const[p,s,settings]=await Promise.all([platformApi.listPlans(),platformApi.listStores(),platformApi.getPlatformSettings()]);
      setPlans(p);setStores(s);setPlatformSettings(settings);
      const selectablePlans=p.filter((plan)=>plan.active&&(settings.demoEnabled||plan.code!=='DEMO'));
      setCreateForm((f)=>({...f,planId:selectablePlans.some((plan)=>plan.id===f.planId)?f.planId:(selectablePlans.find((x)=>x.code==='BASIC')?.id||selectablePlans[0]?.id||'')}));
    }catch(e){showToast(e instanceof Error?e.message:'Falha ao carregar lojas.','error')}
    finally{setLoading(false)}
  };

  const checkCreateFunction=async()=>{
    try{
      const health=await platformApi.createStoreFunctionHealth();
      setCreateFunctionReady(Boolean(health.ok&&health.configured));
      setCreateFunctionError(health.ok&&health.configured?'':'A função está publicada, mas as variáveis internas do Supabase não estão disponíveis.');
    }catch(e){setCreateFunctionReady(false);setCreateFunctionError(e instanceof Error?e.message:'Edge Function indisponível.')}
  };

  useEffect(()=>{void reload();void checkCreateFunction()},[]);

  const commercialCounts=useMemo(()=>{
    const counts:Record<StoreFilter,number>={all:stores.length,paying:0,trial:0,onboarding:0,attention:0,suspended:0};
    for(const store of stores)counts[storeCommercialStage(store,platformSettings.demoWarningDays).key]++;
    return counts;
  },[stores,platformSettings.demoWarningDays]);

  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return stores.filter((store)=>{
      const matchesQuery=!q||`${store.name} ${store.slug} ${store.city} ${store.ownerEmail||''} ${store.planName||''}`.toLowerCase().includes(q);
      const stage=storeCommercialStage(store,platformSettings.demoWarningDays);
      return matchesQuery&&(filter==='all'||stage.key===filter);
    });
  },[stores,query,filter,platformSettings.demoWarningDays]);

  const selectableCreatePlans=plans.filter((plan)=>plan.active&&(platformSettings.demoEnabled||plan.code!=='DEMO'));
  const selectedCreatePlan=plans.find((plan)=>plan.id===createForm.planId);
  const selectedEditPlan=editing?plans.find((plan)=>plan.id===editing.planId):undefined;
  const emailError=createForm.ownerEmail?emailValidationMessage(createForm.ownerEmail):'';
  const passwordError=createForm.credentialMode==='temporary_password'&&createForm.temporaryPassword?temporaryPasswordValidationMessage(createForm.temporaryPassword):'';

  const saveEdit=async()=>{
    if(!editing)return;
    setSaving(true);
    try{
      const plan=plans.find((p)=>p.id===editing.planId);
      await platformApi.updateStore({
        storeId:editing.id,planId:editing.planId||'',accessStatus:editing.accessStatus,billingAmount:editing.billingAmount??plan?.monthlyPrice??0,
        dueDay:editing.dueDay||10,nextDueDate:editing.nextDueDate,expiresAt:editing.expiresAt,customDomain:editing.customDomain,suspensionReason:editing.suspensionReason,
      });
      showToast('Loja atualizada.','success');setEditing(null);await reload();
    }catch(e){showToast(e instanceof Error?e.message:'Falha ao atualizar loja.','error')}
    finally{setSaving(false)}
  };

  const quickUpdate=async(store:PlatformStoreSummary,patch:Partial<PlatformStoreSummary>)=>{
    const next={...store,...patch};
    if(patch.accessStatus==='suspended'&&store.accessStatus!=='suspended'&&!window.confirm(`Suspender ${store.name}? A vitrine e o painel do cliente ficarão indisponíveis. A loja, pedidos, produtos e vínculos de usuários serão preservados para uma futura reativação.`))return;
    if(patch.accessStatus==='online'&&store.planCode==='DEMO'&&trialExpired(store.expiresAt)){
      if(!window.confirm(`A demonstração de ${store.name} já venceu. Reativar por mais ${platformSettings.demoDurationDays} dias?`))return;
      next.expiresAt=addDaysDate(platformSettings.demoDurationDays);
    }
    setRowSaving(store.id);
    try{
      const plan=plans.find((p)=>p.id===next.planId);
      const billingAmount=patch.planId!==undefined?(plan?.monthlyPrice??next.billingAmount??0):(next.billingAmount??plan?.monthlyPrice??0);
      await platformApi.updateStore({
        storeId:store.id,planId:next.planId||'',accessStatus:next.accessStatus,billingAmount,dueDay:next.dueDay||10,nextDueDate:next.nextDueDate,
        expiresAt:next.expiresAt,customDomain:next.customDomain,suspensionReason:next.suspensionReason,
      });
      showToast(patch.planId!==undefined?'Plano atualizado.':'Status da loja atualizado.','success');await reload();
    }catch(e){showToast(e instanceof Error?e.message:'Falha ao atualizar loja.','error')}
    finally{setRowSaving('')}
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
      const result=await platformApi.createStore({...createForm,ownerEmail:normalizeEmail(createForm.ownerEmail),slug:createForm.slug||slugify(createForm.name),appOrigin:window.location.origin});
      if(result.warning)showToast(result.warning,'info');
      else if(result.existingUser)showToast('Loja criada e vinculada ao usuário que já existia no Supabase Auth.','success');
      else if(result.createdWithPassword)showToast('Loja e usuário criados com senha temporária. O cliente deverá trocá-la no primeiro acesso.','success');
      else if(result.invited)showToast('Loja criada e convite enviado ao responsável.','success');
      else showToast('Loja criada.','success');
      setCreating(false);setConfirmTemporaryPassword('');
      setCreateForm((f)=>({...f,name:'',slug:'',ownerName:'',ownerEmail:'',customDomain:'',temporaryPassword:'',credentialMode:'invite',forcePasswordChange:true}));
      await reload();
    }catch(err){showToast(err instanceof Error?err.message:'Falha ao criar loja.','error')}
    finally{setSaving(false)}
  };

  return <>
    <div className="admin-page-title"><div><span className="eyebrow">CLIENTES</span><h1>Lojas e assinaturas</h1><p>Crie estabelecimentos, escolha o plano e suspenda o acesso sem apagar nenhum dado.</p></div><button className="primary-button" onClick={()=>setCreating(true)}><Plus size={18}/>Nova loja</button></div>

    {createFunctionReady===false&&<section className="admin-card master-service-alert"><TriangleAlert size={22}/><div><strong>Criação automática de lojas indisponível</strong><p>{createFunctionError}</p><small>O frontend está publicado, mas a Edge Function do Supabase não está disponível. Vá em <b>Diagnóstico</b> para ver o comando de deploy.</small></div></section>}
    {createFunctionReady===true&&<div className="master-service-ok"><CloudCog size={16}/> Serviço de criação de lojas disponível</div>}

    <section className="admin-card no-padding master-store-table">
      <div className="master-client-toolbar"><div className="table-toolbar"><div className="admin-search"><Search size={18}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Buscar loja, responsável, plano ou cidade..."/></div><span>{filtered.length} de {stores.length} lojas</span></div><div className="master-client-filters" aria-label="Filtrar clientes por etapa comercial">{([['all','Todas'],['paying','Pagantes'],['trial','Demos'],['onboarding','Implantação'],['attention','Atenção'],['suspended','Suspensas']] as [StoreFilter,string][]).map(([key,label])=><button type="button" key={key} className={filter===key?'active':''} onClick={()=>setFilter(key)}><span>{label}</span><b>{commercialCounts[key]}</b></button>)}</div></div>
      {loading?<div className="master-table-loading">Carregando...</div>:<div className="responsive-table"><table><thead><tr><th>Loja</th><th>Plano</th><th>Acesso</th><th>Uso</th><th>Mensalidade</th><th>URL</th><th></th></tr></thead><tbody>{filtered.map((store)=>{
        const warning=trialLabel(store);const isWarning=store.planCode==='DEMO'&&store.subscriptionStatus==='trial'&&!trialExpired(store.expiresAt)&&daysUntil(store.expiresAt)<=platformSettings.demoWarningDays;
        const stage=storeCommercialStage(store,platformSettings.demoWarningDays);
        return <tr key={store.id} className={isWarning?'trial-warning-row':''}><td><div className="master-store-cell"><span className={`master-store-dot ${store.accessStatus}`}/><div><strong>{store.name}</strong><small>{store.city}/{store.state} · {store.ownerEmail||'sem responsável'}</small><span className={`commercial-stage-badge ${stage.tone}`}>{stage.label}</span>{warning&&<span className={`trial-expiry-badge ${isWarning?'warning':''}`}>{warning}</span>}</div></div></td><td><select className="master-inline-select" aria-label={`Plano de ${store.name}`} value={store.planId||''} disabled={rowSaving===store.id} onChange={(e)=>void quickUpdate(store,{planId:e.target.value})}>{plans.filter((p)=>(p.active||p.id===store.planId)&&(platformSettings.demoEnabled||p.code!=='DEMO'||p.id===store.planId)).map((p)=><option value={p.id} key={p.id}>{p.name}</option>)}</select><small>{store.subscriptionStatus==='trial'?'Teste':store.subscriptionStatus||'—'}</small></td><td><select className={`master-inline-select access-select ${store.accessStatus}`} aria-label={`Status de ${store.name}`} value={store.accessStatus} disabled={rowSaving===store.id} onChange={(e)=>void quickUpdate(store,{accessStatus:e.target.value as StoreAccessStatus})}><option value="online">Online</option><option value="suspended">Desativada</option></select></td><td><strong>{store.activeProductCount} ativos</strong><small>{store.productCount} cadastrados · {store.adminUserCount} usuário(s)</small></td><td><strong>{store.planCode==='DEMO'?'Grátis':currency.format(store.billingAmount||0)}</strong><small>{store.planCode==='DEMO'&&store.expiresAt?`até ${new Date(store.expiresAt).toLocaleDateString('pt-BR')}`:store.dueDay?`vence dia ${store.dueDay}`:'sem vencimento'}</small></td><td><div className="master-url-cell"><a href={publicUrlFor(store)} target="_blank" rel="noreferrer"><ExternalLink size={15}/>{store.customDomain?'Domínio próprio':`/${store.slug}`}</a><button onClick={()=>void copyText(publicUrlFor(store)).then(()=>showToast('Link copiado.','success'))} aria-label="Copiar URL"><Copy size={14}/></button></div></td><td><button className="secondary-button compact-button" onClick={()=>setEditing({...store})}>Gerenciar</button></td></tr>})}</tbody></table></div>}
    </section>

    {creating&&<div className="modal-overlay"><form className="master-modal master-modal--wide" onSubmit={createStore}><button type="button" className="modal-close" onClick={()=>setCreating(false)}><X/></button><span className="eyebrow">NOVO ESTABELECIMENTO</span><h2>Criar loja e acesso do responsável</h2><p>Produtos e pedidos serão isolados pelo novo <code>store_id</code>. Escolha se o cliente receberá convite ou uma senha temporária cadastrada por você.</p>
      {createFunctionReady===false&&<div className="master-warning"><TriangleAlert size={18}/><span>Não será possível concluir enquanto <code>food-platform-create-store</code> não estiver publicada no Supabase.</span></div>}
      <div className="form-grid">
        <label className="full">Nome da loja<input required value={createForm.name} onChange={(e)=>setCreateForm((f)=>({...f,name:e.target.value,slug:f.slug||slugify(e.target.value)}))}/></label>
        <label>Slug / endereço<input required value={createForm.slug} onChange={(e)=>setCreateForm((f)=>({...f,slug:slugify(e.target.value)}))}/></label>
        <label>Plano<select value={createForm.planId} onChange={(e)=>{const plan=plans.find((p)=>p.id===e.target.value);setCreateForm((f)=>({...f,planId:e.target.value,customDomain:plan?.customDomain?f.customDomain:''}))}}>{selectableCreatePlans.map((p)=><option value={p.id} key={p.id}>{p.name} · {p.code==='DEMO'?'grátis':`${currency.format(p.monthlyPrice||0)}/mês`}</option>)}</select></label>
        {!platformSettings.demoEnabled&&<div className="full demo-plan-create-note demo-disabled-note"><strong>Novas Demos estão desabilitadas</strong><span>Você pode habilitar novamente em Admin Master → Planos. Clientes que já estão em Demo continuam normalmente.</span></div>}
        {selectedCreatePlan?.code==='DEMO'&&<div className="full demo-plan-create-note"><strong>Demonstração por {platformSettings.demoDurationDays} dias</strong><span>O Admin Master será avisado {platformSettings.demoWarningDays} dias antes do vencimento. Ao vencer, vitrine e painel serão pausados automaticamente, preservando todos os dados.</span></div>}
        <label>Responsável<input required value={createForm.ownerName} onChange={(e)=>setCreateForm((f)=>({...f,ownerName:e.target.value}))}/></label>
        <label>E-mail do responsável<input required type="email" value={createForm.ownerEmail} onChange={(e)=>setCreateForm((f)=>({...f,ownerEmail:e.target.value}))} placeholder="nome@gmail.com"/><small className={emailError?'field-help-error':''}>{emailError||'Aceita Gmail, Outlook/Hotmail e domínios corporativos. Formato, domínios de teste/temporários e erros comuns são validados; o convite confirma a caixa postal.'}</small></label>
        <label>Cidade<input required value={createForm.city} onChange={(e)=>setCreateForm((f)=>({...f,city:e.target.value}))}/></label>
        <label>UF<input required maxLength={2} value={createForm.state} onChange={(e)=>setCreateForm((f)=>({...f,state:e.target.value.toUpperCase()}))}/></label>
        {selectedCreatePlan?.code!=='DEMO'&&<label>Vencimento mensal<input type="number" min="1" max="28" value={createForm.dueDay} onChange={(e)=>setCreateForm((f)=>({...f,dueDay:Number(e.target.value)}))}/></label>}
        <label>Status<select value={createForm.accessStatus} onChange={(e)=>setCreateForm((f)=>({...f,accessStatus:e.target.value as StoreAccessStatus}))}><option value="online">Online</option><option value="suspended">Desativada</option></select></label>
        <label className="full">Domínio próprio <span className="optional-label">{selectedCreatePlan?.customDomain?'opcional':'não incluído no plano'}</span><input value={createForm.customDomain} disabled={!selectedCreatePlan?.customDomain} onChange={(e)=>setCreateForm((f)=>({...f,customDomain:e.target.value}))} placeholder="pedidos.sualoja.com.br"/><small>{selectedCreatePlan?.customDomain?`Se vazio, será usada a URL padrão /${createForm.slug||'nome-da-loja'}.`:'Selecione um plano que inclua domínio próprio para habilitar este campo.'}</small></label>
      </div>

      <div className="credential-setup-card"><span className="eyebrow">ACESSO DO RESPONSÁVEL</span><div className="credential-choice-grid"><label className={createForm.credentialMode==='invite'?'selected':''}><input type="radio" name="credentialMode" checked={createForm.credentialMode==='invite'} onChange={()=>setCreateForm((f)=>({...f,credentialMode:'invite',temporaryPassword:''}))}/><div><strong>Enviar convite por e-mail</strong><span>Recomendado. O cliente recebe o link e define a própria senha.</span></div></label><label className={createForm.credentialMode==='temporary_password'?'selected':''}><input type="radio" name="credentialMode" checked={createForm.credentialMode==='temporary_password'} onChange={()=>setCreateForm((f)=>({...f,credentialMode:'temporary_password'}))}/><div><strong>Cadastrar senha temporária</strong><span>Útil quando você estiver fazendo a implantação junto com o cliente. Confirme o e-mail diretamente com o responsável, pois sem envio não é possível provar que a caixa postal específica existe.</span></div></label></div>
        {createForm.credentialMode==='temporary_password'&&<div className="temporary-password-grid"><label>Senha temporária<div className="input-with-icon"><KeyRound size={17}/><input required minLength={10} value={createForm.temporaryPassword} onChange={(e)=>setCreateForm((f)=>({...f,temporaryPassword:e.target.value}))} type={showPassword?'text':'password'} autoComplete="new-password"/><button type="button" onClick={()=>setShowPassword((v)=>!v)} aria-label="Mostrar senha">{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div><small className={passwordError?'field-help-error':''}>{passwordError||'Mínimo 10 caracteres, com maiúscula, minúscula e número.'}</small></label><label>Confirmar senha<input required minLength={10} value={confirmTemporaryPassword} onChange={(e)=>setConfirmTemporaryPassword(e.target.value)} type={showPassword?'text':'password'} autoComplete="new-password"/></label><label className="full checkbox-row"><input type="checkbox" checked={createForm.forcePasswordChange} onChange={(e)=>setCreateForm((f)=>({...f,forcePasswordChange:e.target.checked}))}/>Exigir troca da senha no primeiro acesso</label></div>}
      </div>

      <div className="master-modal-actions"><button type="button" className="secondary-button" onClick={()=>setCreating(false)}>Cancelar</button><button className="primary-button" disabled={saving||createFunctionReady===false||Boolean(emailError)||Boolean(passwordError)}>{saving?'Criando...':createForm.credentialMode==='invite'?'Criar loja e enviar convite':'Criar loja e usuário'}</button></div>
    </form></div>}

    {editing&&<div className="modal-overlay"><div className="master-modal"><button type="button" className="modal-close" onClick={()=>setEditing(null)}><X/></button><span className="eyebrow">GESTÃO DO CLIENTE</span><h2>{editing.name}</h2><p>Suspender acesso não apaga a loja, produtos, pedidos nem vínculos de usuários. Ao reativar, os acessos anteriores voltam a funcionar.</p><div className="form-grid">
      <label>Plano<select value={editing.planId||''} onChange={(e)=>{const plan=plans.find((p)=>p.id===e.target.value);setEditing((s)=>s?{...s,planId:e.target.value,planName:plan?.name,planCode:plan?.code,billingAmount:plan?.monthlyPrice??s.billingAmount,expiresAt:plan?.code==='DEMO'?addDaysDate(platformSettings.demoDurationDays):undefined,customDomain:plan?.customDomain?s.customDomain:''}:s)}}>{plans.filter((p)=>platformSettings.demoEnabled||p.code!=='DEMO'||p.id===editing.planId).map((p)=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
      <label>Acesso<select value={editing.accessStatus} onChange={(e)=>setEditing((s)=>s?{...s,accessStatus:e.target.value as StoreAccessStatus}:s)}><option value="online">Online</option><option value="suspended">Desativada / sem acesso</option></select></label>
      {editing.planCode==='DEMO'?<label className="full">Fim da demonstração<input type="date" value={dateOnly(editing.expiresAt)} onChange={(e)=>setEditing((s)=>s?{...s,expiresAt:e.target.value}:s)}/><small>Prazo global atual: {platformSettings.demoDurationDays} dias. Você pode estender ou reduzir este cliente individualmente.</small></label>:<><label>Mensalidade<input type="number" min="0" step="0.01" value={editing.billingAmount||0} onChange={(e)=>setEditing((s)=>s?{...s,billingAmount:Number(e.target.value)}:s)}/></label><label>Dia de vencimento<input type="number" min="1" max="28" value={editing.dueDay||10} onChange={(e)=>setEditing((s)=>s?{...s,dueDay:Number(e.target.value)}:s)}/></label></>}
      <label className="full">Domínio próprio <span className="optional-label">{selectedEditPlan?.customDomain?'opcional':'não incluído no plano'}</span><input value={editing.customDomain||''} disabled={!selectedEditPlan?.customDomain} onChange={(e)=>setEditing((s)=>s?{...s,customDomain:e.target.value}:s)} placeholder="pedidos.sualoja.com.br"/><small>{selectedEditPlan?.customDomain?'Domínio provisionado manualmente no Cloudflare nesta primeira versão.':'Ao salvar um plano sem este recurso, o domínio próprio ativo será removido.'}</small></label>
      {editing.accessStatus==='suspended'&&<label className="full">Motivo interno da suspensão<textarea value={editing.suspensionReason||''} onChange={(e)=>setEditing((s)=>s?{...s,suspensionReason:e.target.value}:s)} placeholder="Visível somente para o Admin Master."/></label>}
    </div><div className="master-modal-actions"><button className="secondary-button" onClick={()=>setEditing(null)}>Cancelar</button><button className="primary-button" disabled={saving} onClick={()=>void saveEdit()}>{saving?'Salvando...':'Salvar alterações'}</button></div></div></div>}
  </>;
}
