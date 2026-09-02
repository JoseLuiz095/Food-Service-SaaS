# FoodWeb — Food Service SaaS v0.3.0

Plataforma SaaS multempresa para pequenos e médios negócios de alimentação. Esta versão reutiliza o **mesmo projeto Supabase do FloriWeb**, porém mantém os dados do Food Service em um namespace próprio para não misturar as duas verticais.

## Decisão de arquitetura do Supabase compartilhado

O compartilhamento é propositalmente mínimo:

```text
MESMO PROJETO SUPABASE
│
├─ auth.users                    ← compartilhado (login)
│
├─ FloriWeb                      ← continua usando as tabelas atuais
│  ├─ stores
│  ├─ store_users
│  ├─ products
│  ├─ orders
│  └─ ...
│
└─ Food Service                  ← dados separados
   ├─ food_platform_admins
   ├─ food_stores
   ├─ food_store_users
   ├─ food_products
   ├─ food_orders
   ├─ food_plans
   └─ ...
```

O Food Service **não grava** em `stores`, `products`, `orders`, `store_users`, `plans` ou `store_subscriptions` do FloriWeb. Até o Admin Master possui sua tabela própria (`food_platform_admins`). A mesma conta de `auth.users` pode ser autorizada nos dois produtos sem compartilhar suas permissões.

## O que está implementado

- React + TypeScript + Vite.
- Supabase Auth, PostgreSQL, RLS, Storage e Edge Functions.
- Multempresa por `food_stores` + `food_store_users`.
- Admin Master Food separado por `food_platform_admins`, com MFA/AAL2 mantido no frontend.
- Planos, Demo, suspensão, domínios e diagnóstico próprios do Food Service.
- Cardápio público mobile-first por slug da loja.
- Categorias, produtos, imagens e disponibilidade.
- Grupos flexíveis de opções: variação, escolha, adicional e remoção.
- Mínimo/máximo por grupo validado no frontend e no PostgreSQL.
- Carrinho por combinação exata de personalizações.
- Delivery por zona/bairro e retirada.
- Horário de funcionamento, inclusive atravessando meia-noite.
- Agendamento opcional quando fechado.
- PIX, dinheiro, cartão e confirmação com a loja.
- Troco calculado e persistido.
- Checkout via `food-public-checkout`, com Turnstile, rate limit e idempotência.
- Preços e taxas recalculados no PostgreSQL por `food_create_public_order`.
- Pedido persistido antes do WhatsApp.
- Fluxo operacional: Recebido → Confirmado → Em preparação → Pronto → Saiu para entrega/Retirado → Entregue/Cancelado.
- Analytics comercial anônimo, protegido por plano no frontend e no PostgreSQL.
- Escada comercial: Demo 14 dias, Essencial, Starter e Profissional.
- Limite de 1 foto por produto no Essencial também aplicado no banco.
- Banner personalizado disponível do Starter para cima e protegido no banco.
- Mensalidade PIX manual com comprovante via WhatsApp + revisão no Master.
- PIX dinâmico opcional via Asaas com webhook idempotente e renovação após `PAYMENT_RECEIVED`.
- Suspensão automática de mensalidades vencidas após carência configurável.
- Financeiro gerencial no Profissional: entradas, saídas e receitas automáticas de pedidos concluídos.
- Documento financeiro por foto/PDF com leitura assistida opcional via Cloudflare Workers AI e confirmação humana.
- Storage exclusivo: `food-product-images`, `food-store-assets` e bucket privado `food-finance-documents`.

## Roadmap após v0.3

Continuam como evolução: combos avançados, cupons, pizza meio a meio, ficha técnica/CMV, estoque automático, fiscal NF-e/NFC-e e integrações com marketplaces.

## Supabase ativo deste pacote

Existem duas migrations Food em ordem. Se a v0.2 já está aplicada, execute somente a segunda:

```text
1. 202608280400_foodservice_shared_database.sql      # base Food
2. 202608310900_foodservice_commercial_finance_v030.sql  # atualização v0.3
```

Ela é aditiva, roda em transação e cria somente objetos do Food Service (`food_*`), além de buckets/policies também prefixados. Ela lê `public.store_domains` apenas para impedir que um domínio Food já utilizado pelo FloriWeb seja duplicado; não instala trigger nem altera RLS/tabelas operacionais do FloriWeb.

As Edge Functions são independentes:

