import {receiptContactLoadError} from '../../utils/receiptContactErrors';
import { useEffect, useRef, useState } from 'react';
import { receiptContactsApi, type ReceiptContact } from '../../services/receiptContactsApi';
import '../receipt-contacts.css';
import {receiptContactsEnabled} from '../../services/receiptContactsApi';
import {getWhatsAppUrl} from '../../utils/whatsapp';
const empty=():ReceiptContact[]=>[1,2].map(slot=>({slot,name:'',phone:''}));
export default function ReceiptContactsSettings({storeId,demo=false}:{storeId:string;demo?:boolean}){
 const [attempt,setAttempt]=useState(0),[state,setState]=useState({key:'',loading:true,error:'',saved:false});
 const [contacts,setContacts]=useState(empty),[points,setPoints]=useState<Array<{id:string;name:string}>>([]),[mapping,setMapping]=useState<Record<string,string>>({}),[saving,setSaving]=useState(false);
 const [loaded,setLoaded]=useState(false);
 const [confirmed,setConfirmed]=useState(false);
 const current=useRef(storeId);current.current=storeId;
 useEffect(()=>{let active=true;setState({key:storeId,loading:true,error:'',saved:false});setContacts(empty());setPoints([]);setMapping({});setSaving(false);setLoaded(false);setConfirmed(false);
  if(demo){setState({key:storeId,loading:false,error:'Este cadastro exige uma loja conectada. A demonstração não grava contatos.',saved:false});return;}
  void receiptContactsApi.load(storeId).then(([list,links,locations])=>{if(!active)return;setContacts(empty().map(c=>list.find(v=>v.slot===c.slot)||c));setMapping(Object.fromEntries(links.map(p=>[p.pickup_location_id,String(p.contact_slot)])));setPoints(locations);setLoaded(true);setState({key:storeId,loading:false,error:'',saved:false});}).catch((error:unknown)=>{if(active)setState({key:storeId,loading:false,error:receiptContactLoadError(error),saved:false});});return()=>{active=false;};
 },[storeId,demo,attempt]);
 const visible=state.key===storeId;
 async function save(){
  if(!loaded||saving)return;
  const id=storeId;const values=contacts.filter(c=>c.name.trim()||c.phone.trim()).map(c=>({...c,name:c.name.trim(),phone:c.phone.replace(/\D/g,'')}));
  if(values.some(c=>!c.name||c.name.length>60||!/^[1-9][0-9]{9,14}$/.test(c.phone))){setState(s=>({...s,error:'Preencha o nome e o telefone com código do país de cada contato utilizado.',saved:false}));return;}
  if(values.length&&!confirmed){setState(s=>({...s,error:'Confira os números e confirme os destinos antes de salvar.',saved:false}));return;}
  const links=points.flatMap(p=>mapping[p.id]?[{pickup_location_id:p.id,contact_slot:Number(mapping[p.id])}]:[]);
  if(links.some(p=>!values.some(c=>c.slot===p.contact_slot))){setState(s=>({...s,error:'Selecione um contato preenchido para cada ponto ou use a escolha do cliente.',saved:false}));return;}
  setSaving(true);setState(s=>({...s,error:'',saved:false}));
  try{await receiptContactsApi.save(id,values,links);if(current.current===id)setState(s=>({...s,saved:true}));}catch{if(current.current===id)setState(s=>({...s,error:'Não foi possível salvar. Seu rascunho foi mantido; tente novamente.',saved:false}));}finally{if(current.current===id)setSaving(false);}
 }
 return <section id="comprovantes" className="admin-card receipt-settings" aria-labelledby="receipt-settings-title"><h2 id="receipt-settings-title">Telefones para confirmação e comprovantes</h2><p>Cadastre até dois contatos comerciais de WhatsApp. Nomes e telefones serão compartilhados com os clientes. Isso define apenas o destino da mensagem; a loja continua conferindo e confirmando o pagamento manualmente.</p>
 {!receiptContactsEnabled&&<p className="receipt-settings-notice" role="status">O envio por contato do ponto aguarda a ativação da plataforma. Os contatos abaixo só passam a valer para o cliente após essa ativação.</p>}
 {(!visible||state.loading)?<p role="status">Carregando contatos…</p>:<>{state.error&&<p role="alert">{state.error}</p>}{!demo&&<><div className="receipt-contacts-grid">{contacts.map((c,i)=><fieldset key={c.slot} disabled={saving||!loaded}><legend>Contato {c.slot}</legend><label>Nome público<input maxLength={60} value={c.name} onChange={e=>{setContacts(list=>list.map((x,n)=>n===i?{...x,name:e.target.value}:x));setState(s=>({...s,saved:false}));setConfirmed(false);}}/></label><label>WhatsApp com código do país<input type="tel" inputMode="tel" autoComplete="off" placeholder="55 + DDD + número" value={c.phone} onChange={e=>{setContacts(list=>list.map((x,n)=>n===i?{...x,phone:e.target.value}:x));setState(s=>({...s,saved:false}));setConfirmed(false);}}/></label>{/^[1-9][0-9]{9,14}$/.test(c.phone.replace(/\D/g,''))&&<a className="secondary-button" href={getWhatsAppUrl(c.phone.replace(/\D/g,''),'Teste do contato comercial para recebimento de comprovantes.')} target="_blank" rel="noopener noreferrer">Conferir WhatsApp de {c.name||`contato ${c.slot}`}</a>}</fieldset>)}</div>
 {points.map(p=><label key={p.id}>Comprovante de {p.name}<select disabled={saving} value={mapping[p.id]||''} onChange={e=>{setMapping(m=>({...m,[p.id]:e.target.value}));setState(s=>({...s,saved:false}));setConfirmed(false);}}><option value="">Cliente escolhe o contato</option>{contacts.filter(c=>c.name.trim()&&c.phone.trim()).map(c=><option key={c.slot} value={c.slot}>{c.name}</option>)}</select></label>)}<p>No link geral, o cliente escolhe entre os contatos cadastrados. No link de um ponto, usamos o contato vinculado ao ponto confirmado no pedido.</p><label className="receipt-settings-confirm"><input type="checkbox" checked={confirmed} disabled={saving||!loaded} onChange={e=>setConfirmed(e.target.checked)}/><span>Conferi os números e o contato que receberá o comprovante de cada ponto.</span></label><button type="button" className="primary-button" disabled={saving||!loaded} onClick={()=>void save()}>{saving?'Salvando contatos…':'Salvar contatos de comprovantes'}</button>{state.saved&&<p role="status">Contatos e destinos dos pontos salvos.</p>}<button type="button" className="text-button" disabled={saving} onClick={()=>setAttempt(x=>x+1)}>Recarregar contatos</button></>}</>}
 </section>;
}
