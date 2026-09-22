import { BarChart3, CheckCircle2, Clock3, FileText, MessageCircle, ShoppingBag, Truck, WalletCards } from 'lucide-react';

type Variant='food'|'flori';

type ValueItem={title:string;description:string;icon:'orders'|'delivery'|'analytics'|'finance'|'document'|'whatsapp'};

const items:Record<Variant,ValueItem[]>={
  food:[
    {icon:'orders',title:'Venda sem comissão por pedido',description:'Cardápio próprio, carrinho e pedido salvo no sistema antes do contato pelo WhatsApp.'},
    {icon:'delivery',title:'Delivery, retirada e agendamento',description:'A operação já trabalha com entrega, retirada, taxas e pedido agendado conforme configuração da loja.'},
    {icon:'whatsapp',title:'Pedido estruturado antes do WhatsApp',description:'O WhatsApp entra como continuidade do atendimento, sem substituir o registro do pedido no FoodWeb.'},
    {icon:'analytics',title:'Analytics do funil de vendas',description:'Acompanhe visualizações, produto visto, carrinho, checkout, conversão e oportunidades.'},
    {icon:'finance',title:'Financeiro ligado ao recebimento',description:'A receita do pedido entra no Financeiro após a confirmação de recebimento, evitando inflar o resultado.'},
    {icon:'document',title:'Leitura assistida de documentos',description:'Notas, cupons e boletos podem ser lidos localmente para apoiar o lançamento financeiro, mantendo revisão humana.'},
  ],
  flori:[
    {icon:'orders',title:'Pedido pensado para presente',description:'Destinatário, mensagem do cartão, entrega ou retirada e dados do pedido ficam organizados no mesmo fluxo.'},
    {icon:'delivery',title:'Entrega programada',description:'Data desejada, faixa de horário, zonas de entrega e retirada fazem parte do processo atual da floricultura.'},
    {icon:'whatsapp',title:'WhatsApp depois do pedido salvo',description:'A loja recebe um pedido estruturado antes de continuar o atendimento pelo WhatsApp.'},
    {icon:'analytics',title:'Analytics comercial',description:'Visualizações, interesse, carrinho e conversão ajudam a entender quais produtos despertam mais atenção.'},
    {icon:'finance',title:'Financeiro com recebimento confirmado',description:'O painel separa o pedido do efetivo recebimento para manter uma visão gerencial mais confiável.'},
    {icon:'document',title:'Leitura assistida no Financeiro',description:'Documentos financeiros podem ser lidos localmente para preencher campos e continuar sob revisão do usuário.'},
  ],
};

function Icon({name}:{name:ValueItem['icon']}){
  if(name==='orders')return <ShoppingBag/>;
  if(name==='delivery')return <Truck/>;
  if(name==='analytics')return <BarChart3/>;
  if(name==='finance')return <WalletCards/>;
  if(name==='document')return <FileText/>;
  return <MessageCircle/>;
}

export function ExistingValueSection({variant}:{variant:Variant}){
  return <section className={`existing-value existing-value--${variant}`}>
    <div className="existing-value__shell">
      <div className="existing-value__heading">
        <span>VALOR QUE JÁ EXISTE NO PRODUTO</span>
        <h2>{variant==='food'?'Mais que um cardápio: venda, operação e gestão sem cobrar comissão por pedido.':'Mais que um catálogo: venda, entrega programada e gestão pensadas para floriculturas.'}</h2>
        <p>{variant==='food'?'O FoodWeb concentra recursos que pequenos negócios normalmente precisam combinar em várias ferramentas.':'O FloriWeb organiza a jornada do presente e a rotina da floricultura sem transformar o painel em um ERP pesado.'}</p>
      </div>
      <div className="existing-value__grid">{items[variant].map((item)=><article key={item.title}><span><Icon name={item.icon}/></span><div><h3>{item.title}</h3><p>{item.description}</p></div></article>)}</div>
      <div className="existing-value__footer"><CheckCircle2/><span>{variant==='food'?'Os recursos apresentados fazem parte do produto atual e ajudam a reduzir o uso de ferramentas separadas na operação.':'Os recursos apresentados fazem parte do produto atual e concentram a jornada do presente e a gestão da floricultura.'}</span><Clock3/></div>
    </div>
  </section>;
}
