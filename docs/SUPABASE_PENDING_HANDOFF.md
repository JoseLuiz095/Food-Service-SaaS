# SOLICITAÇÃO SUPABASE — VENDEWEB: ESTOQUE POR LOCAL E DISPONIBILIDADE

Este handoff é para o operador de uma homologação identificada. **A migration `20261025143142` não está aplicada no projeto consultado**. Não executar em produção sem revisão do histórico, backup e autorização específica.

## Atualização em 26/10/2026 — estoque por local

Após autorização explícita, as migrations `20261026112835_food_location_stock_fast_flow.sql` e `20261026115308_food_stock_location_balance_bootstrap.sql` foram aplicadas ao projeto de produção `elttryavkeartoxgdgse` (`floriweb01`) pelo conector Supabase e constam no histórico remoto nas versões correspondentes. A segunda corrigiu quatro pares de saldo por local ausentes usando somente saldos zero; o total faltante agora é zero e os saldos físicos/reservados existentes foram preservados. Assinaturas, grants, RLS, triggers e linhas de saldo foram conferidos. Após a correção, o site registrou duas chamadas de transferência `POST 200` e oito movimentos persistidos na Doce Lua. Ainda faltam cenários controlados de fixture isolada, erros negativos e concorrência. Veja [`SOLICITACAO_SUPABASE_TRANSFERENCIA_LOTE.md`](SOLICITACAO_SUPABASE_TRANSFERENCIA_LOTE.md) para evidências e limitações.

Leitura remota em 25/10/2026 pelo conector Supabase: o projeto `elttryavkeartoxgdgse` aparece como `floriweb01`, ativo, com apenas a branch padrão `main`; não foi identificada homologação separada. O histórico remoto termina em `20261024005608_food_location_initial_balance_upsert`, enquanto os arquivos locais usam versões diferentes para parte do estoque multilocal. `food_adjust_product_stock_v1(uuid,uuid,text,numeric,text,uuid)` e `food_convert_inventory_unit(uuid,uuid,text)` existem; `food_update_inventory_item_v1`, `food_save_product_recipe_v1` e `food_dashboard_metrics_v1` não existem. Também não existem `food_stock_mode_v1(uuid,boolean)` e `food_stock_preferences`, definidos na migration local anterior `20261025090000_food_stock_simple_mode.sql`. A consulta às colunas confirma `food_orders.payment_received_at`, mas não `food_product_recipe_items.active`, `food_inventory_order_consumptions.order_quantity_at_target` ou `food_product_stock_movements.requested_quantity`. Essas consultas foram somente leitura; **nenhum dado ou esquema remoto foi alterado**.
## Atualização de 25/10/2026

O projeto publicado confirmado pelo conector é **`elttryavkeartoxgdgse` / `floriweb01`**, branch `main` de produção. A lista de projetos conectados contém somente esse projeto e `Academia` (não relacionado); **nenhuma homologação VendeWeb está conectada**. Esta mudança não foi aplicada remotamente. O histórico remoto termina em `20261024005608_food_location_initial_balance_upsert`; os arquivos locais posteriores ainda não constam na lista de migrations remotas. Os nomes/versões das migrations multilocal já executadas no remoto diferem dos nomes dos arquivos locais; antes de qualquer deploy, compare o SQL efetivo e o schema, não apenas o nome da versão.

Na sequência originalmente proposta, `20261025200720_food_recipe_reconciliation_lock_safety.sql` depende da migration transacional abaixo. O fluxo fast-flow de estoque por local foi aplicado separadamente como `20261026112835_food_location_stock_fast_flow.sql`, e o bootstrap de saldos ausentes como `20261026115308_food_stock_location_balance_bootstrap.sql`; eles criam os contratos abaixo sem alterar saldos físicos históricos:

