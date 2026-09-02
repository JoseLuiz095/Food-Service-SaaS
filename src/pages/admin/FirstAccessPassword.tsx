import { Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { temporaryPasswordValidationMessage } from '../../utils/email';

export default function FirstAccessPassword(){
  const {user,membership,loading,completeTemporaryPasswordChange}=useAuth();
  const {showToast}=useToast();
  const navigate=useNavigate();
  const[currentPassword,setCurrentPassword]=useState('');
  const[newPassword,setNewPassword]=useState('');
  const[confirmPassword,setConfirmPassword]=useState('');
  const[show,setShow]=useState(false);
  const[saving,setSaving]=useState(false);

  if(loading)return <div className="page-center">Validando acesso...</div>;
  if(!user||!membership)return <Navigate to="/admin/login" replace/>;
  if(!membership.mustChangePassword)return <Navigate to="/admin" replace/>;

  const submit=async(e:FormEvent)=>{
    e.preventDefault();
    const passwordError=temporaryPasswordValidationMessage(newPassword);
    if(passwordError){showToast(passwordError,'error');return;}
    if(newPassword!==confirmPassword){showToast('A confirmação da nova senha não confere.','error');return;}
    if(newPassword===currentPassword){showToast('Escolha uma senha diferente da senha temporária.','error');return;}
    setSaving(true);
    try{
      await completeTemporaryPasswordChange(currentPassword,newPassword);
      showToast('Senha definitiva cadastrada com sucesso.','success');
      navigate('/admin/primeiros-passos',{replace:true});
    }catch(error){showToast(error instanceof Error?error.message:'Não foi possível alterar a senha.','error')}
    finally{setSaving(false)}
  };

  return <div className="first-access-page"><form className="first-access-card" onSubmit={submit}>
    <div className="first-access-icon"><ShieldCheck size={28}/></div>
    <span className="eyebrow">PRIMEIRO ACESSO</span>
    <h1>Crie sua senha definitiva</h1>
    <p>Você entrou com uma senha temporária criada pela administração da plataforma. Antes de acessar a loja, defina uma senha somente sua.</p>
    <label>Senha temporária<div className="input-with-icon"><KeyRound size={18}/><input required value={currentPassword} onChange={(e)=>setCurrentPassword(e.target.value)} type={show?'text':'password'} autoComplete="current-password"/></div></label>
    <label>Nova senha<div className="input-with-icon"><KeyRound size={18}/><input required minLength={10} value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} type={show?'text':'password'} autoComplete="new-password"/></div><small>Mínimo de 10 caracteres, com letra maiúscula, minúscula e número.</small></label>
    <label>Confirmar nova senha<div className="input-with-icon"><KeyRound size={18}/><input required minLength={10} value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)} type={show?'text':'password'} autoComplete="new-password"/></div></label>
    <button type="button" className="password-visibility-button" onClick={()=>setShow((value)=>!value)}>{show?<EyeOff size={17}/>:<Eye size={17}/>} {show?'Ocultar senhas':'Mostrar senhas'}</button>
    <button className="primary-button full-button" disabled={saving}>{saving?'Salvando...':'Salvar nova senha'}</button>
  </form></div>;
}
