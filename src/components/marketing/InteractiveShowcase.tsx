import {
  BarChart3,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Flower2,
  LayoutDashboard,
  Minus,
  Package,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
  Truck,
  Utensils,
  WalletCards,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type Variant = 'food' | 'flori';
type DemoMode = 'customer' | 'admin';
type AdminPanel = 'dashboard' | 'orders' | 'products' | 'finance';
type DemoView = 'catalog' | 'cart' | 'checkout' | 'success';
type PaymentMethod = 'pix' | 'card' | 'cash' | 'confirm';
type Fulfillment = 'delivery' | 'pickup';

type DemoAddon = { id: string; name: string; price: number; emoji: string };

type DemoProduct = {
  id: string;
  category: string;
  name: string;
  description: string;
  price: number;
  oldPrice?: number;
  tag?: string;
  emoji?: string;
  addons?: DemoAddon[];
};

type DemoCartItem = {
  productId: string;
  quantity: number;
  addons?: Record<string, number>;
};

type DemoOrder = {
  id: string;
  orderNumber: number;
  customerName: string;
  phone: string;
  fulfillment: Fulfillment;
  paymentMethod: PaymentMethod;
  total: number;
  status: string;
  paymentPaid: boolean;
  createdAt: string;
  itemSummary: string;
  desiredDate?: string;
  timeWindow?: string;
  recipientName?: string;
  cardMessage?: string;
  neighborhood?: string;
};

type PersistedDemo = {
  cart: DemoCartItem[];
  orders: DemoOrder[];
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
      {id:'f1',category:'Destaques',name:'Smash Duplo',description:'Dois burgers, queijo, cebola caramelizada e molho da casa.',price:34.90,oldPrice:39.90,tag:'Mais pedido',emoji:'🍔',addons:[{id:'bacon',name:'Bacon extra',price:5,emoji:'🥓'},{id:'queijo',name:'Queijo extra',price:4,emoji:'🧀'},{id:'ovo',name:'Ovo',price:3,emoji:'🍳'},{id:'banana',name:'Banana',price:4,emoji:'🍌'}]},
      {id:'f2',category:'Hambúrgueres',name:'Chicken Crocante',description:'Frango crocante, queijo, salada e molho especial.',price:29.90,emoji:'🍗',addons:[{id:'queijo',name:'Queijo extra',price:4,emoji:'🧀'},{id:'bacon',name:'Bacon extra',price:5,emoji:'🥓'}]},
      {id:'f3',category:'Combos',name:'Combo Família',description:'4 lanches, fritas grande e refrigerante 2L.',price:119.90,oldPrice:134.90,tag:'Economize',emoji:'🍔'},
      {id:'f4',category:'Bebidas',name:'Limonada da Casa',description:'Limão, hortelã e gelo. Refrescante e feita na hora.',price:12.90,emoji:'🍋'},
      {id:'f5',category:'Destaques',name:'Açaí 500ml',description:'Açaí cremoso com até 4 complementos.',price:24.90,emoji:'🍧',addons:[{id:'banana',name:'Banana',price:2.5,emoji:'🍌'},{id:'morango',name:'Morango',price:3,emoji:'🍓'},{id:'granola',name:'Granola',price:2,emoji:'🥣'},{id:'leite',name:'Leite em pó',price:2.5,emoji:'🥛'}]},
      {id:'f6',category:'Hambúrgueres',name:'Burger Bacon',description:'Burger artesanal, bacon crocante e cheddar.',price:31.90,emoji:'🥓',addons:[{id:'bacon',name:'Bacon extra',price:5,emoji:'🥓'},{id:'queijo',name:'Cheddar extra',price:4,emoji:'🧀'}]},
    ],
    adminTitle:'Gestão FoodWeb',
    adminSubtitle:'Pedidos, produtos, entrega, Analytics e Financeiro no mesmo painel.',
  },
  flori:{
    store:'Jardim da Vila',
    subtitle:'Flores, presentes e entregas programadas',
    categories:['Destaques','Buquês','Presentes','Ocasiões'],
    products:[
      {id:'l1',category:'Destaques',name:'Buquê Aurora',description:'Flores selecionadas em tons vibrantes para momentos especiais.',price:129.90,oldPrice:149.90,tag:'Disponível hoje'},
      {id:'l2',category:'Buquês',name:'12 Rosas Clássicas',description:'Rosas frescas, folhagens e acabamento elegante.',price:169.90},
      {id:'l3',category:'Presentes',name:'Cesta Afeto',description:'Flores, chocolates e itens delicadamente organizados.',price:219.90,tag:'Presente completo'},
      {id:'l4',category:'Ocasiões',name:'Girassol Luz',description:'Composição vibrante com girassóis e embalagem kraft.',price:109.90},
      {id:'l5',category:'Destaques',name:'Box Carinho',description:'Flores e complementos em uma apresentação pronta para presentear.',price:189.90},
      {id:'l6',category:'Buquês',name:'Lírio Encanto',description:'Lírios e folhagens com acabamento premium.',price:119.90},
    ],
    adminTitle:'Gestão FloriWeb',
    adminSubtitle:'Pedidos, entregas programadas, produtos, Analytics e Financeiro no mesmo painel.',
  },
};

