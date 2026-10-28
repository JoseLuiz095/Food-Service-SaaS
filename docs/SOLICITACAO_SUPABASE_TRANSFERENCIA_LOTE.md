# Registro Supabase — transferência de estoque em lote

Atualizado em 26/10/2026. Após autorização explícita do usuário, duas migrations foram aplicadas ao projeto de produção `elttryavkeartoxgdgse` (`floriweb01`) pelo conector Supabase. O serviço registrou `food_location_stock_fast_flow` como `20261026112835` e `food_stock_location_balance_bootstrap` como `20261026115308`; os arquivos locais foram alinhados às versões remotas para evitar reaplicação. Nenhuma migration de receita/dashboard foi aplicada.

O SQL aplicado é o conteúdo integral do arquivo versionado abaixo (SHA-256 `d9639843504c843f3f3017e707a3639a42bca0e5b96ee74d3cc7fa1e420c44f9`). A migration inclui transferência de estoque em lote, tabela de recibos idempotentes, ajustes rápidos, consultas de disponibilidade/vendas e guardas de local e checkout de retirada. Esses efeitos de checkout foram cobertos pela autorização específica recebida.

## Projeto e causa

- Projeto consultado: `elttryavkeartoxgdgse` (`floriweb01`, ativo). Os logs da chamada que produziu o erro mostram a origem `https://www.vendeweb.com.br/` e o host `elttryavkeartoxgdgse.supabase.co`, confirmando o projeto usado pelo fluxo da captura.
- Antes da aplicação, consultas somente de leitura confirmaram que `public.food_transfer_location_stock_batch_v1(uuid,uuid,uuid,jsonb,uuid)` e `public.food_stock_transfer_batches` estavam ausentes, confirmando a causa do `PGRST202`, não sendo apenas cache desatualizado.
- Depois da primeira migration, a chamada autenticada passou a alcançar a RPC, mas os logs mostraram SQLSTATE `22023` e `Origem ou destino não encontrado.`. O diagnóstico encontrou quatro pares de saldo ausentes: dois produtos rastreados não tinham linhas para os locais ativos `Moveis linhares` e `Sicoob`. A função individual antiga exigia as linhas de origem e destino antes de transferir.
- A causa dos pares ausentes era a inicialização assimétrica: ao criar um local, produtos já existentes recebiam saldo zero; produtos criados depois recebiam apenas a linha do estoque principal. A migration de correção adiciona inicialização para novos produtos e locais reativados, preenche somente pares ausentes com zero e torna a RPC resiliente a uma linha zero faltante.
- A função individual `food_transfer_location_stock_v1(uuid,uuid,uuid,uuid,integer,text,uuid)` existe, com `EXECUTE` para `authenticated` e sem `EXECUTE` para `anon`. Sua definição remota corresponde ao corpo da migration local `20261023140000_food_multilocation_stock.sql`. As tabelas e colunas referenciadas pela migration fast-flow foram encontradas no schema remoto.
- O histórico remoto registra `food_stock_simple_mode` na versão `20261026105329`, enquanto o arquivo local correspondente tem versão `20261025090000`. A definição remota de `food_stock_mode_v1` corresponde à local, e `food_stock_preferences` tem RLS sem DML direto para clientes. **Não aplique o arquivo local `20261025090000` novamente.**
- O projeto tem somente a branch `main`; não foi encontrada homologação conectada. O site publicado não foi consultado para confirmar a URL Supabase embutida no bundle.

## Registro da migration e estado relacionado

1. [`20261025090000_food_stock_simple_mode.sql`](../supabase/migrations/20261025090000_food_stock_simple_mode.sql) já tem equivalente no remoto sob a versão `20261026105329`; não deve ser reaplicada.
2. [`20261026112835_food_location_stock_fast_flow.sql`](../supabase/migrations/20261026112835_food_location_stock_fast_flow.sql) foi aplicada e registrada remotamente na versão `20261026112835`. O projeto não tinha a tabela ou os objetos dessa migration antes da aplicação. O arquivo inclui `food_change_location_stock_v1`, `food_get_location_sales_today_v1`, `food_get_public_location_availability_v1`, guardas de estoque/local e **dois triggers de validação do checkout de retirada** em `food_orders` e `food_order_items`.
3. [`20261026115308_food_stock_location_balance_bootstrap.sql`](../supabase/migrations/20261026115308_food_stock_location_balance_bootstrap.sql) foi aplicada e registrada remotamente na versão `20261026115308`. O backfill inseriu quatro pares ausentes como zero; consultas posteriores confirmaram zero pares ativos faltantes e os saldos físicos/reservados originais inalterados.
4. A branch principal atual também contém `20261026014408_food_public_pickup_order_guards.sql`, separada no PR #90. O conteúdo dos dois guardas de checkout dessa migration já está incluído na migration `20261026112835` aplicada ao projeto; ela não aparece como versão remota independente. Não aplique a migration separada em produção sem reconciliar o histórico e verificar que não se está repetindo a mesma alteração.

