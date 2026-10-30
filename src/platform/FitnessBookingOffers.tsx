import { InfoHint } from '../components/ui/InfoHint';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useAuth } from '../contexts/AuthContext';
import { TurnstileWidget } from '../components/ui/TurnstileWidget';
import { appConfig } from '../lib/config';
import { getFitnessStudentAuthClient } from '../lib/fitnessStudentAuth';
import { useStore } from '../contexts/StoreContext';
import { restFetch } from '../lib/supabaseRest';
import { fitnessApi, type FitnessAppointment, type FitnessSlot, type FitnessSlots } from '../services/fitnessApi';
import { FitnessStudentWorkouts } from './FitnessWorkouts';
import { FitnessStudentPreferences } from './FitnessStudentPreferences';
import './fitness.css';
import { normalizeText } from '../utils/text';

type Offer = {id:string;name:string;description:string;price_cents:number;duration_minutes:number;kind:string;professional?:{user_id:string;name:string;council:string;registration:string}};
type ProfessionalPost={id:string;title:string;body:string;category:string;published_at:string;author_name:string;author_council:string;author_registration:string};
type PublicOffers = {services:Offer[];links?:{id:string;label:string;url:string}[];publications?:ProfessionalPost[]};
type OfferWithSlots = {service:Offer;availability:FitnessSlots};
const dateTime = (value:string) => new Date(value).toLocaleString('pt-BR',{dateStyle:'full',timeStyle:'short'});
const money = (cents:number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
const appointmentStatus:Record<string,string>={scheduled:'Agendado',confirmed:'Confirmado',completed:'Concluído',cancelled:'Cancelado'};
const identified=(service:Offer)=>Boolean(service.professional?.name?.trim()&&service.professional?.registration?.trim()&&(
  service.kind==='training'?service.professional.council==='CREF':service.kind==='nutrition'?service.professional.council==='CRN':Boolean(service.professional.council)
));
const normalizePhone=(raw:string):string|null=>{
  const digits=raw.replace(/\D/g,'');
  if(raw.trim().startsWith('+'))return digits.length>=8&&digits.length<=15?'+'+digits:null;
  if(digits.startsWith('55')&&(digits.length===12||digits.length===13))return '+'+digits;
  if(digits.length===10||digits.length===11)return '+55'+digits;
  return null;
};

type StudentIdentity={client_id:string;name:string};

export function FitnessBookingOffers({query='',type='all'}:{query?:string;type?:'all'|'products'|'services'|'consultations'|'content'}){
  const {settings}=useStore();
  const {user,memberships}=useAuth();
  const studentAuth=useMemo(()=>{try{return getFitnessStudentAuthClient();}catch{return null;}},[]);
  const store=settings.id;
  const [offers,setOffers]=useState<OfferWithSlots[]>([]);
  const [otherServices,setOtherServices]=useState<Offer[]>([]);
  const [contentLinks,setContentLinks]=useState<{id:string;label:string;url:string}[]>([]);
  const [publications,setPublications]=useState<ProfessionalPost[]>([]);
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
  const [studentSession,setStudentSession]=useState<Session|null>(null);
  const [studentIdentity,setStudentIdentity]=useState<StudentIdentity|null>(null);
  const [studentAccess,setStudentAccess]=useState(false);
  const [studentProfileRequired,setStudentProfileRequired]=useState(false);
  const [studentBlockedReason,setStudentBlockedReason]=useState('');
  const [otpSent,setOtpSent]=useState(false);
  const [otp,setOtp]=useState('');
  const [captcha,setCaptcha]=useState('');
  const [captchaReset,setCaptchaReset]=useState(0);
  const [busy,setBusy]=useState(false);
  const chosen=offers.find(item=>item.service.id===selected);
  const isStoreStaff=memberships.some(item=>item.storeId===store);
  const currentStudentToken=useCallback(async()=>{
    if(!studentAuth)throw new Error('Supabase não configurado.');
    const {data,error}=await studentAuth.auth.getSession();
    if(error)throw error;
    if(!data.session?.access_token)throw new Error('Sua sessão Fitness expirou. Entre novamente por telefone.');
    return data.session.access_token;
  },[studentAuth]);

  useEffect(()=>{
    if(!studentAuth)return;
    let active=true;
    const {data}=studentAuth.auth.onAuthStateChange((_event,nextSession)=>setStudentSession(nextSession));
    void studentAuth.auth.getSession().then(({data:current,error:sessionError})=>{
      if(active){if(sessionError)setError(sessionError.message);setStudentSession(current.session);}
    }).catch((cause:unknown)=>{if(active)setError((cause as Error).message);});
    return()=>{active=false;data.subscription.unsubscribe();};
  },[studentAuth]);

  useEffect(()=>{
    let active=true;
    setStudentAccess(false);setStudentIdentity(null);setStudentProfileRequired(false);setStudentBlockedReason('');
    if(!studentSession||!store||isStoreStaff)return;
    void (async()=>{
      try{
        const token=await currentStudentToken();
        const status=await fitnessApi.studentStatus(store,token);
        if(!active)return;
        setStudentPhone(studentSession.user.phone||'');
        if(!status.registered||!status.client_id){setStudentProfileRequired(true);return;}
        const identity={client_id:status.client_id,name:status.name||'Aluno'};
        const gate=await fitnessApi.studentSession(store,identity.client_id,'claim',token);
        if(active){setStudentIdentity(identity);setStudentAccess(gate.authorized);setStudentBlockedReason(gate.authorized?'':gate.reason||'SESSION_REVOKED');setStudentName(identity.name);}
      }catch(cause){if(active)setError((cause as Error).message);}
    })();
    return()=>{active=false;};
  },[studentSession?.access_token,store,isStoreStaff,currentStudentToken]);

  useEffect(()=>{
    if(!studentSession||!studentIdentity||!studentAccess||isStoreStaff)return;
    let active=true;
    const check=async()=>{
      try{
        const token=await currentStudentToken();
        const gate=await fitnessApi.studentSession(store,studentIdentity.client_id,'check',token);
        if(active&&!gate.authorized){setStudentAccess(false);setStudentBlockedReason(gate.reason||'SESSION_REVOKED');}
      }catch(cause){if(active)setAppointmentsError((cause as Error).message);}
    };
    const timer=window.setInterval(()=>void check(),30_000);
    const onFocus=()=>void check();
    window.addEventListener('focus',onFocus);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',onFocus);};
  },[studentSession?.access_token,studentIdentity?.client_id,studentAccess,isStoreStaff,store,currentStudentToken]);

  useEffect(()=>{
    let active=true;
    setOffers([]);setPublished([]);setOtherServices([]);setContentLinks([]);setPublications([]);setSelected('');setSlot(null);setAccepted(false);setError('');setLoading(true);
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
        if(active){setPublished(valid);setOffers(valid.filter(item=>item.availability.slots.length>0));setOtherServices(data.services.filter(service=>['general','nutrition'].includes(service.kind)&&identified(service)&&service.price_cents>0&&service.duration_minutes>0&&Boolean(service.description?.trim())));setContentLinks((data.links||[]).filter(link=>{try{const url=new URL(link.url);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}}));setPublications(data.publications||[]);}
      })
      .catch(cause=>{if(active)setError((cause as Error).message);})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[store,refresh]);

  useEffect(()=>{
    let active=true;
    setAppointments([]);setAppointmentsError('');
    if(!store||!studentSession||!studentAccess||isStoreStaff)return;
    void currentStudentToken().then(token=>fitnessApi.myAppointments(store,token)).then(result=>{
      if(!Array.isArray(result.appointments))throw new Error('Resposta inválida do histórico de reservas.');
      if(active)setAppointments(result.appointments);
    }).catch(cause=>{if(active)setAppointmentsError((cause as Error).message);});
    return()=>{active=false;};
  },[store,studentSession?.access_token,studentAccess,isStoreStaff,refresh,currentStudentToken]);

  const sendStudentCode=async(event:FormEvent)=>{
    event.preventDefault();if(busy||!studentAuth)return;
    const phone=normalizePhone(studentPhone);
    if(!phone){setError('Informe um telefone válido com DDD.');return;}
    if(!captcha){setError('Conclua a verificação anti-robô para receber o código.');return;}
    setBusy(true);setError('');setNotice('');
    try{
      const {error:authError}=await studentAuth.auth.signInWithOtp({phone,options:{shouldCreateUser:true,captchaToken:captcha}});
      if(authError)throw authError;
      setStudentPhone(phone);setOtpSent(true);setOtp('');setCaptcha('');setCaptchaReset(value=>value+1);
      setNotice('Código enviado por SMS. Confirme o telefone para continuar.');
    }catch(cause){setError((cause as Error).message);setCaptcha('');setCaptchaReset(value=>value+1);}
    finally{setBusy(false);}
  };

  const verifyStudentCode=async(event:FormEvent)=>{
    event.preventDefault();if(busy||!studentAuth)return;
    setBusy(true);setError('');setNotice('');
    try{
      const {data,error:verifyError}=await studentAuth.auth.verifyOtp({phone:normalizePhone(studentPhone)||studentPhone,token:otp,type:'sms'});
      if(verifyError)throw verifyError;
      if(!data.session)throw new Error('O código não abriu uma sessão. Solicite outro código.');
      setStudentSession(data.session);setOtpSent(false);setOtp('');
    }catch(cause){setError((cause as Error).message);}
    finally{setBusy(false);}
  };

  const registerStudentProfile=async(event:FormEvent)=>{
    event.preventDefault();if(!studentSession||busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      const token=await currentStudentToken();
      const verifiedPhone=studentSession.user.phone||'';
      const created=await fitnessApi.registerStudent(store,studentName.trim(),verifiedPhone,token) as {client_id:string};
      const identity={client_id:created.client_id,name:studentName.trim()};
      const gate=await fitnessApi.studentSession(store,identity.client_id,'claim',token);
      setStudentIdentity(identity);setStudentAccess(gate.authorized);setStudentProfileRequired(false);
      setStudentBlockedReason(gate.authorized?'':gate.reason||'SESSION_REVOKED');
      if(gate.authorized)setNotice('Telefone confirmado. Agora você pode reservar e consultar suas fichas nesta loja.');
    }catch(cause){setError((cause as Error).message);}
    finally{setBusy(false);}
  };

  const signOutStudent=async()=>{
    if(!studentAuth||busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      if(studentSession&&studentIdentity&&studentAccess){
        const token=await currentStudentToken();
        await fitnessApi.studentSession(store,studentIdentity.client_id,'release',token);
      }
      const {error:signOutError}=await studentAuth.auth.signOut({scope:'local'});
      if(signOutError)throw signOutError;
      setStudentSession(null);setStudentIdentity(null);setStudentAccess(false);setStudentProfileRequired(false);setOtpSent(false);
    }catch(cause){setError((cause as Error).message);}
    finally{setBusy(false);}
  };

  const book=async(event:FormEvent)=>{
    event.preventDefault();if(busy||!chosen||!slot||!accepted||!studentAccess||!studentIdentity||isStoreStaff)return;
    setBusy(true);setError('');setNotice('');
    try{
      const token=await currentStudentToken();
      await fitnessApi.book(store,chosen.service.id,slot.starts_at,slot.professional_id,true,token);
      setSlot(null);setAccepted(false);setSelected('');
      setNotice('Reserva registrada no servidor. Confira os detalhes e o estado do agendamento no seu acesso. Nenhuma cobrança foi realizada.');
      setRefresh(value=>value+1);
    }catch(cause){setError((cause as Error).message);}
    finally{setBusy(false);}
  };

  const cancel=async(appointment:FitnessAppointment)=>{
    if(busy||!window.confirm('Cancelar este agendamento? O registro ficará no histórico.'))return;
    setBusy(true);setError('');setNotice('');
    try{await fitnessApi.cancel(appointment.id,await currentStudentToken());setNotice('Cancelamento registrado no servidor.');setRefresh(value=>value+1);}
    catch(cause){setError((cause as Error).message);}
    finally{setBusy(false);}
  };

  const reschedule=async(appointment:FitnessAppointment)=>{
    const key=newSlot[appointment.id];
    const availability=published.find(item=>item.service.id===appointment.service_id);
    const chosenSlot=availability?.availability.slots.find(item=>`${item.starts_at}:${item.professional_id}`===key);
    if(busy||!chosenSlot)return;
    setBusy(true);setError('');setNotice('');
    try{await fitnessApi.reschedule(appointment.id,chosenSlot.starts_at,chosenSlot.professional_id,await currentStudentToken());setNotice('Reagendamento registrado no servidor. O histórico anterior foi preservado.');setRefresh(value=>value+1);}
    catch(cause){setError((cause as Error).message);}
    finally{setBusy(false);}
  };

  const matches=(value:string)=>normalizeText(value).includes(normalizeText(query));
  const visibleOffers=offers.filter(item=>matches(`${item.service.name} ${item.service.description}`));
  const visibleServices=otherServices.filter(item=>item.kind==='general'&&matches(`${item.name} ${item.description}`));
  const visibleConsultations=otherServices.filter(item=>item.kind==='nutrition'&&matches(`${item.name} ${item.description}`));
  const visibleLinks=contentLinks.filter(item=>matches(item.label));
  const visiblePublications=publications.filter(item=>matches(`${item.title} ${item.body} ${item.author_name}`));
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
        {!studentAuth?<p role="alert">O acesso ao Supabase não está configurado.</p>
          :isStoreStaff?<p className="business-muted">Esta conta administra a loja. Use a entrada de aluno para uma conta pessoal separada.</p>
          :!studentSession?otpSent?<form className="fitness-access-form" onSubmit={verifyStudentCode}>
            <p>Digite o código recebido por SMS. Nenhum e-mail ou senha é necessário.</p>
            <label>Código de acesso<input required autoComplete="one-time-code" inputMode="numeric" minLength={4} maxLength={8} value={otp} onChange={event=>setOtp(event.target.value.replace(/\D/g,'').slice(0,8))}/></label>
            <button className="secondary-button" disabled={busy||otp.trim().length<4}>{busy?'Verificando…':'Confirmar código'}</button>
            <button type="button" className="text-link" disabled={busy} onClick={()=>{setOtpSent(false);setOtp('');setCaptcha('');}}>Solicitar outro código</button>
          </form>:<form className="fitness-access-form" onSubmit={sendStudentCode}>
            <p>Entre com seu telefone confirmado por SMS para reservar e consultar seus treinos. O mesmo acesso funciona no portal Fitness.</p>
            <label>Telefone<input required type="tel" inputMode="tel" autoComplete="tel" placeholder="+55 11 99999-9999" value={studentPhone} onChange={event=>setStudentPhone(event.target.value)}/></label>
            <TurnstileWidget siteKey={appConfig.turnstileSiteKey} action="fitness-student-phone" onToken={setCaptcha} resetSignal={captchaReset}/>
            {!appConfig.turnstileSiteKey&&<small>A proteção anti-robô precisa ser configurada antes de enviar códigos.</small>}
            <button className="secondary-button" disabled={busy||!captcha||!appConfig.turnstileSiteKey}>{busy?'Enviando…':'Receber código por SMS'}</button>
          </form>
          :studentProfileRequired?<form className="fitness-access-form" onSubmit={registerStudentProfile}>
            <p>Telefone confirmado. Informe o nome que o profissional reconhecerá ao atribuir treinos.</p>
            <label>Seu nome<input required minLength={2} maxLength={120} autoComplete="name" value={studentName} onChange={event=>setStudentName(event.target.value)}/></label>
            <button className="secondary-button" disabled={busy||studentName.trim().length<2}>{busy?'Salvando…':'Continuar'}</button>
          </form>
          :studentBlockedReason?<div className="fitness-access-form">
            <p role="alert">{studentBlockedReason==='SESSION_LIMIT'?'Já existe outra sessão Fitness autorizada para este aluno nesta loja. Peça ao Admin para liberar a troca e entre novamente por SMS.':'Esta sessão Fitness foi revogada. Entre novamente por SMS após a liberação do Admin.'}</p>
            <button type="button" className="secondary-button" disabled={busy} onClick={()=>void signOutStudent()}>Sair e entrar novamente</button>
          </div>
          :studentAccess&&studentIdentity?<form className="fitness-access-form" onSubmit={book}>
            <p>Conta confirmada por telefone: <strong>{studentIdentity.name}</strong>.</p>
            <label className="fitness-check"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>Li e aceito as regras de cancelamento e reagendamento exibidas acima.</span></label>
            <button className="primary-button" disabled={busy||!slot||!accepted}>{busy?'Confirmando no servidor…':'Confirmar reserva'}</button>
            <button type="button" className="text-link" disabled={busy} onClick={()=>void signOutStudent()}>Sair do Fitness</button>
          </form>
          :<p role="status">Validando sua sessão Fitness…</p>}
      </div>}
    </>)}
    {showServices&&!loading&&<div className="fitness-other-services"><h2>Serviços</h2>{visibleServices.length?<div className="business-public-grid">{visibleServices.map(service=><article className="business-card" key={service.id}><span className="business-badge">{service.duration_minutes} min</span><h3>{service.name}</h3><p>{service.description}</p><p className="business-provider">Atendimento: <strong>{service.professional!.name}</strong> · {service.professional!.council} {service.professional!.registration}</p><strong>{money(service.price_cents)}</strong><small>Agendamento online ainda não disponível para este serviço.</small></article>)}</div>:<p role="status" className="business-muted">{query?'Nenhum serviço corresponde à busca.':'Nenhum serviço publicado no momento.'}</p>}</div>}
    {showContent&&!loading&&<div className="fitness-other-services"><h2>Conteúdos</h2>{visibleLinks.length||visiblePublications.length?<div className="business-public-grid">{visiblePublications.map(post=><article className="business-card" key={post.id}><span className="business-badge">{post.category==='nutrition'?'Nutrição':post.category==='training'?'Treinamento':'Conteúdo da loja'}</span><h3>{post.title}</h3><p>{post.body}</p><p className="business-provider">Responsável: <strong>{post.author_name}</strong> · {post.author_council} {post.author_registration}</p></article>)}{visibleLinks.map(link=><a className="business-card" href={link.url} target="_blank" rel="noopener noreferrer" key={link.id}>{link.label} ↗</a>)}</div>:<p role="status" className="business-muted">{query?'Nenhum conteúdo corresponde à busca.':'Nenhum conteúdo publicado no momento.'}</p>}</div>}
    {studentSession&&studentAccess&&studentIdentity&&!isStoreStaff&&<div className="business-card fitness-my-appointments"><h3>Meus agendamentos</h3>{appointmentsError?<p role="alert">Não foi possível consultar seus agendamentos: {appointmentsError}</p>:appointments.length===0?<p>Nenhum agendamento encontrado para esta conta e loja.</p>:<ul className="fitness-records">{appointments.map(item=>{
      const service=published.find(offer=>offer.service.id===item.service_id);
      const open=['scheduled','confirmed'].includes(item.status);
      return <li key={item.id}><strong>{service?.service.name||'Acompanhamento'} · {dateTime(item.starts_at)}</strong><span>Situação: {appointmentStatus[item.status]||item.status}</span>{open&&<><div className="fitness-policies"><p><strong>Cancelamento:</strong> {item.cancel_policy||service?.availability.cancel_policy||'Consulte as condições informadas na reserva.'}</p><p><strong>Reagendamento:</strong> {item.reschedule_policy||service?.availability.reschedule_policy||'Consulte as condições informadas na reserva.'}</p></div><div className="fitness-appointment-actions"><button type="button" className="secondary-button" disabled={busy} onClick={()=>void cancel(item)}>Cancelar reserva</button>{service&&service.availability.slots.length>0&&<><label>Novo horário<select value={newSlot[item.id]||''} onChange={event=>setNewSlot(current=>({...current,[item.id]:event.target.value}))}><option value="">Selecione</option>{service.availability.slots.map(option=><option key={`${option.starts_at}:${option.professional_id}`} value={`${option.starts_at}:${option.professional_id}`}>{dateTime(option.starts_at)}</option>)}</select></label><button type="button" className="secondary-button" disabled={busy||!newSlot[item.id]} onClick={()=>void reschedule(item)}>Reagendar</button></>}</div></>}</li>;
    })}</ul>}</div>}
    {studentSession&&studentAccess&&studentIdentity&&!isStoreStaff&&<FitnessStudentWorkouts store={store} accessToken={studentSession.access_token}/>}
    {user&&!isStoreStaff&&<FitnessStudentPreferences store={store} userId={user.id}/>} 
  </section>;
}
