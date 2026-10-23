# SOLICITAÇÃO SUPABASE — VENDEWEB

Copie este documento inteiro para a conversa que possui acesso ao Supabase. Não há transmissão automática entre contas.

## A. Identificação

- Funcionalidade: ajuste transacional de estoque de produtos prontos e sua trilha de auditoria (`core`).
- Objetivo: restaurar definir/adicionar/remover estoque pela aplicação real, preservando reservas e isolamento por negócio.
- Repositório: https://github.com/JoseLuiz095/Food-Service-SaaS
- Projeto indicado pelo solicitante: `elttryavkeartoxgdgse`, API `https://elttryavkeartoxgdgse.supabase.co`.
- Ambiente: **não confirmado**. Não presumir que é homologação. Confirmar a configuração efetiva do frontend publicado, inclusive `VITE_SUPABASE_URL` no build Cloudflare; o fallback no código aponta ao projeto indicado.
- A sessão de desenvolvimento recebeu `You do not have permission to perform this action` ao consultar este projeto. Nenhuma migration foi aplicada por essa sessão.
- Fonte revisada: `main` em `e9f3040d682915b6bd5ded33af5b3e1e69adf861`, PRs #76 e #77 mesclados. Verifique alterações posteriores antes de executar.
- Migration existente: `supabase/migrations/20261023101500_food_product_stock_adjustments.sql`, versão `20261023101500`. SQL integral ao final.
- Dependências: tabelas `food_stores`, `food_products`, `auth.users`; função `food_is_store_admin(uuid)`; campos `food_products.track_stock`, `stock_quantity`, `stock_reserved_quantity`, `stock_status`, `availability_status` e triggers de reserva/baixa/reposição já existentes.

## B. Diagnóstico

Erro reportado pela aplicação:

`Could not find the function public.food_adjust_product_stock_v1(p_idempotency_key, p_mode, p_product_id, p_quantity, p_reason, p_store_id) in the schema cache`

A chamada não conclui o ajuste (exemplo observado: saldo 0 permanece 0 ao tentar definir 17). O frontend passou a explicar a falha, mas isso não comprova correção no banco.

- Confirmado no código: existe uma única definição local da RPC e os seis nomes enviados correspondem à assinatura.
- Confirmado no código: o workflow `deploy-supabase-functions.yml` publica Edge Functions, sem executar migrations SQL.
- Ainda não confirmado no banco: histórico da migration, existência/assinatura/permissões da RPC, schema exposto e estado do cache PostgREST.
- Hipóteses: migration ausente, assinatura/permissões divergentes, cache desatualizado ou aplicação conectada a outro projeto. Diferencie essas causas antes de executar DDL.
- Não utilizar o projeto `banco-financeiro`, que não pertence a este produto.

## C. Alteração necessária — somente se a migration estiver ausente e compatível

1. Tabela nova `public.food_product_stock_movements`, com tenant/produto, nome no momento da movimentação, tipo, saldo anterior/novo/delta, motivo, chave idempotente, usuário e data.
2. Constraints de valores não negativos e tipo de movimento; unicidade `(store_id, idempotency_key)`; índice de histórico `(store_id, product_id, created_at desc)`; relação com `food_stores` e `auth.users`. O produto permanece como referência histórica sem apagar movimentações quando removido.
3. RPC `public.food_adjust_product_stock_v1(uuid,uuid,text,numeric,text,uuid)` com argumentos `p_store_id,p_product_id,p_mode,p_quantity,p_reason,p_idempotency_key`, retorno JSONB com físico, reservado e status. Lock `FOR UPDATE`, validação de permissão administrativa e invariantes de saldo.
4. Triggers de saldo inicial e bloqueio de alteração direta de físico/reservado por `anon`/`authenticated`.
5. RLS de leitura do histórico para administradores do tenant; sem INSERT/UPDATE/DELETE direto para clientes. EXECUTE da RPC apenas a `authenticated`; o corpo verifica usuário e negócio.
6. Nenhuma alteração em Edge Functions, em tabelas operacionais sem prefixo `food_`, em cobrança, plano ou assinatura.

## D. Implementação e ordem

### 1 — Inspecionar com acesso autorizado, somente leitura

Confirme o project ref e o ambiente; consulte logs/advisors e compare migrations/objetos antes de mudar o schema. Execute estas consultas diagnósticas (não incluem dados de clientes):

```sql
select current_database(), current_user;
select to_regclass('supabase_migrations.schema_migrations') as migration_history,
       to_regclass('public.food_products') as products,
       to_regclass('public.food_product_stock_movements') as movements,
       to_regprocedure('public.food_is_store_admin(uuid)') as tenant_guard,
       to_regprocedure('public.food_adjust_product_stock_v1(uuid,uuid,text,numeric,text,uuid)') as stock_rpc;
```

