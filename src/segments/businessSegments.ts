import type { StoreVisualTheme } from '../types';
import { normalizeStoreVisualTheme, STORE_VISUAL_THEME_PRESETS } from '../utils/storeVisualTheme';

export type BusinessSegment = 'food' | 'confectionery' | 'retail' | 'printing3d' | 'rentals' | 'services' | 'florist' | 'personal' | 'nutrition' | 'creator';
type SegmentProfile = {
  id: BusinessSegment; label: string; description: string; catalogLabel: string; productLabel: string;
  searchPlaceholder: string; heroEyebrow: string; heroTitle: string; heroDescription: string;
  adminTitle: string; primaryColor: string; accentColor: string; examples: string[];
};

export const BUSINESS_SEGMENTS: SegmentProfile[] = [
  {id:'food',label:'Alimentação',description:'Restaurantes, lanchonetes e delivery.',catalogLabel:'Cardápio',productLabel:'Produto',searchPlaceholder:'Buscar no cardápio...',heroEyebrow:'PEDIDO DIRETO',heroTitle:'Seu próximo favorito está aqui',heroDescription:'Escolha seus produtos e faça seu pedido direto com a loja.',adminTitle:'Operação da loja',primaryColor:'#17633D',accentColor:'#A94726',examples:['Especial da casa','Combo para compartilhar','Favorito da semana']},
  {id:'confectionery',label:'Doces e confeitaria',description:'Doces prontos, lembranças e encomendas.',catalogLabel:'Catálogo de doces',productLabel:'Produto',searchPlaceholder:'Buscar doces e encomendas...',heroEyebrow:'FEITO PARA CELEBRAR',heroTitle:'Pequenos detalhes, grandes momentos',heroDescription:'Encontre doces, presentes e produtos para sua ocasião.',adminTitle:'Ateliê e encomendas',primaryColor:'#803E57',accentColor:'#AD5E35',examples:['Doce especial','Caixa para presentear','Favorito da casa']},
  {id:'retail',label:'Produtos e varejo',description:'Lojas, presentes, acessórios e produtos prontos.',catalogLabel:'Catálogo',productLabel:'Produto',searchPlaceholder:'Buscar produtos...',heroEyebrow:'ESCOLHAS DA LOJA',heroTitle:'Encontre o que combina com você',heroDescription:'Explore os produtos, confira os detalhes e compre direto da loja.',adminTitle:'Loja e catálogo',primaryColor:'#2157A0',accentColor:'#9D4D21',examples:['Novidade da loja','Seleção especial','Mais procurado']},
  {id:'printing3d',label:'Impressão 3D e personalizados',description:'Peças, chaveiros, brindes e projetos sob medida.',catalogLabel:'Peças e personalizados',productLabel:'Peça',searchPlaceholder:'Buscar peças e brindes...',heroEyebrow:'IDEIAS QUE GANHAM FORMA',heroTitle:'Do seu projeto à peça pronta',heroDescription:'Conheça as peças disponíveis. Projetos sob medida são combinados com a loja.',adminTitle:'Produção e projetos',primaryColor:'#3C4B9D',accentColor:'#A04724',examples:['Chaveiro personalizado','Peça funcional','Brinde para empresas']},
  {id:'rentals',label:'Aluguel e eventos',description:'Brinquedos, equipamentos e itens para celebrações.',catalogLabel:'Catálogo para eventos',productLabel:'Item',searchPlaceholder:'Buscar itens para seu evento...',heroEyebrow:'SUA PRÓXIMA CELEBRAÇÃO',heroTitle:'Tudo começa com uma boa escolha',heroDescription:'Explore os itens e converse com a loja sobre datas e disponibilidade.',adminTitle:'Agenda e locações',primaryColor:'#77521B',accentColor:'#326661',examples:['Pula-pula','Equipamento para festa','Item para celebrar']},
  {id:'services',label:'Serviços e outros negócios',description:'Serviços, ateliês e operações com catálogo próprio.',catalogLabel:'Produtos e serviços',productLabel:'Item',searchPlaceholder:'Buscar produtos e serviços...',heroEyebrow:'FEITO PARA VOCÊ',heroTitle:'Soluções com atendimento próximo',heroDescription:'Conheça o catálogo e os detalhes de cada produto ou serviço.',adminTitle:'Serviços e atendimento',primaryColor:'#246565',accentColor:'#9B4B2C',examples:['Serviço especial','Projeto sob medida','Seleção do negócio']},
  {id:'florist',label:'Floricultura',description:'Arranjos, presentes e encomendas.',catalogLabel:'Flores e presentes',productLabel:'Arranjo',searchPlaceholder:'Buscar flores e presentes...',heroEyebrow:'PARA ALGUÉM ESPECIAL',heroTitle:'Um gesto que floresce',heroDescription:'Escolha seu arranjo e combine os detalhes da entrega com a floricultura.',adminTitle:'Arranjos e encomendas',primaryColor:'#6B4965',accentColor:'#817B41',examples:['Buquê da estação','Arranjo para presentear','Orquídea especial']},
  {id:'personal',label:'Personal trainer',description:'Consultorias, serviços e acompanhamento de alunos.',catalogLabel:'Treinos e consultorias',productLabel:'Serviço',searchPlaceholder:'Buscar consultorias e serviços...',heroEyebrow:'MOVIMENTO COM ORIENTAÇÃO',heroTitle:'Seu próximo passo, acompanhado',heroDescription:'Conheça os serviços e organize seu atendimento com o profissional.',adminTitle:'Alunos e atendimentos',primaryColor:'#245B48',accentColor:'#C06532',examples:['Avaliação inicial','Consultoria de treino','Acompanhamento mensal']},
  {id:'nutrition',label:'Nutricionista',description:'Consultas, pacotes e gestão administrativa.',catalogLabel:'Consultas e serviços',productLabel:'Serviço',searchPlaceholder:'Buscar consultas e pacotes...',heroEyebrow:'CUIDADO NA SUA ROTINA',heroTitle:'Acompanhamento que cabe na sua vida',heroDescription:'Conheça as consultas e combine seu atendimento com o profissional.',adminTitle:'Clientes e consultas',primaryColor:'#577348',accentColor:'#AC654D',examples:['Consulta inicial','Consulta de retorno','Pacote de acompanhamento']},
  {id:'creator',label:'Influenciador digital',description:'Produtos, campanhas, links e parcerias.',catalogLabel:'Produtos e parcerias',productLabel:'Oferta',searchPlaceholder:'Buscar produtos e serviços...',heroEyebrow:'IDEIAS QUE CONECTAM',heroTitle:'Conteúdo, produtos e novas conexões',heroDescription:'Explore as ofertas, os serviços e os links deste criador.',adminTitle:'Campanhas e conteúdo',primaryColor:'#5743A3',accentColor:'#BD5B48',examples:['Material digital','Consultoria criativa','Parceria comercial']},
];

