import { useEffect, useState } from 'react';
import { restFetch } from '../lib/supabaseRest';
import { publicStorefrontUrl } from '../utils/storefrontRoute';

type Point = { id: string; name: string; short_code: string };
/** Lista pública validada no servidor; nunca oferece locais internos de estoque. */
export function useStoreShareTarget(storeId: string, slug: string, open: boolean, initialCode = '') {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; points: Point[]; loading: boolean; error: string }>({ key:'',points:[],loading:false,error:'' });
  const [choice, setChoice] = useState({ key:'',id:'' });
  useEffect(() => {
    if (!open || !storeId) return;
    let current = true;
    setState({key:storeId,points:[],loading:true,error:''});
    setChoice({key:storeId,id:''});
    void restFetch<Point[]>('rpc/food_get_public_pickup_locations_v1', {method:'POST',body:{p_store_id:storeId}}).then(points => {
      if (!current) return;
      if (!Array.isArray(points) || points.some(p => !p || typeof p.id!=='string' || typeof p.name!=='string' || !/^[A-Z0-9-]{3,16}$/.test(p.short_code))) throw new Error('invalid');
      setState({key:storeId,points,loading:false,error:''});
      setChoice({key:storeId,id:points.find(p=>p.short_code===initialCode)?.id||''});
    }).catch(()=>{if(current)setState({key:storeId,points:[],loading:false,error:'Não foi possível carregar os pontos de retirada. Você ainda pode compartilhar a página da loja.'});});
    return ()=>{current=false;};
  },[storeId,open,initialCode,attempt]);
  const points=state.key===storeId?state.points:[];
  const point=choice.key===storeId?points.find(p=>p.id===choice.id):undefined;
  const url=new URL(publicStorefrontUrl(slug));
  if(point)url.searchParams.set('ponto',point.short_code);
  return {points,point,url:url.href,loading:open&&(state.key!==storeId||state.loading),error:state.key===storeId?state.error:'',
    select:(id:string)=>setChoice({key:storeId,id:points.some(p=>p.id===id)?id:''}),retry:()=>setAttempt(n=>n+1)};
}
