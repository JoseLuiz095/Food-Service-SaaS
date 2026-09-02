import { ArrowLeft, CheckCircle2, Mail, ShoppingBag } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { isDemoMode } from '../../lib/config';
import { requestPasswordRecovery } from '../../lib/supabaseRest';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [technicalError, setTechnicalError] = useState('');
  const redirectTo = useMemo(() => `${window.location.origin}/admin/redefinir-senha`, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setTechnicalError('');
    if (isDemoMode) {
      setTechnicalError('A recuperação por e-mail fica disponível quando o Supabase Auth estiver configurado.');
      return;
    }
    setBusy(true);
    try {
      await requestPasswordRecovery(email.trim(), redirectTo);
      setSent(true);
    } catch (error) {
      setTechnicalError(error instanceof Error ? error.message : 'Não foi possível solicitar a recuperação.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="auth-recovery-page">
    <div className="auth-recovery-brand"><ShoppingBag size={27}/><strong>Food Service SaaS</strong></div>
    <main className="auth-recovery-card">
      {sent ? <>
        <div className="auth-success-icon"><CheckCircle2 size={30}/></div>
        <span className="eyebrow">LINK SOLICITADO</span>
        <h1>Confira seu e-mail</h1>
        <p>Se existir uma conta vinculada a <strong>{email}</strong>, você receberá as instruções para redefinir sua senha.</p>
        <div className="auth-security-note">Por segurança, não informamos se o e-mail está ou não cadastrado.</div>
        <Link className="primary-button full-button" to="/admin/login">Voltar ao login</Link>
      </> : <form onSubmit={submit}>
        <Link className="back-link" to="/admin/login"><ArrowLeft size={16}/>Voltar ao login</Link>
        <span className="eyebrow">RECUPERAR ACESSO</span>
        <h1>Esqueceu sua senha?</h1>
        <p>Informe o e-mail usado no painel. Enviaremos um link seguro para criar uma nova senha.</p>
        <label className="auth-field">E-mail<div className="input-with-icon"><Mail size={18}/><input autoFocus required type="email" autoComplete="email" value={email} onChange={(event)=>setEmail(event.target.value)} placeholder="voce@empresa.com.br"/></div></label>
        {technicalError && <div className="form-error">{technicalError}</div>}
        <button className="primary-button full-button" disabled={busy} type="submit">{busy?'Enviando...':'Enviar link de recuperação'}</button>
      </form>}
    </main>
  </div>;
}
