import {useId,useRef,useState} from 'react';
import type {StoreVisualTheme} from '../../types';
import {APPEARANCE_COLORS,editAppearance,type AppearanceColor} from '../../utils/appearanceEditor';
import './store-appearance-editor.css';

type Props={theme:StoreVisualTheme;saved:StoreVisualTheme;name:string;tagline:string;examples:string[];disabled?:boolean;onChange:(theme:StoreVisualTheme)=>void};
export default function StoreAppearanceEditor({theme,saved,name,tagline,examples,disabled,onChange}:Props){
 const id=useId();const [selected,setSelected]=useState<AppearanceColor>('primaryColor');const [hex,setHex]=useState('');const picker=useRef<HTMLInputElement>(null);
 const label=APPEARANCE_COLORS.find(([key])=>key===selected)![1];
 const choose=(key:AppearanceColor)=>{setSelected(key);setHex('');picker.current?.focus({preventScroll:true});};
 const change=(key:AppearanceColor,color:string)=>{onChange(editAppearance(theme,key,color));if(key===selected)setHex('');};
 const target=(key:AppearanceColor)=>({type:'button' as const,disabled,'aria-label':`Editar ${APPEARANCE_COLORS.find(([k])=>k===key)![1].toLowerCase()} na prévia`,onClick:()=>choose(key)});
 return <section className="subform-section appearance-editor" aria-labelledby={`${id}-title`}>
  <span className="eyebrow">APARÊNCIA DA VITRINE</span><h3 id={`${id}-title`}>Uma paleta para sua loja</h3>
  <p>Esta identidade é salva na loja e acompanha seus pontos de retirada. Clique ou toque nas áreas da demonstração para escolher a cor que deseja editar.</p>
  <fieldset className="appearance-editor__controls" disabled={disabled}><legend>Editar cor selecionada</legend>
   <label htmlFor={`${id}-color`}>{label}</label><div className="appearance-editor__color-row"><input ref={picker} id={`${id}-color`} type="color" value={theme[selected]} onChange={e=>change(selected,e.target.value)}/><label>Código hexadecimal<input value={hex||theme[selected]} maxLength={7} pattern="#[0-9a-fA-F]{6}" required title="Use # seguido de seis dígitos hexadecimais" spellCheck={false} onChange={e=>{setHex(e.target.value);if(/^#[0-9a-f]{6}$/i.test(e.target.value))change(selected,e.target.value);}} aria-invalid={Boolean(hex&&!/^#[0-9a-f]{6}$/i.test(hex))}/></label></div>
   {hex&&!/^#[0-9a-f]{6}$/i.test(hex)&&<small role="status">Use # seguido de seis letras ou números de 0 a 9 e A a F.</small>}
   <button type="button" className="secondary-button" onClick={()=>{change(selected,saved[selected]);setHex('');}}>Restaurar esta cor salva</button>
  </fieldset>
  <div className="appearance-editor__swatches" role="group" aria-label="Cores da loja">{APPEARANCE_COLORS.map(([key,title])=><button key={key} type="button" disabled={disabled} aria-pressed={selected===key} onClick={()=>choose(key)}><span style={{background:theme[key]}}/>{title}</button>)}</div>
  <div className="appearance-preview" role="group" aria-label="Demonstração interativa da vitrine" style={{background:theme.backgroundColor,borderColor:theme.borderColor,borderRadius:theme.radius}}>
   <button {...target('backgroundColor')} className="appearance-preview__hint">Toque em uma área para editar · Fundo da página</button>
   <div className="appearance-preview__bar" style={{borderColor:theme.borderColor}}><button {...target('primaryColor')} style={{color:theme.primaryColor}}>{name||'Sua loja'}</button><button {...target('primaryColor')} className="appearance-preview__cta" style={{background:theme.primaryColor,color:'#fff'}}>Pedir</button></div>
   <div className="appearance-preview__hero" style={{background:theme.surfaceColor,borderColor:theme.borderColor,borderRadius:theme.radius}}>
    <button {...target('surfaceColor')} className="appearance-preview__hint">Fundo dos cards</button><button {...target('textColor')} className="appearance-preview__headline" style={{color:theme.textColor}}>{tagline||'Pedidos rápidos e do seu jeito.'}</button><button {...target('mutedColor')} style={{color:theme.mutedColor}}>Encomendas combinadas com a loja.</button>
   </div>
   <div className="appearance-preview__products">{examples.slice(0,3).map((product,index)=><article key={`${product}-${index}`} style={{background:theme.surfaceColor,borderColor:theme.borderColor,borderRadius:theme.radius}}><button {...target(index===1?'highlightColor':'accentColor')} className="appearance-preview__image" style={{background:index===1?theme.highlightColor:theme.accentColor}}><span>{index===1?'Editar destaque':'Editar cor de apoio'}</span></button><strong style={{color:theme.textColor}}>{product}</strong><small style={{color:theme.mutedColor}}>Produto ilustrativo</small></article>)}</div>
   <button {...target('borderColor')} className="appearance-preview__border" style={{borderColor:theme.borderColor}}>Editar bordas e divisórias</button>
  </div>
  <p className="appearance-editor__notice">Prévia ilustrativa. As alterações só são publicadas ao salvar as configurações.</p>
  <details><summary>Ajustes avançados de todas as cores</summary><fieldset disabled={disabled} className="appearance-editor__advanced">{APPEARANCE_COLORS.map(([key,title])=><label key={key}>{title}<input type="color" value={theme[key]} onChange={e=>change(key,e.target.value)}/></label>)}<label>Arredondamento dos cards (px)<input type="number" min={8} max={32} value={theme.radius} onChange={e=>onChange({...theme,radius:Number(e.target.value)})}/></label></fieldset></details>
 </section>;
}
