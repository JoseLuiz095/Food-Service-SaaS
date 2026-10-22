# Auditoria operacional e refinamentos — 22/10/2026

Frontend publicado em `https://www.vendeweb.com.br`, Worker `foodweb`, versão `f92b8b9c-4788-46a9-ad72-9dad3016d568`.

## Incidente da edição de pedido

**Problema:** ao acrescentar uma unidade de um produto em um pedido existente, a gravação falhava.

**Causa confirmada:** os logs do Supabase registraram dois `POST /rest/v1/rpc/food_update_order_items_v1` com HTTP 404 nas 24 horas anteriores à investigação. O modal `OrderDetailsModal` envia as quantidades por `storeApi.updateOrderDetails`, mas a função não existia no banco publicado. O usuário confirmou que o erro ocorreu na edição do pedido, não na sacola pública. Não havia erro de checkout público nesse intervalo.

A adição pública de Pipoca de Ninho e o incremento de 1 para 2 e 3 unidades foram reproduzidos sem erros de console/rede. O produto foi apenas dado de teste; nenhuma correção utiliza seu nome, ID ou loja.

**Correção:** migration aditiva restaura a RPC e executa alteração de linhas, subtotal, total, troco e reservas em uma transação. Itens existentes usam seu preço snapshot, inclusive opções, em vez de preços atuais do catálogo. Novos produtos precisam pertencer à loja do pedido. Pedido pago, cancelado ou com estoque já consumido não permite edição dos itens. Estoque insuficiente ou troco inválido reverte toda a operação.

Antes de publicar, corrigimos também a interação da migration antiga com o trigger de INSERT: a reserva é liberada e o pedido fica temporariamente `released`, estado que o trigger respeita. A função reserva cada linha uma única vez no final. As migrations antigas permanecem intactas.

**Verificação publicada:** a função foi executada com papel SQL `authenticated` e associação real de proprietário, aumentando uma linha em uma unidade. Asserções confirmaram total pelo preço snapshot e reserva adicional de exatamente uma unidade; toda a transação foi revertida por `ROLLBACK`. Nenhum pedido novo, pagamento ou alteração permanente no pedido de teste foi gerado.

## Inventário das integrações

| Área / arquivos | Dependências e operações verificadas |
| --- | --- |
| `src/lib/supabaseRest.ts`, `src/lib/supabase.ts`, `src/contexts/AuthContext.tsx` | Sessões, recuperação, MFA, cabeçalhos, respostas de erro, usuário e associações em `food_store_users`. Auth é compartilhado com outro produto; dados operacionais não são. |
| `src/services/storeApi.ts`, `src/contexts/StoreContext.tsx` | RPC pública da vitrine; queries, inserts, updates e deletes de catálogo, categorias, opções, entrega e configurações; pedidos e itens; checkout pela Edge Function. Tenant selecionado acompanha as operações administrativas. |
| `src/services/inventoryApi.ts` | Insumos, compras, movimentos, fichas técnicas, alertas, conversão de unidade e contagem física. Triggers de reserva, liberação, consumo e reconciliação inspecionados. |
| `src/services/financeApi.ts` | Categorias e lançamentos financeiros, receitas automáticas, documentos privados, upload e leitura. Valores e relações com pedido/categoria exigem a mesma loja. |
| `src/services/billingApi.ts`, `src/services/platformApi.ts` | Planos, assinaturas, cobranças manuais e confirmações; gestão de lojas e acessos; operações Master e MFA. O preço de assinatura continua no servidor. |
| `src/services/selfServiceSignup.ts`, `businessPresentation.ts` | Criação/uso de conta, solicitação de loja, aprovação e persistência do ramo em `visual_theme`; ramo não ativa módulos. |
| `landingApi.ts`, `publicContactApi.ts`, `supportApi.ts` | Projeções comerciais, contato protegido e suporte autenticado. |
| `analyticsApi.ts`, `interactionTelemetry.ts` | Eventos comerciais e diagnóstico; não adicionar dados pessoais de comprador aos eventos públicos. |
| `pwaNotifications.ts`, `public/sw.js` | Assinaturas, permissões de notificações e envio pela função `food-send-push`; respostas privadas não entram no cache do PWA. |
| `src/modules/` | Configurações opcionais, catálogo, combos versionados, pedidos/subpedidos, recebíveis, aluguel, personalizados e arquivos privados; suite existente de isolamento e transações preservada. |
| Edge Functions `food-*` | Checkout, contato, cadastro, criação de loja, gestão de usuários, push e módulos. Cotação externa `food-delivery-quote-99` existe no código, mas não é utilizada por telas e não foi publicada sem necessidade. |
| Storage `food-*` | Imagens/assets públicos; financeiro e personalizados privados. Políticas por loja, limites, leitura e upload revisados. Não houve alteração de buckets. |

