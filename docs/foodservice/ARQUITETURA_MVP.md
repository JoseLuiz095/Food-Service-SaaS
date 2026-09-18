# Arquitetura — FoodWeb v0.3

## Banco compartilhado, domínios separados

```text
React Food
    │
    ├─ Supabase Auth ─────────────── auth.users (compartilhado)
    │
    └─ REST/RPC Food
       ├─ food_stores
       ├─ food_products
       ├─ food_orders
       └─ food_* RPCs
```

O FloriWeb continua consumindo suas tabelas originais. O frontend Food não possui fallback para RPC/tabela Flori.

## Food Core

```text
food_platform_admins
food_stores ───── food_store_users ───── auth.users
  │
  ├─ food_categories
  │    └─ food_products
  │         ├─ food_product_images
  │         └─ food_product_option_groups
  │                    └─ food_option_groups
  │                         └─ food_option_items
  │
  ├─ food_delivery_zones
  │
  └─ food_orders
       └─ food_order_items
            └─ food_order_item_options
```

## Plano/assinatura

```text
food_plans
food_features
food_plan_features
food_store_subscriptions
food_platform_settings
```

## Edge Functions

```text
food-platform-create-store        JWT obrigatório
food-public-checkout              comprador anônimo / Turnstile
food-finance-document-extract     JWT obrigatório / Cloudflare Workers AI
```

## Segurança

- RLS em todas as tabelas Food operacionais.
- `food_is_store_member` e `food_is_store_admin` trabalham somente com `food_store_users`.
- `food_is_platform_admin` trabalha somente com `food_platform_admins`.
- FKs compostas impedem vínculo entre lojas Food distintas.
- O navegador não determina preço final.
- `food_create_public_order` executa somente via service role.
- `public_request_id` garante idempotência por loja.

## Checkout

```text
Browser
 ↓
food-public-checkout
 ↓ Turnstile/origem/rate-limit
food_create_public_order
 ↓
valida loja/assinatura/horário/opções/entrega/pagamento
 ↓
recalcula subtotal/taxa/total
 ↓
food_orders
 ↓
WhatsApp opcional
```
