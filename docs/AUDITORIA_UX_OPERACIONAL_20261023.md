# Auditoria operacional e consistência do VendeWeb

Data: 23/10/2026

Escopo desta entrega: fluxo de estoque de produtos, telas relacionadas ao catálogo, navegação administrativa por segmento e atualização da fila de pedidos. Revisão de código e validação local; nenhum dado ou banco remoto foi alterado.

## Diagnóstico priorizado

| Tela/fluxo | Evidência antes da correção | Causa | Resultado |
|---|---|---|---|
| Estoque de produtos | Só havia botões de +1/−1. | A tela chamava um PATCH direto em `food_products`, sem operação auditada para ajuste manual. | Campo para definir o saldo físico absoluto, motivo obrigatório, valor arbitrário para entrada/saída e controles de ajuste rápido. RPC bloqueia concorrência com `FOR UPDATE`, valida contra reserva e registra usuário, motivo, saldos anterior/novo e horário. |
| Produto / cadastro | O rótulo “Quantidade disponível” escrevia `stock_quantity`, que é físico. Edições do produto reenviavam o saldo mesmo quando ele não havia sido alterado. | O editor misturava propriedades comerciais e saldo de estoque. | Rótulo “Estoque físico”; edição existente fica somente leitura e aponta para Estoque. O editor preserva físico e reservado sem sobrescrever o saldo. Saldo inicial de produto novo entra na trilha de movimentações. |
| Produtos (mobile) | Exibia `stockQuantity` como “em estoque”, mesmo com unidades reservadas. | Exibição do saldo físico como disponibilidade. | Mostra disponível, físico e reservado em linhas distintas, com a mesma fórmula `físico − reservado` usada na vitrine. |
| Pedidos | Falhas da atualização automática ficavam só no console e o painel continuava parecendo atualizado. | O catch não mostrava estado de erro para o operador. | Mensagem persistente no toolbar informa que os dados podem estar desatualizados e habilita “Tentar novamente”. Atualização segue seletiva, sem recarregar a página. |
| Navegação do lojista | “Entregas” e “Estoque” eram mostrados também em segmentos nos quais não eram usados. | Menu único sem filtro de contexto. | Perfil do segmento é fonte preferencial; entrega aparece nos segmentos físicos e estoque também aparece em qualquer segmento com produto controlado. Verificações de permissão de rota não foram alteradas. |
| Dashboard | Atalhos e tarefas frequentes já estavam destacados. | — | Mantido. |

## Fonte de verdade e transições de pedido

O código existente já define `stock_quantity` como saldo físico e `stock_reserved_quantity` como unidades comprometidas. O saldo disponível é `max(0, físico − reservado)`. A auditoria confirmou esse cálculo no inventário, no checkout e nos componentes de produto da vitrine; não foi aplicada uma correção visual em fórmula que já estava correta.

Reserva e liberação são transacionais e bloqueiam a linha do produto. Cancelamento libera a reserva idempotentemente; confirmação/baixa converte a reserva em baixa física. A nova guarda impede PATCH direto de saldo físico/reservado por sessões `anon` e `authenticated`; as funções transacionais existentes continuam operando como `SECURITY DEFINER`. A migration adiciona um RPC dedicado para ajustes manuais e uma tabela append-only de movimentos com RLS de leitura administrativa.

## Cobertura das telas analisadas

| Área | Avaliação desta rodada |
|---|---|
| Shell, sidebar e seletor de negócio | Revisado; filtro visual por segmento ajustado sem alterar permissões. |
| Dashboard | Atalhos operacionais existentes preservados. |
| Produtos e cadastro/edição | Revisados; corrigida semântica de saldo e prevenção de sobrescrita. |
| Estoque e insumos | Revisado; alteração implementada somente para estoque de venda. Rotinas existentes de insumos e fichas técnicas preservadas. |
| Pedidos | Revisados filtros, rascunhos em lote e recarga silenciosa já existentes; erro de recarga agora fica visível. |
| Categorias, zonas de entrega, financeiro, análises, configurações, plano, onboarding, área de módulos e páginas Master | Inventariadas no código, sem alteração funcional nesta rodada. Precisam de revisão manual de tarefa a tarefa e teste autenticado por papel/segmento. O seletor de lojas do Admin Master continua sem busca/paginação. |

## Pendências conhecidas

- A migration `20261023101500_food_product_stock_adjustments.sql` foi criada e validada em PGlite local, mas não foi aplicada: nenhum projeto Supabase de homologação correspondente estava conectado nesta sessão. Aplicar e validar a migration em homologação antes de ativar o RPC no deploy.
- O teste Playwright público foi executado com Chromium e serviu a landing, mas 46 casos falharam e 1 foi ignorado: axe reportou violações sérias de contraste na página comercial e houve respostas de recurso `ERR_EMPTY_RESPONSE`. A suíte pública não cobre o painel autenticado; a falha de contraste pertence a elementos existentes da landing e não foi introduzida por esta branch.
- Não havia credenciais locais de homologação para testar login, troca de tenant, painel autenticado ou screenshots reais do estoque. Os testes SQL usam tenants e usuários fictícios em PGlite.
- Esta rodada não faz revisão tela a tela de todos os módulos especializados (personal, nutrição, creator, locações e Admin Master). O próximo ciclo deve priorizar esses fluxos e adicionar testes autenticados com contas de homologação.

## Validação executada

- `npm run validate`: concluído com sucesso (smoke, critical flows, segmentos, domínios, PWA, notificações, segurança, integrações PostgreSQL/PGlite, plataforma, provisionamento, typecheck e build).
- `node scripts/product-stock-db-test.mjs`: 15 verificações aprovadas; cobre saldo absoluto 15→50 com reserva 12, disponível 38, adicionar/remover, saldo abaixo da reserva, negativos/frações, motivo obrigatório, repetição idempotente, trilha de auditoria, bloqueio de PATCH direto, isolamento de tenant e sessão anônima.
- `npm run qa:lite`: 47 casos executados (46 falharam, 1 foi ignorado); falhas de contraste e recursos externos registradas acima. A configuração `qa/qa.config.json` foi restaurada após apontar temporariamente o servidor para loopback permitido pelo ambiente.

## Arquivos da mudança

- `src/pages/admin/Inventory.tsx`
- `src/pages/admin/ProductForm.tsx`
- `src/pages/admin/Products.tsx`
- `src/pages/admin/Orders.tsx`
- `src/layouts/AdminLayout.tsx`
- `src/contexts/StoreContext.tsx`
- `src/services/storeApi.ts`
- `src/styles.css`
- `supabase/migrations/20261023101500_food_product_stock_adjustments.sql`
- `scripts/product-stock-db-test.mjs`
- `package.json`
