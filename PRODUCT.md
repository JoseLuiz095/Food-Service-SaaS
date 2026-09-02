# FoodWeb — Produto v0.3

FoodWeb é um SaaS multempresa para negócios de alimentação. A vitrine pública é a porta de entrada; o produto evolui para pedidos, inteligência comercial, financeiro gerencial e operação.

## Escada comercial

### Teste grátis

- 14 dias por padrão;
- experiência equivalente ao Profissional;
- permite experimentar Analytics e Financeiro antes da assinatura.

### Essencial

- cardápio online;
- pedidos persistidos no sistema;
- WhatsApp após criação do pedido;
- delivery e retirada;
- até 1 foto por produto;
- sem Analytics, Financeiro e banner personalizado.

### Starter

- tudo do Essencial;
- Analytics de conversão e interesse por produto;
- banner personalizado;
- maior capacidade de catálogo e usuários.

### Profissional

- tudo do Starter;
- Financeiro gerencial;
- entradas e saídas;
- receita automática de pedidos concluídos;
- leitura assistida de nota/cupom/boleto/PDF com confirmação humana.

## Cobrança da plataforma

Todos os planos pagos podem ser renovados via PIX.

- modo manual: chave/copia e cola + comprovante enviado pelo WhatsApp + conferência do Master;
- modo Asaas opcional: PIX dinâmico e renovação após webhook `PAYMENT_RECEIVED`;
- pagamento é separado do checkout do consumidor;
- assinatura vencida é suspensa após a carência configurada, sem apagar dados.

## Financeiro

O Financeiro é uma visão gerencial, não uma demonstração contábil oficial.

```text
Entradas realizadas
- Saídas realizadas
= Resultado gerencial
```

Pedidos concluídos geram receita automática uma única vez. Despesas e outras receitas podem ser cadastradas manualmente ou preenchidas a partir de sugestão de documento.

## Princípios

- isolamento total entre lojas por `store_id` + RLS;
- namespace `food_*` no Supabase compartilhado com FloriWeb;
- preços e regras críticas validados no servidor;
- IA não grava movimentação financeira sem confirmação;
- segredos de pagamentos e IA nunca entram no frontend;
- interface mobile-first para o comprador e operacional para o lojista.
