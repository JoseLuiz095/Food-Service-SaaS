# SOLICITAÇÃO SUPABASE — VENDEWEB

Copiar este documento para o Chat 2. Nenhuma operação remota foi executada pela conta que preparou o código.

## A. Identificação

- Funcionalidade: estoque simples por padrão com múltiplos locais opcionais.
- Projeto citado pelo solicitante: `elttryavkeartoxgdgse` (`https://elttryavkeartoxgdgse.supabase.co`). **O ambiente desse projeto não foi confirmado. Não aplicar nele nem provisionar dados fictícios se for produção.** A versão da Edge Function bloqueia explicitamente esse ref como destino de demonstração.
- Destino da migration: somente projeto de desenvolvimento/homologação confirmado, com revisão do histórico e autorização técnica para SQL, RLS e Edge Functions. O projeto operacional usa tabelas `food_*` e apenas `auth.users` é compartilhado com FloriWeb.
- Dependências locais: `20261023101500_food_product_stock_adjustments.sql`, `20261023140000_food_multilocation_stock.sql`, `20261023153000_food_sales_fulfillment_location_ledger.sql`, `20261024001500_food_location_initial_balance_upsert.sql`, `20261022215432_food_business_segments.sql` para provisionamento.

## B. Diagnóstico

A interface anterior expunha locais, QR, depósitos e transferências a lojas com um único estoque. A infraestrutura multi-local já existe no GitHub, mas a preferência por loja ainda não existe no banco remoto conhecido. O frontend agora usa `food_stock_mode_v1(p_store_id,p_enabled)`; sem esta migration a opção apresentará erro e o menu antigo ficará acessível por compatibilidade. A inexistência da RPC original `food_adjust_product_stock_v1` no Supabase informado anteriormente permanece sem diagnóstico remoto conclusivo: verificar separadamente a migration e a assinatura, não substituir por ajuste direto.

## C. Alteração necessária

A migration aditiva cria `public.food_stock_preferences(store_id,multi_location_enabled,updated_at,updated_by)` e RPC `public.food_stock_mode_v1(uuid,boolean)`; índice primário por loja, FK a `food_stores` e `auth.users`, RLS ativada, sem grant direto de tabela a `anon` ou `authenticated`, `EXECUTE` somente para `authenticated`. A RPC verifica `auth.uid()` e `food_is_store_admin`, serializa mudanças por loja, impede desligar o modo avançado se houver saldos/reservas secundárias ou pontos ativos associados e retorna modo avançado efetivo se algum saldo surgir depois. Não há trigger, Edge Function ou tabela nova além da preferência.

A nova Edge Function `food-provision-demo`, definida no PR que acompanha este documento, é **separada** da migration. Reutiliza `food_test_provisioning_status` e `food_provision_test_business` existentes; configurações de homologação e publicação requerem revisão explícita, com master AAL2. Não é autorização para aplicar schema ou provisionar no projeto informado como produção.

## D. Implementação exata

Arquivo: `supabase/migrations/20261025090000_food_stock_simple_mode.sql`. Antes de executar, compare hash e conteúdo do arquivo com o PR, revise diferenças de esquema e faça backup/snapshot ou garanta ponto de recuperação do ambiente. Execute uma vez em homologação, em uma transação. Não use `db push` indiscriminado para aplicar outras migrations; resolva dependências pendentes na ordem de versão com revisão individual.

```sql
-- shared_future: modo simples por padrão, mantendo os dados multi-local existentes.
-- Depende de 20261023140000_food_multilocation_stock.sql e 20261024001500_food_location_initial_balance_upsert.sql.
begin;
create table public.food_stock_preferences (
  store_id uuid primary key references public.food_stores(id) on delete cascade,
  multi_location_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.food_stock_preferences enable row level security;
revoke all on public.food_stock_preferences from public,anon,authenticated;
-- Sem DML direto, inclusive para o proprietário. RPC única valida a loja.
insert into public.food_stock_preferences(store_id,multi_location_enabled)
select s.id,exists(
  select 1 from public.food_stock_locations l where l.store_id=s.id and not l.is_default and l.active
  union all
  select 1 from public.food_product_location_stock b join public.food_stock_locations l on l.id=b.location_id and l.store_id=b.store_id
  where b.store_id=s.id and not l.is_default and (b.stock_quantity>0 or b.stock_reserved_quantity>0)
) from public.food_stores s;
create function public.food_stock_mode_v1(p_store_id uuid,p_enabled boolean default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_mode boolean; actor uuid;
begin
 actor:=auth.uid();
 if actor is null or not public.food_is_store_admin(p_store_id) then raise exception 'Sem permissão para o estoque desta loja.' using errcode='42501'; end if;
 -- Locks serializam duas mudanças de configuração; não modificam nenhum saldo.
 perform 1 from public.food_stores where id=p_store_id for update;
 if not found then raise exception 'Loja indisponível.' using errcode='42501'; end if;
 select multi_location_enabled into current_mode from public.food_stock_preferences where store_id=p_store_id;
 if not found then current_mode:=false; end if;
 -- O estado efetivo nunca oculta dados se outro fluxo criou saldo/retirada após a última preferência.
 if exists(select 1 from public.food_product_location_stock b join public.food_stock_locations l on l.id=b.location_id and l.store_id=b.store_id
   where b.store_id=p_store_id and not l.is_default and (b.stock_quantity>0 or b.stock_reserved_quantity>0))
 or exists(select 1 from public.food_pickup_locations p join public.food_stock_locations l on l.id=p.stock_location_id and l.store_id=p.store_id
   where p.store_id=p_store_id and p.active and not l.is_default) then current_mode:=true; end if;
 if p_enabled is not null and p_enabled is distinct from current_mode then
   if not p_enabled and exists(
     select 1 from public.food_product_location_stock b join public.food_stock_locations l
       on l.id=b.location_id and l.store_id=b.store_id
      where b.store_id=p_store_id and not l.is_default and (b.stock_quantity<>0 or b.stock_reserved_quantity<>0)
   ) then raise exception 'Transfira os saldos dos locais secundários ao principal antes de usar o modo simples.' using errcode='23514'; end if;
   if not p_enabled and exists(
     select 1 from public.food_pickup_locations p join public.food_stock_locations l on l.id=p.stock_location_id and l.store_id=p.store_id
     where p.store_id=p_store_id and p.active and not l.is_default
   ) then raise exception 'Desative ou remapeie os pontos de retirada associados a locais secundários.' using errcode='23514'; end if;
   insert into public.food_stock_preferences(store_id,multi_location_enabled,updated_by)
   values(p_store_id,p_enabled,actor)
   on conflict(store_id) do update set multi_location_enabled=excluded.multi_location_enabled,updated_at=now(),updated_by=actor;
   current_mode:=p_enabled;
 end if;
 return jsonb_build_object('multi_location_enabled',current_mode);
end $$;
revoke all on function public.food_stock_mode_v1(uuid,boolean) from public,anon;
grant execute on function public.food_stock_mode_v1(uuid,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
```

