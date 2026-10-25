import { useCallback, useEffect, useRef, useState } from 'react';
import { stockModeApi, stockModeEvent } from '../services/stockModeApi';

export function useStockMode(storeId:string){
 const [enabled,setEnabled]=useState<boolean|null>(null);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 const currentStore=useRef(storeId);currentStore.current=storeId;
 const version=useRef(0);
 const reload=useCallback(async()=>{
  const current=++version.current;
  if(!storeId){setEnabled(null);setLoading(false);return;}
  try{const result=await stockModeApi.read(storeId);if(version.current===current&&currentStore.current===storeId){setEnabled(result.multi_location_enabled);setError('');}}
  catch(cause){if(version.current===current&&currentStore.current===storeId){setEnabled(null);setError(cause instanceof Error?cause.message:'Configuração de estoque indisponível.');}}
  finally{if(version.current===current&&currentStore.current===storeId)setLoading(false);}
 },[storeId]);
 useEffect(()=>{setEnabled(null);setLoading(true);setError('');void reload();const refresh=()=>void reload();window.addEventListener(stockModeEvent,refresh);return()=>{++version.current;window.removeEventListener(stockModeEvent,refresh);};},[reload]);
 return {enabled,error,loading,reload};
}
