
## 0.4.4 - 2026-09-03

- Leitura financeira de boletos com parser deterministico (linha digitavel, valor, vencimento, beneficiario e documento) + IA como complemento.
- Diagnostico visual da leitura sem gravacao automatica no financeiro.
- Contato comercial publico protegido por Turnstile, origem autorizada e rate limit por fingerprint SHA-256.
- WhatsApp de suporte removido das paginas publicas e restrito a owner/admin/Admin Master autenticados.
- CAPTCHA Turnstile adicionado aos logins Admin e Admin Master e encaminhado ao Supabase Auth.
- Checkout reorganizado visualmente e sem suporte interno exposto ao cliente.
- Landing comercial atualizada e favicon FoodWeb diferenciado.
# Changelog

## 0.4.2
- Corrige login/admin quando o build e publicado sem `.env`, usando apenas identificadores publicos do Supabase como fallback.
- Adiciona landing page comercial na raiz oficial do FoodWeb, com demonstracao, lojas publicadas e planos reais.
- Preserva custom domains: a landing aparece somente no host oficial FoodWeb/localhost.
- Adiciona RPC publico `food_get_public_landing_v1` sem expor dados privados.
- Deploy passa a validar ambiente e avisar separadamente sobre Turnstile.

## 0.4.1

- Corrige os valores iniciais de `PlatformSettings` no Admin Master após a inclusão dos campos de cobrança PIX.
- Centraliza os defaults da plataforma em `src/data/platformDefaults.ts` para evitar novos erros quando o tipo evoluir.
- Nenhuma migration adicional é necessária em relação à v0.4.0.

# Changelog

## 0.4.0 — Identidade FoodWeb, PIX manual e financeiro útil

- Redesign público mais profundo para linguagem de delivery/marketplace alimentar.
- Nova identidade FoodWeb e favicon vermelho próprio.
- Busca/categorias sticky, destaques, cards alimentares e sacola fixa no mobile.
- Cobrança ativa simplificada para PIX manual; integração Asaas removida do pacote operacional.
- Admin Master cadastra chave PIX, titular, cidade, WhatsApp e valores dos planos.
- PIX Copia e Cola gerado com o preço real do plano consultado no servidor.
- Renovação e alteração de plano registradas separadamente, com plano anterior auditável.
- Comprovante via WhatsApp obrigatório e confirmação exclusiva do Admin Master.
- Financeiro com resultado gerencial, pendências, ranking de despesas e evolução de seis meses.
- OCR/IA não escolhe Entrada/Saída e não grava lançamento automaticamente.
- Validação server-side de documento por loja, tamanho, MIME e assinatura real do arquivo.
- Checkout reconhece a origem oficial `foodweb.joseluizacama.workers.dev` e health check informa estado da origem.
- Diagnóstico passou a indicar explicitamente que Wrangler não publica Edge Functions do Supabase.
- `food_platform_system_check()` passa a consultar o `pg_cron` real para o agendamento da Demo.
- 43 smoke checks e 45 verificações de fluxo crítico específicas da v0.4.



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

## v0.4.3 - 02/09/2026
- Redesign da vitrine pública com perfil compacto da loja, banner, badges operacionais e cards de produtos maiores.
- Landing comercial reforçada com imagens reais de prévia da plataforma e seções de demonstração.
- CTA de teste do Plano Profissional por 30 dias via WhatsApp configurável no Admin Master.
- WhatsApp comercial e WhatsApp de suporte/Ajuda independentes do número de comprovantes de mensalidade.
- Botão flutuante de ajuda via WhatsApp na landing e nas lojas públicas.
- Migration incremental adiciona `marketing_whatsapp` e `support_whatsapp` em `food_platform_settings` e atualiza a RPC pública sem expor dados de PIX.
- Teste padrão passa de 14 para 30 dias apenas quando a configuração ainda estava no padrão antigo de 14 dias.