/** Primary registration choices; legacy themes remain valid for existing stores. */
export const PRIMARY_BUSINESS_SEGMENTS: BusinessSegment[] = ['food','florist','retail','rentals','personal','nutrition','creator'];

export function normalizeBusinessSegment(value: unknown): BusinessSegment {
  return BUSINESS_SEGMENTS.some(segment => segment.id === value) ? value as BusinessSegment : 'food';
}

export function isDefaultStoreImage(url: string): boolean {
  return ['/assets/placeholder-food.svg','/assets/marketing/app-splash-v2.png'].includes(url.split('?')[0]);
}

export function getBusinessSegment(theme: unknown): SegmentProfile {
  const value = theme && typeof theme === 'object' ? (theme as {businessSegment?: unknown}).businessSegment : theme;
  return BUSINESS_SEGMENTS.find(segment => segment.id === normalizeBusinessSegment(value))!;
}

/** Presentation only: never enables operational modules or changes selling rules. */
export function resolveBusinessTheme(theme: unknown): StoreVisualTheme {
  const safe = normalizeStoreVisualTheme(theme);
  const segment = getBusinessSegment(safe);
  if (safe.preset !== 'foodweb' || segment.id === 'food') return safe;
  return {...safe, primaryColor:segment.primaryColor, accentColor:segment.accentColor};
}

export function selectBusinessSegment(theme: unknown, segment: BusinessSegment): StoreVisualTheme {
  const safe = normalizeStoreVisualTheme(theme);
  const selected = normalizeBusinessSegment(segment);
  if (safe.preset === 'foodweb' && selected === 'food') return {...STORE_VISUAL_THEME_PRESETS.foodweb,businessSegment:selected};
  return resolveBusinessTheme({...safe, businessSegment:selected});
}
