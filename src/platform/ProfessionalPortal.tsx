import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabaseClient } from '../lib/supabase';
import { professionalApi, type OwnAssignment } from './professionalApi';
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
  useEffect(()=>{
    let active=true;setItems([]);setError('');
    if(!user)return;
    setLoading(true);
    void professionalApi.mine().then(result=>{if(active)setItems(result);}).catch(cause=>{if(active)setError((cause as Error).message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[user?.id]);
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
  return <main className="container business-workspace"><section className="business-card"><span className="eyebrow">VENDEWEB · ÁREA PROFISSIONAL</span><h1>Minhas atribuições</h1><p>Consulte seus serviços nas lojas às quais sua conta está vinculada. Dados de alunos exigem autorização individual e não aparecem nesta área.</p>
    {authLoading||loading?<p role="status">Verificando acesso e atribuições…</p>:!user?<form className="business-form-grid" onSubmit={event=>void requestLink(event)}><label>E-mail da conta profissional<input required type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)}/></label><button className="primary-button" disabled={busy}>{busy?'Enviando…':'Receber link de acesso'}</button></form>:<><p>Conta: {user.email}</p>{items.length?<div className="business-public-grid">{items.map(item=><article className="business-card" key={item.store_id}><h2>{item.store_name}</h2><p><strong>{item.name}</strong> · {item.council} {item.registration}</p><h3>Serviços atribuídos</h3>{item.services.length?<ul>{item.services.map(service=><li key={service.id}>{service.name}</li>)}</ul>:<p>Nenhum serviço atribuído nesta loja.</p>}</article>)}</div>:<p role="status">Não há perfil profissional ativo nesta conta. Peça ao proprietário da loja para confirmar o vínculo e o registro.</p>}<button type="button" className="secondary-button" onClick={()=>void signOut()}>Sair</button></>}
    {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
  </section></main>;
}
