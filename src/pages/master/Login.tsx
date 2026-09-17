import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { DEMO_CREDENTIALS, useAuth } from '../../contexts/AuthContext';
import { TurnstileWidget } from '../../components/ui/TurnstileWidget';
import { appConfig } from '../../lib/config';

export default function MasterLogin(){
  const {signIn,user,platformAdmin,loading,error,mode}=useAuth();
  const [email,setEmail]=useState(mode==='demo'?DEMO_CREDENTIALS.email:'');
  const [password,setPassword]=useState(mode==='demo'?DEMO_CREDENTIALS.password:'');
  const [show,setShow]=useState(false);
  const [captchaToken,setCaptchaToken]=useState('');
  const [captchaReset,setCaptchaReset]=useState(0);
  const navigate=useNavigate();const location=useLocation();
  const captchaRequired=mode!=='demo';
  const receiveCaptcha=useCallback((token:string)=>setCaptchaToken(token),[]);

  useEffect(()=>{if(user&&platformAdmin)navigate('/admin-master',{replace:true})},[user,platformAdmin,navigate]);
  const submit=async(e:FormEvent)=>{
    e.preventDefault();
    if(captchaRequired&&!captchaToken)return;
    const ok=await signIn(email,password,'platform',captchaToken);
    if(ok){const from=(location.state as {from?:string}|null)?.from;navigate(from&&from.startsWith('/admin-master')?from:'/admin-master',{replace:true});return;}
    if(captchaRequired)setCaptchaReset((value)=>value+1);
  };

  return <div className="login-page master-login-page"><section className="login-brand-panel"><div className="login-brand"><ShieldCheck size={30}/><strong>FoodWeb</strong></div><div><span className="eyebrow">GESTÃO DA PLATAFORMA</span><h1>Controle lojas, planos e acessos em um só lugar.</h1><p>Área exclusiva do administrador da plataforma. Os dados de cada estabelecimento permanecem isolados por loja.</p></div><div className="login-quote">Uma base única, várias lojas, sem misturar catálogo ou pedidos.</div></section><section className="login-form-panel"><form onSubmit={submit}><div className="login-form-title"><span className="eyebrow">ADMIN MASTER</span><h2>Acessar gestão central</h2><p>Entre com um usuário cadastrado em <code>food_platform_admins</code>.</p></div><label>E-mail<div className="input-with-icon"><Mail size={18}/><input required value={email} onChange={e=>setEmail(e.target.value)} type="email" autoComplete="email"/></div></label><label>Senha<div className="input-with-icon"><LockKeyhole size={18}/><input required value={password} onChange={e=>setPassword(e.target.value)} type={show?'text':'password'} autoComplete="current-password"/><button type="button" onClick={()=>setShow(v=>!v)} aria-label="Mostrar ou ocultar senha">{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>{captchaRequired&&<div className="login-security-card"><div><ShieldCheck size={18}/><span><strong>Verificação de segurança</strong><small>Obrigatória antes de autenticar o Admin Master.</small></span></div><TurnstileWidget siteKey={appConfig.turnstileSiteKey} action="login" onToken={receiveCaptcha} resetSignal={captchaReset}/></div>}{error&&<div className="form-error">{error}</div>}<div className="login-help-row"><span></span><Link to="/admin/esqueci-senha">Esqueceu sua senha?</Link></div><button className="primary-button" type="submit" disabled={loading||(captchaRequired&&!captchaToken)}>{loading?'Entrando...':captchaRequired&&!captchaToken?'Conclua a verificação':'Entrar no Admin Master'}</button><Link className="login-back" to="/admin/login">Ir para administração de uma loja</Link>{mode!=='demo'&&!appConfig.turnstileSiteKey&&<small className="security-config-warning">Turnstile não está configurado neste build.</small>}</form></section></div>;
}
