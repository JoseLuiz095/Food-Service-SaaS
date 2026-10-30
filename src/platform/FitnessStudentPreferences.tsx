import { useEffect, useState, type FormEvent } from 'react';
import { professionalApi, type StudentReminder, type ReminderDelivery, type ProfessionalAuthorization, type ProfessionalMessage } from './professionalApi';
import { subscribeToPwaPush, pwaPushStatus } from '../services/pwaNotifications';

const kinds:Record<StudentReminder['kind'],string>={workout:'Treino',appointment:'Agenda',hydration:'Hidratação',routine:'Outra rotina'};
const days=[['D','Domingo'],['S','Segunda'],['T','Terça'],['Q','Quarta'],['Q','Quinta'],['S','Sexta'],['S','Sábado']] as const;

export function FitnessStudentPreferences({store,userId}:{store:string;userId:string}){
  const [reminders,setReminders]=useState<StudentReminder[]>([]);
  const [inbox,setInbox]=useState<ReminderDelivery[]>([]);
  const [professionals,setProfessionals]=useState<ProfessionalAuthorization[]>([]);
  const [messages,setMessages]=useState<ProfessionalMessage[]>([]);
  const [kind,setKind]=useState<StudentReminder['kind']>('workout');
  const [label,setLabel]=useState('Lembrete de treino');
  const [time,setTime]=useState('08:00');
  const [weekdays,setWeekdays]=useState<number[]>([0,1,2,3,4,5,6]);
  const [channel,setChannel]=useState<StudentReminder['channel']>('in_app');
  const [editingReminder,setEditingReminder]=useState('');
  const [pauseUntil,setPauseUntil]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const pushReady=pwaPushStatus()==='available';
  const reload=async()=>{
    const [next,auth,received]=await Promise.all([professionalApi.reminders(store),professionalApi.authorizationList(store),professionalApi.messages(store)]);
    setReminders(next.reminders||[]);setInbox(next.inbox||[]);setProfessionals(auth.professionals||[]);setMessages(received||[]);
  };
  useEffect(()=>{let active=true;setLoading(true);setError('');void Promise.all([professionalApi.reminders(store),professionalApi.authorizationList(store),professionalApi.messages(store)]).then(([next,auth,received])=>{if(active){setReminders(next.reminders||[]);setInbox(next.inbox||[]);setProfessionals(auth.professionals||[]);setMessages(received||[]);}}).catch(cause=>{if(active)setError((cause as Error).message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[store,userId]);
  const act=async(fn:()=>Promise<unknown>,message:string)=>{if(busy)return;setBusy(true);setError('');setNotice('');try{await fn();await reload();setNotice(message);}catch(cause){setError((cause as Error).message);}finally{setBusy(false);}};
  const save=async(event:FormEvent)=>{
    event.preventDefault();if(busy||weekdays.length===0)return;
    setBusy(true);setError('');setNotice('');
    try{
      if(channel==='push')await subscribeToPwaPush(store,userId,'student');
      await professionalApi.saveReminder({store,id:editingReminder||undefined,kind,label:label.trim(),time,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',weekdays,channel});
      await reload();setEditingReminder('');setNotice(editingReminder?'Lembrete atualizado. Você pode ajustar, pausar ou desligar quando quiser.':'Lembrete pessoal salvo. Ajuste, pause ou desligue quando quiser.');
    }catch(cause){setError((cause as Error).message);}
    finally{setBusy(false);}
  };
  const changeKind=(next:StudentReminder['kind'])=>{setKind(next);setLabel(({workout:'Lembrete de treino',appointment:'Lembrete de agenda',hydration:'Lembrete de hidratação',routine:'Minha rotina'})[next]);};
  const editReminder=(item:StudentReminder)=>{setEditingReminder(item.id);setKind(item.kind);setLabel(item.label);setTime(item.reminder_time.slice(0,5));setWeekdays(item.weekdays);setChannel(item.channel);};
  const pause=async(id:string)=>{
    if(!pauseUntil){setError('Escolha até quando deseja pausar.');return;}
    await act(()=>professionalApi.reminderAction(store,id,'pause',new Date(pauseUntil).toISOString()),'Lembrete pausado.');
  };
  return <section className="business-card fitness-student-preferences" aria-labelledby="student-routine-title">
    <h2 id="student-routine-title">Meus lembretes e permissões</h2>
    <p>Configure horários para treino, agenda, hidratação ou outras rotinas. O lembrete de hidratação não define quantidade de água nem orientação individual.</p>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {loading?<p role="status">Carregando suas preferências…</p>:<>
      <form className="business-form-grid" onSubmit={event=>void save(event)}>
        <label>Rotina<select value={kind} onChange={event=>changeKind(event.target.value as StudentReminder['kind'])}>{Object.entries(kinds).map(([value,name])=><option value={value} key={value}>{name}</option>)}</select></label>
        <label>Nome do lembrete<input required maxLength={100} value={label} onChange={event=>setLabel(event.target.value)}/></label>
        <label>Horário local<input required type="time" value={time} onChange={event=>setTime(event.target.value)}/></label>
        <fieldset><legend>Dias</legend><div className="fitness-student-days">{days.map(([short,name],day)=><label key={day} title={name}><input type="checkbox" aria-label={name} checked={weekdays.includes(day)} onChange={event=>setWeekdays(current=>event.target.checked?[...current,day].sort():current.filter(value=>value!==day))}/><span>{short}</span></label>)}</div></fieldset>
        <label>Canal<select value={channel} onChange={event=>setChannel(event.target.value as StudentReminder['channel'])}><option value="in_app">Na VendeWeb</option><option value="push" disabled={!pushReady}>Notificação no aparelho{pushReady?'':' · indisponível neste navegador'}</option></select></label>
        <button className="primary-button" disabled={busy||!label.trim()||weekdays.length===0}>{busy?'Salvando…':editingReminder?'Atualizar lembrete':'Adicionar lembrete'}</button>
        {editingReminder&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>setEditingReminder('')}>Cancelar edição</button>}
      </form>
      <h3>Meus lembretes</h3>{reminders.length?<ul>{reminders.map(item=><li key={item.id}><strong>{item.label}</strong><span>{item.reminder_time.slice(0,5)} · {item.weekdays.map(day=>days[day]?.[1]?.slice(0,3)).join(', ')} · {item.channel==='push'?'aparelho':'VendeWeb'} · {item.status==='active'?'Ativo':item.status==='paused'?'Pausado':'Desligado'}</span><div className="business-actions">{item.status!=='cancelled'&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>editReminder(item)}>Editar</button>}{item.status==='active'&&<><label>Pausar até<input type="datetime-local" value={pauseUntil} onChange={event=>setPauseUntil(event.target.value)}/></label><button type="button" className="secondary-button" disabled={busy||!pauseUntil} onClick={()=>void pause(item.id)}>Pausar</button></>}{item.status==='paused'&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>void act(()=>professionalApi.reminderAction(store,item.id,'resume'),'Lembrete retomado.')}>Retomar</button>}{item.status!=='cancelled'&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>void act(()=>professionalApi.reminderAction(store,item.id,'cancel'),'Lembrete desligado. Ele permanece no histórico.')}>Desligar</button>}</div></li>)}</ul>:<p role="status">Você ainda não configurou lembretes.</p>}
      <h3>Avisos recentes</h3>{inbox.filter(item=>item.status!=='seen').length?<ul>{inbox.filter(item=>item.status!=='seen').map(item=><li key={item.id}><strong>{item.label}</strong> · {new Date(item.planned_for).toLocaleString('pt-BR')}<button type="button" className="secondary-button" disabled={busy} onClick={()=>void act(()=>professionalApi.markReminderSeen(store,item.id),'Aviso marcado como visto.')}>Marcar como visto</button></li>)}</ul>:<p role="status">Nenhum aviso pendente.</p>}
      <h3>Mensagens profissionais</h3>{messages.length?<ul>{messages.map(item=><li key={item.id}><strong>{item.title}</strong><span>{item.author_name} · {item.author_council} {item.author_registration} · {new Date(item.sent_at).toLocaleString('pt-BR')}</span><p>{item.body}</p>{item.status==='sent'&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>void act(()=>professionalApi.markMessageSeen(store,item.id),'Mensagem marcada como lida.')}>Marcar como lida</button>}</li>)}</ul>:<p role="status">Nenhuma mensagem profissional recebida.</p>}
      <h3>Autorizações profissionais</h3><p>Controle separadamente o acesso profissional a informações de treinamento/nutrição e o recebimento de mensagens. Ambos podem ser revogados a qualquer momento.</p>{professionals.length?<ul>{professionals.map(person=><li key={person.user_id}><strong>{person.name}</strong> · {person.council} {person.registration}<label className="fitness-check"><input type="checkbox" checked={person.authorized} onChange={event=>void act(()=>professionalApi.authorize(store,person.user_id,person.kind,event.target.checked),event.target.checked?'Acesso profissional autorizado.':'Acesso profissional revogado.')}/><span>{person.authorized?'Acesso clínico autorizado':'Permitir acesso clínico'}</span></label><label className="fitness-check"><input type="checkbox" checked={person.message_enabled} onChange={event=>void act(()=>professionalApi.messagePermission(store,person.user_id,event.target.checked),event.target.checked?'Recebimento de mensagens autorizado.':'Recebimento de mensagens revogado.')}/><span>Receber mensagens deste profissional</span></label></li>)}</ul>:<p role="status">Nenhum prestador com serviço ativo está disponível para autorização nesta loja.</p>}
    </>}
  </section>;
}
