import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { TurnstileWidget } from '../../components/ui/TurnstileWidget';
import { appConfig } from '../../lib/config';
import { getFitnessStudentAuthClient } from '../../lib/fitnessStudentAuth';
import { isFitnessStoreId } from '../../services/fitnessAccessApi';
import { fitnessApi, type FitnessStudentAccess } from '../../services/fitnessApi';
import { FitnessStudentWorkouts } from '../../platform/FitnessWorkouts';
import '../../platform/fitness.css';

const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.';

const toE164 = (raw: string): string | null => {
  const digits = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? '+' + digits : null;
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return '+' + digits;
  if (digits.length === 10 || digits.length === 11) return '+55' + digits;
  return null;
};

type StudentIdentity = { client_id: string; name: string };

export default function FitnessStudentPortal() {
  const { storeId = '' } = useParams();
  const validStore = isFitnessStoreId(storeId);
  const auth = useMemo(() => {
    try { return getFitnessStudentAuthClient(); } catch { return null; }
  }, []);
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [captcha, setCaptcha] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const [profileRequired, setProfileRequired] = useState(false);
  const [student, setStudent] = useState<StudentIdentity | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [blockedReason, setBlockedReason] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!auth) { setInitializing(false); setError('O acesso ao Supabase não está configurado neste ambiente.'); return; }
    let alive = true;
    const { data } = auth.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setAuthorized(false);
        setStudent(null);
        setProfileRequired(false);
      }
    });
    void auth.auth.getSession().then(({ data: current, error: sessionError }) => {
      if (!alive) return;
      if (sessionError) setError(messageOf(sessionError));
      setSession(current.session);
    }).catch((cause: unknown) => {
      if (alive) setError(messageOf(cause));
    }).finally(() => {
      if (alive) setInitializing(false);
    });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, [auth]);

  const currentToken = useCallback(async (): Promise<string> => {
    if (!auth) throw new Error('Supabase não configurado.');
    const { data, error: sessionError } = await auth.auth.getSession();
    if (sessionError) throw sessionError;
    if (!data.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente por telefone.');
    return data.session.access_token;
  }, [auth]);

  const applyClaim = useCallback(async (identity: StudentIdentity, token: string) => {
    const result = await fitnessApi.studentSession(storeId, identity.client_id, 'claim', token);
    setStudent(identity);
    setProfileRequired(false);
    setAuthorized(result.authorized);
    setBlockedReason(result.authorized ? '' : result.reason || 'SESSION_REVOKED');
    if (result.authorized) setNotice('Entrada autorizada para esta loja e esta sessão Fitness.');
  }, [storeId]);

  useEffect(() => {
    if (!session || !validStore || !auth) return;
    let alive = true;
    setBusy(true);
    setError('');
    setNotice('');
    setAuthorized(false);
    setBlockedReason('');
    void (async () => {
      try {
        const token = await currentToken();
        const status: FitnessStudentAccess = await fitnessApi.studentStatus(storeId, token);
        if (!alive) return;
        if (!status.registered || !status.client_id) {
          setStudent(null);
          setProfileRequired(true);
          return;
        }
        await applyClaim({ client_id: status.client_id, name: status.name || 'Aluno' }, token);
      } catch (cause) {
        if (alive) setError(messageOf(cause));
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [session?.access_token, storeId, validStore, auth, currentToken, applyClaim]);

  useEffect(() => {
    if (!session || !student || !authorized || !auth) return;
    let alive = true;
    const check = async () => {
      try {
        const token = await currentToken();
        const result = await fitnessApi.studentSession(storeId, student.client_id, 'check', token);
        if (alive && !result.authorized) {
          setAuthorized(false);
          setBlockedReason(result.reason || 'SESSION_REVOKED');
          setNotice('O acesso Fitness foi encerrado. Entre novamente após a liberação do Admin.');
        }
      } catch (cause) {
        if (alive) setError(messageOf(cause));
      }
    };
    const timer = window.setInterval(() => { void check(); }, 30_000);
    const onFocus = () => { void check(); };
    window.addEventListener('focus', onFocus);
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [session?.access_token, student?.client_id, authorized, storeId, auth, currentToken]);

  useEffect(() => {
    if (!codeSent || resendAt <= clock) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [codeSent, resendAt, clock]);

  const sendCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!auth || busy) return;
    const e164 = toE164(phone);
    if (!e164) { setError('Informe um telefone válido com DDD.'); return; }
    if (!captcha) { setError('Conclua a verificação anti-robô para receber o código.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const { error: otpError } = await auth.auth.signInWithOtp({
        phone: e164,
        options: { shouldCreateUser: true, captchaToken: captcha },
      });
      if (otpError) throw otpError;
      setPhone(e164); setCodeSent(true); setCode(''); setResendAt(Date.now() + 60_000);
      setCaptcha(''); setCaptchaReset(value => value + 1);
      setNotice('Código enviado. Confira as mensagens do telefone informado.');
    } catch (cause) { setError(messageOf(cause)); setCaptcha(''); setCaptchaReset(value => value + 1); }
    finally { setBusy(false); }
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!auth || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const { data, error: verifyError } = await auth.auth.verifyOtp({ phone: toE164(phone) || phone, token: code, type: 'sms' });
      if (verifyError) throw verifyError;
      if (!data.session) throw new Error('O código não abriu uma sessão. Solicite outro código e tente novamente.');
      setSession(data.session);
      setCodeSent(false); setCode('');
      setNotice('Telefone confirmado.');
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  };

  const createStudent = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const token = await currentToken();
      const created = await fitnessApi.registerFitnessStudent(storeId, name.trim(), token);
      await applyClaim({ client_id: created.client_id, name: name.trim() }, token);
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  };

  const signOutLocal = async (release: boolean) => {
    if (!auth || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (release && student && session) {
        try {
          const token = await currentToken();
          await fitnessApi.studentSession(storeId, student.client_id, 'release', token);
        } catch (cause) {
          setNotice('A saída local foi concluída. Se a troca ficar bloqueada, peça ao Admin para liberar a sessão.');
          setError(messageOf(cause));
        }
      }
      const { error: signOutError } = await auth.auth.signOut({ scope: 'local' });
      if (signOutError) throw signOutError;
      setSession(null); setStudent(null); setAuthorized(false); setProfileRequired(false);
      setBlockedReason(''); setCodeSent(false); setCode(''); setName('');
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  };

  const refreshAuthorization = async () => {
    if (!session || !student || busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await applyClaim(student, await currentToken()); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  };

  const identityPhone = session?.user.phone || phone;
  const secondsToResend = Math.max(0, Math.ceil((resendAt - clock) / 1000));

  return <div className="auth-recovery-page">
    <div className="auth-recovery-brand"><img className="platform-brand-icon" src="/assets/vendeweb-mark.svg" alt=""/><strong>VendeWeb Fitness</strong></div>
    <main className="auth-recovery-card">
      <span className="eyebrow">ÁREA DO ALUNO</span>
      <h1>Entre nos seus treinos</h1>
      {!validStore ? <div className="form-error" role="alert">O link da loja é inválido. Peça ao profissional o endereço correto.</div>
        : initializing ? <p role="status">Verificando a sessão Fitness…</p>
        : !auth ? <div className="form-error" role="alert">O acesso ao Supabase não está configurado neste ambiente.</div>
        : !session ? codeSent ? <form onSubmit={verifyCode}>
          <p>Digite o código enviado por SMS para confirmar este telefone.</p>
          <label className="auth-field">Código de acesso<div className="input-with-icon"><input required autoComplete="one-time-code" inputMode="numeric" minLength={4} maxLength={8} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))}/></div></label>
          <button className="primary-button full-button" disabled={busy || code.trim().length < 4}>{busy ? 'Verificando…' : 'Confirmar código'}</button>
          <div className="login-help-row" style={{ flexWrap: 'wrap', gap: 16, justifyContent: 'space-between' }}>
            <button className="text-link" type="button" disabled={busy || secondsToResend > 0} onClick={() => { setCodeSent(false); setCode(''); setCaptcha(''); }}>{secondsToResend > 0 ? 'Novo código em ' + secondsToResend + 's' : 'Enviar outro código'}</button>
            <button className="text-link" type="button" disabled={busy} onClick={() => { setCodeSent(false); setCode(''); setPhone(''); setCaptcha(''); }}>Trocar telefone</button>
          </div>
        </form> : <form onSubmit={sendCode}>
          <p>Entre com o telefone confirmado por um código. Não é necessário e-mail nem senha.</p>
          <label className="auth-field">Telefone<div className="input-with-icon"><input required type="tel" inputMode="tel" autoComplete="tel" placeholder="+55 11 99999-9999" value={phone} onChange={event => setPhone(event.target.value)}/></div></label>
          <TurnstileWidget siteKey={appConfig.turnstileSiteKey} action="fitness-student-phone" onToken={setCaptcha} resetSignal={captchaReset}/>
          {!appConfig.turnstileSiteKey && <p role="status">A proteção anti-robô ainda precisa ser configurada neste ambiente para enviar códigos.</p>}
          <button className="primary-button full-button" disabled={busy || !captcha || !appConfig.turnstileSiteKey}>{busy ? 'Enviando…' : 'Receber código por SMS'}</button>
        </form>
        : busy ? <p role="status">Confirmando sua identidade e acesso à loja…</p>
        : profileRequired ? <form onSubmit={createStudent}>
          <p>Telefone confirmado. Informe o nome que o profissional reconhecerá ao atribuir seus treinos.</p>
          <label className="auth-field">Seu nome<div className="input-with-icon"><input required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={event => setName(event.target.value)}/></div></label>
          <button className="primary-button full-button" disabled={busy || name.trim().length < 2}>{busy ? 'Salvando…' : 'Continuar'}</button>
        </form>
        : authorized && student ? <>
          <p>Olá, <strong>{student.name}</strong>. A sessão Fitness está autorizada nesta loja.</p>
          <p>Telefone confirmado: <strong>{identityPhone.replace(/\d(?=\d{4})/g, '•')}</strong></p>
          <FitnessStudentWorkouts store={storeId} accessToken={session.access_token}/>
          <p className="auth-security-note">A autorização vale para esta conta, aluno e loja. Ela não identifica o aparelho de forma infalível.</p>
          <button className="secondary-button full-button" disabled={busy} onClick={() => void signOutLocal(true)}>Sair do Fitness</button>
        </> : student ? <>
          <p role="alert">{blockedReason === 'SESSION_LIMIT'
            ? 'Já existe outra sessão Fitness autorizada para este aluno nesta loja. Peça ao profissional para liberar a troca. Se esta já for uma sessão nova, toque em verificar liberação; caso contrário, saia e entre novamente por SMS.'
            : 'Esta sessão foi revogada ou expirou. Entre novamente por SMS para criar uma sessão Fitness nova.'}</p>
          {blockedReason === 'SESSION_LIMIT' && <button className="secondary-button full-button" disabled={busy} onClick={() => void refreshAuthorization()}>Verificar liberação</button>}
          <button className="secondary-button full-button" disabled={busy} onClick={() => void signOutLocal(false)}>Sair e entrar novamente</button>
        </> : <p role="status">Aguardando validação da identidade.</p>}
      {notice && <p role="status" className="auth-security-note">{notice}</p>}
      {error && <div role="alert" className="form-error">{error}</div>}
      <section className="auth-security-note" aria-label="Recuperação da conta Fitness">
        <strong>Perdeu o aparelho ou o número?</strong>
        <p>Se manteve o número, peça ao profissional da loja para liberar a sessão e depois entre novamente por SMS. Se perdeu o acesso ao número, contate o profissional para conferência manual da identidade. A troca do telefone altera a identidade Supabase compartilhada e deve ser feita pelo canal seguro de suporte, após confirmação do titular.</p>
      </section>
      <Link className="back-link" to="/">Voltar ao VendeWeb</Link>
    </main>
  </div>;
}
