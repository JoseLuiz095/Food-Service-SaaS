# FoodWeb — Produto

FoodWeb é uma plataforma multempresa de vitrines, pedidos e operação para pequenos negócios. Alimentação, confeitaria, varejo, impressão 3D, aluguel e serviços compartilham a base comercial, com apresentação própria por ramo e módulos opcionais. A marca está em estudo; nomes técnicos e integrações permanecem compatíveis.

## Apresentação por ramo — shared_future

O ramo é escolhido no cadastro, na criação da loja pelo Master ou em Configurações. Ele define vocabulário, cores e apresentação da vitrine e do painel. É guardado em `food_stores.visual_theme.businessSegment`, sem novas tabelas ou migrations.

Lojas sem ramo mantêm a apresentação anterior. Cores personalizadas e o tema exclusivo Doce Lua prevalecem sobre as cores sugeridas. O ramo não ativa módulos, não modifica catálogo existente e não altera preços, estoque, Pix, horários, entrega, retirada ou permissões.

Produtos prontos continuam no catálogo normal. Reservas de aluguel, solicitações personalizadas e vendas com parceiros usam os respectivos módulos, mediante ativação explícita. A escolha do ramo não converte produtos comuns em reservas ou orçamentos.

Consulte [configuração e validação](docs/SEGMENTOS_IDENTIDADE.md) e [estudos de marca](docs/PROPOSTAS_MARCA.md).

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

- cobrança exclusivamente manual: PIX Copia e Cola com o valor do plano + comprovante via WhatsApp + conferência do Master;
- o Master cadastra chave PIX, titular, cidade e WhatsApp financeiro;
- mudança de plano e renovação ficam auditadas separadamente;
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

## Módulos opcionais — shared_future

Eventos, combos, aluguel e personalizados são habilitados por loja e começam desativados. A venda normal permanece independente.
Cada loja mantém identidade, Pix, equipe e dados próprios. O catálogo dos módulos recebe saldo explicitamente destinado a essa operação, sem consumir automaticamente o estoque normal.

Combos têm versões imutáveis e aprovação de cada fornecedor. O cliente recebe um pedido e uma cobrança para seller_store_id.
Subpedidos, snapshots, urgência, cancelamentos, reembolsos e A receber são registrados por loja; o Master consulta a composição completa com MFA.
Cobrança e transferências continuam manuais. Aprovação de arte e conversa continuam pelo WhatsApp.

Impressão 3D inclui ficha de especificações, arquivos privados e calculadora por unidade com preço final editável.
Aluguel inclui reservas por intervalo/ativo, sinal manual, contrato, checklists e manutenção.
