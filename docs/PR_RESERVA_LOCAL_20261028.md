# Preservar o local da reserva ao editar itens de pedido

Ao editar quantidade de um pedido reservado em um ponto, a RPC instalada libera a reserva no ponto correto e refaz a reserva no principal. A correção mantém `food.order_stock_location` durante toda a edição e restaura o contexto anterior. Por exemplo, editar 1→2 no ponto mantém duas unidades reservadas nesse ponto, sem movimentar o físico ou o principal.

## Escopo

- Classificação `food`, compartilhada pelos ramos que usam pedidos/estoque Food.
- Migration nova substitui apenas `food_update_order_items_v1(uuid,jsonb)`; mantém assinatura e ACL, preços, opções salvas, bloqueios financeiros e regras comerciais da baseline.
- Valida local ativo da mesma loja antes de liberar a reserva; legado sem local usa o principal. Serviço sem controle continua editável sem local cadastrado.
- Preflight compara o corpo efetivo normalizado contra a baseline/correção conhecidas e aborta em drift. Rollback possui guarda equivalente.
- O #100 foi integrado à main `737ae4a`; esta branch recebeu a main por merge, preservando histórico. A composição com a migration integral do #100 foi verificada localmente. A consulta remota atual ainda mostra reserva limitada ao físico e ausência dessa migration no histórico. Não corrige saldo real, não repete saída nem cria ledger histórico.

## Arquivos

**Novo:**

- `supabase/migrations/20261028105112_food_order_item_reservation_location.sql` — única migration candidata.
- `scripts/order-item-location-db-test.mjs` — regressão PGlite.
- `scripts/order-item-location-postgres-test.mjs` — runner nativo de duas sessões, ainda sem execução bem-sucedida neste executor.
- `scripts/fixtures/order-location-remote-baseline.json` — corpos/ACL/schema de referência, sem registros reais.
- `scripts/fixtures/order-location-guards-baseline.json` — helpers de autorização, guards e inventário de triggers efetivos.
- `qa/reserva-local.config.ts` — alvo fictício explícito e servidor isolado.
- `qa/tests/modules/reservation-baseline-audit.spec.ts` — edição por teclado em cinco larguras e coleta axe.
- `qa/tests/modules/diagnostico-mobile.spec.ts` — coleta atual das rotas e estados adversos públicos.
- `docs/REVISAO_INCREMENTAL_20261028.md` — matriz de achados, jornada, disponibilidade, papéis, dependências e resultados.
- `docs/qa/reserva-local-20261028/RESULTADOS.md` e `baseline-mobile.json` — evidência sintética sanitizada.
- `docs/rollback/food_order_item_location.sql` — rollback revisável, testado somente em PGlite.
- `docs/PR_RESERVA_LOCAL_20261028.md` — esta descrição, preparada localmente.

**Modificado:** `.github/workflows/vendas-estoque.yml`, adicionando regressão PGlite e o runner nativo ao job existente.

**Removido:** nenhum. `sources/` e checkouts antigos preservados. Sem nova dependência na aplicação/lockfile. O runner nativo reutiliza as versões já instaladas pelo workflow: `embedded-postgres@17.9.0-beta.17` e `pg@8.16.3` em runtime externo.

## Validação executada

- Coleta inicial na main `72b20a2`; antes da publicação, main reconsultada em `737ae4a7d09df92fe6cc078153bc656b2a432420`, com #100 integrado. A atualização foi incorporada sem conflito.
- Corpo remoto da função de edição equivalente ao SQL histórico local após normalizar whitespace; as três RPCs de inventário/ficha/métricas continuam ausentes no catálogo público.
- `node scripts/audit-order-location-db.mjs`: oito verificações reproduzem o defeito antigo.
- `node scripts/order-item-location-db-test.mjs`: 68 verificações aprovadas; quantidade e opções preservadas, entrega/retirada, cancelamento pelo trigger, falha/rollback, retry, contexto externo, legado, serviço, tenant/anônimo e preservação de ACL.
- `FOOD_RESERVATION_CANDIDATE_SQL=/tmp/vendeweb-pr100-reservation.sql node scripts/order-item-location-db-test.mjs`: mesmas 68 aprovadas, usando cópia da migration do head #100 apenas em PGlite descartável.
- Typecheck, build com alvo fictício, smoke (177), fluxo crítico (122), vendas/estoque (11), reparo operacional (94) e guards tenant (44): aprovados.
- Playwright: seis cenários de edição/regressão; oito de coleta de diagnóstico (95 observações em 19 rotas nas cinco larguras, mais vazio/erro/loading). O cenário de erro total foi corrigido e reexecutado separadamente porque o fallback mascarava a primeira fixture.
- Sem overflow/erro JS nas 95 observações. Axe encontrou problemas atuais de calendário, contraste e rótulo; regiões main duplicadas também foram registradas. Não é aprovação WCAG.
- SQL de rollback restaurou o corpo anterior exatamente; reaplicação validada em PGlite. `git diff --check` e sintaxe dos runners aprovados.

## Bloqueios e próximos critérios de liberação

- PostgreSQL nativo: o executor atual é root e não permite executar como usuário sem privilégios (`runuser: cannot set groups`). O runner de concorrência foi preparado e incluído no CI, mas não passou aqui. Não há resultado remoto deste candidato: a branch ainda não foi publicada.
- O teste usa schema mínimo e stub de reconciliação de receita. Antes de aplicar remotamente, homologar com todos os triggers/políticas efetivos, revisar grants/RLS e obter resultado real de duas sessões.
- A auditoria completa de estados admin, Android/iOS, zoom, modais/foco e demais segmentos permanece para os próximos incrementos.
- `ANALISE.md` não foi localizado. A auditoria Doce Lua de 27/10 foi recuperada; a integral Fitness/IMP-01–IMP-05 não foi recuperada. Nenhuma capacidade Impulso foi incorporada.

## Impacto e reversão

Doce Lua: novas edições deixam de deslocar a reserva do ponto para o principal após a aplicação futura revisada. Outros ramos que usam o mesmo estoque recebem a mesma correção; serviços sem estoque permanecem sem reserva/local obrigatório.

Risco principal: substituição de função SECURITY DEFINER e composição com triggers existentes. Nenhum grant é ampliado. A baseline guard impede sobrescrever edição desconhecida. O histórico real não é reparado automaticamente.

Reversão: interromper operacionalmente novas edições, revisar o diff/alvo e, somente se indispensável, usar `docs/rollback/food_order_item_location.sql`. O rollback reintroduz o defeito anterior e não desfaz dados ou movimentos. Não aplicar ajustes compensatórios sem evidência.

## Publicação

O usuário autorizou publicar as branches e abrir os PRs em rascunho, incluindo os previews automáticos do Cloudflare. Essa autorização não inclui aplicar migrations, fazer merge ou publicar funções/banco em produção. Nenhuma migration remota, RLS, Edge Function, pedido, saldo ou objeto FloriWeb foi alterado.
