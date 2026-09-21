import { BarChart3, CheckCircle2, ChevronRight, Clock3, Flower2, LayoutDashboard, Minus, Package, Plus, Search, ShoppingBag, Truck, Utensils, WalletCards } from 'lucide-react';
import { useMemo, useState } from 'react';

type Variant = 'food' | 'flori';
type DemoMode = 'customer' | 'admin';
type AdminPanel = 'dashboard' | 'orders' | 'products' | 'finance';

type DemoProduct = {
  id: string;
  category: string;
  name: string;
  description: string;
  price: number;
  oldPrice?: number;
  emoji: string;
  tag?: string;
};

type InteractiveShowcaseProps = {
  variant: Variant;
  demoHref?: string;
};

const money = (value:number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value);

const datasets:Record<Variant,{
  store:string;
  subtitle:string;
  categories:string[];
  products:DemoProduct[];
  adminTitle:string;
  adminSubtitle:string;
}> = {
  food:{
    store:'Sabor da Vila',
    subtitle:'Delivery, retirada e pedidos organizados',
    categories:['Destaques','Hambúrgueres','Combos','Bebidas'],
    products:[
      {id:'f1',category:'Destaques',name:'Smash Duplo',description:'Dois burgers, queijo, cebola caramelizada e molho da casa.',price:34.90,oldPrice:39.90,emoji:'🍔',tag:'Mais pedido'},
      {id:'f2',category:'Hambúrgueres',name:'Chicken Crocante',description:'Frango crocante, queijo, salada e molho especial.',price:29.90,emoji:'🍗'},
      {id:'f3',category:'Combos',name:'Combo Família',description:'4 lanches, fritas grande e refrigerante 2L.',price:119.90,oldPrice:134.90,emoji:'🍟',tag:'Economize'},
      {id:'f4',category:'Bebidas',name:'Limonada da Casa',description:'Limão, hortelã e gelo. Refrescante e feita na hora.',price:12.90,emoji:'🥤'},
      {id:'f5',category:'Destaques',name:'Açaí 500ml',description:'Açaí cremoso com até 4 complementos.',price:24.90,emoji:'🥣'},
      {id:'f6',category:'Hambúrgueres',name:'Burger Bacon',description:'Burger artesanal, bacon crocante e cheddar.',price:31.90,emoji:'🥓'},
    ],
    adminTitle:'Gestão FoodWeb',
    adminSubtitle:'Pedidos, produtos, entrega, analytics e financeiro no mesmo painel.',
  },
  flori:{
    store:'Jardim da Vila',
    subtitle:'Flores, presentes e entregas programadas',
    categories:['Destaques','Buquês','Presentes','Ocasiões'],
    products:[
      {id:'l1',category:'Destaques',name:'Buquê Aurora',description:'Flores selecionadas em tons vibrantes para momentos especiais.',price:129.90,oldPrice:149.90,emoji:'💐',tag:'Disponível hoje'},
      {id:'l2',category:'Buquês',name:'12 Rosas Clássicas',description:'Rosas frescas, folhagens e acabamento elegante.',price:169.90,emoji:'🌹'},
      {id:'l3',category:'Presentes',name:'Cesta Afeto',description:'Flores, chocolates e itens delicadamente organizados.',price:219.90,emoji:'🎁',tag:'Presente completo'},
      {id:'l4',category:'Ocasiões',name:'Girassol Luz',description:'Composição vibrante com girassóis e embalagem kraft.',price:109.90,emoji:'🌻'},
      {id:'l5',category:'Destaques',name:'Box Carinho',description:'Flores e complementos em uma apresentação pronta para presentear.',price:189.90,emoji:'🌷'},
      {id:'l6',category:'Buquês',name:'Lírio Encanto',description:'Lírios e folhagens com acabamento premium.',price:119.90,emoji:'🌸'},
    ],
    adminTitle:'Gestão FloriWeb',
    adminSubtitle:'Pedidos agendados, produtos, entregas, analytics e financeiro no mesmo painel.',
  },
};