const storageKey=(variant:Variant)=>variant==='food'?'foodweb_interactive_demo_v060':'floriweb_interactive_demo_rc614';

const defaultCart=(variant:Variant):DemoCartItem[]=>variant==='food'
  ? [{productId:'f1',quantity:1}]
  : [{productId:'l1',quantity:1}];

const defaultOrders=(variant:Variant):DemoOrder[]=>variant==='food'
  ? [
      {id:'food-default-1048',orderNumber:1048,customerName:'Marcos Oliveira',phone:'(27) 99999-1001',fulfillment:'delivery',paymentMethod:'pix',total:76.80,status:'preparing',paymentPaid:true,createdAt:new Date(Date.now()-12*60000).toISOString(),itemSummary:'2x Smash + bebida',neighborhood:'Centro'},
      {id:'food-default-1047',orderNumber:1047,customerName:'Ana Souza',phone:'(27) 99999-1002',fulfillment:'pickup',paymentMethod:'card',total:119.90,status:'ready',paymentPaid:false,createdAt:new Date(Date.now()-28*60000).toISOString(),itemSummary:'Combo família'},
      {id:'food-default-1046',orderNumber:1046,customerName:'Paulo Lima',phone:'(27) 99999-1003',fulfillment:'delivery',paymentMethod:'pix',total:29.90,status:'delivered',paymentPaid:true,createdAt:new Date(Date.now()-48*60000).toISOString(),itemSummary:'Açaí 500ml',neighborhood:'Colina'},
    ]
  : [
      {id:'flori-default-821',orderNumber:821,customerName:'Célia Santos',phone:'(27) 99999-2001',fulfillment:'delivery',paymentMethod:'pix',total:129.90,status:'draft',paymentPaid:false,createdAt:new Date(Date.now()-14*60000).toISOString(),itemSummary:'Buquê Aurora',desiredDate:new Date(Date.now()+86400000).toISOString().slice(0,10),timeWindow:'14:00–18:00',recipientName:'Maria Santos',cardMessage:'Com carinho.'},
      {id:'flori-default-820',orderNumber:820,customerName:'Mariana Alves',phone:'(27) 99999-2002',fulfillment:'delivery',paymentMethod:'card',total:219.90,status:'sent_to_whatsapp',paymentPaid:true,createdAt:new Date(Date.now()-32*60000).toISOString(),itemSummary:'Cesta Afeto',desiredDate:new Date(Date.now()+2*86400000).toISOString().slice(0,10),timeWindow:'08:00–12:00',recipientName:'Luciana Alves',cardMessage:'Feliz aniversário!'},
      {id:'flori-default-819',orderNumber:819,customerName:'Rafael Nunes',phone:'(27) 99999-2003',fulfillment:'pickup',paymentMethod:'cash',total:169.90,status:'sent_to_whatsapp',paymentPaid:true,createdAt:new Date(Date.now()-57*60000).toISOString(),itemSummary:'12 Rosas Clássicas',desiredDate:new Date().toISOString().slice(0,10),timeWindow:'16:00–18:00',recipientName:'Rafael Nunes'},
    ];

