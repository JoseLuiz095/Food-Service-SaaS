# Solicitação Supabase — transferência de estoque em lote

Diagnóstico em 26/10/2026. **Este documento não autoriza aplicação em produção.** Obter autorização específica para o projeto e a migration exatos antes de qualquer alteração remota.

## Projeto e causa

- Projeto consultado: `elttryavkeartoxgdgse` (`floriweb01`, ativo). É o ref configurado no repositório. A resposta do site publicado não pôde ser consultada nesta rodada; confirmar o `VITE_SUPABASE_URL` efetivo no bundle publicado imediatamente antes da implantação.
- A consulta remota a `pg_proc` não encontrou `public.food_transfer_location_stock_batch_v1`. `to_regprocedure('public.food_transfer_location_stock_batch_v1(uuid,uuid,uuid,jsonb,uuid)')` retornou `NULL` e `to_regclass('public.food_stock_transfer_batches')` retornou `NULL`. Portanto, o erro `PGRST202` é causado pela ausência real da função, não apenas por cache desatualizado.
- A função individual `food_transfer_location_stock_v1(uuid,uuid,uuid,uuid,integer,text,uuid)` existe; `authenticated` possui `EXECUTE` e `anon` não possui. As tabelas `food_stock_locations` e `food_product_location_stock` existem.
- O histórico remoto termina, para este fluxo, em `food_location_initial_balance_upsert` (versão remota `20261024005608`). Não contém `food_stock_simple_mode` nem `food_location_stock_fast_flow`.

## Migrations locais a revisar

1. [`20261025090000_food_stock_simple_mode.sql`](../supabase/migrations/20261025090000_food_stock_simple_mode.sql) cria `food_stock_preferences` e `food_stock_mode_v1`, usados pelo controle de modo simples/múltiplos locais. Depende das migrations já presentes de múltiplos locais e saldo inicial.
2. [`20261026014407_food_location_stock_fast_flow.sql`](../supabase/migrations/20261026014407_food_location_stock_fast_flow.sql) cria a função de lote, tabela de recibos de idempotência, ajustes rápidos e guardas de locais. Depende das tabelas e da função individual já existentes. Não depende da migration de receitas.
3. [`20261026014408_food_public_pickup_order_guards.sql`](../supabase/migrations/20261026014408_food_public_pickup_order_guards.sql) contém apenas os guardas novos do checkout de retirada. Foi separado porque a Doce Lua possui pontos públicos ativos e pedidos de retirada legados; **não faz parte da correção da transferência** e não deve ser aplicado nesta implantação.

Também estão pendentes localmente `20261025143142_food_inventory_recipe_dashboard_transactions.sql` e `20261025200720_food_recipe_reconciliation_lock_safety.sql`. A segunda depende da primeira; são assuntos separados. **Não usar `supabase db push` nem aplicar a cadeia inteira sem revisão própria.** Para esta tela, aplicar somente `20261025090000` e depois `20261026014407`; preservar `20261026014408` e as duas migrations de receitas para revisão própria.

A RPC nova tem a assinatura nomeada exata esperada pelo frontend:

```sql
public.food_transfer_location_stock_batch_v1(
  p_store_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_items jsonb,
  p_idempotency_key uuid
) returns jsonb
```

O corpo valida `auth.uid()` e `food_is_store_admin(p_store_id)`, locais distintos, 1 a 50 itens, IDs únicos e quantidades inteiras positivas. Ordena os produtos, registra uma chave por lote, chama a função individual para cada item na mesma transação e devolve os novos saldos. Qualquer exceção desfaz toda a chamada, inclusive histórico e recibo. A tabela de recibos tem RLS, sem acesso direto de `anon` ou `authenticated`; a função `SECURITY DEFINER` revoga `PUBLIC`/`anon` e concede `EXECUTE` a `authenticated`. O arquivo termina com `NOTIFY pgrst, 'reload schema'`.

## Consultas de pré-implantação

Executar somente consultas no projeto explicitamente autorizado e comparar com os resultados acima:

