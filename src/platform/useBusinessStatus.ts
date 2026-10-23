import { useCallback, useEffect, useRef, useState } from 'react';
import { businessApi, businessChangeEvent, type BusinessStatus } from './api';

export function useBusinessStatus(store:string) {
  const [state,setState]=useState<BusinessStatus|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const version=useRef(0);
  const activeStore=useRef(store);activeStore.current=store;
  const [resolvedStore,setResolvedStore]=useState(store);
  const reload=useCallback(async()=>{
    if(activeStore.current!==store)return;
    const current=++version.current;
    if(!store){setState(null);setLoading(false);return;}
    try {const next=await businessApi.status(store);if(current===version.current&&activeStore.current===store){setResolvedStore(store);setState(next);setError('');}}
    catch(e){if(current===version.current&&activeStore.current===store){setState(null);setError(e instanceof Error?e.message:'Não foi possível carregar os módulos.');}}
    finally{if(current===version.current&&activeStore.current===store)setLoading(false);}
  },[store]);
  useEffect(()=>{
    setResolvedStore(store);setState(null);setError('');setLoading(true);void reload();
    const refresh=()=>{if(document.visibilityState!=='hidden')void reload();};
    window.addEventListener('focus',refresh);window.addEventListener(businessChangeEvent,refresh);window.addEventListener('storage',refresh);
    const timer=window.setInterval(refresh,30_000);
    return()=>{++version.current;window.clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener(businessChangeEvent,refresh);window.removeEventListener('storage',refresh);};
  },[reload]);
  return {state:resolvedStore===store?state:null,error:resolvedStore===store?error:'',loading:resolvedStore!==store||loading,reload};
}
