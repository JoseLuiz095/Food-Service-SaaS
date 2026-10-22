# Validação VendeWeb — 22/10/2026

Endereço oficial: **https://www.vendeweb.com.br**. Loja preservada: **https://www.vendeweb.com.br/doce-lua**.

## Resultado e publicação

Frontend publicado no Worker `foodweb`, versão `48a1d724-4e46-4ece-96b1-54b2f35257d2`.
As funções públicas `food-public-checkout`, `food-public-contact`, `food-public-self-signup` e `food-modules-public` foram republicadas para aceitar o novo domínio. Preflights do domínio oficial passaram; o checkout confirmou CAPTCHA configurado e origem permitida.

Foram aplicadas as duas migrations de segurança abaixo. Não houve alteração de dados de produtos, estoque, pedidos, preços, Pix, horários, entrega ou retirada. Nenhum pedido, pagamento ou conta de teste foi criado em produção. Não houve alteração de DNS nesta entrega.

## Alterações por área

| Área | Arquivos principais | Resultado |
| --- | --- | --- |
| Domínio e compartilhamento | `src/lib/brand.ts`, `src/lib/config.ts`, `src/utils/storefrontRoute.ts`, `src/App.tsx`, `src/main.tsx` | Domínio canônico centralizado; aliases conhecidos preservam caminho, parâmetros e fragmento. |
| Links públicos e autenticação | `src/pages/store/ProductDetail.tsx`, `src/pages/master/Stores.tsx`, `src/pages/admin/ForgotPassword.tsx` | Compartilhamento de produto, QR Code, convites e recuperação usam a origem correta; produto não compartilha parâmetros privados da página. |
| Carregamento | `src/contexts/StoreContext.tsx`, `src/pages/store/Landing.tsx` | Cadastro e módulos não buscam uma loja inexistente; demonstração comercial separada em bundle. |
| Comercial e cadastro | `src/components/marketing/CommercialSegments.tsx`, `BusinessJourneyPreview.tsx`, `experience.css`, `src/pages/store/SelfSignup.tsx` | Prévia por ramo, etapas interativas e nome da loja em tempo real; animação curta, teclado e movimento reduzido. |
| Checkout | `src/pages/store/Checkout.tsx`, `src/components/checkout/checkout-refinements.css` | Separação do texto de retirada, cartões de pagamento acessíveis e espaçamento entre produto e preço. Cálculos, envio e regras operacionais preservados. |
| PWA | `public/sw.js`, `public/manifest.webmanifest`, `public/assets/vendeweb-*.png`, `src/services/pwaNotifications.ts`, `index.html`, `public/_headers` | Ícones PNG e maskable; cache limitado a recursos públicos; navegações privadas não sobrescrevem o shell; notificações só abrem URLs da mesma origem. |
| Segurança de build | `scripts/check-env.mjs`, `scripts/public-env-validation.mjs`, `package.json`, `package-lock.json` | Build rejeita segredos em variáveis públicas; Vite e Wrangler atualizados; auditorias de dependências sem vulnerabilidades conhecidas na execução. |
| Publicação e documentação | `.github/workflows/deploy-supabase-functions.yml`, `DEPLOY_SUPABASE_FUNCTIONS.bat`, `README.md`, documentos desta entrega | Publicação manual inclui módulos; configuração do domínio e testes documentados. |

Nenhuma dependência nova de animação foi adicionada. Não há autoplay nem movimentos necessários para usar a interface. As prévias são identificadas como exemplos e não geram vendas ou reservas.

## Migrations aplicadas

1. `20261022144035_food_internal_rpc_permissions.sql`: retira acesso direto de `anon` e `authenticated` às funções auxiliares `food_seed_financial_categories` e `food_get_public_storefront_v1_base`. Wrappers e triggers mantêm execução pelo proprietário; `service_role` continua autorizado.
2. `20261022144600_food_public_store_projection.sql`: restringe os campos públicos da loja, excluindo dados de cobrança e campos internos. Retira `internal_code` do produto; preserva campos comerciais, preços e regras de encomenda.

Ambas usam transação, sem apagar ou renomear tabelas. Não reabrir as permissões públicas como rollback automático. Em eventual regressão de apresentação, corrigir a projeção por migration adicional, mantendo a remoção de dados privados. O frontend pode voltar à versão anterior pelo histórico do Cloudflare; a política de cache deve permanecer restrita.

## Validações executadas

