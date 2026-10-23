import { useCallback, useEffect, useState } from 'react';
import { restFetch } from '../lib/supabaseRest';
import { useStore } from '../contexts/StoreContext';
import { currency, sanitizeWhatsAppNumber } from '../utils/format';
import './business.css';

type PublicService={id:string;name:string;description:string;price_cents:number;duration_minutes:number};
type PublicLink={id:string;label:string;url:string};
type PublicBusiness={services:PublicService[];links:PublicLink[];primary_segment?:string};
const safeUrl=(value:string)=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}};

export function PublicBusinessOffers() {
  const {settings}=useStore();const [data,setData]=useState<PublicBusiness|null>(null);const [error,setError]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const load=useCallback(()=>restFetch<PublicBusiness>('rpc/food_business_public',{method:'POST',body:{p_store:settings.id}}),[settings.id]);
  useEffect(()=>{let active=true;setData(null);setError(false);if(!settings.id)return;void load().then(next=>{if(active&&Array.isArray(next.services)&&Array.isArray(next.links))setData(next);}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[load,settings.id,attempt]);
  const specialized=['personal','nutrition','creator','florist'].includes(settings.visualTheme.businessSegment||'');
  if(!data?.services.length&&!data?.links.length){return error&&specialized?<section className="business-public business-card"><h2>Serviços e links</h2><p>Não foi possível consultar estas ofertas agora. O catálogo de produtos continua disponível abaixo.</p><button type="button" className="secondary-button" onClick={()=>setAttempt(value=>value+1)}>Tentar carregar ofertas</button></section>:null;}
  const phone=sanitizeWhatsAppNumber(settings.whatsapp);
  return <section className="business-public" aria-label="Serviços e links do negócio">
    {data.services.length>0&&<><div className="food-section-title"><div><span>ATENDIMENTO COM O NEGÓCIO</span><h2>Serviços e acompanhamento</h2><p>Confira as condições. Horários e contratação são confirmados pelo atendimento.</p></div></div><div className="business-public-grid">{data.services.map(service=><article className="business-card" key={service.id}><span className="business-badge">{service.duration_minutes} min por sessão</span><h3>{service.name}</h3><p>{service.description}</p><strong>{currency.format(service.price_cents/100)}</strong><details><summary>Como funciona a contratação</summary><p>O atendimento confirma disponibilidade e condições. Esta página não reserva um horário nem confirma pagamento automaticamente.</p></details>{settings.showWhatsApp&&phone&&<a className="primary-button" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${phone}?text=${encodeURIComponent(`Olá! Tenho interesse no serviço ${service.name}. Gostaria de consultar disponibilidade e condições.`)}`}>Consultar {service.name}</a>}</article>)}</div></>}
    {data.links.length>0&&<div className="business-card"><h2>Conheça também</h2><div className="business-actions">{data.links.map(link=>{const url=safeUrl(link.url);return url?<a key={link.id} className="secondary-button" href={url} target="_blank" rel="noopener noreferrer">{link.label} ↗</a>:null;})}</div></div>}
  </section>;
}
