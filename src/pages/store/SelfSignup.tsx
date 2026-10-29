import { storeNameValidation } from '../../utils/storeName';
import { ArrowLeft, ArrowRight, Check, Clock3, Eye, EyeOff, ShieldCheck, Store, UserPlus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { TurnstileWidget } from '../../components/ui/TurnstileWidget';
import { appConfig } from '../../lib/config';
import { loadPublicLanding, type LandingPlan } from '../../services/landingApi';
import {
  continueFoodSelfServiceWithExistingAccount,
  createFoodSelfServiceAccount,
  type SelfServiceSignupInput,
} from '../../services/selfServiceSignup';
import { currency } from '../../utils/format';
import { BusinessSegmentPicker } from '../../segments/BusinessSegmentPicker';
import { normalizeBusinessSegment } from '../../segments/businessSegments';
import { PLATFORM_BRAND } from '../../lib/brand';
import './self-signup.css';
import { BusinessJourneyPreview } from '../../components/marketing/BusinessJourneyPreview';

const DEMO_PLAN: LandingPlan = { id:'demo-self-service', code:'DEMO', name:'Demo 30 dias', monthlyPrice:0, featureCodes:[], marketingBenefits:[] };
const allowedPlan=(code:string)=>['DEMO','ESSENTIAL','STARTER','PROFESSIONAL'].includes(code.toUpperCase());

export default function SelfSignup(){
  const navigate=useNavigate();
  const[searchParams]=useSearchParams();
  const requestedPlan=(searchParams.get('plan')||'DEMO').toUpperCase();
  const[plans,setPlans]=useState<LandingPlan[]>([DEMO_PLAN]);
  const[demoDays,setDemoDays]=useState(30);
  const[demoEnabled,setDemoEnabled]=useState(true);
  const[mode,setMode]=useState<'new'|'existing'>('new');
  const[showPassword,setShowPassword]=useState(false);
  const[stage,setStage]=useState<1|2>(1);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState('');
  const[success,setSuccess]=useState('');
  const[presentationNeedsReview,setPresentationNeedsReview]=useState(false);
  const[captchaToken,setCaptchaToken]=useState('');
  const[captchaReset,setCaptchaReset]=useState(0);
  const[form,setForm]=useState<SelfServiceSignupInput>({
    businessSegment:normalizeBusinessSegment(searchParams.get('segment')),
    storeName:'',ownerName:'',email:'',password:'',planCode:allowedPlan(requestedPlan)?requestedPlan:'DEMO',city:'',state:'',contactPhone:'',businessDocument:'',captchaToken:'',
  });

  useEffect(()=>{
    void loadPublicLanding().then((landing)=>{
      setDemoDays(landing.demoDurationDays||30);
      setDemoEnabled(landing.demoEnabled!==false);
      const commercial=landing.plans.filter((plan)=>allowedPlan(plan.code)&&plan.code!=='DEMO');
      setPlans([...(landing.demoEnabled!==false?[{...DEMO_PLAN,name:`Demo ${landing.demoDurationDays||30} dias`}]:[]),...commercial]);
      setForm((current)=>{
        const desired=current.planCode;
        const available=(landing.demoEnabled!==false&&desired==='DEMO')||commercial.some((plan)=>plan.code===desired);
        return {...current,planCode:available?desired:(commercial[0]?.code||'DEMO')};
      });
    }).catch(()=>undefined);
  },[]);

  const isDemo=form.planCode==='DEMO';
  const setField=<K extends keyof SelfServiceSignupInput>(key:K,value:SelfServiceSignupInput[K])=>setForm((current)=>({...current,[key]:value}));

  const advance=()=>{
    if(storeNameValidation(form.storeName)){setError(storeNameValidation(form.storeName));return;}
    if(form.ownerName.trim().length<2){setError('Informe o nome do responsável.');return;}
    if(!/^\S+@\S+\.\S+$/.test(form.email.trim())){setError('Informe um e-mail válido.');return;}
    const digits=form.contactPhone.replace(/\D/g,'');
    if(digits.length<10||digits.length>13){setError('Informe um WhatsApp comercial válido.');return;}
    setError('');setStage(2);
  };
  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    if(stage===1){advance();return;}
    if(loading)return;
    setError('');setSuccess('');setPresentationNeedsReview(false);
    if(storeNameValidation(form.storeName)){setError(storeNameValidation(form.storeName));return;}
    if(form.ownerName.trim().length<2){setError('Informe o nome do responsável.');return;}
    if(!/^\S+@\S+\.\S+$/.test(form.email.trim())){setError('Informe um e-mail válido.');return;}
    const phoneDigits=form.contactPhone.replace(/\D/g,'');
    if(phoneDigits.length<10||phoneDigits.length>13){setError('Informe um WhatsApp comercial válido.');return;}
    const cnpjDigits=(form.businessDocument||'').replace(/\D/g,'');
    if(cnpjDigits&&cnpjDigits.length!==14){setError('O CNPJ deve ter 14 dígitos.');return;}
    if(form.password.length<8){setError('A senha deve ter pelo menos 8 caracteres.');return;}
    if(!captchaToken){setError('Conclua a verificação de segurança.');return;}

    setLoading(true);
    const input={...form,captchaToken};
    try{
      if(mode==='existing'){
        const completion=await continueFoodSelfServiceWithExistingAccount(input);
        setSuccess(completion.presentationWarning ? `Solicitação criada. ${completion.presentationWarning}` : (completion.existing?`Sua conta já possui um estabelecimento na ${PLATFORM_BRAND}. Abrindo painel...`:'Solicitação criada. Abrindo seu espaço de configuração...'));
        if(completion.presentationWarning){setPresentationNeedsReview(true);return;}
        window.setTimeout(()=>navigate('/admin/primeiros-passos',{replace:true}),700);
        return;
      }

      const result=await createFoodSelfServiceAccount(input);
      if(result.requiresEmailConfirmation){
        setSuccess('Cadastro iniciado. Confira seu e-mail para confirmar a conta; depois você será direcionado para concluir a criação do estabelecimento.');
      }else{
        setSuccess(result.completion.presentationWarning ? `Conta criada. ${result.completion.presentationWarning}` : 'Conta criada. Abrindo seu painel...');
        if(result.completion.presentationWarning){setPresentationNeedsReview(true);return;}
        window.setTimeout(()=>navigate('/admin/primeiros-passos',{replace:true}),700);
      }
    }catch(e){
      setError(e instanceof Error?e.message:'Não foi possível concluir o cadastro.');
      setCaptchaReset((value)=>value+1);
      setCaptchaToken('');
    }finally{setLoading(false)}
  };

  return <div className="self-signup-page self-signup-experience">
    <header className="self-signup-topbar"><Link to="/"><ArrowLeft size={18}/>Voltar</Link><strong>{PLATFORM_BRAND}</strong><Link to="/admin/login">Entrar</Link></header>
    <main className="self-signup-shell">
      <section className="self-signup-intro">
        <h1>Seu negócio, com um jeito próprio de vender.</h1>
        <p>Escolha seu ramo e prepare uma vitrine com a sua identidade. Produtos, encomendas, peças ou serviços: você organiza o catálogo e acompanha os pedidos em um só lugar.</p>
        <a className="self-signup-mobile-start" href="#signup-form">Preencher cadastro <ArrowRight size={16} aria-hidden="true"/></a>
        <div className="signup-live-preview"><p>Veja sua loja começar a ganhar forma. O nome e o ramo escolhidos aparecem nesta prévia.</p><BusinessJourneyPreview segment={form.businessSegment || 'food'} storeName={form.storeName} compact /></div>
        <div className="self-signup-rules">
          <article><Clock3/><div><strong>Demo por {demoDays} dias</strong><span>Teste gratuito sujeito à validação cadastral do negócio.</span></div></article>
          <article><Store/><div><strong>Configuração antecipada</strong><span>Planos pagos entram em modo de preparação até a aprovação.</span></div></article>
          <article><ShieldCheck/><div><strong>Liberação controlada</strong><span>O Admin Master pode aprovar ou rejeitar novos cadastros.</span></div></article>
        </div>
      </section>

      <section id="signup-form" className="self-signup-card">
        <div className="self-signup-mode">
          <button type="button" aria-pressed={mode==='new'} className={mode==='new'?'active':''} onClick={()=>{setMode('new');setError('')}}>Criar nova conta</button>
          <button type="button" aria-pressed={mode==='existing'} className={mode==='existing'?'active':''} onClick={()=>{setMode('existing');setError('')}}>Já tenho conta</button>
        </div>
        <form onSubmit={submit}>
          <div className="self-signup-heading"><UserPlus size={22}/><div><h2>{mode==='new'?'Novo cadastro':'Usar uma conta existente'}</h2><p>{mode==='new'?'Após a verificação de segurança, sua conta é criada. Você prepara a loja e aguarda a revisão do Admin Master antes da publicação.':`Entre com seu usuário Supabase e solicite um novo acesso à ${PLATFORM_BRAND}.`}</p></div></div>
          <ol className="self-signup-progress" aria-label="Etapas até a publicação"><li><Store size={14} aria-hidden="true"/>Prepare sua loja</li><li><ShieldCheck size={14} aria-hidden="true"/>Aguarde a revisão</li><li><Check size={14} aria-hidden="true"/>Comece após a liberação</li></ol>

          <fieldset className="self-signup-step" hidden={stage!==1} disabled={stage!==1}><legend>1. Seu negócio</legend>
            <label>Nome do estabelecimento<input required maxLength={120} value={form.storeName} onChange={e=>setField('storeName',e.target.value)} placeholder="Ex.: Sua loja ou ateliê"/></label>
            <BusinessSegmentPicker value={form.businessSegment || 'food'} onChange={segment=>setField('businessSegment',segment)}/>
            {mode==='existing'&&<p className="business-picker__note">Se sua conta já tem uma loja, os dados atuais serão preservados.</p>}
            <div className="self-signup-grid"><label>Responsável<input required value={form.ownerName} onChange={e=>setField('ownerName',e.target.value)} placeholder="Seu nome"/></label><label>E-mail<input required type="email" autoComplete="email" value={form.email} onChange={e=>setField('email',e.target.value)} placeholder="voce@empresa.com"/></label></div>
            <label>WhatsApp comercial<input required inputMode="tel" value={form.contactPhone} onChange={e=>setField('contactPhone',e.target.value)} placeholder="(27) 99999-9999"/></label>
          </fieldset>
          <fieldset className="self-signup-step" hidden={stage!==2} disabled={stage!==2}><legend>2. Plano e segurança</legend>
            <p>{form.storeName} · {form.businessSegment}. O Admin Master revisará seu cadastro antes da publicação.</p>
            <details className="self-signup-optional"><summary>Adicionar cidade, UF ou CNPJ (opcional)</summary><div className="self-signup-grid"><label>Cidade<input value={form.city||''} onChange={e=>setField('city',e.target.value)} placeholder="Cidade"/></label><label>UF<input maxLength={2} value={form.state||''} onChange={e=>setField('state',e.target.value.toUpperCase())} placeholder="ES"/></label></div><label>CNPJ<input inputMode="numeric" value={form.businessDocument||''} onChange={e=>setField('businessDocument',e.target.value)} placeholder="00.000.000/0001-00"/></label></details>
          <label>Senha<div className="self-signup-password"><input required minLength={8} type={showPassword?'text':'password'} autoComplete={mode==='new'?'new-password':'current-password'} value={form.password} onChange={(e)=>setField('password',e.target.value)} placeholder="Mínimo de 8 caracteres"/><button type="button" onClick={()=>setShowPassword((value)=>!value)} aria-label="Mostrar ou ocultar senha">{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>

          <fieldset className="self-signup-plans"><legend>Escolha seu plano</legend>{plans.map((plan)=><label key={plan.code} className={form.planCode===plan.code?'selected':''}><input type="radio" name="plan" value={plan.code} checked={form.planCode===plan.code} onChange={()=>setField('planCode',plan.code)}/><div><strong>{plan.name}</strong><span>{plan.code==='DEMO'?`${demoDays} dias gratuitos`:`${currency.format(plan.monthlyPrice)} / mês`}</span></div>{form.planCode===plan.code&&<Check size={18}/>}</label>)}</fieldset>

          {isDemo&&demoEnabled&&<div className="self-signup-notice"><Clock3 size={17}/><span>O período gratuito começa após a liberação do Admin Master. A elegibilidade é verificada pelos dados cadastrais do negócio.</span></div>}
          {!isDemo&&<div className="self-signup-notice"><ShieldCheck size={17}/><span>Você poderá preparar o sistema, mas a vitrine permanecerá indisponível até o Admin Master liberar o cadastro.</span></div>}

          {appConfig.turnstileSiteKey?<TurnstileWidget siteKey={appConfig.turnstileSiteKey} action="signup" onToken={setCaptchaToken} resetSignal={captchaReset}/>:<div className="form-error">Turnstile não configurado neste build. O auto cadastro permanece bloqueado por segurança.</div>}
          {success&&<div className="form-success self-signup-success" role="status">{success}</div>}
          {presentationNeedsReview?<Link className="primary-button self-signup-submit" to="/admin/negocio">Concluir segmento e permissões</Link>:<button className="primary-button self-signup-submit" disabled={loading||!appConfig.turnstileSiteKey||!captchaToken}>{loading?'Processando...':mode==='new'?'Criar conta e continuar':'Entrar e solicitar acesso'}</button>}
          </fieldset>
          {error&&<div className="form-error" role="alert">{error}</div>}
          {stage===1?<button type="button" className="primary-button self-signup-submit" onClick={advance}>Continuar para plano e segurança</button>:<button type="button" className="secondary-button" onClick={()=>{setStage(1);setCaptchaToken('');setCaptchaReset(v=>v+1);}}>Voltar aos dados do negócio</button>}
          <small className="self-signup-footnote">Ao continuar, você solicita a criação de um ambiente {PLATFORM_BRAND}. Cadastros são revisados pelo Admin Master antes da liberação definitiva e o teste gratuito depende de elegibilidade cadastral.</small>
        </form>
      </section>
    </main>
  </div>;
}
