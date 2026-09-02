# Food Service SaaS — instruções para agentes/Codex

## Supabase compartilhado

Este produto usa o mesmo projeto Supabase do FloriWeb, porém apenas `auth.users` é compartilhado intencionalmente. Todo dado e permissão do Food Service deve usar namespace `food_*`; Edge Functions usam `food-*`; Storage usa buckets `food-*`.

Nunca grave dados Food em `stores`, `store_users`, `products`, `orders`, `plans`, `store_subscriptions` ou outras tabelas operacionais do FloriWeb.

## Regra de produção

Não aplique migration, altere RLS ou publique Edge Function sem revisar o diff. Neste pacote, a única migration ativa é `202608280400_foodservice_shared_database.sql`.

## Arquitetura

Classifique nova funcionalidade como `core`, `food` ou `shared_future`. Regra específica de pizza, hamburgueria, floricultura ou outra vertical não entra no núcleo.

## Segurança

- Browser usa apenas publishable/anon key.
- Service role, JWTs, secrets e cookies não entram no frontend/log/commit.
- `food_create_public_order` é executada somente via `food-public-checkout`.
- Preço, opções, taxa, horário e disponibilidade são revalidados no PostgreSQL.
- RLS e FKs preservam isolamento por `store_id` nas tabelas `food_*`.
- Admin Master Food usa `food_platform_admins` e MFA/AAL2.

## Multiempresa

Um usuário de `auth.users` pode possuir várias associações em `food_store_users`. Todas as operações do Admin usam a loja selecionada no `AuthContext`.

## Analytics

Apenas telemetria comercial anônima. Não registrar nome, telefone, e-mail, endereço, observação ou mensagem do cliente em `food_analytics_events`.

## Impeccable

Impeccable é exclusivo para refinamento visual/UX. Pode alterar TSX/CSS/responsividade/acessibilidade/microcopy/assets. Não pode alterar `supabase/**`, `src/services/**`, Auth/MFA, payloads, preços, planos, analytics de coleta, Turnstile, variáveis ou infraestrutura.
