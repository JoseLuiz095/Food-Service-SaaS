# SOLICITAÇÃO SUPABASE — VENDEWEB

Este handoff é para o operador de uma homologação identificada. **A migration `20261025143142` não está aplicada no projeto consultado**. Não executar em produção sem revisão do histórico, backup e autorização específica.

Leitura remota em 25/10/2026 pelo conector Supabase: o projeto `elttryavkeartoxgdgse` aparece como `floriweb01`, ativo, com apenas a branch padrão `main`; não foi identificada homologação separada. O histórico remoto termina em `20261024005608_food_location_initial_balance_upsert`, enquanto os arquivos locais usam versões diferentes para parte do estoque multilocal. `food_adjust_product_stock_v1(uuid,uuid,text,numeric,text,uuid)` e `food_convert_inventory_unit(uuid,uuid,text)` existem; `food_update_inventory_item_v1`, `food_save_product_recipe_v1` e `food_dashboard_metrics_v1` não existem. Também não existem `food_stock_mode_v1(uuid,boolean)` e `food_stock_preferences`, definidos na migration local anterior `20261025090000_food_stock_simple_mode.sql`. A consulta às colunas confirma `food_orders.payment_received_at`, mas não `food_product_recipe_items.active`, `food_inventory_order_consumptions.order_quantity_at_target` ou `food_product_stock_movements.requested_quantity`. Essas consultas foram somente leitura; **nenhum dado ou esquema remoto foi alterado**.

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
