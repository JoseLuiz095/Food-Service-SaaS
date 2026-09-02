import { CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck, ShoppingBag } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getSupabaseClient } from '../../lib/supabase';
import { temporaryPasswordValidationMessage } from '../../utils/email';

type RecoveryStep = 'loading' | 'mfa' | 'password' | 'invalid';

export default function ResetPassword() {
  const [step,setStep]=useState<RecoveryStep>('loading');
  const [factorId,setFactorId]=useState('');
  const [mfaCode,setMfaCode]=useState('');
  const [password,setPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [show,setShow]=useState(false);
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    let active=true;
    const prepare=async()=>{
      try{
        const supabase=getSupabaseClient();
        const {data:sessionData,error:sessionError}=await supabase.auth.getSession();
        if(sessionError)throw sessionError;
        if(!active)return;
        if(!sessionData.session){setStep('invalid');setError('Link de recuperação inválido ou expirado. Solicite um novo link.');return;}
        const {data:aalData,error:aalError}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if(aalError)throw aalError;
        if(!active)return;
        if(aalData?.currentLevel==='aal2'){setStep('password');return;}
        if(aalData?.currentLevel==='aal1'&&aalData?.nextLevel==='aal2'){
          const {data:factors,error:factorsError}=await supabase.auth.mfa.listFactors();
          if(factorsError)throw factorsError;
          const factor=factors.totp.find((item)=>item.status==='verified');
          if(!factor){setStep('invalid');setError('Sua conta exige autenticação em duas etapas, mas nenhum autenticador verificado foi localizado.');return;}
          setFactorId(factor.id);setStep('mfa');return;
        }
        setStep('password');
      }catch(err){if(active){setStep('invalid');setError(err instanceof Error?err.message:'Não foi possível validar o link de recuperação.');}}
    };
    void prepare();return()=>{active=false};
  },[]);

  const verifyMfa=async(event:FormEvent)=>{
    event.preventDefault();if(busy)return;setError('');const code=mfaCode.replace(/\D/g,'');
    if(code.length!==6){setError('Informe o código de 6 dígitos do aplicativo autenticador.');return;}
    if(!factorId){setError('Fator de autenticação não disponível. Solicite um novo link.');return;}
    setBusy(true);
    try{
      const supabase=getSupabaseClient();const {error:verifyError}=await supabase.auth.mfa.challengeAndVerify({factorId,code});if(verifyError)throw verifyError;
      let aal2=false;for(let i=0;i<10;i+=1){const {data,error:aalError}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();if(aalError)throw aalError;if(data?.currentLevel==='aal2'){aal2=true;break;}await new Promise<void>((resolve)=>window.setTimeout(resolve,150));}
      if(!aal2)throw new Error('O código foi validado, mas a sessão ainda não atingiu AAL2. Tente novamente.');
      setMfaCode('');setStep('password');
    }catch(err){setError(err instanceof Error?err.message:'Código inválido ou expirado.');}finally{setBusy(false);}
  };

  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(busy)return;setError('');const passwordError=temporaryPasswordValidationMessage(password);if(passwordError){setError(passwordError);return;}if(password!==confirmPassword){setError('As senhas informadas não são iguais.');return;}setBusy(true);
    try{
      const supabase=getSupabaseClient();const {data:aal,error:aalError}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();if(aalError)throw aalError;
      if(aal?.nextLevel==='aal2'&&aal?.currentLevel!=='aal2'){
        const {data:factors,error:factorsError}=await supabase.auth.mfa.listFactors();if(factorsError)throw factorsError;const factor=factors.totp.find((item)=>item.status==='verified');if(!factor)throw new Error('Autenticador MFA verificado não encontrado.');setFactorId(factor.id);setStep('mfa');throw new Error('Confirme novamente o código do autenticador antes de alterar a senha.');
      }
      const {error:updateError}=await supabase.auth.updateUser({password});if(updateError)throw updateError;await supabase.auth.signOut();setDone(true);window.history.replaceState({},document.title,'/admin/redefinir-senha');
    }catch(err){setError(err instanceof Error?err.message:'Não foi possível redefinir a senha.');}finally{setBusy(false);}
  };

  return <div className="auth-recovery-page"><div className="auth-recovery-brand"><ShoppingBag size={27}/><strong>FoodWeb</strong></div><main className="auth-recovery-card">
    {done?<><div className="auth-success-icon"><CheckCircle2 size={30}/></div><h1>Senha atualizada</h1><p>A nova senha foi salva. Entre novamente usando sua nova senha.</p><Link className="primary-button full-button" to="/admin/login">Entrar na plataforma</Link></>
    :step==='loading'?<><h1>Validando seu acesso</h1><p>Aguarde enquanto verificamos o link e as configurações de segurança da sua conta.</p></>
    :step==='mfa'?<form onSubmit={verifyMfa}><div className="auth-success-icon"><ShieldCheck size={30}/></div><h1>Confirme o segundo fator</h1><p>Esta conta utiliza autenticação em duas etapas. Informe o código de 6 dígitos do seu aplicativo autenticador.</p><label className="auth-field">Código do autenticador<div className="input-with-icon"><KeyRound size={18}/><input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={(event)=>setMfaCode(event.target.value.replace(/\D/g,'').slice(0,6))} placeholder="000000"/></div></label>{error&&<div className="form-error">{error}</div>}<button className="primary-button full-button" disabled={busy||mfaCode.length!==6} type="submit">{busy?'Verificando...':'Validar código'}</button><Link className="text-link auth-recovery-new-link" to="/admin/esqueci-senha">Solicitar outro link</Link></form>
    :step==='invalid'?<><h1>Não foi possível validar o acesso</h1>{error&&<div className="form-error">{error}</div>}<Link className="primary-button full-button" to="/admin/esqueci-senha">Solicitar novo link</Link></>
    :<form onSubmit={submit}><h1>Crie uma nova senha</h1><p>Use pelo menos 10 caracteres, com maiúscula, minúscula e número. Evite reutilizar a senha de outros serviços.</p><label className="auth-field">Nova senha<div className="input-with-icon"><LockKeyhole size={18}/><input required minLength={10} value={password} onChange={(event)=>setPassword(event.target.value)} type={show?'text':'password'} autoComplete="new-password"/><button type="button" onClick={()=>setShow((value)=>!value)} aria-label="Mostrar ou ocultar senha">{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label><label className="auth-field">Confirmar nova senha<div className="input-with-icon"><LockKeyhole size={18}/><input required minLength={10} value={confirmPassword} onChange={(event)=>setConfirmPassword(event.target.value)} type={show?'text':'password'} autoComplete="new-password"/></div></label>{error&&<div className="form-error">{error}</div>}<button className="primary-button full-button" disabled={busy} type="submit">{busy?'Alterando...':'Alterar senha'}</button></form>}
  </main></div>;
}
