import { useEffect, useState } from 'react';
import { getReceiptDestinations, receiptContactsEnabled, type ReceiptDestinations } from '../services/receiptContactsApi';
import { getWhatsAppUrl } from '../utils/whatsapp';
import './receipt-contacts.css';
/** Só comunicação: não confirma pagamento nem muda o status operacional. */
export default function ReceiptDestination({storeId,pointId,destinations,legacyPhone='',message,onOpen}:{storeId?:string;pointId?:string;destinations?:ReceiptDestinations;legacyPhone?:string;message:string;onOpen?:()=>void}){
 const key=`${storeId||''}:${pointId||''}`;
 const [attempt,setAttempt]=useState(0),[choice,setChoice]=useState({key:'',slot:0});
 const [state,setState]=useState<{key:string;data?:ReceiptDestinations;loading:boolean;error:string}>({key:'',loading:true,error:''});
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
 return <section className="receipt-destination" aria-label="Enviar comprovante"><h2>Envie o comprovante à loja</h2>
 {state.key!==key||state.loading?<p role="status">Consultando contato…</p>:state.error?<><p role="alert">{state.error}</p><button type="button" className="secondary-button" onClick={()=>setAttempt(x=>x+1)}>Tentar consultar contatos</button></>:<>
 {data?.mode==='unavailable'?<p>O contato deste ponto não está disponível. Fale com a loja para conferir o destino antes de enviar.</p>:<>
 {data?.mode==='unassigned'&&<p>Este ponto ainda não tem contato definido. Escolha quem receberá o comprovante.</p>}
 {contacts.length>1&&<label>Para qual contato deseja enviar?<select value={selected?.slot||''} onChange={e=>setChoice({key,slot:Number(e.target.value)})}><option value="">Selecione um contato</option>{contacts.map(c=><option key={c.slot} value={c.slot}>{c.name}</option>)}</select></label>}
 {selected&&<p>Destino: <strong>{selected.name}</strong> · +{selected.phone}</p>}
 {phone?<a href={getWhatsAppUrl(phone,message)} target="_blank" rel="noopener noreferrer" onClick={onOpen}>Abrir WhatsApp e enviar comprovante</a>:contacts.length>1?<p>Selecione um contato para abrir a conversa.</p>:<p>A loja ainda não cadastrou um destino para comprovantes.</p>}
 </>}
 </>}
 <p>Após pagar, anexe o comprovante na conversa. O envio não confirma o pagamento automaticamente. A loja confere o recebimento; entrega e retirada são etapas separadas.</p></section>;
}