| Contrato | Entrada | Retorno/efeito |
| --- | --- | --- |
| `food_get_public_location_availability_v1` | `p_store_id uuid,p_pickup_location_id uuid` | Array `{product_id,available,available_elsewhere}` somente de produtos físicos ativos. `available = físico − reservado` do ponto público selecionado; nenhum ID/endereço de estoque privado. |
| `food_get_location_sales_today_v1` | `p_store_id uuid,p_location_id uuid` | Array `{product_id,sold_quantity,returned_quantity,net_sold}` do dia na timezone da loja, apenas para administrador do tenant. |
| `food_change_location_stock_v1` | `p_store_id,p_product_id,p_location_id uuid,p_mode add\|remove\|set,p_quantity integer,p_idempotency_key uuid` | Ajuste relativo ou absoluto sob lock do produto e do saldo, com ledger e retry seguro. |
| `food_transfer_location_stock_batch_v1` | `p_store_id,p_from_location_id,p_to_location_id uuid,p_items jsonb [{product_id,quantity}],p_idempotency_key uuid` | `{items:[{product_id,from_stock,to_stock}],replayed}`; todos os produtos em uma transação, na ordem estável, sem aumento do total. |

Triggers novos em `food_orders` e `food_order_items` exigem ponto público válido para pedidos de retirada do site quando há pontos publicados; conferem o estoque associado e bloqueiam inclusive pedidos agendados que tentem usar saldo de outro local. Outro trigger impede desativar um estoque com saldo, reserva, ponto de retirada ativo ou pedido pendente. Lojas sem ponto público mantêm o comportamento de estoque principal legado. O futuro pedido para retirada sem saldo local **não é prometido automaticamente**: o lojista deve transferir/repor o local primeiro. Agendamento com reposição antecipada confirmada e reserva na origem continua pendente de contrato próprio.

`food_stock_transfer_batches` é um ledger interno com RLS habilitada e DML revogado de clientes; só a RPC autenticada escreve. A RPC pública verifica loja acessível e ponto ativo/publicado. Teste local executado em PostgreSQL 17.9 com 89 verificações, duas conexões simultâneas, rollback integral de lote, replay idempotente, isolamento por loja, restrições de pedido e conversões g↔kg/ml↔l. O workflow `Vendas e estoque` repete esse teste em PR. **Testes locais não substituem validação no projeto de homologação.**

Sequência segura: conectar uma homologação VendeWeb; comparar `supabase_migrations.schema_migrations` e definições de funções/tabelas/triggers/policies com os arquivos locais; fazer snapshot; aplicar apenas as migrations realmente ausentes em ordem; testar JWT de dois tenants, `anon`, PostgREST, checkout e saldos; publicar frontend somente após as RPCs estarem disponíveis. Em falha antes do commit, rollback da transação. Após uso, corrigir aditivamente com backup, sem apagar saldos ou ledger. Nenhuma migration de produção está autorizada neste handoff.

Risco operacional restante: pedidos que reservam vários produtos e uma transferência em lote podem disputar locks em ordens diferentes. O PostgreSQL aborta uma transação ao detectar deadlock, preservando a integridade; a operação deve ser repetida com a mesma chave idempotente. Reposição simultânea de insumos distintos também pode exigir retry. O agendamento futuro com estoque de origem reservado não foi ativado neste PR; não apresentar previsão automática de reposição.

**As migrations de receitas/dashboard deste handoff continuam sem aplicação remota.** O fast-flow de estoque por local acima é a única migration desse conjunto aplicada ao projeto consultado. Não use outro projeto por conveniência nem execute outras migrations em produção sem revisão do histórico, backup e autorização específica para o escopo.

## Objetivo e contrato da aplicação

Migration local: `supabase/migrations/20261025143142_food_inventory_recipe_dashboard_transactions.sql` (confirme arquivo e hash no PR antes de executar). A ordem exige reconciliar as migrations anteriores de inventário, receita, estoque de produto e multilocal até `20261024001500_food_location_initial_balance_upsert.sql`; avaliar também `20261025090000_food_stock_simple_mode.sql`, que está no repositório e ausente no alvo. Não use `db push` indiscriminado para resolver diferenças.