No início da auditoria, as 58 tabelas públicas `food_*` existentes tinham RLS habilitada. Não foram modificadas tabelas operacionais do outro produto, usuários reais, segredos ou buckets.

## Outros problemas reais e correções

| Problema → causa | Correção / validação |
| --- | --- |
| Contagem física e conversão de unidade falhavam → duas RPCs adicionais ausentes | Restabelecer `food_commit_inventory_count` e `food_convert_inventory_unit`. Contagem atômica com documento e movimentos; conversão não dispara reposição fictícia, restaura flags em sucesso/falha e rejeita perda de precisão de saldo/custo/histórico. |
| API permitia autoaprovação/reativação comercial → UPDATE por loja autorizava todas as colunas | Guard de campos comerciais; lojista continua alterando nome, Pix, apresentação e operação. Master precisa de MFA; cron/serviços legítimos continuam funcionando. |
| Permissões Master não exigiam AAL2 no banco → helper verificava apenas associação ativa | Helper passa a exigir MFA/AAL2. A própria associação continua visível antes do MFA, permitindo iniciar a autenticação; `user_metadata` não concede privilégios. |
| Financeiro podia referenciar pedido/categoria de outra loja → FKs simples não validavam tenant | Validação de referências na gravação e proteção contra mover um registro pai já referenciado. Lookup interno limitado ao trigger, com locks, sem conceder leitura de pedidos ao papel financeiro. |
| Sacola podia acumular mais de 99 unidades ao adicionar novamente → limite aplicado só no controle da sacola | Limite comum alinhado à RPC, aplicado na leitura, adição, incremento e detalhe do produto. Um aviso explica a tentativa acima do limite. Reproduzido por teste que falhava antes da correção. |
| Falhas de carregamento pareciam lista vazia ou loading infinito no Master | Estados de erro persistentes com nova tentativa em visão geral, lojas, pagamentos e solicitações; histórico vazio diferenciado de fila de pendências vazia. |
| Movimento reduzido era sobreposto por estilo legado | Override escopado com especificidade suficiente; conteúdo, teclado e feedback continuam disponíveis sem movimento espacial. |
| Categorias inativas tinham contraste insuficiente | Cor passa a herdar o texto principal do tenant; verificação com axe e teclado. |
| Console publicado acusava bloqueio do beacon já injetado pela Cloudflare | CSP passa a autorizar apenas a origem oficial do script de métricas; não se adicionou script novo nem `unsafe-inline` a scripts. Compatibilidade conforme [documentação oficial de CSP da Cloudflare](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/content-security-policies/). |

## Admin Master e animações

- Identificação da seção atual e contexto de gestão de todas as lojas, inclusive celular.
- Modal identifica nome, endereço público e localização da loja; contém foco, aceita Escape quando não está salvando e devolve foco ao botão anterior.
- Busca e filtros têm rótulos/estados acessíveis; resultados vazios orientam a próxima ação.
- Criação de loja começa com cidade/UF vazias; dados existentes são preservados.
- Vitrine: feedback curto de toque/foco/hover dos produtos, transição do título da categoria e abertura do compartilhamento/carrinho móvel. Não há remontagem de campos ou listas para animar.
- Comercial: jornada manual entre vitrine, pedido e operação com transição de 220 ms. Sem autoplay, loops ou bibliotecas novas; `prefers-reduced-motion` respeitado.

## Arquivos alterados

- Funcional: `src/contexts/CartContext.tsx`, `src/pages/store/ProductDetail.tsx`.
- Master: `src/layouts/MasterLayout.tsx`, `src/pages/master/{Dashboard,Stores,Payments,SignupRequests}.tsx`, novo `src/pages/master/master-refinements.css`.
- Movimento: `src/layouts/StoreLayout.tsx`, `src/pages/store/Home.tsx`, `src/components/marketing/experience.css`, novo `src/segments/storefront-motion.css`.
- Testes novos: `qa/tests/modules/{cart-behavior,order-edit,master-ux,motion-ui}.spec.ts`, `scripts/integration-repair-db-test.mjs`, `scripts/tenant-write-guards-db-test.mjs`.
- Execução: `package.json`, `scripts/modules-unit-test.mjs`, `public/_headers` e documentação.
- Banco: duas migrations aditivas listadas abaixo. Nenhuma migration antiga foi reescrita.

