# Estratégia de valor e custo — FoodWeb V0.5.8 / FloriWeb RC6.14

## Decisões fechadas

- Não implementar emissão fiscal agora.
- Não implementar pagamento online agora.
- Não criar KDS, PDV, automações ou qualquer módulo que o produto ainda não possua.
- Manter a faixa de preços atual:
  - FoodWeb: Essencial R$ 49,90; Profissional R$ 79,90; Premium R$ 129,90.
  - FloriWeb: Essencial R$ 39,90; Profissional R$ 69,90; Premium R$ 119,90.
- Priorizar criação de conta em vez de contato comercial nos CTAs públicos.
- Business continua como contato comercial, pois é sob medida.
- Demonstração pública usa apenas estado local/localStorage e nunca grava pedidos no Supabase.
- Toda demonstração deve representar apenas funcionalidades já existentes.

## Como aumentar valor sem aumentar custo operacional

### FoodWeb

A comunicação comercial deve enfatizar o conjunto já existente, e não competir por quantidade de módulos com um PDV completo:

1. Cardápio próprio sem comissão por pedido.
2. Pedido salvo antes de abrir o WhatsApp.
3. Delivery, retirada, taxa e agendamento de pedido.
4. Grupos de opções e adicionais.
5. Status operacional do pedido no painel.
6. Confirmação de recebimento ligada ao Financeiro.
7. Analytics do funil de compra.
8. Leitura assistida local de nota/cupom/boleto para apoiar o Financeiro.
9. Banners, múltiplas imagens e domínio personalizado conforme o plano atual.
10. Admin Master, cobrança manual por PIX e controle de acesso.

O ganho comercial vem de mostrar que essas peças já trabalham juntas.

### FloriWeb

1. Catálogo especializado para flores e presentes.
2. Variações e complementos.
3. Destinatário e mensagem de cartão.
4. Entrega ou retirada com data/faixa de horário.
5. Produtos sob encomenda e prazo mínimo.
6. Pedido salvo antes do WhatsApp.
7. Analytics comercial.
8. Confirmação de recebimento e Financeiro.
9. Leitura assistida de documentos.
10. Gestão comercial e Admin Master.

## Imagens: manter custo previsível

Não é necessário migrar de armazenamento agora. Primeiro controlar o consumo:

- redimensionar imagens no navegador antes do upload;
- preferir WebP;
- limitar dimensão máxima, por exemplo 1600 px no lado maior;
- manter limites de imagens por produto já existentes nos planos;
- usar placeholder SVG quando não houver imagem;
- não exigir imagem para cadastro de produto;
- revisar imagens órfãs quando um produto for removido/substituído.

Isso reduz armazenamento, tráfego e tempo de carregamento sem contratar outro serviço.

## Domínio

Para o pequeno negócio, o endereço padrão da plataforma deve continuar suficiente. Domínio personalizado deve ser tratado como conveniência do Premium/Business, não como requisito para vender.

A recomendação é que a plataforma não compre nem renove o domínio do cliente. Quando o recurso for usado, o domínio continua sendo de propriedade do lojista e o sistema apenas faz o vínculo técnico.

## Por que a demonstração é importante

A demonstração passa a ser parte da venda:

1. cliente adiciona produto;
2. abre sacola;
3. preenche o checkout demonstrativo;
4. cria o pedido local;
5. abre o painel de gestão;
6. vê o mesmo pedido;
7. no FoodWeb, altera os mesmos status que já existem no painel real;
8. confirma recebimento e observa o efeito no Financeiro demonstrativo;
9. no FloriWeb, vê os campos de destinatário, data, faixa e cartão já suportados pelo produto.

Isso aumenta a percepção de valor sem criar infraestrutura ou serviços pagos adicionais.

## Regra para futuras funcionalidades

Antes de adicionar qualquer item à landing ou aos planos:

- confirmar que a função existe no código e no banco;
- confirmar que funciona em produção;
- estimar custo variável por loja;
- evitar dependências pagas obrigatórias em planos de entrada;
- preferir recursos que aproveitem a infraestrutura já contratada.