- `npm run validate`: aprovado; 177 verificações smoke, 122 verificações críticas, segmentos, domínio, oito cenários de service worker, segurança SQL/variáveis públicas, typecheck e build.
- `npm run test:modules`: 58 verificações PostgreSQL aprovadas, incluindo isolamento, snapshots, versionamento, cancelamentos, urgência, estoque e calculadora 3D.
- `npm run qa:modules`: **44 testes aprovados na rodada final completa (5 minutos)**, com regressão de checkout, compartilhamento/redirecionamentos, PWA e experiência responsiva. Uma falha inicial de codificação UTF-8 no HTML simulado do próprio teste foi corrigida antes dessa rodada final.
- `npm audit`, `npm audit --omit=dev` e auditoria da pasta `qa`: sem vulnerabilidades conhecidas no momento da execução.
- `git diff --check`: aprovado.
- Inspeção de telas em 320, 768, 1024 e 1440 px, teclado, movimento reduzido e axe na experiência comercial. Varredura de rotas públicas, Admin e Master em 320, 768 e 1366 px com backend simulado.
- Produção: comercial, cadastro e login renderizaram sem erro de JavaScript ou overflow; Doce Lua carregou produtos e preços no celular. Apex e Worker antigo chegaram ao `www`, preservando caminho, parâmetros e fragmento. Manifesto com três ícones PNG e service worker com `no-store` confirmados. O domínio respondeu HTTP 200 e os bundles referenciados correspondem ao build final aprovado.

A comparação da resposta pública da Doce Lua antes/depois preservou os hashes de regras do catálogo (`7d2f377b57a9a56e690c98d7471e589a`), produtos sem campo interno (`aedbb7f4335dfddcbe921bc11f254fe2`) e configurações operacionais (`5e3d528fe8f3db45f069027ef06ad6ed`). As permissões foram verificadas também no banco publicado.

## Segurança: limites e pendências

- Todas as 58 tabelas públicas `food_*` têm RLS habilitado. Os testes cobrem cenários de isolamento dos módulos; isso não equivale a um teste de intrusão completo de todas as permissões e integrações.
- A proteção de senhas vazadas do Supabase está desativada no projeto compartilhado. Avaliar e ativar no painel Auth conforme disponibilidade do plano: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection. Não foi alterada uma configuração global que também atende outro sistema.
- O advisor ainda aponta índices de chaves estrangeiras e políticas permissivas sobrepostas. Exigem análise de consultas e uso real antes de criar índices ou alterar RLS; nenhum índice foi removido nem política compartilhada modificada nesta entrega.
- Conferir no Supabase Auth a allowlist do domínio oficial e no Turnstile os hostnames `www.vendeweb.com.br` e `vendeweb.com.br`. CORS e configuração de CAPTCHA no checkout foram validados; não foi enviado e-mail real de recuperação nem concluído cadastro em produção.
- Instalação e push precisam de teste em aparelhos físicos, especialmente iOS. Uma instalação no domínio antigo não transfere sessão, permissões ou armazenamento para o domínio novo; instalar pelo novo endereço e autorizar notificações nele.
- O CSS global ainda é volumoso. A entrega evita bibliotecas adicionais e separa a demonstração comercial, mas não inclui uma reestruturação geral de estilos nem um benchmark Lighthouse de produção.

## Como testar manualmente

1. Abrir o endereço oficial e alternar todos os ramos e etapas da prévia. Usar Tab/Enter e movimento reduzido do sistema.
2. Abrir o cadastro, escolher o ramo e digitar o nome: conferir a prévia, manter campos legíveis em celular e concluir somente com uma conta de teste autorizada.
3. Na Doce Lua, compartilhar a loja e um produto e ler o QR Code: links novos devem começar por `https://www.vendeweb.com.br/doce-lua`.
4. Montar carrinho, alternar retirada/delivery e Pix/dinheiro; conferir instruções, preços, total e troco. O teste automatizado cobre envio simulado; venda real depende de operação autorizada da loja.
5. Abrir um link antigo sem carrinho ativo: deve migrar para o `www`. Carrinhos, rascunhos, confirmações de pedidos e callbacks PKCE com verificador local permanecem na origem anterior para preservar a compra em andamento.
6. Instalar o PWA pelo novo domínio, autorizar notificações e conferir atualização. Offline mostra o shell quando disponível; não cria pedidos offline nem guarda respostas privadas no cache do service worker.
7. Em uma loja de teste, ativar eventos/combos em **Módulos opcionais**; na Doce Lua, manter os módulos desativados. Seguir `docs/TESTAR_MODULOS_OPCIONAIS.md` para preço por loja, recebíveis, urgência, versionamento e cancelamentos.

Capturas desktop/mobile: `deliverables/vendeweb-validacao-20261022/` na raiz do workspace, fora do repositório. Exemplos: `comercial-320.png`, `cadastro-320.png`, `checkout-320.png` e versões de 1440 px.
