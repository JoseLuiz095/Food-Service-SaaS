# Integrações opcionais da v0.3

## PIX da mensalidade

### Modo 1 — Manual

É o modo de menor dependência externa. O FoodWeb gera a cobrança interna, exibe chave/copia e cola e exige o fluxo de comprovante quando configurado. A confirmação do crédito é humana no Admin Master.

### Modo 2 — Asaas

O FoodWeb cria uma cobrança PIX avulsa mensal via backend. O navegador nunca recebe `ASAAS_API_KEY`.

Após o pagamento, o webhook processa `PAYMENT_RECEIVED` de forma idempotente e chama `food_confirm_subscription_payment` para renovar o acesso.

Este desenho usa cobranças controladas pela aplicação; não depende de uma assinatura PIX nativa do provedor.

## Cloudflare Workers AI

A leitura assistida de documentos usa:

1. ToMarkdown para extrair texto de PDF/imagem;
2. Workers AI para estruturar uma sugestão financeira;
3. revisão humana no formulário antes de persistir a movimentação.

Modelo inicial:

```text
@cf/google/gemma-4-26b-a4b-it
```

A integração é opcional: sem secrets Cloudflare, o Financeiro manual continua operacional.

## Separação de segredos

Frontend Vite:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_TURNSTILE_SITE_KEY
```

Supabase Edge Secrets:

```text
TURNSTILE_SECRET_KEY
CHECKOUT_FINGERPRINT_SALT
PUBLIC_APP_ORIGINS
ASAAS_API_KEY
ASAAS_ENVIRONMENT
ASAAS_WEBHOOK_TOKEN
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_AI_TOKEN
```

Nunca coloque API key Asaas, service role Supabase ou token Cloudflare em `VITE_*`.
