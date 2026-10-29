# Estoque e locais — revisão de 29/10/2026

| Achado | Evidência atual | Prioridade | Arquivos | Correção | Dependência | Aceite |
| --- | --- | --- | --- | --- | --- | --- |
| Dois itens de menu para a mesma operação | `AdminLayout` separava Estoque de Locais de estoque | P1 UX | AdminLayout, App, InventoryWorkspace | Uma entrada Estoque e locais | Modo de estoque já existente | Um item no menu; rota antiga continua válida |
| Consulta global antes do local de operação | Inventory exibia totais e encaminhava ao local para ajustar | P1 UX | InventoryWorkspace, Inventory | Em lojas com múltiplos locais, abrir diretamente os saldos por local | RPC de modo existente | Estoque simples mantém entrada direta de produtos; múltiplo abre local |
| Links internos recarregavam o documento | Inventory usava `a href` para locais/produtos | P1 UX | Inventory | Navegação React com URL da visão | Nenhuma | Alternar sem nova navegação de documento |
| Alternar telas perdia contexto | Componentes estavam em rotas independentes | P2 UX | InventoryWorkspace | Manter visões visitadas montadas enquanto esta área permanecer aberta; nova instância por loja | Nenhuma | Busca e local preservados ao alternar; URL suporta voltar/avançar |

## Fatos e limites

Antes desta edição, a `main` remota foi reconfirmada em `32b20e026d6a77e145a6d14c6122f89369e01083`, igual à base deste worktree isolado. Ela contém os merges #100 e #118 e descende de `72b20a2539376f54f86b8e1512e86a057b65191d`. O #100 está integrado no GitHub; sua antiga descrição como rascunho não é o estado atual. Os demais checkouts, incluindo alterações locais, foram preservados. Isso não comprova aplicação de migrations nem versão servida em produção.

Proposta de UX implementada: uma área, com Saldos por local e Produtos e insumos. O cadastro de locais/pontos e suas ações continuam no painel existente, com QR, links e comparação entre locais. Para modo simples, Locais e pontos permite a ativação já existente; nenhum modo é ativado automaticamente. Dados, saldos, reservas, permissões e operações permanecem nos services e RPCs existentes. Classificação: `core`, compartilhado pelos segmentos que já usam estoque; serviços sem estoque continuam com a navegação atual.

Manter as visões montadas preserva rascunhos enquanto se alterna dentro da área. Sair da área ou recarregar o navegador mantém o comportamento anterior; não foi criado armazenamento persistente de ajustes. A tela mantém o botão Atualizar para consultar saldo do servidor. A revalidação/idempotência de gravação permanece no backend existente.

## Validação local

- Typecheck, build, smoke (177) e fluxo crítico (122) passaram.
- 6 regressões do painel de produtos e 16 testes de área unificada/transferência passaram: navegação sem recarga, seleção/busca preservadas, URL antiga, modo simples, falha de consulta recuperável, teclado e navegação voltar/avançar.
- Larguras 320, 390, 768 e 1366 px na área unificada, além das larguras existentes do painel/transferência. Axe na navegação sem violações; captura sintética de 390 px revisada visualmente. Não houve teste em aparelhos Android/iOS físicos.
- PGlite de transferência em lote: 47 verificações, incluindo reservas, retry, atomicidade e fronteiras de loja. Nenhum banco remoto usado nesses testes.

## Arquivos e reversão

Novos: `src/pages/admin/InventoryWorkspace.tsx`, `inventory-workspace.css`, `qa/inventory-workspace.config.ts`, `qa/tests/modules/inventory-workspace.spec.ts` e este documento. Modificados: `src/App.tsx`, `src/layouts/AdminLayout.tsx`, `src/pages/admin/Inventory.tsx`, `StockLocations.tsx` e `qa/tests/modules/inventory-command.spec.ts`. Nenhum arquivo removido, nenhuma migration, dependência nova ou alteração em `sources/`.

Risco: mudança da entrada padrão para lojas com múltiplos locais e montagem das duas visões após visita. Aceite de produto pendente: avaliar com tarefas reais se futuramente os totais de produtos devem virar apenas resumo; esta entrega preserva insumos e fichas técnicas completos.

Rollback: reverter o commit deste PR restaura menu/rotas anteriores, sem ação no banco. Não há alteração de estoque nem deploy de Supabase nesta entrega. Checks do GitHub devem ser conferidos no próprio PR; validação local não equivale a deploy atual.
