import { InfoHint } from '../components/ui/InfoHint';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { businessApi, moduleIsActive, type BusinessRecord, type ModuleCode } from './api';
import { useBusinessStatus } from './useBusinessStatus';
import { getBusinessSegment } from '../segments/businessSegments';
import { professionalApi, type Council, type ProfessionalKind, type StaffMember } from './professionalApi';
import './business.css';

type Tab='clients'|'services'|'appointments'|'followups'|'campaigns'|'links';
type Field={key:string;label:string;type?:string;required?:boolean;options?:{id:string;name:string}[]};
const tabModules:Record<Tab,ModuleCode>={clients:'clients',services:'appointments',appointments:'appointments',followups:'clients',campaigns:'creator',links:'creator'};
const emptyLists=():Record<Tab,BusinessRecord[]>=>({clients:[],services:[],appointments:[],followups:[],campaigns:[],links:[]});
const dateLabel=(value:unknown)=>value?new Date(String(value)).toLocaleString('pt-BR'):'Sem data';
const localDate=(value:unknown)=>{if(!value)return '';const date=new Date(String(value));if(!Number.isFinite(date.getTime()))return '';return new Date(date.getTime()-date.getTimezoneOffset()*60_000).toISOString().slice(0,16);};

export default function OperationsPage() {
  const [searchParams]=useSearchParams();
  const queryTab=searchParams.get('tab');
  const requestedTab=(['clients','services','appointments','followups','campaigns','links'].includes(queryTab||'')?queryTab:null) as Tab|null;
  const {membership}=useAuth();const store=membership?.storeId||'';
  const activeStore=useRef(store);activeStore.current=store;
  const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const isCurrent=()=>mounted.current&&activeStore.current===store;
  const {state,error:statusError,loading:statusLoading,reload:reloadStatus}=useBusinessStatus(store);
  const [tab,setTab]=useState<Tab>(requestedTab||'clients');const [lists,setLists]=useState(emptyLists);
  const [values,setValues]=useState<Record<string,string>>({});const [editing,setEditing]=useState('');
  const [loading,setLoading]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [query,setQuery]=useState('');
  const [staff,setStaff]=useState<StaffMember[]>([]);
  const [staffError,setStaffError]=useState('');
  const [providerUser,setProviderUser]=useState('');
  const [profileUser,setProfileUser]=useState('');
  const [profileName,setProfileName]=useState('');
  const [profileKind,setProfileKind]=useState<ProfessionalKind>('general');
  const [profileCouncil,setProfileCouncil]=useState<Council>('OUTRO');
  const [profileRegistration,setProfileRegistration]=useState('');
  const profile=state?.profile?getBusinessSegment(state.profile.primary_segment):null;
  const clientLabel=['personal','fitness'].includes(profile?.id||'')?'Alunos':'Clientes';
  const labels:Record<Tab,string>={clients:clientLabel,services:'Serviços e pacotes',appointments:'Agenda',followups:'Acompanhamentos',campaigns:'Campanhas',links:'Links comerciais'};
  const permitted=(Object.keys(tabModules) as Tab[]).filter(key=>moduleIsActive(state,tabModules[key]));
  const permissionKey=permitted.join(',');
  const canAssign=membership?.role==='owner'||membership?.role==='admin';
  useEffect(()=>{
    let active=true;setStaff([]);setStaffError('');
    if(!store||!canAssign||!moduleIsActive(state,'appointments'))return;
    void professionalApi.staff(store).then(rows=>{if(active)setStaff(rows);}).catch(cause=>{if(active)setStaffError((cause as Error).message);});
    return()=>{active=false;};
  },[store,canAssign,permissionKey]);
  const load=useCallback(async()=>{
    const entries=await Promise.all((permissionKey.split(',').filter(Boolean) as Tab[]).map(async key=>[key,(await businessApi.operate(store,`${key}.list`)).items||[]] as const));
    return {...emptyLists(),...Object.fromEntries(entries)};
  },[store,permissionKey]);
  useEffect(()=>{
    let active=true;setLists(emptyLists());setError('');setNotice('');setValues({});setEditing('');setQuery('');
    const permittedTabs=permissionKey.split(',').filter(Boolean) as Tab[];
    const first=requestedTab&&permittedTabs.includes(requestedTab)?requestedTab:permittedTabs[0];if(first)setTab(first);
    if(!first||!store){setLoading(false);return;}
    setLoading(true);void load().then(next=>{if(active)setLists(next);}).catch(e=>{if(active)setError((e as Error).message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[load,store,permissionKey,requestedTab]);
  const choices=(key:Tab)=>lists[key].filter(item=>item.active!==false).map(item=>({id:item.id,name:String(item.name||item.title||item.label||item.id)}));
  const fields:Record<Tab,Field[]>={
    clients:[{key:'name',label:'Nome',required:true},{key:'email',label:'E-mail',type:'email'},{key:'phone',label:'Telefone'}],
    services:[{key:'name',label:'Nome do serviço ou pacote',required:true},{key:'description',label:'Descrição comercial'},{key:'price_cents',label:'Valor (R$)',type:'number',required:true},{key:'duration_minutes',label:'Duração da sessão (minutos)',type:'number',required:true},{key:'kind',label:'Tipo',options:[{id:'general',name:'Serviço geral'},...(moduleIsActive(state,'training')?[{id:'training',name:'Treinamento'}]:[]),...(moduleIsActive(state,'nutrition')?[{id:'nutrition',name:'Atendimento nutricional administrativo'}]:[])]}],
    appointments:[{key:'client_id',label:profile?.id==='personal'?'Aluno':'Cliente',required:true,options:choices('clients')},{key:'service_id',label:'Serviço',required:true,options:choices('services')},{key:'starts_at',label:'Início',type:'datetime-local',required:true},{key:'ends_at',label:'Término',type:'datetime-local',required:true},{key:'status',label:'Situação',options:[{id:'scheduled',name:'Agendado'},{id:'confirmed',name:'Confirmado'}]}],
    followups:[{key:'client_id',label:profile?.id==='personal'?'Aluno':'Cliente',required:true,options:choices('clients')},{key:'title',label:'Tarefa administrativa',required:true},{key:'type',label:'Tipo de acompanhamento',options:[{id:'administrative',name:'Administrativo'},...(moduleIsActive(state,'training')?[{id:'training',name:'Acompanhamento de treino'}]:[]),...(moduleIsActive(state,'nutrition')?[{id:'nutrition',name:'Retorno administrativo'}]:[])]},{key:'due_at',label:'Prazo',type:'datetime-local',required:true}],
    campaigns:[{key:'title',label:'Nome da campanha',required:true},{key:'starts_at',label:'Início da campanha',type:'datetime-local',required:true},{key:'ends_at',label:'Prazo final',type:'datetime-local',required:true},{key:'status',label:'Situação',options:[{id:'draft',name:'Rascunho'},{id:'active',name:'Em andamento'},{id:'completed',name:'Concluída'},{id:'cancelled',name:'Cancelada'}]}],
    links:[{key:'label',label:'Título do link',required:true},{key:'url',label:'Endereço HTTPS',type:'url',required:true},{key:'campaign_id',label:'Campanha (opcional)',options:choices('campaigns')}],
  };
  const recordStatus=(item:BusinessRecord)=>fields[tab].find(field=>field.key==='status')?.options?.find(option=>option.id===item.status)?.name
    || ({completed:'Concluído',cancelled:'Cancelado',pending:'Pendente',done:'Concluído'} as Record<string,string>)[String(item.status)]
    || String(item.status||(item.active===false?'Arquivado':'Ativo'));
  const records=useMemo(()=>lists[tab].filter(item=>`${JSON.stringify(item)} ${recordStatus(item)}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))),[lists,tab,query]);
  const reset=()=>{setValues({});setEditing('');setProviderUser('');};
  const changeTab=(next:Tab)=>{setTab(next);reset();setQuery('');setNotice('');};
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(busy)return;setBusy(true);setError('');setNotice('');
    try {
      if(tab==='services'&&(!canAssign||!providerUser))throw new Error('Selecione um prestador com conta e registro confirmados nesta loja.');
      const data:Record<string,unknown>={};
      for(const field of fields[tab]) {
        const raw=values[field.key]??(field.key==='campaign_id'?'':field.options?.[0]?.id||'');
        data[field.key]=field.type==='datetime-local'?(raw?new Date(raw).toISOString():null):field.type==='number'?Math.round(Number(raw)*(field.key==='price_cents'?100:1)):raw||null;
      }
      if(editing)data.id=editing;
      // Edições mantêm o profissional persistido no servidor. Reenviar o
      // usuário atual transferia silenciosamente a agenda de outro membro.
      if(tab==='appointments'&&!editing){
        const selected=lists.services.find(item=>item.id===data.service_id);
        if(!selected?.professional_user_id)throw new Error('Atribua um prestador ao serviço antes de agendar.');
        data.professional_id=selected.professional_user_id;
      }
      if(tab==='clients'||tab==='services'||tab==='links')data.active=true;
      if(tab==='followups')data.status=editing?lists.followups.find(item=>item.id===editing)?.status||'pending':'pending';
      const saved=await businessApi.operate(store,`${tab}.save`,data);
      if(tab==='services'){
        const id=saved.item?.id;
        if(typeof id!=='string')throw new Error('Serviço salvo, mas o servidor não retornou o identificador para atribuir o prestador.');
        await professionalApi.assign(store,id,providerUser);
      }
      const next=await load();if(!isCurrent())return;setLists(next);reset();setNotice(`${labels[tab]}: registro salvo no servidor.`);
    }catch(e){if(isCurrent())setError((e as Error).message);}finally{if(isCurrent())setBusy(false);}
  };
  const updateState=async(item:BusinessRecord,action:string)=>{
    if(busy)return;setBusy(true);setError('');setNotice('');
    try{await businessApi.operate(store,`${tab}.${action}`,{id:item.id,...(tab==='followups'?{status:'done'}:{})});const next=await load();if(!isCurrent())return;setLists(next);setNotice('Alteração salva. O histórico foi preservado.');}
    catch(e){if(isCurrent())setError((e as Error).message);}finally{if(isCurrent())setBusy(false);}
  };
  const edit=(item:BusinessRecord)=>{
    const next:Record<string,string>={};for(const field of fields[tab])next[field.key]=field.type==='datetime-local'?localDate(item[field.key]):field.key==='price_cents'?String(Number(item[field.key]||0)/100):String(item[field.key]??'');
    setEditing(item.id);setValues(next);setProviderUser(String(item.professional_user_id||''));document.getElementById('business-record-form')?.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  };
  const saveProfile=async(event:FormEvent)=>{
    event.preventDefault();if(busy||!profileUser||membership?.role!=='owner')return;
    setBusy(true);setError('');setNotice('');
    try{
      await professionalApi.save({store,user:profileUser,name:profileName.trim(),kind:profileKind,council:profileCouncil,registration:profileRegistration.trim(),active:true});
      const next=await professionalApi.staff(store);
      if(isCurrent()){setStaff(next);setProfileUser('');setProfileName('');setProfileRegistration('');setNotice('Prestador vinculado à conta desta loja. Atribua-o ao serviço antes de publicar.');}
    }catch(cause){if(isCurrent())setError((cause as Error).message);}
    finally{if(isCurrent())setBusy(false);}
  };
  return <div className="business-workspace"><header className="business-heading"><div><span className="eyebrow">{profile?.label||'OPERAÇÃO'}</span><h1>{profile?.adminTitle||'Minha operação'}</h1><InfoHint>Contatos, compromissos e tarefas com acesso verificado por negócio.</InfoHint></div><Link className="secondary-button" to="/admin/negocio">Ver meus módulos</Link></header>
    {(statusError||error)&&<div className="business-message business-message--error" role="alert"><strong>Não foi possível carregar ou salvar</strong><p>{error||statusError}</p><button type="button" onClick={()=>{void reloadStatus();if(permissionKey)void load().then(next=>{if(isCurrent())setLists(next);}).catch(e=>{if(isCurrent())setError((e as Error).message);});}}>Tentar novamente</button></div>}
    {notice&&<p className="business-message" role="status">{notice}</p>}
    {(statusLoading||loading)&&<p role="status">Carregando operação…</p>}
    {!statusLoading&&!loading&&state&&!permitted.length&&<section className="business-card"><h2>Prepare os módulos do negócio</h2><InfoHint label="Sobre Prepare os módulos do negócio">Seu catálogo e os pedidos continuam disponíveis. Configure o segmento ou solicite ao Master os módulos complementares.</InfoHint><Link className="primary-button" to="/admin/negocio">Configurar segmento e módulos</Link></section>}
    {!statusLoading&&!loading&&permitted.length>0&&<><nav className="business-tabs" aria-label="Operação por módulo">{permitted.map(key=><button key={key} type="button" aria-pressed={tab===key} onClick={()=>changeTab(key)}>{labels[key]}</button>)}</nav>
      {['personal','nutrition'].includes(profile?.id||'')&&<p className="business-muted">Área administrativa de atendimento. Não registre prontuários, diagnósticos ou informações de saúde nestes formulários.</p>}
      {tab==='campaigns'||tab==='links'?<p className="business-muted">Planejamento comercial e links. As campanhas não publicam automaticamente em redes sociais.</p>:null}
      {tab==='services'&&canAssign&&<section className="business-card"><h2>Prestadores da loja</h2><p>Um serviço profissional só aparece na vitrine após atribuir uma conta ativa com nome e registro. Confirme o registro junto ao conselho antes de publicar.</p>{staffError&&<p role="alert">Não foi possível consultar a equipe: {staffError}. É necessária a migração de identidade profissional.</p>}{membership?.role==='owner'&&<form className="business-form-grid" onSubmit={event=>void saveProfile(event)}><label>Conta da equipe<select required value={profileUser} onChange={event=>{const selected=staff.find(item=>item.user_id===event.target.value);setProfileUser(event.target.value);setProfileName(selected?.name||'');setProfileRegistration(selected?.registration||'');}}><option value="">Selecione uma conta vinculada a esta loja</option>{staff.map(item=><option value={item.user_id} key={item.user_id}>{item.email}</option>)}</select></label><label>Nome profissional<input required minLength={3} maxLength={120} value={profileName} onChange={event=>setProfileName(event.target.value)}/></label><label>Área<select value={profileKind} onChange={event=>{const kind=event.target.value as ProfessionalKind;setProfileKind(kind);setProfileCouncil(kind==='nutrition'?'CRN':kind==='training'?'CREF':'OUTRO');}}><option value="general">Outro serviço profissional</option>{moduleIsActive(state,'training')&&<option value="training">Treinamento</option>}{moduleIsActive(state,'nutrition')&&<option value="nutrition">Nutrição</option>}</select></label><label>Conselho<select value={profileCouncil} onChange={event=>setProfileCouncil(event.target.value as Council)}><option value="CRN">CRN</option><option value="CREF">CREF</option>{profileKind==='general'&&<option value="OUTRO">Outro</option>}</select></label><label>Registro (inclua a região quando aplicável)<input required minLength={3} maxLength={50} value={profileRegistration} onChange={event=>setProfileRegistration(event.target.value)} placeholder="Número e região informados pelo profissional"/></label><div className="business-actions"><button className="secondary-button" disabled={busy||!profileUser}>Confirmar prestador</button></div></form>}{!staff.some(item=>item.professional_active)&&<p role="status" className="business-muted">Ainda não há prestador confirmado. Vincule primeiro a conta da profissional à loja; nenhum nome ou CRN fictício é criado aqui.</p>}</section>}
      <div className="business-operation-grid"><section className="business-card"><h2>{editing?'Editar registro':`Novo registro · ${labels[tab].toLocaleLowerCase('pt-BR')}`}</h2><form id="business-record-form" className="business-form-grid" onSubmit={e=>void submit(e)}>
        {fields[tab].map(field=><label key={`${tab}:${field.key}`}>{field.label}{field.options?<select required={field.required} value={values[field.key]??(field.required===false||field.key==='campaign_id'?'':field.options[0]?.id||'')} onChange={e=>setValues(current=>({...current,[field.key]:e.target.value}))}>{(field.required||field.key==='campaign_id')&&<option value="">{field.required?'Selecione':'Sem campanha'}</option>}{field.options.map(option=><option value={option.id} key={option.id}>{option.name}</option>)}</select>:<input required={field.required} type={field.type||'text'} min={field.type==='number'?'0':undefined} step={field.key==='price_cents'?'0.01':undefined} maxLength={field.type===undefined?240:undefined} value={values[field.key]||''} onChange={e=>setValues(current=>({...current,[field.key]:e.target.value}))}/>}</label>)}
        {tab==='services'&&<label>Quem presta este serviço<select required value={providerUser} onChange={event=>setProviderUser(event.target.value)}><option value="">Selecione um prestador confirmado</option>{staff.filter(item=>item.professional_active&&(values.kind==='nutrition'||values.kind==='training'?item.kind===values.kind:true)).map(item=><option value={item.user_id} key={item.user_id}>{item.name} · {item.council} {item.registration}</option>)}</select></label>}
        {tab==='appointments'&&(!lists.clients.length||!lists.services.length)&&<p>Cadastre um cliente e um serviço antes de agendar. Datas são salvas em UTC e exibidas no horário deste dispositivo.</p>}
        <div className="business-actions"><button className="primary-button" disabled={busy||!moduleIsActive(state,tabModules[tab])}>{busy?'Salvando…':'Salvar registro'}</button>{editing&&<button className="secondary-button" type="button" onClick={reset}>Cancelar edição</button>}</div>
      </form></section>
      <section className="business-card"><div className="business-card-heading"><h2>{labels[tab]}</h2><span className="business-badge">{records.length} registros</span></div><label className="business-search">Buscar registros<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nome, título ou situação"/></label>
      {!records.length?<div className="business-empty"><strong>{query?'Nenhum resultado para esta busca':'Comece pelo primeiro registro'}</strong><p>{query?'Tente outro termo.':'Use o formulário para organizar esta parte do negócio.'}</p></div>:<ul className="business-record-list">{records.map(item=><li key={item.id}><div><strong>{String(item.name||item.title||item.label||(tab==='appointments'?lists.clients.find(client=>client.id===item.client_id)?.name:'')||'Atendimento')}</strong><small>{tab==='appointments'?`${dateLabel(item.starts_at)} · ${String(lists.services.find(service=>service.id===item.service_id)?.name||'Serviço')}`:tab==='followups'?dateLabel(item.due_at):tab==='campaigns'?dateLabel(item.ends_at):tab==='links'?String(item.url):String(item.email||item.phone||item.description||'')}</small><span>{recordStatus(item)}</span></div><div className="business-record-actions"><button type="button" disabled={busy} onClick={()=>edit(item)}>Editar</button>{tab==='appointments'?<><button type="button" disabled={busy||['completed','cancelled'].includes(String(item.status))} onClick={()=>void updateState(item,'complete')}>Concluir</button><button type="button" disabled={busy||['completed','cancelled'].includes(String(item.status))} onClick={()=>void updateState(item,'cancel')}>Cancelar</button></>:tab==='followups'?<button type="button" disabled={busy||item.status==='done'} onClick={()=>void updateState(item,'status')}>Concluir tarefa</button>:<button type="button" disabled={busy||item.active===false||(tab==='campaigns'&&item.status==='cancelled')} onClick={()=>void updateState(item,'archive')}>Arquivar</button>}</div></li>)}</ul>}
      <p className="business-muted">Lista limitada pelo servidor. Desativar um módulo preserva seus registros.</p></section></div>
    </>}
  </div>;
}