```text
food-platform-create-store
food-public-checkout
food-billing-create-pix
food-billing-asaas-webhook
food-finance-document-extract
```

Não publique funções antigas sem prefixo a partir deste pacote.

## Rodar localmente

Requisitos: Node.js 22.18+ e npm.

No Windows:

```text
INICIAR_PROJETO.bat
```

Ou:

```bash
npm install
npm run dev
```

Sem `.env`, o projeto usa a Demo local em desenvolvimento.

```text
Loja:         http://localhost:5173/central-food-demo
Admin:        http://localhost:5173/admin/login
Admin Master: http://localhost:5173/admin-master/login
```

Demo Admin local:

```text
admin@foodservice.demo
Food@2026
```

## Configurar com o Supabase atual do FloriWeb

O frontend Food usa a **mesma** URL e publishable/anon key do projeto Supabase atual:

```env
VITE_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_PUBLISHABLE_KEY
VITE_DEFAULT_STORE_SLUG=central-food-demo
VITE_APP_ENV=production
VITE_ANALYTICS_ENABLED=true
VITE_TURNSTILE_SITE_KEY=SUA_SITE_KEY
```

Antes de aplicar a migration no banco existente, faça backup e leia `docs/foodservice/SUPABASE_COMPARTILHADO.md`.

## Bootstrap do primeiro Master Food

Depois da migration, autorize uma conta já existente em `auth.users` (ou crie uma pelo Auth) inserindo-a em `food_platform_admins` pelo SQL Editor:

```sql
insert into public.food_platform_admins (user_id, name)
select id, coalesce(raw_user_meta_data->>'name', email, 'Master Food')
from auth.users
where lower(email) = lower('SEU_EMAIL@EMPRESA.COM')
on conflict (user_id) do update
set active = true,
    name = excluded.name,
    updated_at = now();
```

Isso **não transforma essa conta em Master do FloriWeb**.

## Edge Functions

Publique apenas:

```bash
supabase functions deploy food-platform-create-store --project-ref SEU_PROJECT_REF
supabase functions deploy food-public-checkout --project-ref SEU_PROJECT_REF --no-verify-jwt
supabase functions deploy food-billing-create-pix --project-ref SEU_PROJECT_REF
supabase functions deploy food-billing-asaas-webhook --project-ref SEU_PROJECT_REF --no-verify-jwt
supabase functions deploy food-finance-document-extract --project-ref SEU_PROJECT_REF
```

Secrets do projeto para o núcleo:

```text
TURNSTILE_SECRET_KEY
TURNSTILE_REQUIRED=true
CHECKOUT_FINGERPRINT_SALT
PUBLIC_APP_ORIGINS
```

Opcionais para PIX automático e leitura de documentos:

```text
ASAAS_API_KEY
ASAAS_ENVIRONMENT=sandbox
ASAAS_WEBHOOK_TOKEN
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_AI_TOKEN
```

As variáveis Supabase fornecidas pelo runtime continuam sendo usadas. Nunca coloque service role ou secrets no Vite.

## Segurança do checkout

```text
Browser
  ↓ IDs/escolhas + requestId
food-public-checkout
  ↓ origem + Turnstile + fingerprint/rate limit
food_create_public_order(jsonb)
  ↓ catálogo/horário/entrega/preços consultados no banco
food_orders + food_order_items + food_order_item_options
  ↓
Pedido salvo
  ↓
WhatsApp opcional
```

`food_create_public_order` não possui `EXECUTE` para `anon` ou `authenticated`; a chamada válida passa pela Edge Function com service role.

## Validar antes de publicar

```bash
npm run smoke
npm run test:critical
npm run typecheck
npm run build
```

Ou:

```bash
npm run validate
```

Consulte:

- `docs/foodservice/ATUALIZAR_V0_3_0.md`
- `docs/foodservice/INTEGRACOES_V0_3.md`
- `docs/foodservice/SUPABASE_COMPARTILHADO.md`
- `docs/foodservice/IMPLEMENTACAO_MVP.md`
- `docs/foodservice/ARQUITETURA_MVP.md`
- `docs/foodservice/IMPLANTACAO_RAPIDA.md`
- `docs/foodservice/ROTEIRO_TESTES_MVP.md`
- `docs/foodservice/VALIDACAO_LOCAL.md`

As migrations e bundles históricos do FloriWeb foram removidos deste pacote para reduzir o risco de execução acidental no banco compartilhado. O projeto original continua sendo a referência histórica da vertical Floricultura.
