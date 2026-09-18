import { CheckCircle2, Clock3, RefreshCw, ShieldCheck, UserPlus, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { trackInteraction } from '../../services/interactionTelemetry';
import {
  approveFoodSelfServiceSignup,
  listFoodSelfServiceSignupRequests,
  rejectFoodSelfServiceSignup,
  type SelfServiceSignupRequest,
} from '../../services/selfServiceSignup';

const dateTime=(value?:string|null)=>value?new Date(value).toLocaleString('pt-BR'):'—';
const statusLabel=(status:SelfServiceSignupRequest['status'])=>status==='pending'?'Pendente':status==='approved'?'Aprovado':status==='rejected'?'Rejeitado':'Cancelado';

export default function SignupRequests(){
  const{showToast}=useToast();
  const[items,setItems]=useState<SelfServiceSignupRequest[]>([]);
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState('');
  const[filter,setFilter]=useState<'pending'|'all'>('pending');

  const load=async()=>{
    setLoading(true);
    try{setItems(await listFoodSelfServiceSignupRequests())}
    catch(e){showToast(e instanceof Error?e.message:'Falha ao carregar solicitações.','error')}
    finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[]);
  const visible=useMemo(()=>filter==='pending'?items.filter((item)=>item.status==='pending'):items,[items,filter]);
  const pending=items.filter((item)=>item.status==='pending').length;

  const approve=async(item:SelfServiceSignupRequest)=>{
    if(!window.confirm(`Liberar ${item.storeName} no plano ${item.requestedPlanName}?`))return;
    setSaving(item.id);
    try{await trackInteraction('self_service_signup_approve',()=>approveFoodSelfServiceSignup(item.id),{storeId:item.storeId,successKind:'audit'});showToast('Cadastro liberado.','success');await load()}
    catch(e){showToast(e instanceof Error?e.message:'Falha ao liberar cadastro.','error')}
    finally{setSaving('')}
  };
  const reject=async(item:SelfServiceSignupRequest)=>{
    const reason=window.prompt(`Motivo para não liberar ${item.storeName}:`,'Cadastro não aprovado pelo Admin Master');
    if(reason===null)return;
    setSaving(item.id);
    try{await trackInteraction('self_service_signup_reject',()=>rejectFoodSelfServiceSignup(item.id,reason),{storeId:item.storeId,successKind:'audit'});showToast('Cadastro rejeitado e acesso suspenso.','success');await load()}
    catch(e){showToast(e instanceof Error?e.message:'Falha ao rejeitar cadastro.','error')}
    finally{setSaving('')}
  };

  return <>
    <div className="admin-page-title"><div><span className="eyebrow">AUTO CADASTRO</span><h1>Solicitações de novos clientes</h1><p>Revise quem entrou sozinho pela página comercial antes da liberação definitiva.</p></div><button className="secondary-button" onClick={()=>void load()} disabled={loading}><RefreshCw size={17}/>Atualizar</button></div>

    <section className="signup-request-summary"><article><UserPlus/><div><strong>{pending}</strong><span>Aguardando decisão</span></div></article><article><ShieldCheck/><div><strong>{items.filter((item)=>item.status==='approved').length}</strong><span>Liberados</span></div></article><article><Clock3/><div><strong>{items.filter((item)=>item.trialGranted&&item.status==='pending').length}</strong><span>Demos em análise</span></div></article></section>

    <div className="signup-request-filters"><button className={filter==='pending'?'active':''} onClick={()=>setFilter('pending')}>Pendentes ({pending})</button><button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>Histórico ({items.length})</button></div>

    <section className="admin-card no-padding signup-request-table">{loading?<div className="master-table-loading">Carregando...</div>:visible.length===0?<div className="signup-request-empty"><CheckCircle2/><h3>Nenhuma solicitação pendente</h3><p>Novos auto cadastros aparecerão aqui automaticamente.</p></div>:<div className="responsive-table"><table><thead><tr><th>Cliente</th><th>Plano solicitado</th><th>Acesso atual</th><th>Cadastro</th><th>Status</th><th></th></tr></thead><tbody>{visible.map((item)=><tr key={item.id}><td><strong>{item.storeName}</strong><small>{item.ownerName} · {item.email}</small></td><td><strong>{item.requestedPlanName}</strong><small>{item.requestedPlanCode}{item.trialGranted?' · Demo concedida':''}</small></td><td><span className={`signup-access-chip ${item.accessStatus==='online'?'online':'limited'}`}>{item.accessStatus==='online'?'Online':'Preparação'}</span>{item.trialExpiresAt&&<small>Demo até {dateTime(item.trialExpiresAt)}</small>}</td><td>{dateTime(item.createdAt)}</td><td><span className={`signup-status-chip ${item.status}`}>{statusLabel(item.status)}</span>{item.rejectionReason&&<small>{item.rejectionReason}</small>}</td><td>{item.status==='pending'?<div className="signup-request-actions"><button className="primary-button compact" disabled={saving===item.id} onClick={()=>void approve(item)}><CheckCircle2 size={15}/>Liberar</button><button className="danger-button compact" disabled={saving===item.id} onClick={()=>void reject(item)}><XCircle size={15}/>Não liberar</button></div>:<small>Revisado em {dateTime(item.reviewedAt)}</small>}</td></tr>)}</tbody></table></div>}</section>
  </>;
}
