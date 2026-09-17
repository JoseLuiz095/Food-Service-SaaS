import { Activity, CheckCircle2, CloudCog, Database, RefreshCw, ShieldCheck, Store, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import packageJson from '../../../package.json';
import type { EdgeFunctionHealth } from '../../lib/supabaseRest';
import type { PlatformEventLog } from '../../services/interactionTelemetry';
import { platformApi } from '../../services/platformApi';
import type { PlatformSystemCheck } from '../../types';

const numberLabel=(value:number)=>new Intl.NumberFormat('pt-BR').format(value);
const productionOrigin='https://foodweb.joseluizacama.workers.dev';
const dateTime=(value:string)=>new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'medium'});
const actionLabel=(value:string)=>({
  subscription_renewal_confirm:'Confirmar renovação',subscription_plan_change_confirm:'Confirmar alteração de plano',
  subscription_renewal_reject:'Negar renovação',subscription_plan_change_reject:'Negar alteração de plano',
  subscription_renewal_confirmed:'Renovação confirmada no banco',subscription_plan_change_confirmed:'Alteração de plano confirmada no banco',
  subscription_renewal_rejected:'Renovação negada no banco',subscription_plan_change_rejected:'Alteração de plano negada no banco',
  order_payment_confirmed:'Recebimento de pedido confirmado',store_credentials_updated:'Credenciais do lojista alteradas',
  window_error:'Erro global do navegador',unhandled_promise_rejection:'Falha assíncrona não tratada',
}[value]||value.replaceAll('_',' '));

