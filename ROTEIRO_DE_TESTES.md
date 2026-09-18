# Roteiro de testes — FoodWeb v0.4.1

## 1. Regressão do núcleo

- login Admin e Master;
- MFA/AAL2 do Master;
- recuperação de senha com MFA;
- isolamento Loja A × Loja B;
- checkout anônimo com Turnstile;
- idempotência do pedido;
- pedido salvo antes do WhatsApp;
- FloriWeb continua operando sem alteração de suas tabelas/Workers.

## 2. Vitrine marketplace

Testar em 390x844, tablet e desktop:

- busca persistente;
- categorias sticky;
- cards horizontais de produto;
- disponibilidade e preço promocional;
- personalizações mínimo/máximo;
- carrinho fixo no mobile;
- delivery/retirada;
- loja fechada e agendamento.

## 3. Planos

### Demo

- nova loja recebe 14 dias;
- Analytics e Financeiro visíveis;
- expiração suspende a loja sem apagar dados.

### Essencial

- Analytics bloqueado;
- Financeiro bloqueado;
- segunda imagem no produto é rejeitada inclusive pela API;
- alteração de banner personalizado é rejeitada inclusive pela API.

### Starter

- Analytics liberado;
- Financeiro bloqueado;
- banner personalizado liberado.

### Profissional

- Analytics e Financeiro liberados.

## 4. Mensalidade PIX manual

- gerar cobrança;
- copiar chave/copia e cola;
- abrir WhatsApp com identificação da cobrança;
- botão “Já enviei o comprovante” só habilita após abrir WhatsApp;
- Master não confirma cobrança manual sem `proof_sent_at`;
- confirmação renova um mês e reativa loja;
- pagamento antecipado preserva período já pago;
- vencimento + carência suspende automaticamente.

## 5. Mudança de plano por PIX manual

- Meu Plano exibe Essencial, Starter e Profissional com valores atuais do banco;
- gerar PIX para renovação usa o valor retornado pela cobrança do servidor;
- gerar PIX para mudança de plano registra `plan_change`;
- mensagem do WhatsApp identifica plano atual, novo plano, valor e cobrança;
- comprovante continua obrigatório;
- Master visualiza plano anterior → plano solicitado antes de confirmar;
- confirmação altera o plano, renova um mês e reativa a loja;
- cobrança pendente antiga não pode provocar mudança de plano ambígua.

## 6. Financeiro

- pedido `delivered` cria receita uma única vez;
- pedido `picked_up` cria receita uma única vez;
- pedido cancelado cancela receita automática correspondente;
- entrada manual;
- saída manual;
- lançamento pendente;
- filtro visual de resultado gerencial;
- usuário sem feature `finance` recebe bloqueio do banco.

## 7. Documento financeiro

- JPG/PNG/WebP/PDF até 10 MB;
- bucket é privado;
- documento de Loja A não pode ser lido pela Loja B;
- extração preenche sugestão;
- sugestão não cria `food_financial_entries` automaticamente;
- usuário revisa e só então salva;
- falha de IA não impede lançamento manual.

## 8. Comandos

```bash
npm run smoke
npm run test:critical
npm run validate
npm run design:detect
```
