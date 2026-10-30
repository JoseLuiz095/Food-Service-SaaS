import { useCallback, useEffect, useState } from 'react';
import { restFetch } from '../lib/supabaseRest';
import { useStore } from '../contexts/StoreContext';
import { currency, sanitizeWhatsAppNumber } from '../utils/format';
import { normalizeText } from '../utils/text';
import './business.css';

type OfferType='all'|'products'|'services'|'consultations'|'content';
type Professional={user_id:string;name:string;council:string;registration:string};
type PublicService={id:string;name:string;description:string;price_cents:number;duration_minutes:number;kind:string;professional?:Professional};
type PublicLink={id:string;label:string;url:string};
type PublicBusiness={services:PublicService[];links:PublicLink[];primary_segment?:string};
const safeUrl=(value:string)=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}};
const identified=(service:PublicService)=>Boolean(service.professional?.name?.trim()&&service.professional?.registration?.trim()&&(
  service.kind==='nutrition'?service.professional.council==='CRN':service.kind==='training'?service.professional.council==='CREF':Boolean(service.professional.council)
));

export function PublicBusinessOffers({query='',type='all'}:{query?:string;type?:OfferType}) {
  const {settings}=useStore();const [data,setData]=useState<PublicBusiness|null>(null);const [error,setError]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const load=useCallback(()=>restFetch<PublicBusiness>('rpc/food_business_public',{method:'POST',body:{p_store:settings.id}}),[settings.id]);
  useEffect(()=>{let active=true;setData(null);setError(false);if(!settings.id)return;void load().then(next=>{if(active&&Array.isArray(next.services)&&Array.isArray(next.links))setData(next);}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[load,settings.id,attempt]);
  const specialized=['personal','nutrition','creator','florist'].includes(settings.visualTheme.businessSegment||'');
  const selected=type==='services'||type==='consultations'||type==='content';
  if(error&&specialized)return <section className="business-public business-card" role="alert"><h2>Serviços e links indisponíveis</h2><p>Não foi possível consultar estas ofertas agora. Os produtos continuam disponíveis.</p><button type="button" className="secondary-button" onClick={()=>setAttempt(value=>value+1)}>Tentar novamente</button></section>;
  if(!data)return selected?<p role="status" className="business-muted">Carregando ofertas…</p>:null;
  const matches=(value:string)=>normalizeText(value).includes(normalizeText(query));
  const services=data.services.filter(service=>identified(service)&&(type==='all'||type==='services'&&service.kind!=='nutrition'||type==='consultations'&&service.kind==='nutrition')&&matches(`${service.name} ${service.description} ${service.professional?.name}`));
  const links=data.links.filter(link=>safeUrl(link.url)&&matches(link.label));
  const showServices=type==='all'||type==='services'||type==='consultations';
  const showLinks=type==='all'||type==='content';
  if(!services.length&&!links.length&&!selected)return null;
  const phone=sanitizeWhatsAppNumber(settings.whatsapp);
  return <section className="business-public" aria-label="Serviços, consultas e conteúdos do negócio">
    {showServices&&(services.length?<><div className="food-section-title"><div><span>ATENDIMENTO COM O NEGÓCIO</span><h2>{type==='consultations'?'Consultas':'Serviços e acompanhamento'}</h2><p>Confira as condições. Horários e contratação são confirmados pelo atendimento.</p></div></div><div className="business-public-grid">{services.map(service=><article className="business-card" key={service.id}><span className="business-badge">{service.duration_minutes} min por sessão</span><h3>{service.name}</h3><p>{service.description}</p><p className="business-provider">Atendimento: <strong>{service.professional!.name}</strong> · {service.professional!.council} {service.professional!.registration}</p><strong>{currency.format(service.price_cents/100)}</strong><details><summary>Como funciona a contratação</summary><p>O atendimento confirma disponibilidade e condições. Esta página não reserva um horário nem confirma pagamento automaticamente.</p></details>{settings.showWhatsApp&&phone&&<a className="primary-button" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${phone}?text=${encodeURIComponent(`Olá! Tenho interesse no serviço ${service.name}. Gostaria de consultar disponibilidade e condições.`)}`}>Consultar {service.name}</a>}</article>)}</div></>:selected?<p role="status" className="business-muted">{query?'Nenhuma oferta corresponde à busca.':'Nenhuma oferta deste tipo publicada no momento.'}</p>:null)}
    {showLinks&&(links.length?<div className="business-card"><h2>Conteúdos e links</h2><div className="business-actions">{links.map(link=><a key={link.id} className="secondary-button" href={safeUrl(link.url)!} target="_blank" rel="noopener noreferrer">{link.label} ↗</a>)}</div></div>:type==='content'?<p role="status" className="business-muted">{query?'Nenhum conteúdo corresponde à busca.':'Nenhum conteúdo publicado no momento.'}</p>:null)}
  </section>;
}
