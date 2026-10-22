import { BarChart3, Boxes, CheckCircle2, CircleDollarSign, Clock3, FileText, MessageCircle, ShoppingBag, Truck, WalletCards } from 'lucide-react';

type Variant='food'|'flori';

type ValueItem={title:string;description:string;icon:'orders'|'delivery'|'analytics'|'finance'|'document'|'whatsapp'|'inventory'|'margin'};

const items:Record<Variant,ValueItem[]>={
  food:[
    {icon:'orders',title:'Seu canal de venda',description:'Catálogo próprio, carrinho e pedido salvo no sistema antes do contato pelo WhatsApp, sem comissão por pedido.'},
    {icon:'delivery',title:'Recebimento do seu jeito',description:'Entrega, retirada, taxas e agendamento conforme a configuração e a operação de cada loja.'},
    {icon:'whatsapp',title:'Pedido estruturado antes do WhatsApp',description:'O WhatsApp entra como continuidade do atendimento, sem substituir o registro do pedido na VendeWeb.'},
    {icon:'analytics',title:'Analytics do funil de vendas',description:'Acompanhe visualizações, produto visto, carrinho, checkout, conversão e oportunidades.'},
    {icon:'finance',title:'Financeiro gerencial',description:'Acompanhe entradas, saídas e vencimentos. Os registros ajudam a entender a rotina financeira do negócio.'},
    {icon:'document',title:'Leitura assistida de documentos',description:'Notas, cupons e boletos podem ser lidos localmente para apoiar o lançamento financeiro, mantendo revisão humana.'},
    {icon:'inventory',title:'Estoque e produção',description:'Organize insumos, fichas técnicas e reposição, com uma visão dos custos e da margem estimada dos produtos.'},
    {icon:'orders',title:'Quadro de operação opcional',description:'Acompanhe as etapas do pedido em um quadro. Na alimentação, ele também atende a rotina de cozinha / KDS.'},
    {icon:'whatsapp',title:'Recuperação de vendas',description:'CRM simples + pedir novamente: histórico de pedidos e mensagens prontas apoiam o relacionamento com o cliente.'},
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
  if(name==='inventory')return <Boxes/>;
  if(name==='margin')return <CircleDollarSign/>;
  return <MessageCircle/>;
}

export function ExistingValueSection({variant}:{variant:Variant}){
  return <section id={variant==='food'?'recursos':undefined} className={`existing-value existing-value--${variant}`}>
    <div className="existing-value__shell">
      <div className="existing-value__heading">
        <span>UMA BASE PARA O DIA A DIA</span>
        <h2>{variant==='food'?'Mais tempo para o que você faz de melhor.':'Mais que um catálogo: venda, entrega programada e gestão pensadas para floriculturas.'}</h2>
        <p>{variant==='food'?'Venda com clareza para o cliente e acompanhe seu negócio em um painel feito para a rotina. Recursos disponíveis conforme o plano contratado.':'O FloriWeb organiza a jornada do presente e a rotina da floricultura sem transformar o painel em um ERP pesado.'}</p>
      </div>
      <div className="existing-value__grid">{items[variant].map((item)=><article key={item.title}><span><Icon name={item.icon}/></span><div><h3>{item.title}</h3><p>{item.description}</p></div></article>)}</div>
      <div className="existing-value__footer"><CheckCircle2/><span>{variant==='food'?'Sua loja mantém identidade, Pix, equipe e acesso aos próprios dados. A plataforma organiza a venda e o atendimento continua próximo do cliente.':'Os recursos apresentados fazem parte do produto atual e concentram a jornada do presente e a gestão da floricultura.'}</span><Clock3/></div>
    </div>
  </section>;
}
