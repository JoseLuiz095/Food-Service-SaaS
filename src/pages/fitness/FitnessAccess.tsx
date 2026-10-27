import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { TurnstileWidget } from '../../components/ui/TurnstileWidget';
import { appConfig } from '../../lib/config';
import { getSupabaseClient } from '../../lib/supabase';
import {
  fitnessAccess, fitnessPasswordMfa, fitnessRecoverPassword, fitnessSetPassword, fitnessSignIn,
  fitnessSignOut, fitnessSignUp, fitnessVerifyMfa, isFitnessStoreId, fitnessOffers, fitnessCheckout,
  type FitnessPlan, type FitnessAccess as AccessStatus,
} from '../../services/fitnessAccessApi';

type Mode = 'login' | 'signup' | 'forgot';
const labels: Record<AccessStatus['state'], string> = {
  pending: 'Aguardando confirmação', active: 'Pagamento confirmado', grace: 'Período de tolerância',
  suspended: 'Acesso suspenso', cancelled: 'Acesso cancelado',
};
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.';

export default function FitnessAccess() {
  const { storeId = '' } = useParams();
  const validStore = isFitnessStoreId(storeId);
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [mode, setMode] = useState<Mode>(() => new URLSearchParams(window.location.search).get('recovery') === '1' ? 'forgot' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [recovery, setRecovery] = useState(() => new URLSearchParams(window.location.search).get('recovery') === '1');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [status, setStatus] = useState<AccessStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  const [plans, setPlans] = useState<FitnessPlan[]>([]);
  const [planId, setPlanId] = useState('');
  const [billingName, setBillingName] = useState('');
  const [billingDocument, setBillingDocument] = useState('');
  const [sandboxConsent, setSandboxConsent] = useState(false);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const receiveCaptcha = useCallback((token: string) => setCaptcha(token), []);

  useEffect(() => {
    let alive = true;
    setPlans([]); setPlanId(''); setInvoiceUrl(null); setBillingDocument('');
    if (validStore && session) void fitnessOffers(storeId).then((items) => { if (alive) { setPlans(items); setPlanId(items[0]?.id || ''); } });
    return () => { alive = false; };
  }, [storeId, validStore, session?.user.id]);

  useEffect(() => {
    let alive = true;
    const client = getSupabaseClient();
    void client.auth.getSession().then(({ data, error: authError }) => {
      if (!alive) return;
      if (authError) setError('Não foi possível verificar a sessão. Entre novamente.');
      setSession(data.session);
      setInitializing(false);
    });
    const { data } = client.auth.onAuthStateChange((event, next) => {
      if (!alive) return;
      setSession(next);
      setInitializing(false);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (!next || event === 'SIGNED_OUT') { requestGeneration.current += 1; setStatus(null); }
    });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    requestGeneration.current += 1;
    setStatus(null);
    if (!session || !validStore || recovery) return;
    let alive = true;
    const check = async () => {
      const generation = ++requestGeneration.current;
      try {
        const next = await fitnessAccess(storeId);
        if (alive && generation === requestGeneration.current) { setStatus(next); setError(''); }
      } catch (failure) {
        if (alive && generation === requestGeneration.current) { setStatus(null); setError(messageOf(failure)); }
      }
    };
    void check();
    const timer = window.setInterval(() => { void check(); }, 30_000);
    const onFocus = () => { void check(); };
    window.addEventListener('focus', onFocus);
    return () => { alive = false; requestGeneration.current += 1; window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [session?.user.id, storeId, validStore, recovery]);

  useEffect(() => {
    if (!recovery || !session) return;
    let alive = true;
    setMfaLoading(true);
    void fitnessPasswordMfa().then((factor) => { if (alive) setFactorId(factor); })
      .catch((failure) => { if (alive) setError(messageOf(failure)); })
      .finally(() => { if (alive) setMfaLoading(false); });
    return () => { alive = false; };
  }, [recovery, session?.user.id]);

  const changeMode = (next: Mode) => {
    setMode(next); setPassword(''); setConfirmation(''); setError(''); setNotice('');
    setCaptcha(''); setCaptchaReset((value) => value + 1);
  };

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !captcha || !validStore) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'forgot') {
        await fitnessRecoverPassword(storeId, email, captcha);
        setNotice('Se houver uma conta com esse e-mail, você receberá um link seguro para definir uma nova senha.');
      } else if (mode === 'signup') {
        if (password !== confirmation) throw new Error('As senhas informadas não são iguais.');
        await fitnessSignUp(storeId, email, password, captcha);
        setNotice('Confira seu e-mail para confirmar o cadastro. Se já tem conta, entre ou recupere sua senha. O cadastro não libera acesso pago.');
      } else {
        await fitnessSignIn(email, password, captcha);
      }
      setPassword(''); setConfirmation('');
    } catch (failure) { setError(messageOf(failure)); }
    finally { setBusy(false); setCaptcha(''); setCaptchaReset((value) => value + 1); }
  };

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || mfaLoading) return;
    setBusy(true); setError('');
    try {
      if (factorId) {
        await fitnessVerifyMfa(factorId, mfaCode);
        setMfaCode(''); setFactorId(null);
        return;
      }
      if (password !== confirmation) throw new Error('As senhas informadas não são iguais.');
      await fitnessSetPassword(password);
      await fitnessSignOut(storeId);
      setRecovery(false); setPassword(''); setConfirmation('');
      window.history.replaceState({}, document.title, `/fitness/${storeId}`);
      setNotice('Senha atualizada. Entre novamente com sua senha individual.');
    } catch (failure) { setError(messageOf(failure)); }
    finally { setBusy(false); }
  };

  const claim = async () => {
    if (busy) return;
    setBusy(true); setError('');
    const generation = ++requestGeneration.current;
    try {
      const next = await fitnessAccess(storeId, 'claim');
      if (generation === requestGeneration.current) setStatus(next);
    } catch (failure) { setError(messageOf(failure)); }
    finally { setBusy(false); }
  };

  const signOut = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await fitnessSignOut(storeId); setRecovery(false); setStatus(null); }
    catch (failure) { setError(messageOf(failure)); }
    finally { setBusy(false); }
  };

  const purchase = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !sandboxConsent || !planId) return;
    setBusy(true); setError(''); setInvoiceUrl(null);
    try {
      const result = await fitnessCheckout(storeId, planId, billingName, billingDocument);
      setInvoiceUrl(result.invoiceUrl); setBillingDocument(''); setBillingName('');
      setNotice(result.invoiceUrl ? 'Cobrança de teste disponível. A liberação depende da confirmação no servidor.' : 'A assinatura de teste está em processamento. Aguarde a confirmação no servidor.');
    } catch (failure) { setError(messageOf(failure)); }
    finally { setBusy(false); }
  };

  const paidThrough = status?.paid_until ? new Date(status.paid_until) : null;
  return <div className="auth-recovery-page">
    <div className="auth-recovery-brand"><img className="platform-brand-icon" src="/assets/vendeweb-mark.svg" alt=""/><strong>VendeWeb Fitness</strong></div>
    <main className="auth-recovery-card">
      <span className="eyebrow">ÁREA DO ALUNO</span>
      <h1>{recovery && session ? 'Defina sua nova senha' : 'Seu acesso ao acompanhamento'}</h1>
      {!validStore ? <div className="form-error" role="alert">O link da loja é inválido. Solicite ao responsável o endereço correto.</div>
        : initializing ? <p role="status">Verificando sua sessão…</p>
        : recovery && session ? <form onSubmit={submitPassword}>
          <p>A senha pertence à sua conta VendeWeb. Ela também será usada nos outros negócios vinculados ao mesmo e-mail.</p>
          {factorId ? <label className="auth-field">Código do autenticador<div className="input-with-icon"><input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))}/></div></label>
            : <><label className="auth-field">Nova senha<div className="input-with-icon"><input required type="password" minLength={10} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)}/></div></label>
              <label className="auth-field">Confirmar nova senha<div className="input-with-icon"><input required type="password" minLength={10} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)}/></div></label>
              <p>Use pelo menos 10 caracteres, com maiúscula, minúscula e número.</p></>}
          <button className="primary-button full-button" disabled={busy || mfaLoading || (Boolean(factorId) && mfaCode.length !== 6)}>{busy ? 'Validando…' : mfaLoading ? 'Verificando proteção…' : factorId ? 'Confirmar segundo fator' : 'Salvar nova senha'}</button>
        </form>
        : !session ? <form onSubmit={submitAuth}>
          <p>{mode === 'signup' ? 'Crie uma conta com senha individual e confirme seu e-mail. Se já usa VendeWeb, utilize sua conta existente.' : mode === 'forgot' ? 'Receba um link seguro de recuperação no e-mail da sua conta.' : 'Entre com sua conta. O pagamento é confirmado no servidor antes da liberação do acesso.'}</p>
          {recovery && <p>Se o link expirou ou não abriu sua sessão, solicite uma nova recuperação.</p>}
          <label className="auth-field">E-mail<div className="input-with-icon"><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)}/></div></label>
          {mode !== 'forgot' && <label className="auth-field">Senha<div className="input-with-icon"><input required type="password" minLength={mode === 'signup' ? 10 : undefined} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)}/></div></label>}
          {mode === 'signup' && <label className="auth-field">Confirmar senha<div className="input-with-icon"><input required type="password" minLength={10} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)}/></div></label>}
          <TurnstileWidget siteKey={appConfig.turnstileSiteKey} action={mode === 'login' ? 'login' : mode === 'signup' ? 'signup' : 'recovery'} onToken={receiveCaptcha} resetSignal={captchaReset}/>
          {!appConfig.turnstileSiteKey && <p role="status">A verificação de segurança ainda precisa ser configurada neste ambiente para permitir o acesso.</p>}
          <button className="primary-button full-button" disabled={busy || !captcha}>{busy ? 'Aguarde…' : mode === 'signup' ? 'Criar minha conta' : mode === 'forgot' ? 'Enviar link seguro' : 'Entrar'}</button>
          <div className="login-help-row" style={{ flexWrap: 'wrap', gap: 16, justifyContent: 'space-between' }}><button className="text-link" type="button" onClick={() => changeMode(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? 'Criar conta de aluno' : 'Já tenho conta'}</button><button className="text-link" type="button" onClick={() => changeMode('forgot')}>Recuperar senha</button></div>
        </form>
        : <section aria-label="Situação do acesso">
          <p style={{ overflowWrap: 'anywhere' }}>Conta: <strong>{session.user.email}</strong></p>
          {status ? <>
            <h2>{labels[status.state]}</h2>
            <p>{status.access && status.session_allowed ? 'Seu acesso Fitness está autorizado nesta sessão.' : status.reason === 'SESSION_LIMIT' ? 'Outra sessão já está autorizada nesta loja. Solicite ao administrador a liberação para troca ou perda do aparelho.' : status.access ? 'Seu período pago está válido. Autorize esta sessão para utilizar o acesso Fitness.' : 'Acesso aguardando compra vinculada e pagamento confirmado, ou bloqueado pelas regras do plano. O retorno da página de pagamento não libera permissões.'}</p>
            {paidThrough && !Number.isNaN(paidThrough.getTime()) && <p>Período pago até {paidThrough.toLocaleDateString('pt-BR')}.</p>}
            <p>{status.session_limit === 1 ? 'Regra desta loja: uma sessão Fitness autorizada por aluno. A troca precisa ser liberada pelo administrador.' : 'Esta loja não aplica limite adicional de sessão Fitness.'}</p>
            {status.access && !status.session_allowed && status.reason !== 'SESSION_LIMIT' && <button className="primary-button full-button" disabled={busy} onClick={() => void claim()}>{busy ? 'Verificando…' : 'Autorizar esta sessão'}</button>}
          </> : <p role="status">{error ? 'A verificação do acesso não foi concluída.' : 'Consultando seu acesso…'}</p>}
          <p>Os pagamentos recorrentes confirmados renovam o período conforme o plano.</p>
          {plans.length > 0 && <form onSubmit={purchase} style={{ marginBlock: 24 }}>
            <h2>Compra em ambiente de teste</h2>
            <p>Esta integração usa o sandbox Asaas. Não envie dinheiro real. Use dados de teste autorizados.</p>
            <label className="auth-field">Plano<select className="input" value={planId} onChange={(event) => setPlanId(event.target.value)}>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} — {(plan.amount_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês</option>)}</select></label>
            <label className="auth-field">Nome para cobrança de teste<div className="input-with-icon"><input required minLength={2} maxLength={120} value={billingName} onChange={(event) => setBillingName(event.target.value)} autoComplete="off"/></div></label>
            <label className="auth-field">CPF/CNPJ de teste<div className="input-with-icon"><input required inputMode="numeric" maxLength={20} value={billingDocument} onChange={(event) => setBillingDocument(event.target.value)} autoComplete="off"/></div></label>
            <label style={{ display: 'flex', alignItems: 'start', gap: 10, marginBlock: 16 }}><input type="checkbox" checked={sandboxConsent} onChange={(event) => setSandboxConsent(event.target.checked)}/>Entendo que esta compra é um teste no sandbox Asaas.</label>
            <button className="primary-button full-button" disabled={busy || !sandboxConsent || !planId}>{busy ? 'Processando…' : 'Consultar ou gerar cobrança de teste'}</button>
            {invoiceUrl && <a className="back-link" href={invoiceUrl} target="_blank" rel="noopener noreferrer">Abrir cobrança no sandbox Asaas</a>}
          </form>}
          {!plans.length && <p>Os planos desta loja ainda precisam ser configurados para iniciar a compra.</p>}
          <p>Recursos de treino e Nutrição não são habilitados por esta tela.</p>
          <button className="secondary-button full-button" disabled={busy} onClick={() => void signOut()}>Sair desta sessão</button>
        </section>}
      {notice && <p role="status" className="auth-security-note">{notice}</p>}
      {error && <div role="alert" className="form-error">{error}</div>}
      <p className="auth-security-note">A autenticação identifica sua conta. O acesso pago é separado por loja e não concede acesso administrativo, a outras lojas ou a dados clínicos.</p>
      <Link className="back-link" to="/">Voltar ao VendeWeb</Link>
    </main>
  </div>;
}
