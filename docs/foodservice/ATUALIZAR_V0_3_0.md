> **Documento histórico da v0.3.** O FoodWeb v0.4 removeu o Asaas do fluxo ativo e utiliza somente PIX manual + comprovante via WhatsApp. Consulte `ATUALIZAR_V0_4_0.md` para a configuração atual.

# Atualização FoodWeb v0.3.0 — Comercial, PIX e Financeiro

Esta atualização parte da v0.2.x que já está usando o **mesmo projeto Supabase do FloriWeb** com namespace `food_*`.

## O que muda

- nova linguagem visual de marketplace alimentar, mobile-first, sem copiar identidade do iFood;
- Demo de 14 dias com funcionalidades equivalentes ao Profissional;
- três planos pagos: Essencial, Starter e Profissional;
- cobrança da mensalidade por PIX manual com comprovante via WhatsApp;
- opção de PIX dinâmico com Asaas + webhook para renovação automática após `PAYMENT_RECEIVED`;
- suspensão de assinatura paga vencida após carência configurável;
- Financeiro gerencial com entradas, saídas e receita automática de pedidos concluídos;
- leitura assistida de cupom/nota/boleto/PDF com Cloudflare Workers AI;
- documento analisado pela IA **não cria lançamento automaticamente**: o usuário precisa revisar e salvar;
- limites de foto e banner protegidos também no PostgreSQL, não apenas na interface;
- Analytics protegido por feature no servidor e com taxas/produtos mais úteis.

## 1. Faça backup

Antes da migration de produção, faça o backup/snapshot compatível com seu plano Supabase.

## 2. Aplique somente a migration incremental v0.3

Se você **já aplicou** `202608280400_foodservice_shared_database.sql`, não reaplique o banco do zero.

Execute no SQL Editor:

```text
supabase/migrations/202608310900_foodservice_commercial_finance_v030.sql
```

Ela cria/altera somente objetos `food_*`, `storage` para buckets Food e funções Food. Não altera `stores`, `products` ou `orders` do FloriWeb.

## 3. Configure o Admin Master

Acesse:

```text
/admin-master/planos
```

Configure primeiro:

- duração do teste grátis (recomendado: 14 dias);
- valores dos três planos;
- modo de cobrança: PIX manual ou Asaas;
- período de carência para mensalidade vencida.

### PIX manual

Configure:

- tipo da chave;
- chave PIX ou copia e cola;
- titular;
- WhatsApp que receberá comprovantes;
- mantenha “exigir comprovante” habilitado.

O fluxo é:

```text
lojista gera cobrança
→ paga PIX
→ abre WhatsApp e anexa comprovante
→ marca “Já enviei o comprovante”
→ Master confere o crédito
→ Master confirma pagamento
→ assinatura renova 1 mês
```

A aplicação não interpreta “abrir WhatsApp” como confirmação bancária. O Master só deve confirmar depois de conferir o crédito.

### Asaas

Ao selecionar Asaas, a renovação é automática após o webhook receber `PAYMENT_RECEIVED`.

Configure nos Secrets das Edge Functions:

```text
ASAAS_API_KEY
ASAAS_ENVIRONMENT=sandbox
ASAAS_WEBHOOK_TOKEN
```

Para produção:

```text
ASAAS_ENVIRONMENT=production
```

Cadastre no Asaas o endpoint:

```text
https://SEU_PROJECT_REF.supabase.co/functions/v1/food-billing-asaas-webhook
```

Use o mesmo valor de `ASAAS_WEBHOOK_TOKEN` no token de autenticação do webhook.

> O Asaas não é tratado pelo FoodWeb como serviço gratuito. Consulte as taxas vigentes da sua conta antes de ativar em produção.

## 4. Configure a leitura assistida de documentos

O Financeiro funciona manualmente mesmo sem IA. Para habilitar leitura de foto/PDF, configure:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_AI_TOKEN
```

O token Cloudflare precisa poder usar Workers AI. O arquivo fica no bucket privado `food-finance-documents`.

Fluxo:

```text
foto/PDF
→ upload privado
→ Cloudflare ToMarkdown
→ modelo Workers AI sugere campos
→ formulário é preenchido
→ usuário revisa
→ usuário clica Salvar lançamento
```

A IA nunca grava despesa/receita silenciosamente.

## 5. Publique as Edge Functions Food

No Windows você pode executar:

```text
DEPLOY_SUPABASE_FUNCTIONS.bat
```

Ou publicar manualmente apenas:

```text
food-platform-create-store
food-public-checkout
food-billing-create-pix
food-billing-asaas-webhook
food-finance-document-extract
```

Não publique funções do FloriWeb sem prefixo a partir deste pacote.

## 6. Valide localmente

Use Node.js 22.18+:

```bash
npm install
npm run validate
```

O `validate` executa smoke, fluxo crítico, typecheck e build.

## 7. Publique o Worker FoodWeb

```bash
npm run deploy
```

O `wrangler.jsonc` continua com:

```text
name = foodweb
```

Portanto não sobrescreve o Worker `floriweb`.

## 8. Testes obrigatórios pós-deploy

1. Loja Essencial tenta adicionar segunda foto → deve bloquear.
2. Loja Essencial tenta alterar banner → deve bloquear.
3. Starter acessa Analytics → deve funcionar.
4. Starter acessa Financeiro → deve ficar bloqueado.
5. Profissional acessa Financeiro → deve funcionar.
6. Pedido entregue/retirado → deve criar receita automática uma única vez.
7. Pedido cancelado → receita automática relacionada deve ficar cancelada.
8. Documento enviado → deve sugerir campos, mas só gravar após “Salvar lançamento”.
9. PIX manual → comprovante informado e confirmação Master renovam assinatura.
10. PIX Asaas em sandbox → `PAYMENT_RECEIVED` renova e reativa assinatura.
11. Reenvio do mesmo webhook → não duplica renovação.
12. Assinatura vencida + carência expirada → loja deve ficar suspensa pelo cron Food.
13. FloriWeb deve continuar operando sem mudança em suas tabelas/Workers.