Se o histórico existir:

```sql
select version, name
from supabase_migrations.schema_migrations
where version = '20261023101500'
order by version;
```

```sql
select n.nspname, p.proname,
       pg_get_function_identity_arguments(p.oid) as identity_arguments,
       p.proargnames,
       pg_get_function_result(p.oid) as returns,
       p.prosecdef, p.proconfig, p.proacl,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('food_adjust_product_stock_v1', 'food_is_store_admin',
                   'food_log_initial_product_stock', 'food_guard_product_stock_mutation');

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public'
  and table_name in ('food_products','food_product_stock_movements')
order by table_name, ordinal_position;

select t.tgname, pg_get_triggerdef(t.oid)
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='food_products' and not t.tgisinternal;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname='public' and tablename in ('food_products','food_product_stock_movements');

select n.nspname, c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('food_products','food_product_stock_movements');
```

Verifique `public` em Exposed Schemas da Data API sem ampliar esquemas expostos. Compare o corpo remoto via `pg_get_functiondef` com o SQL ao final, sem publicar dados ou secrets.

### 2 — Decidir com base na evidência

- Migration ausente e dependências compatíveis: aplicar **a migration existente**, pelo mecanismo de migrations disponível, registrando corretamente a versão executada. Não criar uma cópia da RPC ou outra migration equivalente.
- Migration já aplicada e função compatível: investigar grants/schema/cache. Quando apropriado, `NOTIFY pgrst, 'reload schema';`, então testar a Data API. SQL que retorna sucesso não prova disponibilidade no PostgREST.
- Migration marcada como aplicada mas objetos divergentes: comparar e preparar correção aditiva específica. Não editar silenciosamente histórico nem remover objetos/dados.
- Dependências ausentes: apresentar a cadeia mínima necessária antes de aplicar. Não executar `db push` sobre todas as pendências sem revisão.
- Projeto/ambiente diferente do frontend: corrigir a configuração somente no ambiente autorizado e confirmar o build correspondente.

### 3 — Compatibilidade

O SQL preserva os saldos existentes. `stock_quantity` representa físico e `stock_reserved_quantity` representa comprometido; disponível é físico menos reservado, conforme o modelo local. Confirmar essa semântica nos RPCs/triggers remotos. Não fazer UPDATE direto de estoque para contornar a RPC.

## E. Segurança e recuperação

- Autorizadas: consultas diagnósticas e migrations não destrutivas em desenvolvimento/homologação. **Mudanças em produção requerem autorização específica**; não inferir autorização pela URL do projeto.
- Permissões técnicas necessárias: leitura de schema/histórico/logs/advisors; DDL de migration no ambiente autorizado; sessões de dois proprietários fictícios para validar tenant e negativa de acesso. Nunca pedir senhas, tokens ou service-role na conversa.
- Conferir backup/snapshot disponível do ambiente antes de aplicar; não gerar custos de backup sem autorização.
- Revisar lock e triggers existentes. A migration já usa uma transação; falha de DDL deve reverter o conjunto.
- Após sucesso, recuperação exige revisão: preferir reverter a versão do aplicativo e corrigir a função aditivamente. Não apagar o histórico de movimentações nem dados de estoque. Não remover RLS/grants/guardas para fazer o teste passar.
- Os testes devem usar loja/produtos fictícios do ambiente autorizado. Não alterar os produtos reais citados pelo usuário.

## F. Validação remota obrigatória

1. Via login real de proprietário fictício, cadastrar produto controlado zerado. Usar o fluxo da aplicação e registrar IDs de teste sem credenciais.
2. Executar `set 17`, depois `add 10`, depois `remove 5`: físico esperado `17 → 27 → 22`, reservado `0`.
3. Cada chamada envia exatamente este corpo com UUIDs válidos e chave nova para cada intenção:

```json
{"p_store_id":"<tenant-teste>","p_product_id":"<produto-teste>","p_mode":"set","p_quantity":17,"p_reason":"Conferência de homologação","p_idempotency_key":"<uuid-operacao>"}
```

4. Repetir a MESMA requisição com a MESMA chave: sem movimento duplicado. Não reutilizar chave com payload alterado.
5. Criar reserva de 2 unidades por pedido válido: físico `22`, reservado `2`, disponível `20`. Cancelar: liberar reserva uma vez. Criar outro pedido e concluir segundo as transições existentes: baixa física uma vez, sem reserva negativa. Não definir diretamente colunas para simular esses fluxos.
6. Conferir Estoque, Produtos, vitrine e carrinho; recarregar e confirmar persistência. Verificar HTTP/Network e console. Exigir resposta 2xx da RPC e consulta do resultado no Supabase correspondente; mocks/PGlite não comprovam isso.
7. Testar negativo, fração, zero relativo, físico abaixo da reserva, motivo vazio e limite acima de int32: rejeitar sem mudar saldo/auditoria.
8. Conta de outro tenant deve ser impedida de ajustar/ler histórico desta loja; sessão anônima não deve executar a RPC. Testar concorrência com chaves distintas sem perda de atualização. Manter as sessões e tokens fora das evidências públicas.
9. Depois de substituir os placeholders por IDs fictícios autorizados:

```sql
select id, store_id, stock_quantity as physical, stock_reserved_quantity as reserved,
       stock_quantity - coalesce(stock_reserved_quantity,0) as available,
       stock_status, availability_status
from public.food_products
where store_id='<UUID_TENANT_TESTE>'::uuid and id='<UUID_PRODUTO_TESTE>'::uuid;

select movement_type, quantity_before, quantity_after, quantity_delta,
       reason, idempotency_key, created_by, created_at
from public.food_product_stock_movements
where store_id='<UUID_TENANT_TESTE>'::uuid and product_id='<UUID_PRODUTO_TESTE>'::uuid
order by created_at;
```

10. Rodar advisors após DDL. Confirmar a versão no histórico e a identidade da função com as consultas anteriores.

## G. Retorno esperado para o desenvolvimento

Entregue somente evidências reais: project ref e ambiente confirmado; status `aplicada / já existente / bloqueada`; migration/versão e SQL efetivamente executados; objetos alterados; assinatura/grants; resultados HTTP e SQL dos cenários; screenshots quando disponíveis; erros e pendências. Não enviar credenciais.

Revise em seguida o inventário das RPCs do frontend/Edge Functions contra o banco remoto, começando por cadastro, checkout, pedidos, reserva e segmentos. Há 46 nomes estáticos chamados com definição local na referência de código; isso não comprova implantação remota. Inspecione também rotas RPC dinâmicas. Evite executar correções em lote sem diagnóstico individual.

O processo de deploy SQL deve ficar separado de Edge Functions, com target ref validado, revisão das versões pendentes, ambiente de homologação protegido e produção somente mediante aprovação. Não criar aplicação automática em produção para resolver este incidente.

Referência oficial para cache: https://supabase.com/docs/guides/troubleshooting/refresh-postgrest-schema

## SQL integral da migration existente — NÃO executar antes das pré-condições

SHA-256 da fonte: `80aaf7d651964a65143559b37930463d98384f6d634f14f5f624e9379e985230`