const loadPersisted=(variant:Variant):PersistedDemo=>{
  if(typeof window==='undefined')return {cart:defaultCart(variant),orders:defaultOrders(variant)};
  try{
    const raw=window.localStorage.getItem(storageKey(variant));
    if(!raw)return {cart:defaultCart(variant),orders:defaultOrders(variant)};
    const parsed=JSON.parse(raw) as Partial<PersistedDemo>;
    return {
      cart:Array.isArray(parsed.cart)?parsed.cart:defaultCart(variant),
      orders:Array.isArray(parsed.orders)&&parsed.orders.length?parsed.orders:defaultOrders(variant),
    };
  }catch{
    return {cart:defaultCart(variant),orders:defaultOrders(variant)};
  }
};

const foodStatuses=[
  ['received','Recebido'],
  ['confirmed','Confirmado'],
  ['preparing','Em preparação'],
  ['ready','Pronto'],
  ['out_for_delivery','Saiu para entrega'],
  ['delivered','Entregue'],
  ['picked_up','Retirado'],
  ['cancelled','Cancelado'],
] as const;

const floriStatusLabel:Record<string,string>={draft:'Pedido realizado',sent_to_whatsapp:'WhatsApp aberto',cancelled:'Cancelado'};
const paymentLabel:Record<PaymentMethod,string>={pix:'PIX',card:'Cartão',cash:'Dinheiro',confirm:'Combinar com a loja'};

function ProductVisual({variant,product}:{variant:Variant;product?:DemoProduct}){
  if(variant==='food'&&product?.emoji)return <span className="interactive-demo__fallback-icon interactive-demo__emoji-v060" role="img" aria-label={product.name}>{product.emoji}</span>;
  return <span className="interactive-demo__fallback-icon" aria-hidden="true">{variant==='food'?<Utensils/>:<Flower2/>}</span>;
}

const addonSelectionKey=(addons:Record<string,number>|undefined)=>JSON.stringify(Object.entries(addons||{}).filter(([,qty])=>qty>0).sort(([a],[b])=>a.localeCompare(b)));

