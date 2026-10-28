import {useEffect,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {receiptContactsEnabled} from '../services/receiptContactsApi';
const read=(key:string)=>{try{return sessionStorage.getItem(key)||''}catch{return ''}};
/** Origem comercial por sessão/loja; não define retirada nem local de estoque. */
export function useReceiptSourceCode(storeId:string,homePath:string){
 const location=useLocation(),key=`food_receipt_source_v1:${storeId}`;
 const [state,setState]=useState({key:'',code:''});
 const memory=useRef({key:'',code:''});
 useEffect(()=>{
  if(!receiptContactsEnabled||!storeId)return;
  const params=new URLSearchParams(location.search),raw=params.get('ponto');
  const home=location.pathname.replace(/\/$/,'')===homePath.replace(/\/$/,'');
  const code=raw!==null?(/^[A-Z0-9-]{3,16}$/.test(raw)?raw:'__INVALID__'):home?'':memory.current.key===key?memory.current.code:read(key);
  memory.current={key,code};setState({key,code});try{if(code)sessionStorage.setItem(key,code);else sessionStorage.removeItem(key)}catch{/* A sessão ainda funciona em memória. */}
 },[storeId,key,homePath,location.pathname,location.search]);
 return receiptContactsEnabled&&state.key===key?state.code:'';
}
