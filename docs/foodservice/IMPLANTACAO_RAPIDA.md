# Implantação rápida — FoodWeb v0.3 no Supabase do FloriWeb

## 1. Instalar e validar localmente

```bash
npm install
npm run validate
```

Node 22.18+.

## 2. Usar o mesmo Project Ref

Use o `SUPABASE_PROJECT_REF`, URL e publishable/anon key já utilizados pelo FloriWeb.

## 3. Backup

Faça backup/snapshot do banco atual antes da primeira migration Food.

## 4. Aplicar as migrations corretas

Instalação nova:

```text
1. supabase/migrations/202608280400_foodservice_shared_database.sql
2. supabase/migrations/202608310900_foodservice_commercial_finance_v030.sql
```

Se a v0.2.x já está aplicada, execute somente a migration v0.3.

Não copie nem execute migrations do projeto FloriWeb como parte desta implantação Food.

## 5. Criar o primeiro Master Food

Autorize uma conta do `auth.users` em `food_platform_admins` conforme `SUPABASE_COMPARTILHADO.md`.

## 6. Publicar Edge Functions Food

```bash
supabase functions deploy food-platform-create-store --project-ref SEU_PROJECT_REF
supabase functions deploy food-public-checkout --project-ref SEU_PROJECT_REF --no-verify-jwt
supabase functions deploy food-finance-document-extract --project-ref SEU_PROJECT_REF
```

Ou use `DEPLOY_SUPABASE_FUNCTIONS.bat`.

## 7. Secrets

Configure Turnstile, origem pública e salt de fingerprint no mesmo projeto.

## 8. Seed opcional

`supabase/seed/seed_demo.sql` grava exclusivamente em `food_*`.

## 9. Teste de isolamento

Confirme que criar loja/produto/pedido no Food altera apenas `food_stores`, `food_products` e `food_orders`. Os contadores correspondentes do FloriWeb devem permanecer iguais.

## 10. Publicar frontend

Depois de `npm run validate`, gere o build e publique no domínio Food. Os dois frontends podem usar o mesmo Supabase sem compartilhar o domínio de negócio.