| RPC | Entrada | Saída consumida pelo frontend |
| --- | --- | --- |
| `food_update_inventory_item_v1` | `p_store_id uuid, p_inventory_item_id uuid, p_data jsonb` com `name,item_type,unit,reorder_point,low_stock_alert_enabled,notes,active` | `{item: <food_inventory_items>}`. O `reorder_point` informado já está na unidade **final**; se omitido, a conversão mantém o mínimo físico equivalente. |
| `food_save_product_recipe_v1` | `p_store_id uuid,p_product_id uuid,p_name text,p_yield_quantity numeric,p_yield_unit text,p_notes text,p_items jsonb` | `{recipe: <food_product_recipes>,items: <linhas ativas>}`. Itens usam `inventory_item_id,stage,quantity,unit,waste_percent,sort_order`. |
| `food_adjust_product_stock_v1` | `p_store_id uuid,p_product_id uuid,p_mode text,p_quantity numeric,p_reason text,p_idempotency_key uuid` | JSON de estoque físico, reservado e status. A assinatura já existia; a migration amplia a validação de reuso da chave para quantidade e motivo. |
| `food_dashboard_metrics_v1` | `p_store_id uuid` | `timezone,asOf,ordersTotal,cancelledOrders,ordersToday,pendingPayments,pendingAmount,processingOrders,scheduledToday,paidOrders,totalReceived,receivedToday,receivedTodayCount`. Sem retorno válido, a UI mostra indisponibilidade em vez de somar os 100 pedidos mais recentes. |

## Estrutura e segurança

A migration acrescenta `food_product_recipe_items.active` para preservar IDs referenciados por consumo histórico e `food_inventory_order_consumptions.order_quantity_at_target` para acompanhar alterações posteriores da quantidade pedida. Uma linha já consumida não muda de quantidade quando uma ficha é editada; pedidos existentes retêm a revisão/quantidade registrada, enquanto os próximos usam a linha ativa. Cancelamentos estornam o consumo. A reconciliação e o guard de arquivamento são adaptados. Acrescenta `food_product_stock_movements.requested_quantity` para comparar a intenção completa de retries. Cria índice parcial dos recebimentos por loja e fixa o `search_path` da função de conversão legada. Não elimina dados nem desabilita RLS. As RPCs são restritas a `authenticated`, validam `auth.uid()` e `food_is_store_admin(p_store_id)`, escopam produtos/insumos/receitas por `store_id`, usam locks e operam dentro da transação PostgreSQL. Revisar todo `SECURITY DEFINER`, `search_path` e GRANT no diff final antes de aplicar.

**Divergência conhecida:** o histórico de versões locais e remotas do multilocal não coincide, embora a assinatura da RPC de ajuste de produto exista no catálogo remoto. Isso não confirma que corpo, triggers e permissões sejam idênticos; compare definições antes de qualquer aplicação. Uma linha de movimento legada sem `requested_quantity` rejeitará replay da mesma chave após a migration, sem repetir efeito; examine essa compatibilidade para operações pendentes. Consumos legados sem `order_quantity_at_target` mantêm o target previamente registrado no primeiro reajuste de quantidade do pedido, porque a quantidade anterior não pode ser reconstruída com segurança. O frontend de edição de insumo, ficha e métricas depende das novas RPCs e coluna `active`; disponibilize as dependências no ambiente correspondente antes do frontend. O índice por `recipe_item_id` na tabela de consumos deve ser avaliado em homologação se o salvamento de fichas com histórico grande mostrar lentidão.

## Pré-verificação obrigatória no ambiente de homologação

