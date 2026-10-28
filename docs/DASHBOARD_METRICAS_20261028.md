# Indicadores do painel: causa e correção isolada

## Evidência atual

A captura enviada mostra `PGRST202`: não foi encontrada `public.food_dashboard_metrics_v1(p_store_id)` no cache de schema. Consulta de catálogo em 28/10 confirmou que não existe função com esse nome em `public`. Foram conferidos os tipos das colunas utilizadas de `food_orders`/`food_stores` e os helpers de autorização efetivos, sem ler dados de clientes.

A função já constava da migration ampla `20261025143142_food_inventory_recipe_dashboard_transactions.sql`. Aplicar esse arquivo apenas para corrigir o painel também alteraria ficha técnica, consumo, arquivamento e ajustes de estoque. A nova migration separa exclusivamente a RPC de indicadores, sem essas alterações.

## Entrega

- `supabase/migrations/20261028130144_food_dashboard_metrics_standalone.sql`: função STABLE, sem INSERT/UPDATE/DELETE; agrega a tabela de pedidos da loja inteira, sem limite de 100. Mantém o corpo/semântica da definição já versionada, com guarda para recusar definição futura divergente.
- EXECUTE é revogado de PUBLIC/anon e concedido a authenticated. O corpo exige `auth.uid()` e `food_is_store_admin(p_store_id)`, que também respeita o Master AAL2. Não altera esse helper nem políticas/RLS. `search_path` vazio e referências qualificadas.
- O fuso vem da loja, validado em `pg_timezone_names`. Ausência/fuso inválido usa `America/Sao_Paulo`, como no contrato já existente.
- `src/utils/dashboardErrors.ts` e `Dashboard.tsx`: mensagem em português em lugar de erro SQL cru, mantendo totais indisponíveis até consultar o servidor; nunca calcula financeiro com a página parcial de pedidos.
- CSS do aviso com retorno legível e botão de retry com área mínima de 44 px.
- `scripts/dashboard-metrics-db-test.mjs` e check de CI: 25 verificações PGlite, incluindo 157 pedidos, vazios, dois tenants, permissões reais via roles locais, anônimo, acesso inativo, totais/datas/fuso, repetição e ausência de escrita.
- `scripts/dashboard-error-test.mjs`: nove verificações de mensagens em português e ausência de detalhes internos.
- `qa/dashboard-metrics.config.ts` e spec: ausência de RPC → aviso amigável → retry → totais vindos da resposta em 320/390/768/1366 px.

## Significado dos totais preservado

`ordersTotal` inclui cancelados; recebimentos excluem cancelados. Pendências e processamento excluem entregues, retirados e cancelados. Recebido hoje utiliza a data da confirmação financeira no fuso da loja, independentemente de quando o pedido foi criado. Agendados hoje considera pedidos ativos agendados para a data da loja. São as regras já previstas no código, não uma reconciliação histórica.

## Instalação pendente de revisão específica

A migration foi preparada e testada apenas em isolamento. Não foi aplicada no Supabase compartilhado. O botão de retry passa a mostrar os totais após a instalação revisada da RPC; somente corrigir a mensagem do frontend não instala a função.

Alvo de eventual aplicação: `elttryavkeartoxgdgse`, somente a função `public.food_dashboard_metrics_v1(uuid)` e seus grants/cache. Não aplicar outras migrations, não usar `db push`, não alterar dados, FloriWeb, RLS, estoque ou Edge Functions. Reconfirmar a ausência/definição antes da aplicação. A regra do usuário exige revisão específica antes de alterar produção.

## Risco e rollback

Função SECURITY DEFINER com autorização explícita e filtro por loja. Homologação completa de grants/RLS no ambiente alvo permanece necessária; testes sintéticos não certificam todos os caminhos da plataforma. Grandes volumes podem exigir ajuste de índices em revisão separada, sem acrescentar índices ou custos silenciosamente nesta correção.

Rollback do frontend: reverter o commit. Se a função tiver sido criada exclusivamente por esta migration, revogar acesso e remover somente essa assinatura após confirmar dependências; se já existia, restaurar definição/grants capturados antes da aplicação. Sem delta compensatório de dados: a RPC não grava registros.

Verificação final: typecheck, build com alvo fictício explícito, smoke (177), PGlite (25), mensagens (9) e quatro cenários de navegador aprovados. Nenhuma migration remota foi aplicada.
