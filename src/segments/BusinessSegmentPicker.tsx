import { Box, CakeSlice, CalendarDays, Check, Handshake, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { BUSINESS_SEGMENTS, getBusinessSegment, type BusinessSegment } from './businessSegments';
import './picker.css';

const icons = {food:UtensilsCrossed,confectionery:CakeSlice,retail:ShoppingBag,printing3d:Box,rentals:CalendarDays,services:Handshake};

export function BusinessSegmentPicker({value,onChange,compact=false}:{value:BusinessSegment;onChange:(segment:BusinessSegment)=>void;compact?:boolean}) {
  const profile = getBusinessSegment(value);
  return <fieldset className={`business-picker ${compact?'business-picker--compact':''}`}>
    <legend>Qual é o ramo do seu negócio?</legend>
    <p>Isso define a apresentação da vitrine e do painel. Você pode mudar depois.</p>
    <div className="business-picker__options">{BUSINESS_SEGMENTS.map(segment=>{
      const Icon=icons[segment.id];
      return <label key={segment.id} className={value===segment.id?'is-selected':''}>
        <input type="radio" name="business-segment" value={segment.id} checked={value===segment.id} onChange={()=>onChange(segment.id)}/>
        <Icon size={21} aria-hidden="true"/><span><strong>{segment.label}</strong><small>{segment.description}</small></span>
        {value===segment.id&&<Check size={16} className="business-picker__check" aria-hidden="true"/>}
      </label>;
    })}</div>
    <div className="business-picker__preview" style={{borderInlineStartColor:profile.primaryColor}} aria-live="polite">
      <span>{profile.label} · prévia da apresentação</span><strong>{profile.heroTitle}</strong>
      <small>Painel: {profile.adminTitle}. Vitrine: {profile.catalogLabel.toLowerCase()}.</small>
    </div>
    <small className="business-picker__note">Eventos, combos, aluguel e personalizados começam desativados. Ative cada módulo somente quando quiser operá-lo.</small>
  </fieldset>;
}
