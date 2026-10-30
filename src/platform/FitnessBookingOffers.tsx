import { InfoHint } from '../components/ui/InfoHint';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useStore } from '../contexts/StoreContext';
import { getSupabaseClient } from '../lib/supabase';
import { restFetch } from '../lib/supabaseRest';
import { fitnessApi, type FitnessAppointment, type FitnessSlot, type FitnessSlots } from '../services/fitnessApi';
import { FitnessStudentWorkouts } from './FitnessWorkouts';
import './fitness.css';
import { normalizeText } from '../utils/text';

type Offer = {id:string;name:string;description:string;price_cents:number;duration_minutes:number;kind:string;professional?:{user_id:string;name:string;council:string;registration:string}};
type PublicOffers = {services:Offer[];links?:{id:string;label:string;url:string}[]};
type OfferWithSlots = {service:Offer;availability:FitnessSlots};
const dateTime = (value:string) => new Date(value).toLocaleString('pt-BR',{dateStyle:'full',timeStyle:'short'});
const money = (cents:number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
const appointmentStatus:Record<string,string>={scheduled:'Agendado',confirmed:'Confirmado',completed:'Concluído',cancelled:'Cancelado'};
const identified=(service:Offer)=>Boolean(service.professional?.name?.trim()&&service.professional?.registration?.trim()&&(
  service.kind==='training'?service.professional.council==='CREF':service.kind==='nutrition'?service.professional.council==='CRN':Boolean(service.professional.council)
));

export function FitnessBookingOffers({query='',type='all'}:{query?:string;type?:'all'|'products'|'services'|'consultations'|'content'}){
  const {settings}=useStore();
  const {user,memberships}=useAuth();
  const store=settings.id;
  const [offers,setOffers]=useState<OfferWithSlots[]>([]);
  const [otherServices,setOtherServices]=useState<Offer[]>([]);
  const [contentLinks,setContentLinks]=useState<{id:string;label:string;url:string}[]>([]);
  const [published,setPublished]=useState<OfferWithSlots[]>([]);
  const [appointments,setAppointments]=useState<FitnessAppointment[]>([]);
  const [appointmentsError,setAppointmentsError]=useState('');
  const [newSlot,setNewSlot]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [refresh,setRefresh]=useState(0);
  const [selected,setSelected]=useState('');
  const [slot,setSlot]=useState<FitnessSlot|null>(null);
  const [accepted,setAccepted]=useState(false);
  const [studentName,setStudentName]=useState('');
  const [studentPhone,setStudentPhone]=useState('');
  const [studentEmail,setStudentEmail]=useState('');
  const [busy,setBusy]=useState(false);
  const chosen=offers.find(item=>item.service.id===selected);
  const isStoreStaff=memberships.some(item=>item.storeId===store);

  useEffect(()=>{
    let active=true;
    setOffers([]);setPublished([]);setOtherServices([]);setContentLinks([]);setSelected('');setSlot(null);setAccepted(false);setError('');setLoading(true);
    if(!store){setLoading(false);return;}
    // Inclui o dia local em fusos a oeste de UTC; o servidor descarta horários passados.
    const from=new Date(Date.now()-86_400_000).toISOString().slice(0,10);
    void restFetch<PublicOffers>('rpc/food_business_public',{method:'POST',body:{p_store:store}})
      .then(async data=>{
        if(!Array.isArray(data.services))throw new Error('Resposta inválida do catálogo de serviços.');
        const results=await Promise.allSettled(data.services.filter(service=>service.kind==='training'&&identified(service)).map(async service=>({service,availability:await fitnessApi.listSlots(store,service.id,from,15)})));
        if(results.some(result=>result.status==='rejected'))throw new Error('Não foi possível consultar todos os horários disponíveis. Tente novamente.');
        const valid=results.map(result=>{
          if(result.status==='rejected')throw new Error('Consulta de horários incompleta.');
          const availability=result.value.availability;
          if(!Array.isArray(availability?.slots)||typeof availability.cancel_policy!=='string'||!availability.cancel_policy.trim()||typeof availability.reschedule_policy!=='string'||!availability.reschedule_policy.trim())throw new Error('O servidor retornou regras ou horários inválidos.');
          return result.value;
        });
        if(active){setPublished(valid);setOffers(valid.filter(item=>item.availability.slots.length>0));setOtherServices(data.services.filter(service=>['general','nutrition'].includes(service.kind)&&identified(service)&&service.price_cents>0&&service.duration_minutes>0&&Boolean(service.description?.trim())));setContentLinks((data.links||[]).filter(link=>{try{const url=new URL(link.url);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}}));}
      })
      .catch(cause=>{if(active)setError((cause as Error).message);})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[store,refresh]);

  useEffect(()=>{
    let active=true;
    setAppointments([]);setAppointmentsError('');
    if(!store||!user||isStoreStaff)return;
    void fitnessApi.myAppointments(store).then(result=>{
      if(!Array.isArray(result.appointments))throw new Error('Resposta inválida do histórico de reservas.');
      if(active)setAppointments(result.appointments);
    }).catch(cause=>{if(active)setAppointmentsError((cause as Error).message);});
    return()=>{active=false;};
  },[store,user?.id,isStoreStaff,refresh]);

  const sendAccessLink=async(event:FormEvent)=>{
    event.preventDefault();if(busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      const {error:authError}=await getSupabaseClient().auth.signInWithOtp({
        email:studentEmail.trim(),
        options:{emailRedirectTo:`${window.location.origin}${window.location.pathname}`,shouldCreateUser:true},
      });
      if(authError)throw authError;
      setNotice('Solicitação recebida. Se o endereço estiver apto, você receberá um link de acesso. Volte a esta página após entrar.');
    }catch(cause){setError((cause as Error).message);}
    finally{setBusy(false);}
  };

  const book=async(event:FormEvent)=>{
    event.preventDefault();if(busy||!chosen||!slot||!accepted||!user||isStoreStaff)return;
    setBusy(true);setError('');setNotice('');
    try{
      await fitnessApi.registerStudent(store,studentName.trim(),studentPhone.trim());
      await fitnessApi.book(store,chosen.service.id,slot.starts_at,slot.professional_id,true);
      setSlot(null);setAccepted(false);setSelected('');
      setNotice('Reserva registrada no servidor. Confira os detalhes e o estado do agendamento no seu acesso. Nenhuma cobrança foi realizada.');
      setRefresh(value=>value+1);
    }catch(cause){setError((cause as Error).message);}
    finally{setBusy(false);}
  };

  const cancel=async(appointment:FitnessAppointment)=>{
    if(busy||!window.confirm('Cancelar este agendamento? O registro ficará no histórico.'))return;
    setBusy(true);setError('');setNotice('');
    try{await fitnessApi.cancel(appointment.id);setNotice('Cancelamento registrado no servidor.');setRefresh(value=>value+1);}
    catch(cause){setError((cause as Error).message);}
    finally{setBusy(false);}
  };

  const reschedule=async(appointment:FitnessAppointment)=>{
    const key=newSlot[appointment.id];
    const availability=published.find(item=>item.service.id===appointment.service_id);
    const chosenSlot=availability?.availability.slots.find(item=>`${item.starts_at}:${item.professional_id}`===key);
    if(busy||!chosenSlot)return;
    setBusy(true);setError('');setNotice('');
    try{await fitnessApi.reschedule(appointment.id,chosenSlot.starts_at,chosenSlot.professional_id);setNotice('Reagendamento registrado no servidor. O histórico anterior foi preservado.');setRefresh(value=>value+1);}
    catch(cause){setError((cause as Error).message);}
    finally{setBusy(false);}
  };

  const matches=(value:string)=>normalizeText(value).includes(normalizeText(query));
  const visibleOffers=offers.filter(item=>matches(`${item.service.name} ${item.service.description}`));
  const visibleServices=otherServices.filter(item=>item.kind==='general'&&matches(`${item.name} ${item.description}`));
  const visibleConsultations=otherServices.filter(item=>item.kind==='nutrition'&&matches(`${item.name} ${item.description}`));
  const visibleLinks=contentLinks.filter(item=>matches(item.label));
  const showAppointments=type==='all'||type==='consultations';
  const showServices=type==='all'||type==='services';
  const showContent=type==='all'||type==='content';

  return <section className="business-public fitness-booking" aria-label="Agendamento Fitness/Academia">
    {showAppointments&&<div className="food-section-title"><div><span>CONSULTAS</span><h2>Acompanhamento com horário reservado</h2><InfoHint label="Sobre Acompanhamento com horário reservado">Escolha um horário disponível. As regras aparecem antes da confirmação.</InfoHint></div></div>}
    {error&&<div className="business-message business-message--error" role="alert"><strong>Agenda indisponível</strong><p>{error}</p><button type="button" onClick={()=>setRefresh(value=>value+1)}>Tentar novamente</button></div>}
    {notice&&<div className="business-message" role="status">{notice}</div>}
    {showAppointments&&(loading?<p role="status">Consultando horários no servidor…</p>:visibleOffers.length===0&&visibleConsultations.length===0?<p role="status" className="business-muted">{query?'Nenhuma consulta corresponde à busca.':'Não há consultas publicadas e disponíveis neste momento.'}</p>:<>
      <div className="business-public-grid">{visibleOffers.map(({service,availability})=><article className="business-card" key={service.id}><span className="business-badge">{service.duration_minutes} min por sessão</span><h3>{service.name}</h3><p>{service.description}</p><p className="business-provider">Atendimento: <strong>{service.professional!.name}</strong> · {service.professional!.council} {service.professional!.registration}</p><strong>{money(service.price_cents)}</strong><small>Pagamento não habilitado nesta etapa.</small><button className="primary-button" type="button" onClick={()=>{setSelected(service.id);setSlot(null);setAccepted(false);}}>{selected===service.id?'Horários exibidos':'Ver horários'}</button><small>{availability.slots.length} horário(s) disponíveis nos próximos 14 dias</small></article>)}{visibleConsultations.map(service=><article className="business-card" key={service.id}><span className="business-badge">Consulta · {service.duration_minutes} min</span><h3>{service.name}</h3><p>{service.description}</p><p className="business-provider">Atendimento: <strong>{service.professional!.name}</strong> · {service.professional!.council} {service.professional!.registration}</p><strong>{money(service.price_cents)}</strong><small>Agendamento e pagamento online ainda não disponíveis para esta consulta.</small></article>)}</div>
      {chosen&&<div className="business-card fitness-booking-panel"><h3>{chosen.service.name}</h3><div className="fitness-slot-grid" role="group" aria-label="Horários disponíveis">{chosen.availability.slots.map(item=><button key={`${item.starts_at}:${item.professional_id}`} type="button" aria-pressed={slot?.starts_at===item.starts_at&&slot.professional_id===item.professional_id} onClick={()=>{setSlot(item);setAccepted(false);}}>{dateTime(item.starts_at)}</button>)}</div>
        <div className="fitness-policies"><h4>Regras antes da reserva</h4><p><strong>Cancelamento:</strong> {chosen.availability.cancel_policy}</p><p><strong>Reagendamento:</strong> {chosen.availability.reschedule_policy}</p></div>
        {!user?<form className="fitness-access-form" onSubmit={sendAccessLink}><p>Entre por um link enviado ao seu e-mail para reservar como aluno.</p><label>E-mail<input required type="email" autoComplete="email" value={studentEmail} onChange={e=>setStudentEmail(e.target.value)}/></label><button className="secondary-button" disabled={busy}>Enviar link de acesso</button></form>
          :isStoreStaff?<p className="business-muted">Esta conta administra a loja. Para testar uma reserva como aluno, use uma conta de aluno separada.</p>
          :<form className="fitness-access-form" onSubmit={book}><p>Conta conectada: {user.email}</p><label>Seu nome<input required minLength={2} maxLength={120} value={studentName} onChange={e=>setStudentName(e.target.value)}/></label><label>Telefone<input required type="tel" maxLength={30} value={studentPhone} onChange={e=>setStudentPhone(e.target.value)}/></label><label className="fitness-check"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>Li e aceito as regras de cancelamento e reagendamento exibidas acima.</span></label><button className="primary-button" disabled={busy||!slot||!accepted}>{busy?'Confirmando no servidor…':'Confirmar reserva'}</button></form>}
      </div>}
    </>)}
    {showServices&&!loading&&<div className="fitness-other-services"><h2>Serviços</h2>{visibleServices.length?<div className="business-public-grid">{visibleServices.map(service=><article className="business-card" key={service.id}><span className="business-badge">{service.duration_minutes} min</span><h3>{service.name}</h3><p>{service.description}</p><p className="business-provider">Atendimento: <strong>{service.professional!.name}</strong> · {service.professional!.council} {service.professional!.registration}</p><strong>{money(service.price_cents)}</strong><small>Agendamento online ainda não disponível para este serviço.</small></article>)}</div>:<p role="status" className="business-muted">{query?'Nenhum serviço corresponde à busca.':'Nenhum serviço publicado no momento.'}</p>}</div>}
    {showContent&&!loading&&<div className="fitness-other-services"><h2>Conteúdos</h2>{visibleLinks.length?<div className="business-public-grid">{visibleLinks.map(link=><a className="business-card" href={link.url} target="_blank" rel="noopener noreferrer" key={link.id}>{link.label} ↗</a>)}</div>:<p role="status" className="business-muted">{query?'Nenhum conteúdo corresponde à busca.':'Nenhum conteúdo publicado no momento.'}</p>}</div>}
    {user&&!isStoreStaff&&<div className="business-card fitness-my-appointments"><h3>Meus agendamentos</h3>{appointmentsError?<p role="alert">Não foi possível consultar seus agendamentos: {appointmentsError}</p>:appointments.length===0?<p>Nenhum agendamento encontrado para esta conta e loja.</p>:<ul className="fitness-records">{appointments.map(item=>{
      const service=published.find(offer=>offer.service.id===item.service_id);
      const open=['scheduled','confirmed'].includes(item.status);
      return <li key={item.id}><strong>{service?.service.name||'Acompanhamento'} · {dateTime(item.starts_at)}</strong><span>Situação: {appointmentStatus[item.status]||item.status}</span>{open&&<><div className="fitness-policies"><p><strong>Cancelamento:</strong> {item.cancel_policy||service?.availability.cancel_policy||'Consulte as condições informadas na reserva.'}</p><p><strong>Reagendamento:</strong> {item.reschedule_policy||service?.availability.reschedule_policy||'Consulte as condições informadas na reserva.'}</p></div><div className="fitness-appointment-actions"><button type="button" className="secondary-button" disabled={busy} onClick={()=>void cancel(item)}>Cancelar reserva</button>{service&&service.availability.slots.length>0&&<><label>Novo horário<select value={newSlot[item.id]||''} onChange={event=>setNewSlot(current=>({...current,[item.id]:event.target.value}))}><option value="">Selecione</option>{service.availability.slots.map(option=><option key={`${option.starts_at}:${option.professional_id}`} value={`${option.starts_at}:${option.professional_id}`}>{dateTime(option.starts_at)}</option>)}</select></label><button type="button" className="secondary-button" disabled={busy||!newSlot[item.id]} onClick={()=>void reschedule(item)}>Reagendar</button></>}</div></>}</li>;
    })}</ul>}</div>}
    {user&&!isStoreStaff&&<FitnessStudentWorkouts store={store}/>}
  </section>;
}
