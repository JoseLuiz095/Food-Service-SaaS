import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { businessApi, type BusinessRecord } from './api';
import { useBusinessStatus } from './useBusinessStatus';
import { fitnessApi, type FitnessBlock, type FitnessStatus, type FitnessWindow } from '../services/fitnessApi';
import { FitnessWorkouts } from './FitnessWorkouts';
import './fitness.css';

const weekDays = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const toUtc = (local: string) => local ? new Date(local).toISOString() : '';
const dateTime = (value: string) => new Date(value).toLocaleString('pt-BR');
const toLocal = (value:string) => {const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60_000).toISOString().slice(0,16);};
const money = (cents: unknown) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(cents || 0)/100);
const appointmentStatus:Record<string,string>={scheduled:'Agendado',confirmed:'Confirmado',completed:'Concluído',cancelled:'Cancelado'};

export default function FitnessAdminPage() {
  const {membership,user}=useAuth();
  const store=membership?.storeId || '';
  const activeStore=useRef(store);activeStore.current=store;
  const {state:business,loading:businessLoading,error:businessError}=useBusinessStatus(store);
  const [status,setStatus]=useState<FitnessStatus|null>(null);
  const [services,setServices]=useState<BusinessRecord[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [weekday,setWeekday]=useState(1);
  const [windowId,setWindowId]=useState('');
  const [start,setStart]=useState('08:00');
  const [end,setEnd]=useState('18:00');
  const [timezone,setTimezone]=useState('America/Sao_Paulo');
  const [step,setStep]=useState(60);
  const [buffer,setBuffer]=useState(0);
  const [blockStart,setBlockStart]=useState('');
  const [blockId,setBlockId]=useState('');
  const [blockEnd,setBlockEnd]=useState('');
  const [blockReason,setBlockReason]=useState('');
  const [serviceId,setServiceId]=useState('');
  const [cancelPolicy,setCancelPolicy]=useState('');
  const [reschedulePolicy,setReschedulePolicy]=useState('');
  const [cancelBefore,setCancelBefore]=useState(24);
  const [priceConfirmed,setPriceConfirmed]=useState(false);
  const professional=status?.professionals.some(item=>item.user_id===user?.id&&item.active)===true;
  const selectedService=services.find(item=>item.id===serviceId);
  const selectedTerm=status?.terms.find(item=>item.service_id===serviceId);
  const isPublished=Boolean(selectedService?.active!==false&&selectedTerm?.published_at&&selectedTerm.price_confirmed);

  const reload=useCallback(async()=>{
    if(!store)return;
    const [nextStatus,nextServices]=await Promise.all([
      fitnessApi.status(store),
      businessApi.operate(store,'services.list',{limit:200}),
    ]);
    if(activeStore.current!==store)return;
    if(!Array.isArray(nextStatus.professionals)||!Array.isArray(nextStatus.windows)||!Array.isArray(nextStatus.blocks)||!Array.isArray(nextStatus.terms)||!Array.isArray(nextStatus.appointments))throw new Error('A agenda não retornou uma resposta válida.');
    setStatus(nextStatus);
    setServices(nextServices.items || []);
  },[store]);

  useEffect(()=>{
    let current=true;
    setStatus(null);setServices([]);setError('');setNotice('');setLoading(true);
    if(!store){setLoading(false);return;}
    Promise.all([fitnessApi.status(store),businessApi.operate(store,'services.list',{limit:200})])
      .then(([nextStatus,nextServices])=>{if(current){
        if(!Array.isArray(nextStatus.professionals)||!Array.isArray(nextStatus.windows)||!Array.isArray(nextStatus.blocks)||!Array.isArray(nextStatus.terms)||!Array.isArray(nextStatus.appointments))throw new Error('A agenda não retornou uma resposta válida.');
        setStatus(nextStatus);setServices(nextServices.items || []);
      }})
      .catch(cause=>{if(current)setError((cause as Error).message);})
      .finally(()=>{if(current)setLoading(false);});
    return()=>{current=false;};
  },[store]);

  const run=async(action:()=>Promise<unknown>,message:string):Promise<boolean>=>{
    if(busy)return false;
    setBusy(true);setError('');setNotice('');
    try{
      await action();
      try{await reload();if(activeStore.current===store)setNotice(message);}
      catch{if(activeStore.current===store)setNotice('O servidor confirmou a operação, mas o painel não conseguiu atualizar. Recarregue antes de repetir.');}
      return true;
    }
    catch(cause){if(activeStore.current===store)setError((cause as Error).message);return false;}
    finally{if(activeStore.current===store)setBusy(false);}
  };

  const saveWindow=(event:FormEvent)=>{
    event.preventDefault();
    if(start>=end){setError('O horário de término precisa ser posterior ao início.');return;}
    void run(()=>fitnessApi.saveWindow({store,id:windowId||null,professional:user!.id,weekday,start,end,timezone,stepMinutes:step,bufferMinutes:buffer}),'Disponibilidade salva no servidor.').then(saved=>{if(saved)setWindowId('');});
  };
  const saveBlock=(event:FormEvent)=>{
    event.preventDefault();
    if(!blockStart||!blockEnd||blockStart>=blockEnd){setError('Informe um intervalo válido para o bloqueio.');return;}
    void run(()=>fitnessApi.saveBlock({store,id:blockId||null,professional:user!.id,starts:toUtc(blockStart),ends:toUtc(blockEnd),reason:blockReason.trim()}),'Bloqueio salvo no servidor.').then(saved=>{if(saved){setBlockId('');setBlockStart('');setBlockEnd('');setBlockReason('');}});
  };
  const editWindow=(item:FitnessWindow)=>{setWindowId(item.id);setWeekday(item.weekday);setStart(item.starts_local.slice(0,5));setEnd(item.ends_local.slice(0,5));setTimezone(item.timezone);setStep(item.step_minutes);setBuffer(item.buffer_minutes);};
  const editBlock=(item:FitnessBlock)=>{setBlockId(item.id);setBlockStart(toLocal(item.starts_at));setBlockEnd(toLocal(item.ends_at));setBlockReason(item.reason);};
  const disableWindow=(item:FitnessWindow)=>{if(!window.confirm('Desativar esta janela? Reservas existentes permanecem no histórico.'))return;void run(()=>fitnessApi.disableWindow(store,item.id),'Janela desativada no servidor.');};
  const deleteBlock=(item:FitnessBlock)=>{if(!window.confirm('Remover este bloqueio? O período poderá voltar a aparecer como disponível.'))return;void run(()=>fitnessApi.deleteBlock(store,item.id),'Bloqueio removido no servidor.');};
  const publish=(event:FormEvent)=>{
    event.preventDefault();
    if(!serviceId||!cancelPolicy.trim()||!reschedulePolicy.trim()||!priceConfirmed){setError('Confirme o serviço, o preço e as regras antes de publicar.');return;}
    void run(()=>fitnessApi.publishService({store,service:serviceId,cancelPolicy:cancelPolicy.trim(),reschedulePolicy:reschedulePolicy.trim(),cancelBeforeMinutes:cancelBefore*60,priceConfirmed:true}),'Serviço publicado no servidor.');
  };

  const isFitness=business?.profile?.primary_segment==='fitness';
  if(businessLoading||loading)return <div className="business-workspace"><p role="status">Carregando agenda da academia…</p></div>;
  if(businessError||error&&!status)return <div className="business-workspace"><div className="business-message business-message--error" role="alert"><strong>Agenda indisponível</strong><p>{businessError||error}</p><button type="button" onClick={()=>{setLoading(true);void reload().catch(cause=>setError((cause as Error).message)).finally(()=>setLoading(false));}}>Tentar novamente</button></div></div>;
  if(!isFitness)return <div className="business-workspace"><section className="business-card"><h1>Agenda Fitness/Academia</h1><p>Este painel pertence ao segmento Fitness/Academia.</p><Link to="/admin/negocio">Ver segmento da loja</Link></section></div>;
  return <div className="business-workspace fitness-admin">
    <header className="business-heading"><div><span className="eyebrow">FITNESS/ACADEMIA</span><h1>Agenda do Personal Trainer</h1><p>Defina a disponibilidade real e publique serviços somente depois de confirmar as condições.</p></div><Link className="secondary-button" to="/admin/operacao?tab=services">Gerenciar serviços</Link></header>
    {error&&<div className="business-message business-message--error" role="alert"><strong>Não foi possível concluir</strong><p>{error}</p></div>}
    {notice&&<div className="business-message" role="status">{notice}</div>}
    <section className="business-card"><div className="business-card-heading"><h2>Perfil profissional</h2><span className={`business-badge ${professional?'is-active':''}`}>{professional?'Ativo':'Pendente'}</span></div><p>{professional?'Sua conta está vinculada como profissional desta loja.':'Ative sua conta como Personal Trainer desta loja antes de oferecer horários.'}</p>{!professional&&<button className="primary-button" disabled={busy||!user} onClick={()=>void run(()=>fitnessApi.setProfessional(store,user!.id,true),'Perfil profissional ativado no servidor.')}>Ativar meu perfil profissional</button>}</section>
    <div className="fitness-admin-grid">
      <section className="business-card">
        <h2>Disponibilidade semanal</h2><p>Defina o fuso local. O intervalo entre sessões é aplicado pelo servidor.</p>
        <form className="business-form-grid" onSubmit={saveWindow}>
          <label>Dia da semana<select value={weekday} onChange={e=>setWeekday(Number(e.target.value))}>{weekDays.map((day,index)=><option key={day} value={index}>{day}</option>)}</select></label>
          <label>Fuso horário<select value={timezone} onChange={e=>setTimezone(e.target.value)}><option value="America/Sao_Paulo">Brasília / São Paulo</option><option value="America/Manaus">Manaus</option><option value="America/Belem">Belém</option><option value="America/Recife">Recife</option><option value="America/Bahia">Bahia</option></select></label>
          <label>Início<input required type="time" value={start} onChange={e=>setStart(e.target.value)}/></label>
          <label>Término<input required type="time" value={end} onChange={e=>setEnd(e.target.value)}/></label>
          <label>Passo entre horários (min)<input required type="number" min="5" max="240" value={step} onChange={e=>setStep(Number(e.target.value))}/></label>
          <label>Intervalo após sessão (min)<input required type="number" min="0" max="120" value={buffer} onChange={e=>setBuffer(Number(e.target.value))}/></label>
          <div className="business-actions"><button className="primary-button" disabled={busy||!professional}>{windowId?'Atualizar disponibilidade':'Salvar disponibilidade'}</button>{windowId&&<button type="button" className="secondary-button" onClick={()=>setWindowId('')}>Cancelar edição</button>}</div>
        </form>
        {status?.windows.some(item=>item.active)?<ul className="fitness-records">{status.windows.filter(item=>item.active).map(item=><li key={item.id}><strong>{weekDays[item.weekday]||`Dia ${item.weekday}`}</strong><span>{item.starts_local.slice(0,5)}–{item.ends_local.slice(0,5)} · {item.timezone} · passo {item.step_minutes} min · intervalo {item.buffer_minutes} min</span><div className="fitness-appointment-actions"><button type="button" className="secondary-button" disabled={busy} onClick={()=>editWindow(item)}>Editar</button><button type="button" className="secondary-button" disabled={busy} onClick={()=>disableWindow(item)}>Desativar</button></div></li>)}</ul>:<p className="business-muted">Nenhum horário configurado.</p>}
      </section>
      <section className="business-card">
        <h2>Folgas e compromissos</h2><p>Bloqueios retiram horários da vitrine. Reservas existentes continuam no histórico.</p>
        <form className="business-form-grid" onSubmit={saveBlock}>
          <label>Início<input required type="datetime-local" value={blockStart} onChange={e=>setBlockStart(e.target.value)}/></label>
          <label>Fim<input required type="datetime-local" value={blockEnd} onChange={e=>setBlockEnd(e.target.value)}/></label>
          <label className="fitness-wide">Motivo administrativo<input required maxLength={120} value={blockReason} onChange={e=>setBlockReason(e.target.value)} placeholder="Ex.: folga"/></label>
          <div className="business-actions"><button className="primary-button" disabled={busy||!professional}>{blockId?'Atualizar bloqueio':'Bloquear período'}</button>{blockId&&<button type="button" className="secondary-button" onClick={()=>setBlockId('')}>Cancelar edição</button>}</div>
        </form>
        {status?.blocks.length?<ul className="fitness-records">{status.blocks.map(item=><li key={item.id}><strong>{dateTime(item.starts_at)} a {dateTime(item.ends_at)}</strong><span>{item.reason}</span><div className="fitness-appointment-actions"><button type="button" className="secondary-button" disabled={busy} onClick={()=>editBlock(item)}>Editar</button><button type="button" className="secondary-button" disabled={busy} onClick={()=>deleteBlock(item)}>Remover</button></div></li>)}</ul>:<p className="business-muted">Nenhum bloqueio registrado.</p>}
      </section>
    </div>
    <section className="business-card"><h2>Publicar acompanhamento</h2><p>Cadastre o serviço no painel antes de publicá-lo. Nenhuma cobrança é feita pela agenda.</p><form className="business-form-grid" onSubmit={publish}><label>Serviço<select required value={serviceId} onChange={e=>{setServiceId(e.target.value);setPriceConfirmed(false);const term=status?.terms.find(item=>item.service_id===e.target.value);setCancelPolicy(term?.cancel_policy||'');setReschedulePolicy(term?.reschedule_policy||'');setCancelBefore((term?.cancel_before_minutes||1440)/60);}}><option value="">Selecione</option>{services.filter(item=>item.active!==false&&item.kind==='training').map(item=><option value={item.id} key={item.id}>{String(item.name)} · {money(item.price_cents)}</option>)}</select></label><div className="fitness-price">{selectedService?<><strong>Preço registrado: {money(selectedService.price_cents)}</strong><span>{isPublished?'Publicado':'Não publicado'}</span></>:<span>Selecione um serviço de treino ativo.</span>}</div><label className="fitness-wide">Regra de cancelamento<textarea required maxLength={1000} value={cancelPolicy} onChange={e=>setCancelPolicy(e.target.value)} placeholder="Informe a regra definida pelo negócio."/></label><label className="fitness-wide">Regra de reagendamento<textarea required maxLength={1000} value={reschedulePolicy} onChange={e=>setReschedulePolicy(e.target.value)} placeholder="Informe a regra definida pelo negócio."/></label><label>Antecedência mínima para cancelar (horas)<input required type="number" min="0" max="168" value={cancelBefore} onChange={e=>setCancelBefore(Number(e.target.value))}/></label><label className="fitness-check"><input type="checkbox" checked={priceConfirmed} onChange={e=>setPriceConfirmed(e.target.checked)}/><span>Conferi o preço deste serviço com o responsável.</span></label><div className="business-actions"><button className="primary-button" disabled={busy||!professional||!selectedService||!priceConfirmed}>Publicar condições</button></div></form></section>
    <section className="business-card"><h2>Agendamentos</h2>{status?.appointments.length?<ul className="fitness-records">{status.appointments.map(item=><li key={item.id}><strong>{dateTime(item.starts_at)} · {String(services.find(service=>service.id===item.service_id)?.name||'Serviço')}</strong><span>Situação: {appointmentStatus[item.status]||item.status}</span></li>)}</ul>:<p className="business-muted">Nenhum agendamento registrado.</p>}</section>
    <FitnessWorkouts store={store} professional={professional}/>
  </div>;
}
