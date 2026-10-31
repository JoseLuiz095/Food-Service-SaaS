import {useState} from 'react';
import {Link} from 'react-router-dom';
import {moduleIsActive,type BusinessStatus} from '../../platform/api';
import {useStore} from '../../contexts/StoreContext';
import {useAuth} from '../../contexts/AuthContext';
import {planHasFeature} from '../../utils/plan';
import './admin-routine-actions.css';

export default function AdminRoutineActions({business}:{business:BusinessStatus|null}){
 const {settings,planUsage,products}=useStore();const {membership}=useAuth();
 const [query,setQuery]=useState('');const [expanded,setExpanded]=useState(false);
 const students=['personal','fitness'].includes(business?.profile?.primary_segment||'');
 const actions=[
  {label:'Cadastrar item',detail:'Produto ou serviço no catálogo',to:'/admin/produtos/novo'},
  {label:'Preços e disponibilidade',detail:'Atualizar o catálogo',to:'/admin/produtos'},
  ...(!membership?.limitedAccess?[
   {label:'Conferir pagamentos',detail:'Pedidos e comprovantes a conferir',to:'/admin/pedidos?queue=payment'},
   {label:'Preparar e entregar',detail:'Pedidos em operação',to:'/admin/pedidos?queue=fulfillment'},
   {label:'Pedidos agendados',detail:'Conferir prazos combinados',to:'/admin/pedidos?queue=scheduled'},
   ...(planHasFeature(planUsage.plan,'finance')?[{label:'Financeiro',detail:'Receitas, despesas e compras',to:'/admin/financeiro'}]:[]),
   ...(moduleIsActive(business,'clients')?[
    {label:students?'Alunos':'Clientes',detail:'Cadastro e identificação dos atendimentos',to:'/admin/operacao?tab=clients'},
    {label:'Acompanhamentos',detail:'Tarefas e retornos administrativos',to:'/admin/operacao?tab=followups'}]:[]),
   ...(moduleIsActive(business,'appointments')?[
    {label:'Agenda',detail:'Organizar atendimentos',to:business?.profile?.primary_segment==='fitness'?'/admin/fitness':'/admin/operacao?tab=appointments'},
    {label:'Serviços e pacotes',detail:'Preparar serviços antes de agendar',to:'/admin/operacao?tab=services'}]:[]),
   ...(moduleIsActive(business,'training')&&business?.profile?.primary_segment==='fitness'?[{label:'Treinos',detail:'Fichas e acompanhamento dos alunos',to:'/admin/fitness#treinos'}]:[]),
   ...(moduleIsActive(business,'creator')?[
    {label:'Campanhas',detail:'Planejamento e prazos comerciais',to:'/admin/operacao?tab=campaigns'},
    {label:'Links comerciais',detail:'Ofertas e parcerias',to:'/admin/operacao?tab=links'}]:[]),
  ]:[]),
  ...(products.some(p=>p.trackStock)?[{label:'Estoque e locais',detail:'Saldos, reservas e transferências',to:'/admin/estoque'}]:[]),
  {label:'Configurações da loja',detail:'Contatos, horários e pagamentos',to:'/admin/configuracoes'},
 ];
 const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
 const words=normalize(query).trim().split(/\s+/);
 const serviceFirst=['personal','fitness','nutrition','creator','services'].includes(business?.profile?.primary_segment||'');
 const ordered=serviceFirst?[...actions.filter(a=>a.to.startsWith('/admin/operacao')||a.to.startsWith('/admin/fitness')),...actions.filter(a=>!a.to.startsWith('/admin/operacao')&&!a.to.startsWith('/admin/fitness'))]:actions;
 const visible=ordered.filter(a=>words.every(w=>normalize(a.label+' '+a.detail).includes(w)));
 const shown=query.trim()||expanded?visible:visible.slice(0,6);
 return <section className="admin-card admin-routine" aria-label="Rotinas e ferramentas"><h2>O que você precisa fazer?</h2><label>Buscar ferramenta<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ex.: pagamento, agenda, preço"/></label><div className="admin-routine__links">{shown.map(a=><Link key={a.to} to={a.to}><strong>{a.label}</strong><span>{a.detail}</span></Link>)}</div>{!query.trim()&&visible.length>6&&<button type="button" className="text-button" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?'Mostrar menos':`Ver todas as ferramentas (${visible.length})`}</button>}{!visible.length&&<p role="status">Nenhuma ferramenta habilitada corresponde à busca. <button type="button" className="text-button" onClick={()=>setQuery('')}>Limpar busca</button></p>}<small>Ferramentas da loja {settings.name}. Módulos seguem as permissões e o plano contratado.</small></section>;
}
