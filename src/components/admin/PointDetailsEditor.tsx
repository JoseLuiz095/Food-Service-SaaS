import {useState} from 'react';
import {restFetch,SupabaseHttpError} from '../../lib/supabaseRest';
import type {StockLocation} from '../../services/stockLocationsApi';

export default function PointDetailsEditor({storeId,point,locations,onSaved}:{storeId:string;point:{id:string;name:string;short_code:string;stock_location_id:string};locations:StockLocation[];onSaved:()=>Promise<void>}){
 const [name,setName]=useState(point.name),[stockId,setStockId]=useState(point.stock_location_id);
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const failure=(cause:unknown)=>cause instanceof SupabaseHttpError&&cause.status===404?'A gestão de pontos aguarda a atualização do banco. Seu rascunho foi mantido.':cause instanceof Error?cause.message:'Não foi possível salvar. Seu rascunho foi mantido.';
 const save=async()=>{
  if(saving||!name.trim())return;setSaving(true);setError('');setMessage('');
  try{
   await restFetch('rpc/food_edit_pickup_point_v1',{method:'POST',body:{p_store_id:storeId,p_point_id:point.id,p_name:name.trim(),p_stock_location_id:stockId,p_expected_stock_location_id:point.stock_location_id}});
   await onSaved();setMessage('Ponto atualizado.');
  }catch(cause){setError(failure(cause));}finally{setSaving(false);}
 };
 const remove=async()=>{
  if(saving||!window.confirm(`Excluir o ponto “${point.name}”? Sem pedidos vinculados, ele será excluído. Com pedidos, ficará arquivado para preservar o histórico. O estoque permanece no local de origem.`))return;
  setSaving(true);setError('');setMessage('');
  try{
   const result=await restFetch<{action:'deleted'|'archived'}>('rpc/food_retire_pickup_point_v1',{method:'POST',body:{p_store_id:storeId,p_point_id:point.id}});
   if(!['deleted','archived'].includes(result?.action))throw new Error('O servidor não confirmou a retirada do ponto. Atualize antes de tentar novamente.');
   setMessage(result.action==='deleted'?'Ponto excluído.':'Ponto arquivado. Pedidos e estoque preservados.');await onSaved();
  }catch(cause){setError(failure(cause));}finally{setSaving(false);}
 };
 return <section aria-label={`Editar ponto ${point.name}`}>
  <fieldset disabled={saving}><legend>Dados do ponto</legend>
   <label>Nome do ponto<input value={name} maxLength={80} onChange={e=>{setName(e.target.value);setMessage('');}}/></label>
   <label>Estoque de origem<select value={stockId} onChange={e=>{setStockId(e.target.value);setMessage('');}}>{locations.filter(l=>l.active||l.id===point.stock_location_id).map(l=><option key={l.id} value={l.id}>{l.name}{l.active?'':' (inativo)'}</option>)}</select></label>
   <p>Link e QR preservam o código {point.short_code}. Pontos com pedidos mantêm seu estoque de origem.</p>
   <button type="button" className="secondary-button" disabled={!name.trim()} onClick={()=>void save()}>{saving?'Salvando…':'Salvar ponto'}</button>
   <button type="button" className="text-button" onClick={()=>void remove()}>Excluir ponto</button>
  </fieldset>
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 </section>;
}
