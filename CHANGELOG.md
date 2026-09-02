# Changelog


## 0.3.0 — Comercial, marketplace alimentar e financeiro

- Redesign da vitrine para linguagem visual de marketplace/delivery, mobile-first, com busca persistente, categorias sticky, cards horizontais de comida e carrinho fixo no celular.
- Demo convertido em teste grátis de 14 dias com recursos equivalentes ao Profissional.
- Escada comercial simplificada em Essencial, Starter e Profissional.
- Feature gates de Analytics, Financeiro e banner personalizado.
- Limite de imagens e banner reforçados também no PostgreSQL para evitar bypass por API.
- PIX manual da mensalidade com comprovante via WhatsApp e confirmação no Admin Master.
- PIX dinâmico opcional via Asaas, API key server-side, webhook autenticado/idempotente e renovação em `PAYMENT_RECEIVED`.
- Suspensão de mensalidade paga após vencimento + carência configurável e reativação na confirmação do pagamento.
- Financeiro gerencial com entradas, saídas, categorias, pendências e receita automática de pedidos concluídos.
- Upload privado de nota/cupom/boleto/PDF e leitura assistida opcional via Cloudflare Workers AI; lançamento sempre exige confirmação humana.
- Analytics server-side protegido por plano, com taxas de conversão/abandono e produtos mais vistos/vendidos.
- 57 smoke checks e 40 verificações de fluxo crítico.

## 0.2.0 — 2026-08-28

### Supabase compartilhado com isolamento por namespace

- Food Service passa a usar o mesmo projeto Supabase do FloriWeb.
- Apenas `auth.users` é compartilhado entre as verticais.
- Admin Master Food separado em `food_platform_admins`.
- Dados Food migrados para tabelas `food_*`.
- RPCs públicas/administrativas usam prefixo `food_`.
- Edge Functions renomeadas para `food-platform-create-store` e `food-public-checkout`.
- Buckets separados: `food-product-images` e `food-store-assets`.
- Frontend Food não possui fallback para tabelas/RPCs FloriWeb.
- Migration única e aditiva `202608280400_foodservice_shared_database.sql`.
- Proteção de domínio rejeita no Food um domínio já utilizado pelo FloriWeb sem instalar trigger na tabela Flori.
- Documentação e testes atualizados para verificar isolamento entre as verticais.

## 0.1.0 — 2026-08-28

Primeiro MVP Food Service derivado do núcleo SaaS existente.

### Adicionado

- Branding e Demo Food Service.
- `option_groups`, `option_items` e `product_option_groups`.
- `order_item_options` como snapshot normalizado da personalização.
- Opções do tipo variação, escolha, adicional e remoção.
- Status operacionais de pedidos.
- Agendamento opcional e validação server-side de horário.
- Tempo médio + adicional de preparo.
- Troco para pagamentos em dinheiro.
- `features` e `plan_features` para evolução de entitlements.
- RPC consolidada `get_public_storefront_food_v1`.
- Checkout Food Service recalculado no PostgreSQL.
- Seed Central Food.
- Smoke tests e testes de fluxo crítico próprios do novo domínio.

### Preservado

- Auth Supabase, RLS, MFA Master, Demo, planos/assinaturas, domínios, Storage, analytics anônimo, Turnstile, rate limit e idempotência.

### Compatibilidade temporária

- Tabelas legadas `product_variants`, `addons` e `product_addons` permanecem no banco durante o rollout.
- Headers de segurança antigos continuam aceitos internamente durante a transição, sem aparecer na interface.