export function InteractiveShowcase({variant}:InteractiveShowcaseProps){
  const config=datasets[variant];
  const initial=useMemo(()=>loadPersisted(variant),[variant]);
  const [mode,setMode]=useState<DemoMode>('customer');
  const [category,setCategory]=useState(config.categories[0]);
  const [query,setQuery]=useState('');
  const [selected,setSelected]=useState<DemoProduct|null>(null);
  const [qty,setQty]=useState(1);
  const [selectedAddons,setSelectedAddons]=useState<Record<string,number>>({});
  const [view,setView]=useState<DemoView>('catalog');
  const [cart,setCart]=useState<DemoCartItem[]>(initial.cart);
  const [orders,setOrders]=useState<DemoOrder[]>(initial.orders);
  const [adminPanel,setAdminPanel]=useState<AdminPanel>('dashboard');
  const [customerName,setCustomerName]=useState('Cliente Demonstração');
  const [phone,setPhone]=useState('(27) 99999-0000');
  const [fulfillment,setFulfillment]=useState<Fulfillment>('delivery');
  const [paymentMethod,setPaymentMethod]=useState<PaymentMethod>('pix');
  const [neighborhood,setNeighborhood]=useState('Centro');
  const [desiredDate,setDesiredDate]=useState(new Date(Date.now()+86400000).toISOString().slice(0,10));
  const [timeWindow,setTimeWindow]=useState('14:00–18:00');
  const [recipientName,setRecipientName]=useState('Pessoa presenteada');
  const [cardMessage,setCardMessage]=useState('Com carinho!');
  const [lastCreatedOrder,setLastCreatedOrder]=useState<DemoOrder|null>(null);

  useEffect(()=>{
    try{window.localStorage.setItem(storageKey(variant),JSON.stringify({cart,orders} satisfies PersistedDemo))}catch{/* demonstração continua em memória */}
  },[cart,orders,variant]);

  const products=useMemo(()=>config.products.filter((product)=>{
    const inCategory=category===config.categories[0]?true:product.category===category;
    const q=query.trim().toLocaleLowerCase('pt-BR');
    const inSearch=!q||`${product.name} ${product.description}`.toLocaleLowerCase('pt-BR').includes(q);
    return inCategory&&inSearch;
  }),[category,config,query]);

  const cartRows=useMemo(()=>cart.map((item)=>{
    const product=config.products.find((candidate)=>candidate.id===item.productId);
    const addonTotal=(product?.addons||[]).reduce((sum,addon)=>sum+addon.price*Math.max(0,item.addons?.[addon.id]||0),0);
    return {...item,product,addonTotal,unitTotal:(product?.price||0)+addonTotal};
  }).filter((item):item is DemoCartItem&{product:DemoProduct;addonTotal:number;unitTotal:number}=>Boolean(item.product)),[cart,config.products]);

  const cartCount=cart.reduce((sum,item)=>sum+item.quantity,0);
  const cartTotal=cartRows.reduce((sum,item)=>sum+item.unitTotal*item.quantity,0);
  const paidLocalTotal=orders.filter((order)=>order.paymentPaid).reduce((sum,order)=>sum+order.total,0);

  const openProduct=(product:DemoProduct)=>{setQty(1);setSelectedAddons({});setSelected(product)};
  const changeDemoAddon=(addonId:string,delta:number)=>setSelectedAddons((current)=>{
    const next={...current};
    const quantity=Math.max(0,Math.min(20,(next[addonId]||0)+delta));
    if(quantity===0)delete next[addonId];else next[addonId]=quantity;
    return next;
  });
  const addSelected=()=>{
    if(!selected)return;
    const addons=Object.fromEntries(Object.entries(selectedAddons).filter(([,value])=>value>0));
    const key=addonSelectionKey(addons);
    setCart((current)=>{
      const existing=current.find((item)=>item.productId===selected.id&&addonSelectionKey(item.addons)===key);
      if(existing)return current.map((item)=>item===existing?{...item,quantity:item.quantity+qty}:item);
      return [...current,{productId:selected.id,quantity:qty,addons}];
    });
    setSelected(null);
    setSelectedAddons({});
  };
  const changeCartQty=(productId:string,addons:Record<string,number>|undefined,delta:number)=>{
    const key=addonSelectionKey(addons);
    setCart((current)=>current
      .map((item)=>item.productId===productId&&addonSelectionKey(item.addons)===key?{...item,quantity:Math.max(0,item.quantity+delta)}:item)
      .filter((item)=>item.quantity>0));
  };

  const finishOrder=()=>{
    if(!cartRows.length)return;
    const nextNumber=Math.max(...orders.map((order)=>order.orderNumber),variant==='food'?1048:821)+1;
    const order:DemoOrder={
      id:`${variant}-local-${Date.now()}`,
      orderNumber:nextNumber,
      customerName:customerName.trim()||'Cliente Demonstração',
      phone:phone.trim(),
      fulfillment,
      paymentMethod,
      total:cartTotal,
      status:variant==='food'?'received':'draft',
      paymentPaid:false,
      createdAt:new Date().toISOString(),
      itemSummary:cartRows.map((item)=>{const addons=(item.product.addons||[]).filter((addon)=>(item.addons?.[addon.id]||0)>0).map((addon)=>`${addon.name}${(item.addons?.[addon.id]||0)>1?` x${item.addons?.[addon.id]}`:''}`).join(', ');return `${item.quantity}x ${item.product.name}${addons?` (${addons})`:''}`}).join(' · '),
      ...(variant==='food'?{neighborhood:fulfillment==='delivery'?neighborhood:''}:{desiredDate,timeWindow,recipientName,cardMessage}),
    };
    setOrders((current)=>[order,...current]);
    setLastCreatedOrder(order);
    setCart([]);
    setView('success');
  };

  const confirmPayment=(orderId:string)=>setOrders((current)=>current.map((order)=>order.id===orderId?{...order,paymentPaid:true}:order));
  const updateFoodStatus=(orderId:string,status:string)=>setOrders((current)=>current.map((order)=>order.id===orderId?{...order,status}:order));
  const markFloriWhatsapp=(orderId:string)=>setOrders((current)=>current.map((order)=>order.id===orderId&&order.status==='draft'?{...order,status:'sent_to_whatsapp'}:order));

  const openAdminOrders=()=>{setView('catalog');setMode('admin');setAdminPanel('orders')};
  const resetDemo=()=>{
    const next={cart:defaultCart(variant),orders:defaultOrders(variant)};
    setCart(next.cart);
    setOrders(next.orders);
    setSelected(null);
    setSelectedAddons({});
    setView('catalog');
    setMode('customer');
    setAdminPanel('dashboard');
    setLastCreatedOrder(null);
    try{window.localStorage.setItem(storageKey(variant),JSON.stringify(next))}catch{/* sem persistência */}
  };

  const baseRevenue=variant==='food'?1846:2318;
  const extraPaid=Math.max(0,paidLocalTotal-defaultOrders(variant).filter((order)=>order.paymentPaid).reduce((sum,order)=>sum+order.total,0));
  const displayedRevenue=baseRevenue+extraPaid;

  return <section id="demonstracao" className={`interactive-showcase interactive-showcase--${variant}`}>
    <div className="interactive-showcase__shell">
      <div className="interactive-showcase__heading">
        <div><span>DEMONSTRAÇÃO INTERATIVA</span><h2>Monte um pedido e acompanhe o mesmo pedido no painel da loja.</h2></div>
        <div className="interactive-showcase__mode-tabs" role="tablist" aria-label="Modo da demonstração">
          <button type="button" className={mode==='customer'?'active':''} onClick={()=>{setMode('customer');setView('catalog')}}><ShoppingBag size={17}/>Experiência do cliente</button>
          <button type="button" className={mode==='admin'?'active':''} onClick={()=>setMode('admin')}><LayoutDashboard size={17}/>Painel de gestão</button>
        </div>
      </div>

      {mode==='customer'?<div className="interactive-demo interactive-demo--customer">
        <aside className="interactive-demo__categories">
          <div className="interactive-demo__brand">{variant==='food'?<Utensils size={19}/>:<Flower2 size={19}/>}<span><strong>{config.store}</strong><small>{config.subtitle}</small></span></div>
          {config.categories.map((item)=><button type="button" key={item} className={category===item?'active':''} onClick={()=>{setCategory(item);setView('catalog')}}>{item}<ChevronRight size={14}/></button>)}
          <div className="interactive-demo__delivery"><Truck size={16}/><span><strong>{variant==='food'?'Entrega e retirada':'Entrega programada e retirada'}</strong><small>{variant==='food'?'Taxas e agendamento conforme configuração da loja':'Data, faixa de horário e dados do presente'}</small></span></div>
        </aside>

        <div className="interactive-demo__storefront">
          {view==='catalog'&&<>
            <header><div><small>LOJA DEMONSTRATIVA</small><strong>{config.store}</strong></div><label><Search size={16}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Buscar produto..."/></label></header>
            <div className="interactive-demo__notice"><CheckCircle2 size={15}/>{variant==='food'?'Pedido salvo no sistema antes do contato pelo WhatsApp.':'Pedido com destinatário, data, faixa de horário e mensagem do cartão.'}</div>
            <div className="interactive-demo__products">{products.map((product)=><button type="button" className="interactive-demo__product" key={product.id} onClick={()=>openProduct(product)}>
              <div className="interactive-demo__product-art"><ProductVisual variant={variant} product={product}/>{product.tag&&<b>{product.tag}</b>}</div>
              <div><small>{product.category}</small><strong>{product.name}</strong><p>{product.description}</p><footer><span>{money(product.price)}{product.oldPrice&&<del>{money(product.oldPrice)}</del>}</span><i><Plus size={15}/></i></footer></div>
            </button>)}</div>
            {!products.length&&<div className="interactive-demo__empty">Nenhum item encontrado nesta demonstração.</div>}
            <button type="button" className="interactive-demo__cart" onClick={()=>setView('cart')}><span><ShoppingBag size={17}/><b>{cartCount}</b></span><strong>Ver sacola</strong><small>{cartCount?`${cartCount} item(ns) · ${money(cartTotal)}`:'Adicione um produto'}</small></button>
          </>}

          {view==='cart'&&<div className="interactive-demo__flow-page">
            <div className="interactive-demo__flow-head"><div><small>SEU PEDIDO</small><h3>Sacola</h3></div><button type="button" onClick={()=>setView('catalog')}>Continuar comprando</button></div>
            <div className="interactive-demo__cart-list">{cartRows.map((item,index)=><article key={`${item.product.id}-${addonSelectionKey(item.addons)}-${index}`}><div className="interactive-demo__mini-visual"><ProductVisual variant={variant} product={item.product}/></div><div><strong>{item.product.name}</strong><small>{money(item.unitTotal)} cada</small>{item.product.addons&&Object.keys(item.addons||{}).length>0&&<small className="interactive-demo__cart-addons-v060">{item.product.addons.filter((addon)=>(item.addons?.[addon.id]||0)>0).map((addon)=>`${addon.emoji} ${addon.name}${(item.addons?.[addon.id]||0)>1?` ×${item.addons?.[addon.id]}`:''}`).join(' · ')}</small>}</div><div className="interactive-demo__qty"><button type="button" onClick={()=>changeCartQty(item.product.id,item.addons,-1)}><Minus size={14}/></button><b>{item.quantity}</b><button type="button" onClick={()=>changeCartQty(item.product.id,item.addons,1)}><Plus size={14}/></button></div><strong>{money(item.unitTotal*item.quantity)}</strong></article>)}</div>
            {!cartRows.length&&<div className="interactive-demo__empty">Sua sacola está vazia.</div>}
            <div className="interactive-demo__flow-summary"><span>Total demonstrativo<strong>{money(cartTotal)}</strong></span><button type="button" disabled={!cartRows.length} onClick={()=>setView('checkout')}>Continuar pedido <ChevronRight size={16}/></button></div>
          </div>}

          {view==='checkout'&&<form className="interactive-demo__flow-page interactive-demo__checkout" onSubmit={(event)=>{event.preventDefault();finishOrder()}}>
            <div className="interactive-demo__flow-head"><div><small>FINALIZAÇÃO</small><h3>Dados do pedido</h3></div><button type="button" onClick={()=>setView('cart')}>Voltar à sacola</button></div>
            <div className="interactive-demo__checkout-grid">
              <label><span>Nome</span><input required value={customerName} onChange={(event)=>setCustomerName(event.target.value)}/></label>
              <label><span>Telefone</span><input value={phone} onChange={(event)=>setPhone(event.target.value)}/></label>
              <label><span>Recebimento</span><select value={fulfillment} onChange={(event)=>setFulfillment(event.target.value as Fulfillment)}><option value="delivery">Entrega</option><option value="pickup">Retirada</option></select></label>
              <label><span>Pagamento</span><select value={paymentMethod} onChange={(event)=>setPaymentMethod(event.target.value as PaymentMethod)}><option value="pix">PIX</option><option value="card">Cartão</option><option value="cash">Dinheiro</option><option value="confirm">Combinar com a loja</option></select></label>
              {variant==='food'?<>
                {fulfillment==='delivery'&&<label className="span-2"><span>Bairro</span><input value={neighborhood} onChange={(event)=>setNeighborhood(event.target.value)} placeholder="Centro"/></label>}
              </>:<>
                <label><span>Data desejada</span><input type="date" value={desiredDate} onChange={(event)=>setDesiredDate(event.target.value)}/></label>
                <label><span>Faixa de horário</span><select value={timeWindow} onChange={(event)=>setTimeWindow(event.target.value)}><option>08:00–12:00</option><option>14:00–18:00</option><option>18:00–20:00</option></select></label>
                <label className="span-2"><span>Destinatário</span><input value={recipientName} onChange={(event)=>setRecipientName(event.target.value)}/></label>
                <label className="span-2"><span>Mensagem do cartão</span><textarea value={cardMessage} onChange={(event)=>setCardMessage(event.target.value)} rows={3}/></label>
              </>}
            </div>
            <div className="interactive-demo__checkout-note">O pagamento é apenas registrado na demonstração. Não há cobrança ou transação online.</div>
            <div className="interactive-demo__flow-summary"><span>Total<strong>{money(cartTotal)}</strong></span><button type="submit">Finalizar pedido demonstrativo <ChevronRight size={16}/></button></div>
          </form>}

          {view==='success'&&lastCreatedOrder&&<div className="interactive-demo__success"><CheckCircle2/><small>PEDIDO CRIADO NA DEMONSTRAÇÃO</small><h3>Pedido #{String(lastCreatedOrder.orderNumber).padStart(4,'0')}</h3><p>O pedido já apareceu na área de gestão abaixo. Ele fica salvo somente neste navegador até você reiniciar a demonstração.</p><strong>{money(lastCreatedOrder.total)}</strong><div><button type="button" onClick={openAdminOrders}>Ver no painel de gestão <LayoutDashboard size={16}/></button><button type="button" onClick={()=>setView('catalog')}>Continuar navegando</button></div></div>}

          {selected&&<div className="interactive-demo__modal-backdrop" onClick={()=>setSelected(null)}><div className="interactive-demo__modal" role="dialog" aria-modal="true" onClick={(event)=>event.stopPropagation()}>
            <div className="interactive-demo__modal-art"><ProductVisual variant={variant} product={selected}/></div>
            <div className="interactive-demo__modal-content"><button type="button" className="interactive-demo__modal-close" onClick={()=>setSelected(null)} aria-label="Fechar">×</button><small>DETALHES DO PRODUTO</small><h3>{selected.name}</h3><p>{selected.description}</p><strong>{money(selected.price)}</strong>
              {variant==='food'&&selected.addons?.length?<div className="interactive-demo__addons-v060"><div><span>ADICIONAIS</span><small>Escolha e repita adicionais. O valor muda em tempo real.</small></div>{selected.addons.map((addon)=>{const addonQty=selectedAddons[addon.id]||0;return <div className={`interactive-demo__addon-row-v060 ${addonQty?'selected':''}`} key={addon.id}><span><b>{addon.emoji}</b><strong>{addon.name}</strong><small>+ {money(addon.price)}</small></span><div><button type="button" onClick={()=>changeDemoAddon(addon.id,-1)} disabled={!addonQty}><Minus size={13}/></button><b>{addonQty}</b><button type="button" onClick={()=>changeDemoAddon(addon.id,1)}><Plus size={13}/></button></div></div>})}</div>:<div className="interactive-demo__option"><span>{variant==='food'?'Personalização disponível':'Personalize o presente'}</span><small>{variant==='food'?'Variações, escolhas, adicionais e remoções podem ser configurados por produto.':'Variações, complementos, mensagem e entrega fazem parte do fluxo atual.'}</small></div>}
              <div className="interactive-demo__modal-action"><div><button type="button" onClick={()=>setQty((value)=>Math.max(1,value-1))}><Minus size={15}/></button><b>{qty}</b><button type="button" onClick={()=>setQty((value)=>value+1)}><Plus size={15}/></button></div><button type="button" onClick={addSelected}>Adicionar · {money((selected.price+(selected.addons||[]).reduce((sum,addon)=>sum+addon.price*(selectedAddons[addon.id]||0),0))*qty)}</button></div>
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
        <div className="interactive-demo__admin-main"><header><div><small>AMBIENTE DE DEMONSTRAÇÃO</small><strong>{adminPanel==='dashboard'?'Visão geral':adminPanel==='orders'?'Pedidos':adminPanel==='products'?'Produtos':'Financeiro'}</strong></div><button type="button" className="interactive-demo__reset" onClick={resetDemo}><RotateCcw size={14}/>Reiniciar</button></header>
          <p className="interactive-demo__admin-subtitle">{config.adminSubtitle}</p>
          {adminPanel==='dashboard'&&<><div className="interactive-demo__kpis"><article><span>Pedidos hoje</span><strong>{orders.length}</strong><small>Inclui pedidos demonstrativos</small></article><article><span>Faturamento</span><strong>{money(displayedRevenue)}</strong><small>Recebimentos confirmados</small></article><article><span>Ticket médio</span><strong>{money(orders.length?orders.reduce((sum,order)=>sum+order.total,0)/orders.length:0)}</strong><small>Pedidos exibidos</small></article><article><span>{variant==='food'?'Em preparação':'Entregas programadas'}</span><strong>{variant==='food'?orders.filter((order)=>order.status==='preparing').length:orders.filter((order)=>order.desiredDate).length}</strong><small>{variant==='food'?'Status real do FoodWeb':'Dados de entrega do pedido'}</small></article></div><div className="interactive-demo__admin-grid"><article><div className="interactive-demo__panel-title"><strong>Pedidos recentes</strong><span>Atualizado localmente</span></div>{orders.slice(0,4).map((order)=><div className="interactive-demo__order" key={order.id}><b>#{String(order.orderNumber).padStart(4,'0')}</b><span><strong>{order.itemSummary}</strong><small>{order.fulfillment==='delivery'?'Entrega':'Retirada'} · {paymentLabel[order.paymentMethod]}</small></span><em>{variant==='food'?(foodStatuses.find(([value])=>value===order.status)?.[1]||order.status):(floriStatusLabel[order.status]||order.status)}</em></div>)}</article><article><div className="interactive-demo__panel-title"><strong>Resumo financeiro</strong><BarChart3 size={16}/></div><div className="interactive-demo__finance"><span>Recebimentos confirmados<strong>{money(displayedRevenue)}</strong></span><span>Pedidos pendentes<strong>{orders.filter((order)=>!order.paymentPaid&&order.status!=='cancelled').length}</strong></span><span className="result">Fluxo demonstrado<strong>Pedido → recebimento → Financeiro</strong></span></div></article></div></>}
          {adminPanel==='orders'&&<div className="interactive-demo__list-panel"><div className="interactive-demo__panel-title"><strong>Pedidos realizados</strong><span>{orders.length} pedidos</span></div>{orders.map((order)=><div className={`interactive-demo__order-card ${lastCreatedOrder?.id===order.id?'is-new':''}`} key={order.id}><div className="interactive-demo__order-main"><b>#{String(order.orderNumber).padStart(4,'0')}</b><span><strong>{order.customerName}</strong><small>{order.itemSummary}</small><small>{order.fulfillment==='delivery'?'Entrega':'Retirada'} · {paymentLabel[order.paymentMethod]}</small>{variant==='flori'&&order.desiredDate&&<small>{order.desiredDate} · {order.timeWindow}</small>}</span><strong>{money(order.total)}</strong></div><div className="interactive-demo__order-actions">
            {variant==='food'?<label><span>Status</span><select value={order.status} onChange={(event)=>updateFoodStatus(order.id,event.target.value)}>{foodStatuses.filter(([value])=>order.fulfillment==='delivery'?value!=='picked_up':!['out_for_delivery','delivered'].includes(value)).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>:<span className="interactive-demo__status-pill">{floriStatusLabel[order.status]||order.status}</span>}
            {!order.paymentPaid&&order.status!=='cancelled'?<button type="button" onClick={()=>confirmPayment(order.id)}><CircleDollarSign size={14}/>Confirmar recebimento</button>:<span className="interactive-demo__paid"><CheckCircle2 size={14}/>Recebimento confirmado</span>}
            {variant==='flori'&&order.status==='draft'&&<button type="button" onClick={()=>markFloriWhatsapp(order.id)}>Marcar WhatsApp aberto</button>}
          </div></div>)}</div>}
          {adminPanel==='products'&&<div className="interactive-demo__product-admin-v060"><div className="interactive-demo__admin-feature-note-v060"><strong>Cadastro com imagem ou emoji</strong><span>O lojista pode usar um emoji como visual quando não quiser enviar foto e configurar adicionais por produto.</span></div><div className="interactive-demo__product-admin-grid">{config.products.map((product)=><article key={product.id}><div className="interactive-demo__mini-visual"><ProductVisual variant={variant} product={product}/></div><div><small>{product.category}</small><strong>{product.name}</strong><p>{money(product.price)}{variant==='food'&&product.addons?.length?` · ${product.addons.length} adicionais`:''}</p></div><em>Ativo</em></article>)}</div></div>}
          {adminPanel==='finance'&&<div className="interactive-demo__finance-page"><div className="interactive-demo__kpis"><article><span>Recebimentos confirmados</span><strong>{money(displayedRevenue)}</strong><small>Pedidos pagos/confirmados</small></article><article><span>Pendentes</span><strong>{orders.filter((order)=>!order.paymentPaid&&order.status!=='cancelled').length}</strong><small>Aguardando confirmação</small></article><article><span>Ticket médio</span><strong>{money(orders.length?orders.reduce((sum,order)=>sum+order.total,0)/orders.length:0)}</strong><small>Pedidos exibidos</small></article><article><span>Documentos</span><strong>{variant==='food'?'18':'12'}</strong><small>Leitura assistida existente</small></article></div><article className="interactive-demo__chart"><div className="interactive-demo__panel-title"><strong>Resultado gerencial demonstrativo</strong><Clock3 size={16}/></div><div>{[38,54,49,67,74,88].map((height,index)=><span key={index} style={{height:`${height}%`}}><i/></span>)}</div></article></div>}
        </div>
      </div>}

      <div className="interactive-showcase__footer"><button type="button" onClick={resetDemo}><RotateCcw size={15}/>Reiniciar demonstração</button><a className="interactive-showcase__signup" href="/cadastro?plan=DEMO">Criar minha conta <ChevronRight size={15}/></a></div>
    </div>
  </section>;
}