export function InteractiveShowcase({variant,demoHref}:InteractiveShowcaseProps){
  const config=datasets[variant];
  const [mode,setMode]=useState<DemoMode>('customer');
  const [category,setCategory]=useState(config.categories[0]);
  const [query,setQuery]=useState('');
  const [selected,setSelected]=useState<DemoProduct|null>(null);
  const [qty,setQty]=useState(1);
  const [bag,setBag]=useState(variant==='food'?1:0);
  const [adminPanel,setAdminPanel]=useState<AdminPanel>('dashboard');

  const products=useMemo(()=>config.products.filter((product)=>{
    const inCategory=category===config.categories[0]?true:product.category===category;
    const q=query.trim().toLocaleLowerCase('pt-BR');
    const inSearch=!q||`${product.name} ${product.description}`.toLocaleLowerCase('pt-BR').includes(q);
    return inCategory&&inSearch;
  }),[category,config,query]);

  const openProduct=(product:DemoProduct)=>{setQty(1);setSelected(product)};
  const addToBag=()=>{setBag((value)=>value+qty);setSelected(null)};

  return <section id="demonstracao" className={`interactive-showcase interactive-showcase--${variant}`}>
    <div className="interactive-showcase__shell">
      <div className="interactive-showcase__heading">
        <div><span>DEMONSTRAÇÃO INTERATIVA</span><h2>Veja a experiência do cliente e a gestão antes de criar sua conta.</h2><p>Não é um slide: clique nas categorias, abra produtos e navegue pelas áreas do painel. Os dados abaixo são apenas demonstrativos.</p></div>
        <div className="interactive-showcase__mode-tabs" role="tablist" aria-label="Modo da demonstração">
          <button type="button" className={mode==='customer'?'active':''} onClick={()=>setMode('customer')}><ShoppingBag size={17}/>Experiência do cliente</button>
          <button type="button" className={mode==='admin'?'active':''} onClick={()=>setMode('admin')}><LayoutDashboard size={17}/>Painel de gestão</button>
        </div>
      </div>

      {mode==='customer'?<div className="interactive-demo interactive-demo--customer">
        <aside className="interactive-demo__categories">
          <div className="interactive-demo__brand">{variant==='food'?<Utensils size={19}/>:<Flower2 size={19}/>}<span><strong>{config.store}</strong><small>{config.subtitle}</small></span></div>
          {config.categories.map((item)=><button type="button" key={item} className={category===item?'active':''} onClick={()=>setCategory(item)}>{item}<ChevronRight size={14}/></button>)}
          <div className="interactive-demo__delivery"><Truck size={16}/><span><strong>{variant==='food'?'Entrega por região':'Entrega programada'}</strong><small>{variant==='food'?'Taxas configuradas pela loja':'Data e faixa de horário no pedido'}</small></span></div>
        </aside>

        <div className="interactive-demo__storefront">
          <header><div><small>LOJA DEMONSTRATIVA</small><strong>{config.store}</strong></div><label><Search size={16}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Buscar produto..."/></label></header>
          <div className="interactive-demo__notice"><CheckCircle2 size={15}/>{variant==='food'?'Pedido salvo antes do contato pelo WhatsApp.':'Escolha data de entrega, mensagem e complementos antes de finalizar.'}</div>
          <div className="interactive-demo__products">{products.map((product)=><button type="button" className="interactive-demo__product" key={product.id} onClick={()=>openProduct(product)}>
            <div className="interactive-demo__product-art"><span>{product.emoji}</span>{product.tag&&<b>{product.tag}</b>}</div>
            <div><small>{product.category}</small><strong>{product.name}</strong><p>{product.description}</p><footer><span>{money(product.price)}{product.oldPrice&&<del>{money(product.oldPrice)}</del>}</span><i><Plus size={15}/></i></footer></div>
          </button>)}</div>
          {!products.length&&<div className="interactive-demo__empty">Nenhum item encontrado nesta demonstração.</div>}
          <div className="interactive-demo__cart"><span><ShoppingBag size={17}/><b>{bag}</b></span><strong>Ver sacola</strong><small>{bag?`${bag} item(ns) demonstrativo(s)`:'Adicione um produto'}</small></div>

          {selected&&<div className="interactive-demo__modal-backdrop" onClick={()=>setSelected(null)}><div className="interactive-demo__modal" role="dialog" aria-modal="true" onClick={(event)=>event.stopPropagation()}>
            <div className="interactive-demo__modal-art"><span>{selected.emoji}</span></div>
            <div className="interactive-demo__modal-content"><button type="button" className="interactive-demo__modal-close" onClick={()=>setSelected(null)} aria-label="Fechar">×</button><small>DETALHES DO PRODUTO</small><h3>{selected.name}</h3><p>{selected.description}</p><strong>{money(selected.price)}</strong>
              <div className="interactive-demo__option"><span>{variant==='food'?'Que tal turbinar seu pedido?':'Personalize o presente'}</span><small>{variant==='food'?'Adicionais e observações podem ser configurados.':'Mensagem no cartão, complementos e entrega programada.'}</small></div>
              <div className="interactive-demo__modal-action"><div><button type="button" onClick={()=>setQty((v)=>Math.max(1,v-1))}><Minus size={15}/></button><b>{qty}</b><button type="button" onClick={()=>setQty((v)=>v+1)}><Plus size={15}/></button></div><button type="button" onClick={addToBag}>Adicionar · {money(selected.price*qty)}</button></div>
            </div>
          </div></div>}
        </div>
      </div>:<div className="interactive-demo interactive-demo--admin">
        <aside className="interactive-demo__admin-nav"><div><span className="interactive-demo__admin-logo">{variant==='food'?'FW':'FL'}</span><strong>{config.adminTitle}</strong></div>
          <button type="button" className={adminPanel==='dashboard'?'active':''} onClick={()=>setAdminPanel('dashboard')}><LayoutDashboard size={16}/>Visão geral</button>
          <button type="button" className={adminPanel==='orders'?'active':''} onClick={()=>setAdminPanel('orders')}><ShoppingBag size={16}/>Pedidos</button>
          <button type="button" className={adminPanel==='products'?'active':''} onClick={()=>setAdminPanel('products')}><Package size={16}/>Produtos</button>
          <button type="button" className={adminPanel==='finance'?'active':''} onClick={()=>setAdminPanel('finance')}><WalletCards size={16}/>Financeiro</button>
        </aside>
        <div className="interactive-demo__admin-main"><header><div><small>AMBIENTE DE DEMONSTRAÇÃO</small><strong>{adminPanel==='dashboard'?'Visão geral':adminPanel==='orders'?'Pedidos':adminPanel==='products'?'Produtos':'Financeiro'}</strong></div><span>Somente visualização</span></header>
          <p className="interactive-demo__admin-subtitle">{config.adminSubtitle}</p>
          {adminPanel==='dashboard'&&<><div className="interactive-demo__kpis"><article><span>Pedidos hoje</span><strong>{variant==='food'?'27':'14'}</strong><small>+18% vs. período anterior</small></article><article><span>Faturamento</span><strong>{variant==='food'?'R$ 1.846':'R$ 2.318'}</strong><small>Pedidos confirmados</small></article><article><span>Ticket médio</span><strong>{variant==='food'?'R$ 68,37':'R$ 165,57'}</strong><small>Operação do dia</small></article><article><span>{variant==='food'?'Conversão':'Agendados'}</span><strong>{variant==='food'?'8,4%':'6'}</strong><small>{variant==='food'?'Visita → pedido':'Próximas entregas'}</small></article></div><div className="interactive-demo__admin-grid"><article><div className="interactive-demo__panel-title"><strong>Pedidos recentes</strong><span>Agora</span></div>{(variant==='food'?[['#1048','2x Smash + bebida','Preparando'],['#1047','Combo família','Pronto'],['#1046','Açaí 500ml','Concluído']]:[['#0821','Buquê Aurora','Produção'],['#0820','Cesta Afeto','Agendado'],['#0819','12 Rosas','Saiu p/ entrega']]).map(([id,name,status])=><div className="interactive-demo__order" key={id}><b>{id}</b><span><strong>{name}</strong><small>{variant==='food'?'Delivery · PIX':'Entrega · PIX'}</small></span><em>{status}</em></div>)}</article><article><div className="interactive-demo__panel-title"><strong>Resumo financeiro</strong><BarChart3 size={16}/></div><div className="interactive-demo__finance"><span>Entradas<strong>{variant==='food'?'R$ 1.846,00':'R$ 2.318,00'}</strong></span><span>Saídas<strong>{variant==='food'?'R$ 612,40':'R$ 684,20'}</strong></span><span className="result">Resultado<strong>{variant==='food'?'R$ 1.233,60':'R$ 1.633,80'}</strong></span></div></article></div></>}
          {adminPanel==='orders'&&<div className="interactive-demo__list-panel"><div className="interactive-demo__panel-title"><strong>Fila de atendimento</strong><span>Atualização visual</span></div>{(variant==='food'?[['#1048','Marcos Oliveira','R$ 76,80','Preparando'],['#1047','Ana Souza','R$ 119,90','Pronto'],['#1046','Paulo Lima','R$ 29,90','Concluído'],['#1045','Carla Mendes','R$ 54,70','Novo']]:[['#0821','Célia Santos','R$ 129,90','Produção'],['#0820','Mariana Alves','R$ 219,90','Agendado'],['#0819','Rafael Nunes','R$ 169,90','Saiu p/ entrega'],['#0818','Juliana Costa','R$ 109,90','Confirmado']]).map(([id,customer,total,status])=><div className="interactive-demo__table-row" key={id}><b>{id}</b><span>{customer}</span><strong>{total}</strong><em>{status}</em></div>)}</div>}
          {adminPanel==='products'&&<div className="interactive-demo__product-admin-grid">{config.products.slice(0,4).map((product)=><article key={product.id}><span>{product.emoji}</span><div><small>{product.category}</small><strong>{product.name}</strong><p>{money(product.price)}</p></div><em>Ativo</em></article>)}</div>}
          {adminPanel==='finance'&&<div className="interactive-demo__finance-page"><div className="interactive-demo__kpis"><article><span>Entradas</span><strong>{variant==='food'?'R$ 14.280':'R$ 18.460'}</strong><small>Mês atual</small></article><article><span>Saídas</span><strong>{variant==='food'?'R$ 5.940':'R$ 7.320'}</strong><small>Mês atual</small></article><article><span>Resultado</span><strong>{variant==='food'?'R$ 8.340':'R$ 11.140'}</strong><small>Gerencial</small></article><article><span>Documentos</span><strong>{variant==='food'?'18':'12'}</strong><small>Leitura assistida</small></article></div><article className="interactive-demo__chart"><div className="interactive-demo__panel-title"><strong>Resultado dos últimos 6 meses</strong><Clock3 size={16}/></div><div>{[38,54,49,67,74,88].map((height,index)=><span key={index} style={{height:`${height}%`}}><i/></span>)}</div></article></div>}
        </div>
      </div>}

      <div className="interactive-showcase__footer"><span><CheckCircle2 size={16}/>Demonstração isolada: não grava pedidos, pagamentos ou dados no seu banco.</span><div>{demoHref&&<a href={demoHref}>Abrir vitrine real <ChevronRight size={15}/></a>}<a className="interactive-showcase__signup" href="/cadastro?plan=DEMO">Criar conta para testar <ChevronRight size={15}/></a></div></div>
    </div>
  </section>;
}
