import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { BUSINESS_SEGMENTS, getBusinessSegment, type BusinessSegment } from '../segments/businessSegments';
import { businessApi, moduleLabels, type ModuleCode, type ModuleGrant } from './api';
import { useBusinessStatus } from './useBusinessStatus';
import './business.css';

export default function BusinessModules({master=false}:{master?:boolean}) {
  const {membership}=useAuth();
  const [stores,setStores]=useState<{id:string;name:string}[]>([]);
  const [selected,setSelected]=useState('');
  const store=master?selected:membership?.storeId||'';
  const activeStore=useRef(store);activeStore.current=store;
  const {state,error:loadError,loading,reload}=useBusinessStatus(store);
  const [segment,setSegment]=useState<BusinessSegment>('food');
  const [error,setError]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  const [moduleCode,setModuleCode]=useState<ModuleCode>('clients');
  const [preserveLegacy,setPreserveLegacy]=useState(false);
  const [source,setSource]=useState('exception');const [reason,setReason]=useState('');const [expiry,setExpiry]=useState('');
  useEffect(()=>{if(!master)return;let active=true;void businessApi.master('list',null).then(value=>{if(active){const items=(value.items||[]) as {id:string;name:string}[];setStores(items);setSelected(items[0]?.id||'');}}).catch(e=>{if(active)setError((e as Error).message);});return()=>{active=false;};},[master]);
  useEffect(()=>{setError('');setMessage('');setReason('');setExpiry('');setPreserveLegacy(false);setBusy(false);},[store]);
  useEffect(()=>{if(state?.profile)setSegment(state.profile.primary_segment);},[state?.profile?.primary_segment]);
  const run=async(action:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);setError('');setMessage('');try{await action();if(activeStore.current!==store)return;await reload();if(activeStore.current!==store)return;setMessage('Configuração salva no servidor. Os dados existentes foram preservados.');}catch(e){if(activeStore.current===store)setError((e as Error).message);}finally{if(activeStore.current===store)setBusy(false);}};
  const renderModule=(item:ModuleGrant)=><article key={item.code}><div className="business-card-heading"><h3>{moduleLabels[item.code]||item.code}</h3><span className={`business-badge ${item.effective?'is-active':''}`}>{item.effective?'Disponível':item.enabled?'Concedido · acesso pendente':'Não habilitado'}</span></div><p>{item.source==='segment'?'Incluído no segmento':item.source==='plan'?'Autorizado pelo plano':item.source==='exception'?'Exceção autorizada pelo Master':'Aguardando concessão'}</p><small>Plano: {item.plan_allowed?'permite':'sem concessão deste recurso'}{item.expires_at&&` · até ${new Date(item.expires_at).toLocaleDateString('pt-BR')}`}</small>{item.reason&&<p>{item.reason}</p>}{item.dependencies?.length>0&&<small>Depende de: {item.dependencies.map(code=>moduleLabels[code]||code).join(', ')}</small>}{master&&item.enabled&&<button className="business-text-button" disabled={busy} onClick={()=>void run(()=>businessApi.master('revoke',store,{module_code:item.code,reason:reason.trim()||'Desativação pelo Admin Master'}))}>Desativar preservando dados</button>}</article>;
  const visibleModules=state?.modules.filter(item=>item.effective||item.enabled)||[];
  const hiddenModules=state?.modules.filter(item=>!item.effective&&!item.enabled)||[];
  return <div className="business-workspace"><header className="business-heading"><div><span className="eyebrow">{master?'ADMIN MASTER':'SEU NEGÓCIO'}</span><h1>Segmento e módulos</h1><p>Uma empresa, com as ferramentas certas para sua operação.</p></div>{master&&<label>Negócio<select value={store} disabled={busy} onChange={e=>setSelected(e.target.value)}>{stores.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}</header>
    {(error||loadError)&&<div className="business-message business-message--error" role="alert"><strong>Não foi possível concluir</strong><p>{error||loadError}</p><button type="button" onClick={()=>void reload()}>Tentar novamente</button></div>}
    {message&&<p className="business-message" role="status">{message}</p>}
    {loading&&<p role="status">Consultando regras e permissões…</p>}
    {state&&<><section className="business-card"><div className="business-card-heading"><div><span className="eyebrow">SEGMENTO PRINCIPAL</span><h2>{state.profile?getBusinessSegment(state.profile.primary_segment).label:'Configuração inicial pendente'}</h2></div><span className="business-badge">{state.legacy?'Operação legada preservada':'Regras aplicadas no servidor'}</span></div>
      <p>Escolher o segmento define os recursos iniciais. Módulos complementares não mudam seu ramo nem criam outra loja.</p>
      {(master||state.can_initialize)&&<form className="business-inline-form" onSubmit={e=>{e.preventDefault();void run(()=>master?businessApi.master('set_segment',store,{segment,preserve_legacy:preserveLegacy}):businessApi.initialize(store,segment));}}><label>Segmento principal<select value={segment} onChange={e=>setSegment(e.target.value as BusinessSegment)}>{BUSINESS_SEGMENTS.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}</select></label>{master&&state.legacy&&<label className="business-preserve-legacy"><input type="checkbox" checked={preserveLegacy} onChange={e=>setPreserveLegacy(e.target.checked)}/>Preservar módulos legados ativos como exceções autorizadas</label>}<button className="primary-button" disabled={busy}>{busy?'Salvando…':state.profile?'Atualizar segmento':'Configurar segmento'}</button></form>}
      {!master&&state.profile&&<p className="business-muted">Para mudar o segmento principal ou autorizar outro módulo, fale com o Admin Master. As cores da sua marca continuam em Configurações.</p>}
    </section>
    <section className="business-card"><h2>Ferramentas deste negócio</h2>{visibleModules.length?<div className="business-capabilities">{visibleModules.map(renderModule)}</div>:<p>Os módulos do negócio aparecem aqui quando estiverem habilitados.</p>}
      {hiddenModules.length>0&&<details className="business-disclosure"><summary>Ver outros módulos ({hiddenModules.length})</summary><div className="business-capabilities">{hiddenModules.map(renderModule)}</div></details>}
      {!master&&<div className="business-actions"><Link className="primary-button" to="/admin/operacao">Abrir minha operação</Link><Link className="secondary-button" to="/admin/modulos">Eventos, locações e personalizados</Link></div>}
    </section>
    {master&&<section className="business-card"><h2>Autorizar módulo complementar</h2><p>A autorização vale somente para o negócio selecionado. Dependências e plano são verificados novamente pelo servidor.</p><form className="business-form-grid" onSubmit={e=>{e.preventDefault();void run(()=>businessApi.master('grant',store,{module_code:moduleCode,source,reason:reason.trim(),expires_at:expiry?new Date(expiry).toISOString():null}));}}><label>Módulo<select value={moduleCode} onChange={e=>setModuleCode(e.target.value as ModuleCode)}>{state.modules.map(item=><option key={item.code} value={item.code}>{moduleLabels[item.code]||item.code}</option>)}</select></label><label>Autorização<select value={source} onChange={e=>setSource(e.target.value)}><option value="exception">Exceção individual</option><option value="plan">Recurso permitido pelo plano</option></select></label><label>Motivo da autorização<input required maxLength={240} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ex.: floricultura também oferece oficinas"/></label><label>Validade opcional<input type="datetime-local" value={expiry} onChange={e=>setExpiry(e.target.value)}/></label><button className="primary-button" disabled={busy||!store}>Autorizar para este negócio</button></form></section>}
    <section className="business-card"><h2>Histórico de alterações</h2>{state.audit?.length?<ol className="business-history">{state.audit.map(item=><li key={item.id}><strong>{({set_segment:'Segmento configurado',grant:'Módulo autorizado',revoke:'Módulo desativado'} as Record<string,string>)[item.action]||item.action}{item.details?.module_code&&` · ${moduleLabels[item.details.module_code as ModuleCode]||item.details.module_code}`}</strong>{item.details?.reason&&<span>{item.details.reason}</span>}<time>{new Date(item.created_at).toLocaleString('pt-BR')}</time></li>)}</ol>:<p className="business-muted">Nenhuma alteração registrada para este perfil.</p>}</section>
    </>}
  </div>;
}