```sql
select to_regprocedure('public.food_transfer_location_stock_batch_v1(uuid,uuid,uuid,jsonb,uuid)') as batch_rpc,
       to_regprocedure('public.food_transfer_location_stock_v1(uuid,uuid,uuid,uuid,integer,text,uuid)') as single_rpc,
       to_regclass('public.food_stock_transfer_batches') as batches_table,
       to_regclass('public.food_stock_locations') as locations_table,
       to_regclass('public.food_product_location_stock') as balances_table;

select version, name
from supabase_migrations.schema_migrations
where version in ('20261025090000', '20261026014407')
order by version;

select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       p.proargnames,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('food_transfer_location_stock_v1',
                    'food_transfer_location_stock_batch_v1');
```

Antes de aplicar, comparar o conteúdo **exato** dos arquivos citados com o commit aprovado. Aplicar somente o SQL revisado da migration escolhida em homologação, registrar sua versão no histórico pelo mecanismo de migration aprovado e verificar os objetos. Repetir o mesmo procedimento em produção apenas mediante autorização específica. Não criar outra função com assinatura diferente. Se houver aplicação parcial, parar e comparar definição, permissões, triggers, tabela e histórico antes de qualquer nova tentativa.

## Validação após aplicação em ambiente autorizado

Usar loja, usuário administrador, dois locais e produtos de teste isolados. Não movimentar mercadoria nem pedidos reais. Confirmar que o usuário está na loja de teste e que cada produto tem `track_stock=true` e saldo inicial por local conhecido.

1. Chamar a RPC como `authenticated` com `p_items` contendo quatro objetos `{ "product_id": "UUID", "quantity": inteiro }`, quantidades `4, 5, 3, 1`. Confirmar 13 unidades, quatro linhas `transfer` no histórico e saldos de origem/destino alterados exatamente nessas quantidades; o total global de cada produto deve permanecer igual.
2. Repetir o mesmo payload e a mesma chave UUID. Deve retornar `replayed=true`, sem novas movimentações. Repetir a chave com payload diferente: deve falhar sem movimentar saldo.
3. Testar um único item pelo mesmo endpoint. Testar segundo item com saldo insuficiente; nenhuma linha do lote deve persistir. Testar quantidade zero, decimal, produto duplicado e origem igual ao destino.
4. Testar estoque reservado: o máximo transferível é `stock_quantity - stock_reserved_quantity` na origem. Testar usuário de outra loja; a RPC deve negar acesso.
5. Concorrer duas chamadas contra o mesmo saldo e confirmar que no máximo uma consome o disponível. Conferir persistência após nova consulta e recarga da interface.
6. Confirmar por `pg_proc` a assinatura nomeada, `authenticated_execute=true`, `anon_execute=false`; verificar RLS da tabela de recibos. Consultar logs do PostgREST e a requisição autenticada real para confirmar ausência de `PGRST202`. Uma chamada anônima pode continuar retornando função não encontrada por restrição de `EXECUTE` e não comprova falha do fluxo autenticado.

Consultas de conferência com IDs **da fixture isolada**:

```sql
select product_id, location_id, stock_quantity, stock_reserved_quantity,
       stock_quantity - stock_reserved_quantity as available
from public.food_product_location_stock
where store_id = :test_store_id and product_id = any(:test_product_ids)
order by product_id, location_id;

select product_id, from_location_id, to_location_id, quantity, idempotency_key, created_at
from public.food_stock_location_movements
where store_id = :test_store_id and product_id = any(:test_product_ids)
order by created_at desc;

select store_id, idempotency_key, request_payload, result
from public.food_stock_transfer_batches
where store_id = :test_store_id and idempotency_key = :batch_key;
```

O teste local `scripts/stock-simple-mode-db-test.mjs` passou 12 verificações. `scripts/recipe-concurrency-db-test.mjs` não iniciou neste workspace porque o runtime externo `embedded-postgres` não está instalado; isso **não** substitui a validação remota. Nenhuma migration foi aplicada nesta investigação.
