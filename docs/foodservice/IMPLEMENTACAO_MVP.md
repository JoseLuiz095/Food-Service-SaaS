# Implementação — FoodWeb v0.3

## Mudança da v0.1 para v0.2

A v0.1 assumia um projeto Supabase separado. A v0.2 foi adaptada para o **mesmo Supabase do FloriWeb**, sem reutilizar suas tabelas operacionais.

Apenas `auth.users` é compartilhado. Todo o restante do Food Service usa namespace próprio.

## Objetos principais

```text
food_platform_admins
food_stores
food_store_users
food_plans
food_store_subscriptions
food_platform_settings
food_store_domains
food_categories
food_products
food_product_images
food_option_groups
food_option_items
food_product_option_groups
food_delivery_zones
food_orders
food_order_items
food_order_item_options
food_analytics_events
```

Tabelas de compatibilidade `food_product_variants`, `food_addons` e `food_product_addons` permanecem temporariamente para reduzir o custo de adaptação do frontend herdado.

## Personalização de produto

```text
food_products
  └─ food_product_option_groups
       └─ food_option_groups
            └─ food_option_items
```

Tipos: `variant`, `choice`, `addon`, `removal`.

## Arquivos ativos Supabase

```text
supabase/migrations/202608280400_foodservice_shared_database.sql
supabase/migrations/202608310900_foodservice_commercial_finance_v030.sql
supabase/functions/food-platform-create-store/index.ts
supabase/functions/food-public-checkout/index.ts
supabase/functions/food-finance-document-extract/index.ts
supabase/seed/seed_demo.sql
```

Arquivos Supabase antigos do FloriWeb foram removidos deste pacote. A árvore `supabase/` contém apenas objetos Food Service.

## Frontend

`src/services/storeApi.ts`, `platformApi.ts`, `analyticsApi.ts` e `AuthContext.tsx` usam somente endpoints `food_*` para o domínio Food. O frontend não faz fallback para `stores`, `products`, `orders` ou RPC pública do FloriWeb.

## Admin Master

`food_platform_admins` é separado de `platform_admins`. Uma conta pode ser autorizada nos dois produtos usando o mesmo `auth.users.id`, mas a permissão não é herdada automaticamente.

## Evolução v0.3

A v0.3 adiciona planos comerciais, cobrança PIX, Financeiro gerencial e leitura assistida de documentos. Permanecem no roadmap: pizza meio a meio, combos avançados, cupons, estoque automático, ficha técnica/CMV, fiscal NF-e/NFC-e e marketplaces.
