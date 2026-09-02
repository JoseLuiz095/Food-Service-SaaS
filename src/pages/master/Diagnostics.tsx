import { CheckCircle2, CloudCog, Database, RefreshCw, ShieldCheck, Store, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { EdgeFunctionHealth } from '../../lib/supabaseRest';
import { platformApi } from '../../services/platformApi';
import type { PlatformSystemCheck } from '../../types';

const numberLabel = (value: number) => new Intl.NumberFormat('pt-BR').format(value);

export default function MasterDiagnostics(){
  const [result,setResult]=useState<PlatformSystemCheck|null>(null);
  const [functionHealth,setFunctionHealth]=useState<EdgeFunctionHealth|null>(null);
  const [checkoutHealth,setCheckoutHealth]=useState<EdgeFunctionHealth|null>(null);
  const [functionError,setFunctionError]=useState('');
  const [checkoutError,setCheckoutError]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  const run=async()=>{
    setLoading(true);setError('');setFunctionError('');setCheckoutError('');
    const [databaseResult, edgeResult, checkoutResult] = await Promise.allSettled([
      platformApi.systemCheck(),
      platformApi.createStoreFunctionHealth(),
      platformApi.publicCheckoutFunctionHealth(),
    ]);

    if (databaseResult.status === 'fulfilled') setResult(databaseResult.value);
    else {
      setResult(null);
      setError(databaseResult.reason instanceof Error ? databaseResult.reason.message : 'Falha ao executar diagnóstico do banco.');
    }

    if (edgeResult.status === 'fulfilled') setFunctionHealth(edgeResult.value);
    else {
      setFunctionHealth(null);
      setFunctionError(edgeResult.reason instanceof Error ? edgeResult.reason.message : 'Não foi possível validar a Edge Function de criação de lojas.');
    }

    if (checkoutResult.status === 'fulfilled') setCheckoutHealth(checkoutResult.value);
    else {
      setCheckoutHealth(null);
      setCheckoutError(checkoutResult.reason instanceof Error ? checkoutResult.reason.message : 'Não foi possível validar o checkout público.');
    }
    setLoading(false);
  };
  useEffect(()=>{void run()},[]);

  const checks=useMemo(()=>result?[
    {label:'Admin Master reconhecido',value:result.platformAdmin?'OK':'Falha',ok:result.platformAdmin},
    {label:'Lojas cadastradas',value:numberLabel(result.stores),ok:true},
    {label:'Lojas online',value:numberLabel(result.storesOnline),ok:true},
    {label:'Lojas suspensas',value:numberLabel(result.storesSuspended),ok:true},
    {label:'Planos',value:numberLabel(result.plans),ok:result.plans>0},
    {label:'Assinaturas',value:numberLabel(result.subscriptions),ok:result.subscriptions>=0},
    {label:'Vínculos de usuários',value:numberLabel(result.users),ok:result.users>=0},
    {label:'Produtos',value:numberLabel(result.products),ok:result.products>=0},
    {label:'Pedidos',value:numberLabel(result.orders),ok:result.orders>=0},
    {label:'Analytics de conversão',value:result.analyticsReady?'Ativo':'Verificar',ok:Boolean(result.analyticsReady)},
    {label:'Eventos de navegação',value:numberLabel(result.analyticsEvents||0),ok:Boolean(result.analyticsReady)},
    {label:'Áreas de entrega',value:numberLabel(result.deliveryZones),ok:result.deliveryZones>=0},
    {label:'Domínios personalizados',value:numberLabel(result.domains),ok:result.domains>=0},
    {label:'Oferta de novas Demos',value:result.demoEnabled===false?'Desabilitada':'Habilitada',ok:true},
    {label:'Demos em andamento',value:numberLabel(result.demoTrials||0),ok:true},
    {label:'Demos próximas do vencimento',value:numberLabel(result.demoTrialsExpiringSoon||0),ok:true},
    {label:'Agendamento automático da Demo',value:result.demoCronScheduled?`Ativo${result.demoCronSchedule?` · ${result.demoCronSchedule}`:''}`:(result.demoCronExists?'Inativo':'Verificar'),ok:Boolean(result.demoCronScheduled)},
  ]:[],[result]);

  return <>
    <div className="admin-page-title"><div><span className="eyebrow">DIAGNÓSTICO</span><h1>Saúde da plataforma</h1><p>Validação do banco, MFA do Admin Master e serviços necessários para vender e operar novas lojas.</p></div><button className="secondary-button" onClick={()=>void run()} disabled={loading}><RefreshCw size={17}/>{loading?'Validando...':'Executar novamente'}</button></div>

    {error&&<section className="admin-card diagnostic-error"><TriangleAlert size={22}/><div><strong>Falha no diagnóstico do banco</strong><p>{error}</p><small>Confirme se o bundle RC2 foi aplicado e se a sessão do Master já atingiu AAL2.</small></div></section>}

    <section className={`admin-card edge-function-status ${functionHealth?.ok ? 'ok' : 'error'}`}>
      <CloudCog size={24}/>
      <div>
        <span className="eyebrow">CRIAÇÃO AUTOMÁTICA DE LOJAS</span>
        <h2>Edge Function food-platform-create-store</h2>
        {functionHealth?.ok
          ? <p><strong>Publicada e respondendo.</strong> Versão {functionHealth.version}. A criação de lojas pode prosseguir.</p>
          : <><p><strong>Indisponível.</strong> {functionError || 'A função não respondeu.'}</p><div className="diagnostic-command"><code>npx supabase@2.116.0 functions deploy food-platform-create-store --project-ref SEU_PROJECT_REF</code></div></>}
      </div>
    </section>

    <section className={`admin-card edge-function-status ${checkoutHealth?.ok && checkoutHealth.turnstileConfigured && checkoutHealth.turnstileRequired ? 'ok' : 'error'}`}>
      <ShieldCheck size={24}/>
      <div>
        <span className="eyebrow">CHECKOUT PÚBLICO</span>
        <h2>Edge Function food-public-checkout + Turnstile</h2>
        {checkoutHealth?.ok
          ? <p><strong>Função publicada.</strong> Versão {checkoutHealth.version}. Turnstile: {checkoutHealth.turnstileConfigured?'configurado':'não configurado'} · proteção obrigatória: {checkoutHealth.turnstileRequired?'sim':'não'}.</p>
          : <p><strong>Indisponível.</strong> {checkoutError || 'A função não respondeu.'}</p>}
        {(!checkoutHealth?.turnstileConfigured||!checkoutHealth?.turnstileRequired)&&<small>Antes da venda em produção, configure TURNSTILE_SECRET_KEY e TURNSTILE_REQUIRED=true nos Secrets das Edge Functions.</small>}
      </div>
    </section>

    {result&&<>
      <section className="admin-card diagnostic-summary"><div className="diagnostic-version"><ShieldCheck size={23}/><div><span className="eyebrow">BANCO CONECTADO</span><strong>Frontend 3.0.0 RC5.2 · Banco {result.version}</strong></div></div><div className="diagnostic-badges"><span><Store size={16}/>{result.storesOnline} online</span><span><Database size={16}/>{result.orders} pedidos</span>{result.demoEnabled===false?<span>Demo desabilitada</span>:result.demoDurationDays&&<span>{result.demoDurationDays} dias de Demo</span>}</div></section>
      <div className="diagnostic-grid">{checks.map((item)=><article className="admin-card diagnostic-check" key={item.label}><span className={item.ok?'diagnostic-ok':'diagnostic-fail'}>{item.ok?<CheckCircle2 size={18}/>:<TriangleAlert size={18}/>}</span><div><small>{item.label}</small><strong>{item.value}</strong></div></article>)}</div>
      <section className="admin-card master-guidance"><span className="eyebrow">TESTE DE VENDA</span><h2>Fluxo mínimo antes de liberar para cliente</h2><p>Crie uma loja, acesse com o responsável, publique produto, faça um pedido real de teste, abra o WhatsApp e confirme que Analytics registra o funil sem dados pessoais.</p></section>
    </>}
  </>;
}
