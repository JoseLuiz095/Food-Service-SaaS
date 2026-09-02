# Configurar Supabase — Food Service no mesmo projeto do FloriWeb

## 1. Projeto

Use o **Project Ref atual do FloriWeb**. Não crie outro projeto.

A separação ocorre por namespace:

```text
FloriWeb:     stores, products, orders, ...
Food Service: food_stores, food_products, food_orders, ...
Compartilhado: auth.users
```

## 2. Backup antes da migration

Como o projeto Supabase já está em uso, faça backup/snapshot compatível com seu plano antes de qualquer SQL de produção.

A migration Food é aditiva e transacional, mas backup continua obrigatório.

## 3. Aplicar migrations Food na ordem

Base (apenas em instalação nova):

```text
supabase/migrations/202608280400_foodservice_shared_database.sql
```

Atualização v0.3 (para quem já está na v0.2.x, execute esta):

```text
supabase/migrations/202608310900_foodservice_commercial_finance_v030.sql
```

Este pacote não inclui migrations antigas do FloriWeb. Não copie migrations do projeto original para a pasta `supabase/migrations` deste produto.

A migration cria `food_*`, RLS, RPCs, cron Food e buckets Food. Ela não grava em `stores`, `products` ou `orders` do FloriWeb.

## 4. Primeiro Admin Master Food

A autenticação é compartilhada por `auth.users`, mas as permissões Master são independentes em `food_platform_admins`.

Depois de aplicar a migration, insira a conta que será Master Food:

```sql
insert into public.food_platform_admins (user_id, name)
select id, coalesce(raw_user_meta_data->>'name', email, 'Master Food')
from auth.users
where lower(email) = lower('SEU_EMAIL@EMPRESA.COM')
on conflict (user_id) do update
set active=true, name=excluded.name, updated_at=now();
```

## 5. Auth: adicionar URL Food sem remover FloriWeb

Em **Authentication → URL Configuration**, mantenha as URLs atuais do FloriWeb e adicione as URLs de recuperação do Food Service. O Auth é compartilhado pelo projeto.

Os templates nativos de e-mail também são globais. Se hoje estiverem totalmente personalizados como FloriWeb, use senha temporária no onboarding Food ou adapte o template para uma marca neutra até criarmos e-mails específicos por vertical.

## 6. Edge Functions

Publique somente:

```text
food-platform-create-store
food-public-checkout
food-billing-create-pix
food-billing-asaas-webhook
food-finance-document-extract
```

`food-public-checkout` usa `verify_jwt=false` no gateway porque o comprador é anônimo, mas valida origem, Turnstile, rate limit e chama `food_create_public_order` com service role.

## 7. Secrets

Configure no mesmo projeto Supabase:

```text
TURNSTILE_SECRET_KEY
TURNSTILE_REQUIRED=true
CHECKOUT_FINGERPRINT_SALT
PUBLIC_APP_ORIGINS
```

Para PIX automático via Asaas:

```text
ASAAS_API_KEY
ASAAS_ENVIRONMENT=sandbox
ASAAS_WEBHOOK_TOKEN
```

Para leitura assistida de documentos via Cloudflare:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_AI_TOKEN
```

## 8. Frontend

Use a mesma URL e publishable/anon key do FloriWeb em `.env`:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_TURNSTILE_SITE_KEY
```

Os dois frontends podem apontar para o mesmo projeto porque cada um consulta suas próprias tabelas/RPCs.

## 9. Seed opcional

`supabase/seed/seed_demo.sql` grava somente em `food_*`. Use apenas se quiser a loja Central Food no banco compartilhado.

## 10. Validação mínima

Antes e depois da migration, compare:

```sql
select count(*) as flori_stores from public.stores;
select count(*) as food_stores from public.food_stores;
select count(*) as flori_orders from public.orders;
select count(*) as food_orders from public.food_orders;
```

A criação de lojas/pedidos Food deve alterar somente os contadores `food_*`.

Valide também:

- Admin Food A não lê/edita Food B.
- Food frontend não lista lojas Flori.
- FloriWeb continua com a mesma quantidade de lojas antes/depois da migration.
- `food_create_public_order` não executa diretamente com anon key.
- Turnstile inválido é rejeitado.
- requestId repetido não duplica pedido.