Continuam pendentes, sem aplicação remota, `20261025143142_food_inventory_recipe_dashboard_transactions.sql` e `20261025200720_food_recipe_reconciliation_lock_safety.sql`. A segunda depende da primeira e exige revisão específica. Não usar `supabase db push` indiscriminado nem inferir que essas alterações foram autorizadas ou validadas pela aplicação da migration de estoque por local.

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

## Consultas de conferência remota

As consultas abaixo foram executadas após a aplicação para conferir o estado do projeto autorizado:

```sql
select to_regprocedure('public.food_transfer_location_stock_batch_v1(uuid,uuid,uuid,jsonb,uuid)') as batch_rpc,
       to_regprocedure('public.food_transfer_location_stock_v1(uuid,uuid,uuid,uuid,integer,text,uuid)') as single_rpc,
       to_regclass('public.food_stock_transfer_batches') as batches_table,
       to_regclass('public.food_stock_locations') as locations_table,
       to_regclass('public.food_product_location_stock') as balances_table;

select version, name
from supabase_migrations.schema_migrations
where version in ('20261026105329', '20261026112835', '20261026115308')
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

Na aplicação, o conteúdo local foi enviado integralmente pelo mecanismo oficial de migration. A versão remota registrada foi conferida após o sucesso. Não criar outra função com assinatura diferente nem reaplicar manualmente o SQL. Se uma ferramenta futura indicar drift, comparar primeiro o histórico remoto e o arquivo local versionado.

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

Validação local: `scripts/stock-simple-mode-db-test.mjs` passou 12 verificações; `scripts/stock-transfer-batch-db-test.mjs` passou 47 verificações em PGlite, cobrindo transferência em lote, backfill, criação/reativação de pares, replay, rollback, reservas, ajustes rápidos, disponibilidade pública, vendas por local e guardas de checkout. Isso não reproduz todo o schema de produção. A validação remota confirmou ambas as versões, assinaturas nomeadas, `EXECUTE` para `authenticated` e bloqueio para `anon` nas RPCs privadas, RLS e ausência de privilégios diretos de cliente na tabela de recibos, os guardas do fluxo e os triggers de inicialização. O número de pares ativos faltantes caiu de quatro para zero; os saldos físicos/reservados existentes foram preservados. As migrations notificaram o PostgREST para recarregar o schema.

Validação operacional remota em 26/10: os logs do endpoint chamado pelo site `www.vendeweb.com.br` registram `POST 200` em 12:04 e 12:36 UTC (09:04 e 09:36 em São Paulo). O banco contém dois lotes concluídos na Doce Lua e oito movimentos de transferência persistidos, todos com `created_by` preenchido. Antes do bootstrap, às 11:37–11:44 UTC, a falha confirmada era `Origem ou destino não encontrado` (SQLSTATE `22023`); após o bootstrap, o endpoint respondeu com sucesso. Isso comprova duas operações reais pelo endpoint autenticado e sua persistência, mas não substitui a suíte controlada de casos negativos e concorrência, nem comprova o estado de qualquer tentativa feita depois de 12:36 UTC.

`scripts/recipe-concurrency-db-test.mjs` não pôde executar porque o ambiente roda como root e impede trocar/criar o usuário de sistema exigido pelo PostgreSQL embutido; concorrência nativa de duas sessões permanece sem validação. O advisor de segurança sinaliza a RPC single-transfer `SECURITY DEFINER` autenticada, que valida `auth.uid()` e `food_is_store_admin(store_id)`; essa função é preexistente. A migration não removeu RLS nem concedeu acesso direto à tabela de recibos.