1. Confirme `project_ref`, ambiente, backup/ponto de recuperação, histórico `supabase_migrations.schema_migrations` e diferenças de schema. Faça inventário das tabelas `food_*`, funções, triggers e policies afetadas. Compare o arquivo local com o SQL a aplicar. Se houver objetos divergentes, **pare** e devolva a diferença para revisão; não substitua produção nem adivinhe a versão.
2. Execute consultas somente leitura, por exemplo:

```sql
select to_regprocedure('public.food_convert_inventory_unit(uuid,uuid,text)') as conversao,
       to_regprocedure('public.food_adjust_product_stock_v1(uuid,uuid,text,numeric,text,uuid)') as estoque,
       to_regprocedure('public.food_reconcile_order_recipe_consumption(uuid,boolean)') as receita;
select to_regclass('public.food_product_recipe_items') as linhas,
       to_regclass('public.food_inventory_order_consumptions') as consumos,
       to_regclass('public.food_product_stock_movements') as movimentos;
select version from supabase_migrations.schema_migrations order by version desc limit 20;
```

3. Confirme nomes/tipos/constraints de `food_orders.payment_received_at`, `payment_status`, `opening_hours`, das FKs de receita e dos saldos por local. Verifique a migration de estoque multilocal e a integridade do ledger antes de aplicar a nova. Não execute testes que alterem pedidos/estoques reais.

## Aplicação e validação controlada

Em **homologação confirmada**, aplique migrations pendentes revisadas na ordem, e então a migration acima em uma transação. O arquivo notifica PostgREST para recarregar schema; confirme a assinatura na Data API após aplicação. Use duas lojas de teste com proprietários distintos e JWTs reais, inclusive chamadas negadas com `anon` e owner da outra loja. Teste kg↔g, l↔ml, precisão inválida e rollback de nome/mínimo; ficha com linha consumida historicamente e linha removida; ajuste de estoque 0→17, reservado, retry igual e retry divergente; mais de 100 pedidos, cancelados, pagamento em data diferente da criação, fuso da loja. Compare o resultado antes/depois e o histórico sem apagar dados.

```sql
select to_regprocedure('public.food_update_inventory_item_v1(uuid,uuid,jsonb)') as editar_insumo,
       to_regprocedure('public.food_save_product_recipe_v1(uuid,uuid,text,numeric,text,text,jsonb)') as salvar_ficha,
       to_regprocedure('public.food_dashboard_metrics_v1(uuid)') as dashboard;
select has_function_privilege('authenticated','public.food_dashboard_metrics_v1(uuid)','EXECUTE') as admin_rpc_executavel,
       has_function_privilege('anon','public.food_dashboard_metrics_v1(uuid)','EXECUTE') as anon_rpc_executavel;
select column_name,data_type from information_schema.columns
 where table_schema='public' and table_name in ('food_product_recipe_items','food_product_stock_movements','food_inventory_order_consumptions')
   and column_name in ('active','requested_quantity','order_quantity_at_target') order by table_name,column_name;
```

Após isso, valide na **mesma homologação** Dashboard, edição de unidade, salvamento de ficha, saldo de produto, vitrine e pedidos sob dois tenants. Observe respostas HTTP/console e recarregue para confirmar persistência. Uma função presente no catálogo SQL não prova acesso pelo PostgREST; consulte a RPC via cliente autenticado e confira `pgrst`/schema cache se necessário.

## Recuperação e retorno esperado

A migration é transacional: falha durante aplicação permite rollback da transação. Após aplicada e usada, **não reverta com DROP de colunas ou linhas**; preserve dados novos, pause o deploy frontend e prepare correção aditiva compatível, com backup. Retorne ref/ambiente confirmado, versões aplicadas e hash, diff de schema prévio, resultados SQL/HTTP por cenário, provas de autorização/isolamento, eventuais erros, recomendações de rollback/roll-forward e status do frontend. Não inclua JWT, senhas, service keys ou dados pessoais no retorno.
