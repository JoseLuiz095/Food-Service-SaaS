import { Eye, EyeOff, LockKeyhole, Mail, ShoppingBag } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DEMO_CREDENTIALS, useAuth } from '../../contexts/AuthContext';

export default function AdminLogin(){
  const {signIn,user,membership,loading,error,mode}=useAuth();
  const [email,setEmail]=useState(mode==='demo'?DEMO_CREDENTIALS.email:'');
  const [password,setPassword]=useState(mode==='demo'?DEMO_CREDENTIALS.password:'');
  const [show,setShow]=useState(false);
  const navigate=useNavigate();
  const location=useLocation();
  useEffect(()=>{if(user&&membership)navigate('/admin',{replace:true})},[user,membership,navigate]);
  const submit=async(e:FormEvent)=>{e.preventDefault();const ok=await signIn(email,password,'store');if(ok){const from=(location.state as {from?:string}|null)?.from;navigate(from&&from.startsWith('/admin')?from:'/admin',{replace:true})}};
  return <div className="login-page"><section className="login-brand-panel"><div className="login-brand"><ShoppingBag size={30}/><strong>Food Service SaaS</strong></div><div><span className="eyebrow">PEDIDOS ONLINE</span><h1>Cardápio, pedidos e operação em um só lugar.</h1><p>Gerencie produtos, grupos de opções, delivery, retirada, pagamentos e pedidos do estabelecimento.</p></div><div className="login-quote">“O pedido é salvo primeiro. O WhatsApp é apenas um canal de contato.”</div></section><section className="login-form-panel"><form onSubmit={submit}><div className="login-form-title"><span className="eyebrow">ÁREA RESTRITA</span><h2>Acessar administração</h2><p>{mode==='demo'?'Use as credenciais de demonstração já preenchidas.':'Entre com o usuário cadastrado no Supabase Auth.'}</p></div><label>E-mail<div className="input-with-icon"><Mail size={18}/><input required value={email} onChange={e=>setEmail(e.target.value)} type="email" autoComplete="email"/></div></label><label>Senha<div className="input-with-icon"><LockKeyhole size={18}/><input required value={password} onChange={e=>setPassword(e.target.value)} type={show?'text':'password'} autoComplete="current-password"/><button type="button" onClick={()=>setShow(v=>!v)} aria-label="Mostrar ou ocultar senha">{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label><div className="login-help-row"><span></span><a href="/admin/esqueci-senha">Esqueceu sua senha?</a></div>{error&&<div className="form-error">{error}</div>}<button className="primary-button" type="submit" disabled={loading}>{loading?'Entrando...':'Entrar no painel'}</button><a href="/" className="login-back">← Voltar para a loja</a>{mode==='demo'&&<small className="demo-warning">Modo local de validação. Configure `.env` + Supabase para ativar autenticação e banco reais.</small>}</form></section></div>;
}
