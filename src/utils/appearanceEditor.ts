import type {StoreVisualTheme} from '../types';
export const APPEARANCE_COLORS = [
 ['primaryColor','Cor principal'],['accentColor','Cor de apoio'],['highlightColor','Destaques'],
 ['backgroundColor','Fundo da página'],['surfaceColor','Fundo dos cards'],['textColor','Texto principal'],
 ['mutedColor','Texto secundário'],['borderColor','Bordas e divisórias'],
] as const;
export type AppearanceColor = typeof APPEARANCE_COLORS[number][0];
/** Uma paleta por loja; editar cor não troca o layout Doce Lua nem o segmento. */
export function editAppearance(theme:StoreVisualTheme,key:AppearanceColor,color:string):StoreVisualTheme {
 if(!/^#[0-9a-f]{6}$/i.test(color))return theme;
 return {...theme,[key]:color.toUpperCase(),preset:theme.preset==='doce_lua'?'doce_lua':'custom'};
}
