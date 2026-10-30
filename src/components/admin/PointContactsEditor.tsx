import { useEffect, useState } from 'react';
import { restFetch } from '../../lib/supabaseRest';
import { getWhatsAppUrl } from '../../utils/whatsapp';

type Contact = { name: string; phone: string };
type StoredContact = Contact & { slot: number; purpose: 'confirmation' | 'proof' | 'both' };
const blank: Contact = { name: '', phone: '' };

export default function PointContactsEditor({storeId,pointId,pointName}:{storeId:string;pointId:string;pointName:string}) {
  const [contact,setContact] = useState<Contact>(blank);
  const [loading,setLoading] = useState(true);
  const [loadFailed,setLoadFailed] = useState(false);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [saved,setSaved] = useState(false);
  const [attempt,setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setSaved(false); setError(''); setLoadFailed(false); setContact(blank);
    void restFetch<StoredContact[]>(`food_pickup_point_contacts?store_id=eq.${encodeURIComponent(storeId)}&pickup_location_id=eq.${encodeURIComponent(pointId)}&select=slot,name,phone,purpose&order=slot`)
      .then(rows => {
        if (!active) return;
        const selected = rows.find(row => row.purpose === 'proof' || row.purpose === 'both');
        setContact(selected ? {name:selected.name,phone:selected.phone} : blank);
      })
      .catch(() => { if (active) { setLoadFailed(true); setError('Não foi possível carregar o WhatsApp deste ponto. A atualização de contatos precisa estar instalada no banco de dados. Tente novamente após a implantação.'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  },[storeId,pointId,attempt]);
  const edit = (change:Partial<Contact>) => { setContact(current => ({...current,...change})); setSaved(false); setError(''); };
  const save = async () => {
    if (loadFailed || saving) return;
    const name = contact.name.trim();
    const phone = contact.phone.replace(/\D/g,'');
    if ((name || phone) && (!name || name.length > 60 || !/^[1-9][0-9]{9,14}$/.test(phone))) {
      setError('Informe o nome e o WhatsApp com código do país (55 + DDD + número).'); return;
    }
    setSaving(true); setError(''); setSaved(false);
    try {
      await restFetch('rpc/food_save_pickup_point_contacts_v1',{method:'POST',body:{p_store_id:storeId,p_point_id:pointId,p_contacts:name?[{slot:1,name,phone,purpose:'proof'}]:[]}});
      setContact(name ? {name,phone} : blank);
      setSaved(true);
    } catch { setError('Não foi possível salvar o WhatsApp deste ponto. O preenchimento foi mantido; confira se a atualização do banco foi instalada.'); }
    finally { setSaving(false); }
  };
  return <div className="point-contacts-editor"><h4>Comprovantes de {pointName}</h4>
    {loading ? <p role="status">Carregando WhatsApp…</p> : <>
      <p>Após a validação do pedido, o cliente abre este WhatsApp para anexar o comprovante. Cadastre um único destino para este ponto.</p>
      <fieldset disabled={saving || loadFailed}>
        <legend>WhatsApp para comprovantes</legend>
        <label>Nome para identificação<input maxLength={60} value={contact.name} onChange={e => edit({name:e.target.value})}/></label>
        <label>WhatsApp com código do país<input type="tel" inputMode="tel" placeholder="55 + DDD + número" value={contact.phone} onChange={e => edit({phone:e.target.value})}/></label>
        {contact.name && /^[1-9][0-9]{9,14}$/.test(contact.phone.replace(/\D/g,'')) && <a href={getWhatsAppUrl(contact.phone.replace(/\D/g,''),'Teste de contato do ponto.')} target="_blank" rel="noopener noreferrer">Conferir WhatsApp</a>}
        {(contact.name || contact.phone) && <button type="button" className="text-button" onClick={() => edit(blank)}>Remover destino</button>}
      </fieldset>
      {error && <p role="alert">{error}</p>}{loadFailed && <button type="button" className="text-button" onClick={() => setAttempt(n => n+1)}>Tentar carregar novamente</button>}{saved && <p role="status">WhatsApp para comprovantes salvo.</p>}
      <button type="button" className="secondary-button" disabled={saving || loadFailed} onClick={() => void save()}>{saving?'Salvando…':'Salvar WhatsApp do ponto'}</button>
    </>}
  </div>;
}
