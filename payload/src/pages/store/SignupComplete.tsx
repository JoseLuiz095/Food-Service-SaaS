import { CircleCheckBig, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getSupabaseClient } from '../../lib/supabase';
import { completeFoodSelfServiceSignup } from '../../services/selfServiceSignup';

export default function SignupComplete(){
  const navigate=useNavigate();
  const{refreshAccess}=useAuth();
  const[state,setState]=useState<'loading'|'success'|'error'>('loading');
  const[message,setMessage]=useState('Confirmando sua conta e preparando o FoodWeb...');

  useEffect(()=>{
    let active=true;
    const run=async()=>{
      try{
        const supabase=getSupabaseClient();
        let session=(await supabase.auth.getSession()).data.session;
        if(!session){
          await new Promise((resolve)=>window.setTimeout(resolve,700));
          session=(await supabase.auth.getSession()).data.session;
        }
        if(!session)throw new Error('A confirmação do e-mail foi concluída, mas a sessão ainda não está disponível. Entre com seu e-mail e senha para continuar.');
        const result=await completeFoodSelfServiceSignup();
        await refreshAccess();
        if(!active)return;
        setState('success');
        setMessage(result.trialGranted?'Seu Demo foi solicitado. O prazo começa após a aprovação do Admin Master. Abrindo o painel...':'Seu espaço de configuração foi criado e está aguardando liberação do Admin Master.');
        window.setTimeout(()=>navigate('/admin/primeiros-passos',{replace:true}),1000);
      }catch(e){
        if(!active)return;
        setState('error');
        setMessage(e instanceof Error?e.message:'Não foi possível concluir o cadastro.');
      }
    };
    void run();
    return()=>{active=false};
  },[navigate,refreshAccess]);

  return <div className="signup-complete-page"><div className="signup-complete-card">{state==='loading'?<LoaderCircle className="spin"/>:state==='success'?<CircleCheckBig/>:<TriangleAlert/>}<h1>{state==='loading'?'Concluindo cadastro':state==='success'?'Cadastro concluído':'Precisamos de uma ação'}</h1><p>{message}</p>{state==='error'&&<div className="signup-complete-actions"><Link to="/cadastro">Voltar ao cadastro</Link><Link to="/admin/login">Entrar</Link></div>}</div></div>;
}