## E. Segurança e recuperação

A preferência é isolada por `store_id` e o backend verifica administrador da loja. A RPC não edita saldos ou pedidos. RLS sem políticas de acesso direto bloqueia leitura/escrita da tabela; apenas a RPC controlada devolve o booleano. Para falha de migration transacional, realizar rollback. Após aplicação, não remover registros nem reverter com DROP sem revisar lojas já usando o modo. Dados multi-local e movimentos existentes ficam preservados. Confirme antes se o ambiente é realmente não produtivo.

## F. Verificações exigidas no Chat 2

```sql
select to_regclass('public.food_stock_preferences') as tabela,
       to_regprocedure('public.food_stock_mode_v1(uuid,boolean)') as rpc;
select store_id,multi_location_enabled from public.food_stock_preferences order by store_id limit 20;
select has_function_privilege('authenticated','public.food_stock_mode_v1(uuid,boolean)','EXECUTE') as autenticado,
       has_function_privilege('anon','public.food_stock_mode_v1(uuid,boolean)','EXECUTE') as anonimo;
select relrowsecurity from pg_class where oid='public.food_stock_preferences'::regclass;
```

Em homologação, use duas lojas fictícias distintas: loja A com um local, loja B com dois locais/saldo. Com JWT de owner A, consultar `food_stock_mode_v1(A,null)` (false), habilitar (true), manter saldo, desabilitar (false). Com owner B, não poder consultar A; com `anon`, não executar. Em B, testar saldo/reserva secundário e ponto de retirada ativo bloqueando desativação. Conferir `food_products.stock_quantity` e `food_product_location_stock` antes/depois sem mudanças indevidas. Verificar RPC via Data API/PostgREST e abrir `/admin/configuracoes`, `/admin/estoque`, `/admin/estoque-locais` no aplicativo da mesma homologação; conferir que menu acompanha flag, reload persiste e transferência segue idempotente. Nunca testar com produto/pedido real.

Para provisionamento, confirmar que `food_test_provisioning_status()` e `food_provision_test_business(uuid,text,text,text,jsonb,text[])` existem e que a configuração **privada** do ambiente está habilitada exclusivamente em staging/development. Publicar `food-provision-demo` **somente nesse projeto**, com `verify_jwt=true`, `DEMO_PROVISIONING_ENABLED=true`, `DEMO_ENVIRONMENT=staging|development`, `DEMO_PROJECT_REF` e `DEMO_APP_ORIGIN` exatos e chaves do servidor guardadas como secrets. A Edge bloqueia explicitamente `elttryavkeartoxgdgse` e outra referência legada de produção. Testar prévia, Master sem MFA negado, owner negado, criação de uma fixture, retry idempotente, login/Auth/vínculo/módulos/vitrine, isolamento, então as demais seis. Usar a interface `/admin-master/demonstracao`; capturar URLs e status sem registrar link de ativação em logs.

## G. Retorno esperado do Chat 2

Informar ref, ambiente confirmado, migration exata/hash/versão aplicada, objetos criados, resultado de cada consulta/teste, versão da Edge publicada, sete IDs reais de lojas e proprietários, URLs verificadas, login e isolamento testados, erros e pendências. Entregar links de ativação de uso único **somente em canal privado ao solicitante**; não os incluir em chat compartilhado, logs, PR, SQL ou documentação. Se qualquer dependência, permissão ou projeto divergir, não executar em outro banco nem afirmar que a alteração foi aplicada.
