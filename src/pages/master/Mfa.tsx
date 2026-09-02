import { KeyRound, LockKeyhole, ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getSupabaseClient } from '../../lib/supabase';

export default function MasterMfa(){
  const {mfaLevel,refreshMfaLevel,signOut}=useAuth();
  const navigate=useNavigate();
  const [factorId,setFactorId]=useState('');
  const [qrCode,setQrCode]=useState('');
  const [secret,setSecret]=useState('');
  const [code,setCode]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    if(mfaLevel==='aal2'){navigate('/admin-master',{replace:true});return;}
    let active=true;
    void (async()=>{
      try{
        const {data,error:listError}=await getSupabaseClient().auth.mfa.listFactors();
        if(listError)throw listError;
        if(active)setFactorId(data.totp[0]?.id||'');
      }catch(e){if(active)setError(e instanceof Error?e.message:'Não foi possível consultar o MFA.');}
      finally{if(active)setLoading(false);}
    })();
    return()=>{active=false};
  },[mfaLevel,navigate]);

  const startEnrollment=async()=>{
    setError('');setSaving(true);
    try{
      const {data,error:enrollError}=await getSupabaseClient().auth.mfa.enroll({factorType:'totp',friendlyName:'Food Service Admin Master'});
      if(enrollError)throw enrollError;
      setFactorId(data.id);setQrCode(data.totp.qr_code);setSecret(data.totp.secret);
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível configurar o autenticador.');}
    finally{setSaving(false);}
  };

  const verify=async(event:FormEvent)=>{
    event.preventDefault();if(!factorId||code.trim().length<6)return;
    setError('');setSaving(true);
    try{
      const {error:verifyError}=await getSupabaseClient().auth.mfa.challengeAndVerify({factorId,code:code.trim()});
      if(verifyError)throw verifyError;
      const next=await refreshMfaLevel();
      if(next!=='aal2')throw new Error('O segundo fator foi validado, mas a sessão ainda não atingiu AAL2.');
      navigate('/admin-master',{replace:true});
    }catch(e){setError(e instanceof Error?e.message:'Código inválido.');}
    finally{setSaving(false);}
  };

  const cancel=async()=>{await signOut();navigate('/admin-master/login',{replace:true})};
  return <div className="mfa-page"><section className="mfa-card"><div className="mfa-icon"><ShieldCheck size={28}/></div><span className="eyebrow">ADMIN MASTER · MFA</span><h1>Confirme o segundo fator</h1><p>O painel central exige uma sessão <strong>AAL2</strong>. Isso protege ações que afetam todas as lojas.</p>
    {loading?<div className="mfa-loading">Consultando fatores configurados...</div>:<>
      {!factorId&&<div className="mfa-setup"><Smartphone size={22}/><div><strong>Configure um aplicativo autenticador</strong><p>Use Google Authenticator, 1Password, Authy ou outro app TOTP.</p></div><button className="secondary-button" type="button" disabled={saving} onClick={()=>void startEnrollment()}>{saving?'Configurando...':'Gerar QR Code'}</button></div>}
      {qrCode&&<div className="mfa-qr"><img src={qrCode} alt="QR Code para configurar o autenticador"/><div><strong>Não consegue escanear?</strong><code>{secret}</code><small>Cadastre a chave manualmente no seu app TOTP.</small></div></div>}
      {factorId&&<form className="mfa-form" onSubmit={verify}><label>Código de 6 dígitos<div className="input-with-icon"><KeyRound size={18}/><input value={code} onChange={(e)=>setCode(e.target.value.replace(/\D/g,'').slice(0,8))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000"/></div></label><button className="primary-button" type="submit" disabled={saving||code.length<6}><LockKeyhole size={17}/>{saving?'Validando...':'Validar e continuar'}</button></form>}
    </>}
    {error&&<div className="form-error">{error}</div>}<button className="mfa-cancel" type="button" onClick={()=>void cancel()}>Sair desta conta</button></section></div>;
}