```sql
begin;

create table if not exists public.food_product_stock_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  product_id uuid not null,
  product_name text not null,
  movement_type text not null check (movement_type in ('set','add','remove')),
  quantity_before integer not null check (quantity_before >= 0),
  quantity_after integer not null check (quantity_after >= 0),
  quantity_delta integer not null,
  reason text not null check (length(trim(reason)) between 1 and 160),
  idempotency_key uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint food_product_stock_movements_idempotency_uidx unique (store_id, idempotency_key)
);

create index if not exists food_product_stock_movements_product_date_idx
  on public.food_product_stock_movements(store_id, product_id, created_at desc);

alter table public.food_product_stock_movements enable row level security;
drop policy if exists food_product_stock_movements_admin_select on public.food_product_stock_movements;
create policy food_product_stock_movements_admin_select
  on public.food_product_stock_movements for select to authenticated
  using (public.food_is_store_admin(store_id));

grant select on public.food_product_stock_movements to authenticated;
revoke insert, update, delete on public.food_product_stock_movements from anon, authenticated;

create or replace function public.food_log_initial_product_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.track_stock and coalesce(new.stock_quantity,0) > 0 then
    insert into public.food_product_stock_movements(
      store_id, product_id, product_name, movement_type, quantity_before,
      quantity_after, quantity_delta, reason, idempotency_key, created_by
    ) values (
      new.store_id, new.id, new.name, 'set', 0, new.stock_quantity,
      new.stock_quantity, 'Saldo inicial do cadastro', gen_random_uuid(), (select auth.uid())
    );
  end if;
  return new;
end;
$$;
revoke all on function public.food_log_initial_product_stock() from public, anon, authenticated;
drop trigger if exists food_products_stock_initial_movement on public.food_products;
create trigger food_products_stock_initial_movement
  after insert on public.food_products
  for each row execute function public.food_log_initial_product_stock();

create or replace function public.food_guard_product_stock_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('anon','authenticated')
     and (new.stock_quantity is distinct from old.stock_quantity
       or new.stock_reserved_quantity is distinct from old.stock_reserved_quantity) then
    raise exception 'O saldo de produtos só pode ser alterado por uma operação transacional de estoque.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.food_guard_product_stock_mutation() from public, anon, authenticated;
drop trigger if exists food_products_stock_mutation_guard on public.food_products;
create trigger food_products_stock_mutation_guard
  before update of stock_quantity, stock_reserved_quantity on public.food_products
  for each row execute function public.food_guard_product_stock_mutation();

create or replace function public.food_adjust_product_stock_v1(
  p_store_id uuid,
  p_product_id uuid,
  p_mode text,
  p_quantity numeric,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.food_products%rowtype;
  v_before integer;
  v_after bigint;
  v_reserved integer;
  v_available integer;
  v_existing public.food_product_stock_movements%rowtype;
begin
  if (select auth.uid()) is null or not public.food_is_store_admin(p_store_id) then
    raise exception 'Sem permissão para ajustar o estoque desta loja.' using errcode = '42501';
  end if;
  if p_mode not in ('set','add','remove') or p_mode is null then
    raise exception 'Tipo de ajuste inválido.' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity < 0 or p_quantity <> trunc(p_quantity) or p_quantity > 2147483647 then
    raise exception 'Informe uma quantidade inteira e não negativa.' using errcode = '22023';
  end if;
  if p_mode in ('add','remove') and p_quantity = 0 then
    raise exception 'O ajuste precisa movimentar ao menos uma unidade.' using errcode = '22023';
  end if;
  if nullif(trim(p_reason), '') is null or length(trim(p_reason)) > 160 then
    raise exception 'Informe o motivo do ajuste (até 160 caracteres).' using errcode = '22023';
  end if;
  if p_idempotency_key is null then
    raise exception 'Identificador da operação ausente.' using errcode = '22023';
  end if;

  select * into v_product
  from public.food_products
  where id = p_product_id and store_id = p_store_id
  for update;
  if not found or not v_product.track_stock then
    raise exception 'Produto não encontrado ou sem controle de estoque.' using errcode = '22023';
  end if;

  select * into v_existing
  from public.food_product_stock_movements
  where store_id = p_store_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.product_id <> p_product_id or v_existing.movement_type <> p_mode then
      raise exception 'Identificador já utilizado em outra operação.' using errcode = '22023';
    end if;
    return jsonb_build_object('stock_quantity',coalesce(v_product.stock_quantity,0),'stock_reserved_quantity',v_product.stock_reserved_quantity,'stock_status',v_product.stock_status,'availability_status',v_product.availability_status);
  end if;

  v_before := coalesce(v_product.stock_quantity,0);
  v_reserved := coalesce(v_product.stock_reserved_quantity,0);
  v_after := case p_mode
    when 'set' then p_quantity::integer
    when 'add' then v_before::bigint + p_quantity::bigint
    else v_before::bigint - p_quantity::bigint
  end;
  if v_after < 0 or v_after > 2147483647 then
    raise exception 'O estoque físico precisa estar entre 0 e 2.147.483.647.' using errcode = '22023';
  end if;
  if v_after < v_reserved then
    raise exception 'A quantidade física não pode ficar abaixo das % unidade(s) reservadas.', v_reserved using errcode = '22023';
  end if;
  v_available := v_after - v_reserved;

  update public.food_products
     set stock_quantity = v_after::integer,
         stock_status = case when v_available <= 3 then 'low_stock' else 'available' end,
         availability_status = case when v_available = 0 then 'sold_out' else 'available' end
   where id = p_product_id and store_id = p_store_id
   returning * into v_product;
  -- O trigger de reposição pode confirmar pedidos pagos aguardando estoque
  -- dentro da mesma transação; registre e retorne o saldo final efetivo.
  select * into v_product from public.food_products where id = p_product_id and store_id = p_store_id;
  v_after := coalesce(v_product.stock_quantity, 0);

  insert into public.food_product_stock_movements(
    store_id, product_id, product_name, movement_type, quantity_before, quantity_after,
    quantity_delta, reason, idempotency_key, created_by
  ) values (
    p_store_id, p_product_id, v_product.name, p_mode, v_before, v_after,
    (v_after - v_before)::integer, trim(p_reason), p_idempotency_key, (select auth.uid())
  );

  return jsonb_build_object('stock_quantity',v_product.stock_quantity,'stock_reserved_quantity',v_product.stock_reserved_quantity,'stock_status',v_product.stock_status,'availability_status',v_product.availability_status);
end;
$$;

revoke all on function public.food_adjust_product_stock_v1(uuid,uuid,text,numeric,text,uuid) from public, anon;
grant execute on function public.food_adjust_product_stock_v1(uuid,uuid,text,numeric,text,uuid) to authenticated;

notify pgrst, 'reload schema';
commit;

```