export default function MasterDiagnostics(){
  const[result,setResult]=useState<PlatformSystemCheck|null>(null);
  const[functionHealth,setFunctionHealth]=useState<EdgeFunctionHealth|null>(null);
  const[checkoutHealth,setCheckoutHealth]=useState<EdgeFunctionHealth|null>(null);
  const[events,setEvents]=useState<PlatformEventLog[]>([]);
  const[functionError,setFunctionError]=useState('');
  const[checkoutError,setCheckoutError]=useState('');
  const[eventsError,setEventsError]=useState('');
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');

  const run=async()=>{
    setLoading(true);setError('');setFunctionError('');setCheckoutError('');setEventsError('');
    const[databaseResult,edgeResult,checkoutResult,eventResult]=await Promise.allSettled([
      platformApi.systemCheck(),platformApi.createStoreFunctionHealth(),platformApi.publicCheckoutFunctionHealth(),platformApi.listPlatformEvents({limit:180}),
    ]);
    if(databaseResult.status==='fulfilled')setResult(databaseResult.value);else{setResult(null);setError(databaseResult.reason instanceof Error?databaseResult.reason.message:'Falha ao executar diagnóstico do banco.')}
    if(edgeResult.status==='fulfilled')setFunctionHealth(edgeResult.value);else{setFunctionHealth(null);setFunctionError(edgeResult.reason instanceof Error?edgeResult.reason.message:'Não foi possível validar a Edge Function de criação de lojas.')}
    if(checkoutResult.status==='fulfilled')setCheckoutHealth(checkoutResult.value);else{setCheckoutHealth(null);setCheckoutError(checkoutResult.reason instanceof Error?checkoutResult.reason.message:'Não foi possível validar o checkout público.')}
    if(eventResult.status==='fulfilled')setEvents(eventResult.value);else{setEvents([]);setEventsError(eventResult.reason instanceof Error?eventResult.reason.message:'Não foi possível consultar o registro de interações.')}
    setLoading(false);
  };
  useEffect(()=>{void run()},[]);

  const checks=useMemo(()=>result?[
    {label:'Admin Master reconhecido',value:result.platformAdmin?'OK':'Falha',ok:result.platformAdmin},
    {label:'Lojas cadastradas',value:numberLabel(result.stores),ok:true},{label:'Lojas online',value:numberLabel(result.storesOnline),ok:true},
    {label:'Lojas suspensas',value:numberLabel(result.storesSuspended),ok:true},{label:'Planos',value:numberLabel(result.plans),ok:result.plans>0},
    {label:'Assinaturas',value:numberLabel(result.subscriptions),ok:result.subscriptions>=0},{label:'Vínculos de usuários',value:numberLabel(result.users),ok:result.users>=0},
    {label:'Produtos',value:numberLabel(result.products),ok:result.products>=0},{label:'Pedidos',value:numberLabel(result.orders),ok:result.orders>=0},
    {label:'Analytics de conversão',value:result.analyticsReady?'Ativo':'Verificar',ok:Boolean(result.analyticsReady)},
    {label:'Eventos de navegação',value:numberLabel(result.analyticsEvents||0),ok:Boolean(result.analyticsReady)},
    {label:'Áreas de entrega',value:numberLabel(result.deliveryZones),ok:result.deliveryZones>=0},{label:'Domínios personalizados',value:numberLabel(result.domains),ok:result.domains>=0},
    {label:'Oferta de novas Demos',value:result.demoEnabled===false?'Desabilitada':'Habilitada',ok:true},{label:'Demos em andamento',value:numberLabel(result.demoTrials||0),ok:true},
    {label:'Demos próximas do vencimento',value:numberLabel(result.demoTrialsExpiringSoon||0),ok:true},
    {label:'Agendamento automático da Demo',value:result.demoCronScheduled?`Ativo${result.demoCronSchedule?` · ${result.demoCronSchedule}`:''}`:(result.demoCronExists?'Inativo':'Não agendado'),ok:Boolean(result.demoCronScheduled)},
  ]:[],[result]);
  const checkoutReady=Boolean(checkoutHealth?.ok&&checkoutHealth.turnstileConfigured&&checkoutHealth.turnstileRequired&&checkoutHealth.originAllowed!==false);
  const failures=useMemo(()=>events.filter((event)=>event.result==='error').slice(0,20),[events]);
  const audits=useMemo(()=>events.filter((event)=>event.kind==='audit'&&event.result==='success').slice(0,20),[events]);
  const unfinished=useMemo(()=>{const terminal=new Set(events.filter((event)=>event.correlationId&&['success','error'].includes(event.result)).map((event)=>event.correlationId));const threshold=Date.now()-15_000;return events.filter((event)=>event.result==='started'&&event.correlationId&&!terminal.has(event.correlationId)&&new Date(event.createdAt).getTime()<threshold).slice(0,20)},[events]);

  return <>
    <div className="admin-page-title"><div><span className="eyebrow">DIAGNÓSTICO FOODWEB</span><h1>Saúde e interações da plataforma</h1><p>Banco, Edge Functions, Turnstile e o histórico técnico das ações importantes.</p></div><button type="button" className="secondary-button" onClick={()=>void run()} disabled={loading}><RefreshCw size={17}/>{loading?'Validando...':'Executar novamente'}</button></div>
    {error&&<section className="admin-card diagnostic-error"><TriangleAlert size={22}/><div><strong>Falha no diagnóstico do banco</strong><p>{error}</p><small>Confirme as migrations e se a sessão do Master está em AAL2.</small></div></section>}
    <section className={`admin-card edge-function-status ${functionHealth?.ok?'ok':'error'}`}><CloudCog size={24}/><div><span className="eyebrow">CRIAÇÃO AUTOMÁTICA DE LOJAS</span><h2>food-platform-create-store</h2>{functionHealth?.ok?<p><strong>Publicada e respondendo.</strong> Versão {functionHealth.version}.</p>:<><p><strong>Indisponível.</strong> {functionError||'A função não respondeu.'}</p><div className="diagnostic-command"><code>npx supabase@2.116.0 functions deploy food-platform-create-store --project-ref SEU_PROJECT_REF</code></div></>}</div></section>
    <section className={`admin-card edge-function-status ${checkoutReady?'ok':'error'}`}><ShieldCheck size={24}/><div><span className="eyebrow">CHECKOUT PÚBLICO</span><h2>food-public-checkout + Turnstile</h2>{checkoutHealth?.ok?<p><strong>Função publicada.</strong> Versão {checkoutHealth.version}. Turnstile: {checkoutHealth.turnstileConfigured?'configurado':'não configurado'} · obrigatório: {checkoutHealth.turnstileRequired?'sim':'não'} · origem atual: {checkoutHealth.originAllowed===false?'não autorizada':'autorizada'}.</p>:<p><strong>Indisponível.</strong> {checkoutError||'A função não respondeu.'}</p>}{!checkoutReady&&<div className="diagnostic-help-block"><strong>Wrangler não publica Edge Functions do Supabase.</strong><small>Configure TURNSTILE_SECRET_KEY, TURNSTILE_REQUIRED=true e PUBLIC_APP_ORIGINS={productionOrigin}. Depois publique novamente a função.</small><div className="diagnostic-command"><code>npx supabase@2.116.0 functions deploy food-public-checkout --project-ref SEU_PROJECT_REF --no-verify-jwt</code></div></div>}</div></section>

    {result&&<><section className="admin-card diagnostic-summary"><div className="diagnostic-version"><ShieldCheck size={23}/><div><span className="eyebrow">BANCO CONECTADO</span><strong>Frontend {packageJson.version} · Banco {result.version}</strong></div></div><div className="diagnostic-badges"><span><Store size={16}/>{result.storesOnline} online</span><span><Database size={16}/>{result.orders} pedidos</span>{result.demoEnabled===false?<span>Demo desabilitada</span>:result.demoDurationDays&&<span>{result.demoDurationDays} dias de teste</span>}</div></section><div className="diagnostic-grid">{checks.map((item)=><article className="admin-card diagnostic-check" key={item.label}><span className={item.ok?'diagnostic-ok':'diagnostic-fail'}>{item.ok?<CheckCircle2 size={18}/>:<TriangleAlert size={18}/>}</span><div><small>{item.label}</small><strong>{item.value}</strong></div></article>)}</div></>}

    <section className="admin-card interaction-diagnostics-r69"><div className="admin-card__header"><div><span className="eyebrow">INTERAÇÕES</span><h2>Falhas e ações críticas recentes</h2><p>Senha, token e conteúdo dos documentos não entram no log. O objetivo é localizar botões que falharam ou ficaram sem conclusão.</p></div><Activity size={22}/></div>
      {eventsError?<div className="diagnostic-error-inline-r69"><TriangleAlert size={18}/><span>{eventsError}. Aplique a migration v0.5.0 para habilitar esta área.</span></div>:<div className="interaction-diagnostics-grid-r69">
        <div><h3>Falhas recentes <b>{failures.length}</b></h3>{failures.length?<div className="interaction-event-list-r69">{failures.map((event)=><article key={event.id}><span className="is-error"><TriangleAlert size={16}/></span><div><strong>{actionLabel(event.action)}</strong><small>{event.storeName||'Plataforma'} · {event.route||'sem rota'} · {dateTime(event.createdAt)}</small>{event.errorMessage&&<p>{event.errorMessage}</p>}</div><em>{event.appVersion||'—'}</em></article>)}</div>:<p className="analytics-empty">Nenhuma falha registrada no recorte consultado.</p>}</div>
        <div><h3>Interações sem conclusão <b>{unfinished.length}</b></h3>{unfinished.length?<div className="interaction-event-list-r69">{unfinished.map((event)=><article key={event.id}><span className="is-warning"><Activity size={16}/></span><div><strong>{actionLabel(event.action)}</strong><small>{event.storeName||'Plataforma'} · iniciou em {dateTime(event.createdAt)}</small><p>Foi registrado o início, mas nenhum sucesso/erro correspondente apareceu.</p></div></article>)}</div>:<p className="analytics-empty">Nenhuma interação aparentemente travada no recorte consultado.</p>}</div>
        <div className="full"><h3>Auditoria crítica <b>{audits.length}</b></h3>{audits.length?<div className="interaction-event-list-r69 compact">{audits.map((event)=><article key={event.id}><span className="is-success"><CheckCircle2 size={16}/></span><div><strong>{actionLabel(event.action)}</strong><small>{event.storeName||'Plataforma'} · {dateTime(event.createdAt)}</small></div><em>{event.appVersion||'—'}</em></article>)}</div>:<p className="analytics-empty">As próximas confirmações/negações e alterações críticas aparecerão aqui.</p>}</div>
      </div>}
    </section>
    <section className="admin-card master-guidance"><span className="eyebrow">ESTABILIZAÇÃO</span><h2>Quando um botão “não fizer nada”</h2><p>Abra esta tela e procure em Interações sem conclusão ou Falhas recentes. A v0.5.0 registra erros globais e acompanha as decisões de mensalidade.</p></section>
  </>;
}
