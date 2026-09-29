---
version: 1
slug: "foodservice-completo"
primary_target: "src/App.tsx"
related_targets: ["src/layouts/AdminLayout.tsx","src/layouts/StoreLayout.tsx","src/layouts/MasterLayout.tsx","src/pages/admin/Dashboard.tsx","src/pages/admin/Onboarding.tsx","src/pages/admin/Analytics.tsx","src/pages/admin/Products.tsx","src/pages/admin/ProductForm.tsx","src/pages/admin/Categories.tsx","src/pages/admin/Orders.tsx","src/pages/admin/DeliveryZones.tsx","src/pages/admin/Settings.tsx","src/pages/admin/Plan.tsx","src/pages/store/Home.tsx","src/pages/store/ProductDetail.tsx","src/pages/store/Cart.tsx","src/pages/store/Checkout.tsx","src/pages/store/OrderSuccess.tsx","src/pages/master/Dashboard.tsx","src/pages/master/Stores.tsx","src/pages/master/Plans.tsx","src/pages/master/Diagnostics.tsx","src/pages/master/Mfa.tsx","src/components/ProductCard.tsx","src/components/StoreHeader.tsx","src/components/ui/TurnstileWidget.tsx","src/styles.css"]
---

# Food Service SaaS — full visual pass

Preserve a arquitetura e as regras descritas em PRODUCT.md e DESIGN.md. Esta é uma passada visual, não uma rodada funcional.

## Modos

- Admin: operação rápida, estados claros e densidade controlada.
- Storefront: persuasão orientada a comida + compra rápida no celular.
- Produto: personalização inequívoca, especialmente mínimo/máximo dos grupos.
- Checkout: confiança, total e CTA claros sem esconder Turnstile/campos.
- Master: cockpit comercial, não dashboard decorativo.
- Auth/MFA: seguro, calmo e direto.

## Metas

1. Aparência específica para Food Service, sem clichês de pizzaria/hamburgueria.
2. Imagens, nome, preço, disponibilidade e CTA dominam a vitrine.
3. Reduzir excesso de cards, bordas e hierarquia plana.
4. Unificar espaçamento, radii, inputs, botões, badges e tipografia.
5. Tornar a próxima ação identificável em menos de três segundos.
6. Manter loading/empty/error/success/disabled coerentes.
7. Garantir foco, contraste e touch targets de produção.

## Viewports

- 390x844: compra mobile.
- 768–1024: tablet/operação.
- 1366x768: Admin/Master.

Sem scroll horizontal e sem controles sticky cobrindo conteúdo ou Turnstile.

## Congelamento funcional

Não alterar rotas, services, Supabase, Auth/MFA, regras de preço, opção, entrega, horário, pagamento, checkout, analytics, Turnstile, planos, multiempresa ou variáveis de ambiente.
