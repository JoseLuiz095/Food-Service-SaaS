# Configuração Supabase — FoodWeb v0.4.1

O FoodWeb usa o mesmo projeto Supabase do FloriWeb, mas todas as tabelas e funções de negócio usam namespace `food_*`.

## 1. Banco

Se sua instalação já está na v0.3.x, execute somente:

```text
supabase/migrations/202609020800_foodweb_v040_manual_pix_finance_visual.sql
```

Depois:

```text
supabase/VALIDAR_V040.sql
```

## 2. Turnstile no Cloudflare

No widget Turnstile, mantenha os hosts existentes e adicione:

```text
foodweb.joseluizacama.workers.dev
```

Use apenas o hostname, sem `https://`.

## 3. Frontend

No `.env`:

```env
VITE_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA
VITE_TURNSTILE_SITE_KEY=SUA_SITE_KEY
VITE_APP_ENV=production
VITE_ANALYTICS_ENABLED=true
```

## 4. Secrets das Edge Functions

No Dashboard do Supabase, configure os secrets das Edge Functions:

```text
TURNSTILE_SECRET_KEY=SEU_SECRET_TURNSTILE
TURNSTILE_REQUIRED=true
PUBLIC_APP_ORIGINS=https://foodweb.joseluizacama.workers.dev
```

Recomendado também:

```text
CHECKOUT_FINGERPRINT_SALT=VALOR_ALEATORIO_LONGO
```

O `TURNSTILE_SECRET_KEY` nunca deve ser colocado no `.env` do Vite.

### Financeiro com leitura assistida

Opcional:

```text
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_AI_TOKEN=...
```

## 5. Publicar Edge Functions

Atenção: `npx wrangler deploy` publica somente o frontend.

Execute:

```bat
DEPLOY_SUPABASE_FUNCTIONS.bat
```

ou manualmente:

```bash
npx supabase@2.116.0 functions deploy food-platform-create-store --project-ref SEU_PROJECT_REF
npx supabase@2.116.0 functions deploy food-public-checkout --project-ref SEU_PROJECT_REF --no-verify-jwt
npx supabase@2.116.0 functions deploy food-finance-document-extract --project-ref SEU_PROJECT_REF
```

## 6. Admin Master

Acesse:

```text
/admin-master/planos
```

Cadastre:

- preços Essencial, Starter e Profissional;
- chave PIX;
- titular;
- cidade;
- WhatsApp para comprovantes;
- carência após vencimento.

A cobrança v0.4 é somente manual.

## 7. Diagnóstico

Acesse:

```text
/admin-master/diagnostico
```

O checkout deve mostrar:

```text
Turnstile: configurado
proteção obrigatória: sim
origem atual: autorizada
```

O agendamento da Demo passa a consultar o `pg_cron` real em vez de retornar `Verificar` de forma fixa.

## 8. URL de recuperação de senha

Como Auth é compartilhado com FloriWeb, não remova as URLs do FloriWeb.

Em Authentication > URL Configuration > Redirect URLs, mantenha as existentes e inclua:

```text
https://foodweb.joseluizacama.workers.dev/admin/redefinir-senha
```

Para desenvolvimento:

```text
http://localhost:5173/admin/redefinir-senha
```
