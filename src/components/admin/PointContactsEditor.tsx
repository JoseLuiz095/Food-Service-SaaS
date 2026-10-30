import { useEffect, useState } from 'react';
import { restFetch } from '../../lib/supabaseRest';
import { getWhatsAppUrl } from '../../utils/whatsapp';

type Contact = { slot: 1 | 2; name: string; phone: string; purpose: 'confirmation' | 'proof' | 'both' };
const blank = (slot: 1 | 2): Contact => ({ slot, name: '', phone: '', purpose: 'both' });

export default function PointContactsEditor({storeId,pointId,pointName}:{storeId:string;pointId:string;pointName:string}) {
  const [contacts,setContacts] = useState<Contact[]>([blank(1),blank(2)]);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [saved,setSaved] = useState(false);
  const [attempt,setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setSaved(false); setError(''); setContacts([blank(1),blank(2)]);
    void restFetch<Contact[]>(`food_pickup_point_contacts?store_id=eq.${encodeURIComponent(storeId)}&pickup_location_id=eq.${encodeURIComponent(pointId)}&select=slot,name,phone,purpose&order=slot`)
      .then(rows => { if (active) setContacts([1,2].map(slot => rows.find(row => row.slot === slot) || blank(slot as 1 | 2))); })
      .catch(() => { if (active) setError('Não foi possível carregar os contatos deste ponto. Confira se o recurso foi implantado e tente novamente.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  },[storeId,pointId,attempt]);
  const edit = (slot:number, change:Partial<Contact>) => { setContacts(rows => rows.map(row => row.slot === slot ? {...row,...change} : row)); setSaved(false); };
  const save = async () => {
    const rows = contacts.filter(c => c.name.trim() || c.phone.trim());
    const normalized = rows.map(c => ({...c,name:c.name.trim(),phone:c.phone.replace(/\D/g,'')}));
    if (normalized.some(c => !c.name || !/^[1-9][0-9]{9,14}$/.test(c.phone)) || new Set(normalized.map(c => c.phone)).size !== normalized.length) {
      setError('Informe nome e número internacional válidos, sem repetir o mesmo telefone.'); return;
    }
    setSaving(true); setError(''); setSaved(false);
    try {
      await restFetch('rpc/food_save_pickup_point_contacts_v1',{method:'POST',body:{p_store_id:storeId,p_point_id:pointId,p_contacts:normalized}});
      setContacts([1,2].map(slot => normalized.find(c => c.slot === slot) || blank(slot as 1 | 2)));
      setSaved(true);
    } catch { setError('Não foi possível gravar os contatos. O rascunho foi mantido.'); }
    finally { setSaving(false); }
  };
  return <div className="point-contacts-editor"><h4>Contatos de {pointName}</h4>
    {loading ? <p role="status">Carregando contatos…</p> : <>
      <p>O pedido deste ponto usa apenas os contatos associados a ele. Sem contato para comprovantes, o cliente recebe orientação para consultar o local.</p>
      {contacts.map(c => <fieldset key={c.slot} disabled={saving}>
        <legend>Contato {c.slot}</legend>
        <label>Nome público<input maxLength={60} value={c.name} onChange={e => edit(c.slot,{name:e.target.value})}/></label>
        <label>WhatsApp com código do país<input type="tel" inputMode="tel" placeholder="55 + DDD + número" value={c.phone} onChange={e => edit(c.slot,{phone:e.target.value})}/></label>
        <label>Finalidade<select value={c.purpose} onChange={e => edit(c.slot,{purpose:e.target.value as Contact['purpose']})}><option value="both">Confirmação e comprovante</option><option value="confirmation">Confirmação</option><option value="proof">Comprovante</option></select></label>
        {c.name && /^[1-9][0-9]{9,14}$/.test(c.phone.replace(/\D/g,'')) && <a href={getWhatsAppUrl(c.phone.replace(/\D/g,''),'Teste de contato do ponto.')} target="_blank" rel="noopener noreferrer">Conferir WhatsApp</a>}
        {(c.name || c.phone) && <button type="button" className="text-button" onClick={() => edit(c.slot,blank(c.slot))}>Remover contato {c.slot}</button>}
      </fieldset>)}
      {error && <p role="alert">{error}</p>}{error.startsWith('Não foi possível carregar') && <button type="button" className="text-button" onClick={() => setAttempt(n => n+1)}>Tentar carregar novamente</button>}{saved && <p role="status">Contatos deste ponto salvos.</p>}
      <button type="button" className="secondary-button" disabled={saving || Boolean(error && error.startsWith('Não foi possível carregar'))} onClick={() => void save()}>{saving?'Salvando…':'Salvar contatos do ponto'}</button>
    </>}
  </div>;
}
