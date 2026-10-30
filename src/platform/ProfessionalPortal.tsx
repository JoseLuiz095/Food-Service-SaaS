import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabaseClient } from '../lib/supabase';
import { professionalApi, type OwnAssignment, type ProfessionalPublication, type AuthorizedStudent, type MessageRecipient } from './professionalApi';
import './business.css';

/** Área própria: não carrega painel do lojista nem dados de alunos. */
export default function ProfessionalPortal(){
  const {user,loading:authLoading,signOut}=useAuth();
  const [email,setEmail]=useState('');
  const [items,setItems]=useState<OwnAssignment[]>([]);
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [selectedStore,setSelectedStore]=useState('');
  const [publications,setPublications]=useState<ProfessionalPublication[]>([]);
  const [authorizedStudents,setAuthorizedStudents]=useState<AuthorizedStudent[]>([]);
  const [messageRecipients,setMessageRecipients]=useState<MessageRecipient[]>([]);
  const [postTitle,setPostTitle]=useState('');
  const [postBody,setPostBody]=useState('');
  const [postCategory,setPostCategory]=useState<'commercial'|'training'|'nutrition'>('commercial');
  const [postChannel,setPostChannel]=useState<ProfessionalPublication['channel']>('storefront');
  const [postRecipient,setPostRecipient]=useState('');
  const [postSchedule,setPostSchedule]=useState('');
  const [approved,setApproved]=useState(false);
  const [aiMode,setAiMode]=useState<'question'|'post_ideas'|'calendar'>('post_ideas');
  const [aiPrompt,setAiPrompt]=useState('');
  const [aiAnswer,setAiAnswer]=useState('');
  const [activePublication,setActivePublication]=useState('');
  const selectedAssignment=useMemo(()=>items.find(item=>item.store_id===selectedStore)||items[0],[items,selectedStore]);
  const eligibleRecipients=useMemo(()=>messageRecipients.filter(item=>postCategory==='commercial'||postCategory==='training'&&item.training_authorized||postCategory==='nutrition'&&item.nutrition_authorized),[messageRecipients,postCategory]);
  useEffect(()=>{
    let active=true;setItems([]);setError('');
    if(!user)return;
    setLoading(true);
    void professionalApi.mine().then(result=>{if(active){setItems(result);setSelectedStore(current=>current||result[0]?.store_id||'');}}).catch(cause=>{if(active)setError((cause as Error).message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[user?.id]);
  useEffect(()=>{
    let active=true;setPublications([]);setAuthorizedStudents([]);setMessageRecipients([]);
    if(!selectedAssignment)return;
    void Promise.all([professionalApi.publications(selectedAssignment.store_id),professionalApi.authorizedStudents(selectedAssignment.store_id),professionalApi.messageRecipients(selectedAssignment.store_id)])
      .then(([posts,students,recipients])=>{if(active){setPublications(posts);setAuthorizedStudents(students);setMessageRecipients(recipients);}})
      .catch(cause=>{if(active)setError((cause as Error).message);});
    return()=>{active=false;};
  },[selectedAssignment?.store_id]);
  const requestLink=async(event:FormEvent)=>{
    event.preventDefault();if(busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      const {error:authError}=await getSupabaseClient().auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:`${window.location.origin}/profissional`,shouldCreateUser:false}});
      if(authError)throw authError;
      setNotice('Se esta conta estiver cadastrada, o link de acesso será enviado ao e-mail informado.');
    }catch(cause){setError((cause as Error).message);}
    finally{setBusy(false);}
  };
  const useAssistant=async(event:FormEvent)=>{
    event.preventDefault();if(busy||!selectedAssignment)return;
    setBusy(true);setError('');setNotice('');setAiAnswer('');
    try{
      const {data,error:invokeError}=await getSupabaseClient().functions.invoke('food-professional-assistant',{body:{store_id:selectedAssignment.store_id,mode:aiMode,prompt:aiPrompt}});
      if(invokeError)throw invokeError;
      const response=String(data?.text||'');if(!response)throw new Error('O assistente não retornou uma sugestão.');
      setAiAnswer(response);if(aiMode==='post_ideas'||aiMode==='calendar')setPostBody(response);
    }catch(cause){setError((cause as Error).message||'Assistente indisponível.');}
    finally{setBusy(false);}
  };
  const saveDraft=async()=>{
    if(busy||!selectedAssignment)return;
    setBusy(true);setError('');setNotice('');
    try{
      await professionalApi.savePublication({store:selectedAssignment.store_id,id:activePublication||undefined,title:postTitle.trim(),body:postBody.trim(),category:postCategory,channel:postChannel,recipient:postRecipient||undefined});
      const next=await professionalApi.publications(selectedAssignment.store_id);setPublications(next);setPostTitle('');setPostBody('');setActivePublication('');setPostRecipient('');setApproved(false);setNotice('Rascunho privado salvo. Nenhum conteúdo foi publicado ou enviado.');
    }catch(cause){setError((cause as Error).message);}
    finally{setBusy(false);}
  };
  const saveAndSchedule=async(event:FormEvent)=>{
    event.preventDefault();if(busy||!selectedAssignment||!approved||!postSchedule)return;
    setBusy(true);setError('');setNotice('');
    try{
      const saved=await professionalApi.savePublication({store:selectedAssignment.store_id,id:activePublication||undefined,title:postTitle.trim(),body:postBody.trim(),category:postCategory,channel:postChannel,recipient:postRecipient||undefined}) as {id?:string};
      if(!saved.id&&!activePublication)throw new Error('Não foi possível identificar o rascunho para agendamento.');
      await professionalApi.approvePublication(selectedAssignment.store_id,activePublication||saved.id!,new Date(postSchedule).toISOString());
      const next=await professionalApi.publications(selectedAssignment.store_id);setPublications(next);setPostTitle('');setPostBody('');setPostSchedule('');setActivePublication('');setPostRecipient('');setApproved(false);setNotice(postChannel==='storefront'?'Publicação aprovada por você e programada para a vitrine.':'Envio aprovado por você e programado para a caixa de entrada do aluno.');
    }catch(cause){setError((cause as Error).message);}
    finally{setBusy(false);}
  };
  const cancelPublication=async(id:string)=>{
    if(busy||!selectedAssignment)return;
    setBusy(true);setError('');setNotice('');
    try{await professionalApi.cancelPublication(selectedAssignment.store_id,id);setPublications(await professionalApi.publications(selectedAssignment.store_id));setNotice('Publicação cancelada e mantida no histórico.');}
    catch(cause){setError((cause as Error).message);}
    finally{setBusy(false);}
  };
  const editPublication=(post:ProfessionalPublication)=>{setActivePublication(post.id);setPostTitle(post.title);setPostBody(post.body);setPostCategory(post.category);setPostChannel(post.channel);setPostRecipient(post.recipient_student_user_id||'');setPostSchedule(post.scheduled_at||'');setApproved(false);};
  return <main className="container business-workspace"><section className="business-card"><span className="eyebrow">VENDEWEB · ÁREA PROFISSIONAL</span><h1>Minhas atribuições</h1><p>Consulte seus serviços nas lojas às quais sua conta está vinculada. Dados de alunos exigem autorização individual e não aparecem nesta área.</p>
    {authLoading||loading?<p role="status">Verificando acesso e atribuições…</p>:!user?<form className="business-form-grid" onSubmit={event=>void requestLink(event)}><label>E-mail da conta profissional<input required type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)}/></label><button className="primary-button" disabled={busy}>{busy?'Enviando…':'Receber link de acesso'}</button></form>:<><p>Conta: {user.email}</p>{items.length?<><label>Loja profissional<select value={selectedAssignment?.store_id||''} onChange={event=>setSelectedStore(event.target.value)}>{items.map(item=><option value={item.store_id} key={item.store_id}>{item.store_name} · {item.council} {item.registration}</option>)}</select></label><div className="business-public-grid">{items.map(item=><article className="business-card" key={item.store_id}><h2>{item.store_name}</h2><p><strong>{item.name}</strong> · {item.council} {item.registration}</p><h3>Serviços atribuídos</h3>{item.services.length?<ul>{item.services.map(service=><li key={service.id}>{service.name}</li>)}</ul>:<p>Nenhum serviço atribuído nesta loja.</p>}</article>)}</div>
      <section className="business-card"><h2>Assistente profissional</h2><p>Use dúvidas gerais, ideias comerciais ou calendário. Não envie informações de alunos. Sugestões são rascunhos e não publicam sozinhas.</p><form className="business-form-grid" onSubmit={event=>void useAssistant(event)}><label>Tarefa<select value={aiMode} onChange={event=>setAiMode(event.target.value as typeof aiMode)}><option value="question">Dúvida de uso ou comunicação</option><option value="post_ideas">Ideias de publicação</option><option value="calendar">Calendário de publicações</option></select></label><label>O que deseja preparar?<textarea required maxLength={700} value={aiPrompt} onChange={event=>setAiPrompt(event.target.value)} placeholder="Ex.: ideias para apresentar o novo serviço da loja"/></label><button className="secondary-button" disabled={busy}>{busy?'Preparando…':'Pedir sugestão à IA'}</button></form>{aiAnswer&&<div role="status" className="business-message"><strong>Sugestão para revisão</strong><p>{aiAnswer}</p>{aiMode==='question'&&<small>Esta resposta não é orientação clínica ou individual de saúde.</small>}{aiMode!=='question'&&<small>O texto também está no rascunho de publicação. Revise antes de salvar ou aprovar.</small>}</div>}</section>
      <section className="business-card"><h2>Publicação ou envio</h2><p>Revise todo o conteúdo antes de programar. A publicação na vitrine é pública; o envio interno só pode ir a um aluno que autorizou receber mensagens deste profissional. Conteúdo de Treinamento ou Nutrição também exige autorização clínica correspondente.</p>
        <form className="business-form-grid" onSubmit={event=>void saveAndSchedule(event)}>
          <label>Destino<select value={postChannel} onChange={event=>{setPostChannel(event.target.value as ProfessionalPublication['channel']);setPostRecipient('');setApproved(false);}}><option value="storefront">Publicar na vitrine</option><option value="student_message">Enviar pela VendeWeb a um aluno autorizado</option></select></label>
          {postChannel==='student_message'&&<label>Aluno destinatário<select required value={postRecipient} onChange={event=>{setPostRecipient(event.target.value);setApproved(false);}}><option value="">Selecione um aluno que autorizou mensagens</option>{eligibleRecipients.map(person=><option value={person.student_user_id} key={person.student_user_id}>{person.name}</option>)}</select>{!eligibleRecipients.length&&<small>Não há alunos com consentimento compatível com esta categoria.</small>}</label>}
          <label>Título<input required maxLength={120} value={postTitle} onChange={event=>{setPostTitle(event.target.value);setApproved(false);}}/></label>
          <label>Categoria<select value={postCategory} onChange={event=>{setPostCategory(event.target.value as typeof postCategory);setPostRecipient('');setApproved(false);}}><option value="commercial">Comercial</option>{selectedAssignment.kind==='training'&&<option value="training">Treinamento</option>}{selectedAssignment.kind==='nutrition'&&<option value="nutrition">Nutrição</option>}</select></label>
          <label>Conteúdo<textarea required maxLength={3000} value={postBody} onChange={event=>{setPostBody(event.target.value);setApproved(false);}}/></label>
          <label>Data e hora programadas<input required type="datetime-local" value={postSchedule} onChange={event=>{setPostSchedule(event.target.value);setApproved(false);}}/></label>
          <label className="fitness-check"><input type="checkbox" checked={approved} onChange={event=>setApproved(event.target.checked)}/><span>Revisei este conteúdo e aprovo {postChannel==='storefront'?'sua publicação na vitrine':'seu envio ao aluno selecionado'} em meu nome e registro.</span></label>
          <div className="business-actions"><button type="button" className="secondary-button" disabled={busy||!postTitle.trim()||!postBody.trim()||(postChannel==='student_message'&&!postRecipient)} onClick={()=>void saveDraft()}>{busy?'Salvando…':activePublication?'Atualizar rascunho':'Salvar rascunho'}</button><button className="primary-button" disabled={busy||!approved||!postSchedule||(postChannel==='student_message'&&!postRecipient)}>{postChannel==='storefront'?'Revisar, aprovar e programar publicação':'Revisar, aprovar e programar envio'}</button></div>
        </form>
        <h3>Histórico e calendário</h3>{publications.length?<ul>{publications.map(post=><li key={post.id}><strong>{post.title}</strong> · {post.channel==='storefront'?'Vitrine':'Envio interno ao aluno'} · {post.author_name} · {post.author_council} {post.author_registration}<span>{post.status==='scheduled'?`Programado para ${new Date(post.scheduled_at||'').toLocaleString('pt-BR')}`:post.status==='published'?`${post.channel==='storefront'?'Publicado':'Enviado'} em ${new Date(post.published_at||'').toLocaleString('pt-BR')}`:post.status==='cancelled'?'Cancelado':'Rascunho'}</span>{post.status==='draft'&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>editPublication(post)}>Editar rascunho</button>}{['draft','scheduled'].includes(post.status)&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>void cancelPublication(post.id)}>Cancelar</button>}</li>)}</ul>:<p role="status">Nenhuma publicação ou envio no calendário.</p>}</section>
      <section className="business-card"><h2>Alunos que autorizaram acesso</h2><p>As autorizações são concedidas pelo próprio aluno e podem ser revogadas. Esta lista não contém dados clínicos.</p>{authorizedStudents.length?<ul>{authorizedStudents.map(student=><li key={`${student.student_user_id}:${student.purpose}`}><strong>{student.name}</strong> · autorização de {student.purpose==='nutrition'?'Nutrição':'Treinamento'}</li>)}</ul>:<p role="status">Nenhum aluno autorizou acesso profissional nesta loja.</p>}</section>
      </>:<p role="status">Não há perfil profissional ativo nesta conta. Peça ao proprietário da loja para confirmar o vínculo e o registro.</p>}<button type="button" className="secondary-button" onClick={()=>void signOut()}>Sair</button></>}
    {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
  </section></main>;
}