## Migrations e segurança de implantação

- `20261022175933_food_operational_rpc_repair.sql`: três RPCs operacionais, duas tabelas de documento de contagem com RLS e índices necessários. Aplicada sem DML sobre dados existentes.
- `20261022175058_food_tenant_write_guards.sql`: proteção comercial, MFA efetivo nas permissões Master e integridade financeira. Aplicada e registrada no histórico pela CLI oficial após expiração da requisição no conector. Funções e quatro triggers confirmados no banco publicado.

Os nomes de versão locais acompanham o histórico efetivamente registrado no Supabase. Não reaplicar as três migrations antigas ausentes individualmente: o reparo novo já contém as definições corrigidas e funciona tanto no estado publicado quanto após uma instalação que já tenha as antigas. Qualquer implantação deve terminar na migration de reparo mais recente.

Reversão: preferir corrigir aditivamente. Não remover as tabelas de contagem após uso, nem reabrir os campos de aprovação/isolamento para contornar uma falha. O frontend pode voltar à versão anterior sem apagar dados ou reverter o reparo da RPC.

## Validação e limites

Resultados:

- `npm run validate`: smoke, 122 verificações críticas, segmentos, domínio, oito testes do PWA, segurança, reparo operacional, TypeScript e build aprovados.
- `npm run test:integrations`: **138 verificações aprovadas** — 94 do reparo e 44 dos guards. Incluem isolamento, MFA/bootstrap, papel financeiro sem leitura de pedidos, referências de pais, precisão e rollback.
- `npm run test:modules`: **58 verificações PostgreSQL aprovadas**, além dos testes de calculadora e Edge Functions existentes. Os 92 arquivos operacionais que continuam protegidos pelo contrato de preservação permanecem iguais à base; a exceção nova é o limite do carrinho, validado por testes próprios.
- `npm run qa:modules`: **60 cenários aprovados na execução consolidada** — 56 na rodada principal e quatro após corrigir o ambiente de teste do CAPTCHA. O servidor reutilizado estava sem `VITE_TURNSTILE_SITE_KEY=local-test-sitekey`; cadastro e combo bloqueavam corretamente o envio. Repetidos os quatro casos com a chave fictícia, todos passaram. Nenhuma proteção de produção foi removida para fazer testes passarem.
- Cobertura de navegador: sacola anônima/autenticada, adição/incremento/redução/remoção/reload, limite 99, produtos sem saldo com agendamento, múltiplos produtos e dois tenants; edição de pedido e total atualizado; erros/retry do Master; foco, axe e movimento reduzido; telas públicas, Admin e Master em celular/tablet/desktop.
- Inspeção de screenshots Master e vitrine em 390/1366 px; experiência comercial também em 320/768/1024/1440 px. Sem novos erros de JavaScript nos cenários de sucesso.
- `git diff --check`: aprovado.
- Produção: além da edição transacional revertida, testes dos guards de acesso comercial, Master AAL1/AAL2 e referência financeira cruzada passaram com `ROLLBACK`, preservando os registros reais.
- Após publicação, a sacola completou adicionar → aumentar → recarregar → diminuir → remover, sem requests Supabase com erro, exceções JavaScript ou overflow. Os bundles publicados correspondem ao build aprovado.

Não há script de lint configurado; TypeScript e build são executados pelo fluxo existente. Testes de navegador usam backend simulado para não criar vendas, cobranças ou contas reais. A edição real publicada foi verificada em transação revertida, conforme descrito acima.

Pendências externas: [proteção de senhas vazadas do Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) está desativada globalmente no projeto compartilhado; ativação depende de configuração/plano e avaliação do outro produto. Instalação/push em aparelhos físicos e benchmarks completos de desempenho não fazem parte da evidência automatizada desta entrega. Alertas de índices/policies legadas exigem análise do uso real, sem alterações indiscriminadas para limpar o advisor.

O bloqueio de CSP do beacon foi corrigido e o cabeçalho publicado confirmado. Este ambiente de validação ainda rejeita o TLS de `static.cloudflareinsights.com`: Chrome e Schannel reportam CA não confiável; a inspeção da conexão apresentou certificado emitido por `Example Root CA`, uma CA privada de interceptação. É uma limitação externa deste ambiente para o script de métricas, sem erro nas requisições do app/Supabase. Não foi desativada a validação TLS nem instalada uma CA para contornar o bloqueio. Conferir esse recurso em uma rede/dispositivo sem a interceptação antes de declarar o console externo integralmente limpo.
