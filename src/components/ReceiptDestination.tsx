import {reportOrderReceipt} from '../services/orderPaymentApi';
import { useEffect, useRef, useState } from 'react';
import { getReceiptDestinations, receiptContactsEnabled, type ReceiptDestinations } from '../services/receiptContactsApi';
import { getWhatsAppUrl } from '../utils/whatsapp';
import './receipt-contacts.css';
/** Encaminha comprovantes e só registra a declaração quando o cliente confirma o envio. */
export default function ReceiptDestination({storeId,pointId,destinations,legacyPhone='',message,onOpen,opened=false,receiptToken,onReported}:{storeId?:string;pointId?:string;destinations?:ReceiptDestinations;legacyPhone?:string;message:string;onOpen?:()=>void;opened?:boolean;receiptToken?:string;onReported?:(autoPickedUp:boolean)=>void}){
 const [reporting,setReporting]=useState(false),[reported,setReported]=useState(false),[localOpened,setLocalOpened]=useState(false),[autoPickedUp,setAutoPickedUp]=useState(false),[reportError,setReportError]=useState('');const inFlight=useRef(false);
 const isOpened=opened||localOpened;
 const key=`${storeId||''}:${pointId||''}:${receiptToken||''}`;
 const activeKey=useRef(key);activeKey.current=key;
 const [attempt,setAttempt]=useState(0),[choice,setChoice]=useState({key:'',slot:0});
 const [state,setState]=useState<{key:string;data?:ReceiptDestinations;loading:boolean;error:string}>({key:'',loading:true,error:''});
 useEffect(()=>{setReported(false);setLocalOpened(false);setAutoPickedUp(false);setReportError('');},[key]);
 useEffect(()=>{let active=true;setChoice({key,slot:0});
  if(destinations){setState({key,data:destinations,loading:false,error:''});return;}
  if(!storeId||!receiptContactsEnabled){setState({key,data:{mode:'general',contacts:[]},loading:false,error:''});return;}
  setState({key,loading:true,error:''});
  void getReceiptDestinations(storeId,pointId).then(data=>{if(active)setState({key,data,loading:false,error:''});}).catch(()=>{if(active)setState({key,loading:false,error:'Não foi possível consultar o destino do comprovante. Tente novamente antes de enviar.'});});return()=>{active=false;};
 },[key,storeId,pointId,destinations,attempt]);
 const data=state.key===key?state.data:undefined;
 const contacts=data?.contacts||[];
 const selected=contacts.length===1?contacts[0]:contacts.find(c=>choice.key===key&&choice.slot===c.slot);
 const fallback=data?.mode==='general'&&contacts.length===0&&/^[1-9][0-9]{9,14}$/.test(legacyPhone.replace(/\D/g,''))?legacyPhone:'';
 const phone=selected?.phone||fallback;
 const openReceipt=()=>{setLocalOpened(true);onOpen?.();};
 const confirmReceiptSent=async()=>{
  if(!receiptToken||inFlight.current||!phone)return;inFlight.current=true;setReporting(true);setReportError('');
  const requestKey=key;
  try{const result=await reportOrderReceipt(receiptToken);if(activeKey.current!==requestKey)return;setReported(true);setAutoPickedUp(result.autoPickedUp);onReported?.(result.autoPickedUp);}
  catch(error){if(activeKey.current===requestKey)setReportError(error instanceof Error?error.message:'Não foi possível registrar o aviso. Tente novamente.');}
  finally{inFlight.current=false;if(activeKey.current===requestKey)setReporting(false);}
 };
 return <section className="receipt-destination" aria-label="Enviar comprovante"><h2>Envie o comprovante à loja</h2>
 {state.key!==key||state.loading?<p role="status">Consultando contato…</p>:state.error?<><p role="alert">{state.error}</p><button type="button" className="secondary-button" onClick={()=>setAttempt(x=>x+1)}>Tentar consultar contatos</button></>:<>
 {data?.mode==='unavailable'?<p>O contato deste ponto não está disponível. Fale com a loja para conferir o destino antes de enviar.</p>:<>
 {data?.mode==='unassigned'&&<p>Este ponto ainda não tem contato definido. Escolha quem receberá o comprovante.</p>}
 {contacts.length>1&&<label>Para qual contato deseja enviar?<select value={selected?.slot||''} onChange={e=>setChoice({key,slot:Number(e.target.value)})}><option value="">Selecione um contato</option>{contacts.map(c=><option key={c.slot} value={c.slot}>{c.name}</option>)}</select></label>}
 {selected&&<p>Destino: <strong>{selected.name}</strong> · +{selected.phone}</p>}
 {phone?<a href={getWhatsAppUrl(phone,message)} target="_blank" rel="noopener noreferrer" onClick={openReceipt}>Abrir WhatsApp e enviar comprovante</a>:contacts.length>1?<p>Selecione um contato para abrir a conversa.</p>:<p>A loja ainda não cadastrou um destino para comprovantes.</p>}
 {receiptToken&&phone&&isOpened&&!reported&&<button type="button" className="primary-button" disabled={reporting} onClick={()=>void confirmReceiptSent()}>{reporting?'Registrando…':'Já enviei o comprovante'}</button>}
 </>}
 </>}
 {reportError&&<><p role="alert">{reportError}</p>{phone&&<a href={getWhatsAppUrl(phone,message)} target="_blank" rel="noopener noreferrer">Abrir o WhatsApp novamente</a>}</>}{reported&&<p role="status">{autoPickedUp?'Comprovante informado. O ponto registrou a retirada e baixou o estoque.':'Comprovante informado. A loja pode conferir o recebimento ou devolver o pedido para A receber.'}</p>}
 {receiptToken&&<p>{isOpened&&!reported?'Depois de anexar e enviar o comprovante, volte aqui e confirme o envio.':''} A confirmação registra a declaração do cliente. Ela não verifica o recebimento bancário.{autoPickedUp?' Ao confirmar, a retirada imediata deste ponto é concluída e o estoque é baixado.':''}</p>}
 {!receiptToken&&<p>Após pagar, anexe o comprovante na conversa. A loja confere o recebimento; a cópia ou abertura do WhatsApp não confirma o pagamento.</p>}</section>;
}
