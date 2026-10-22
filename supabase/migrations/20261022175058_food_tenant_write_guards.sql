-- Valida a autorização também na gravação direta da API. Não altera dados,
-- associações ou políticas existentes, nem os campos operacionais da loja.
begin;

-- As policies Master usam este helper. A linha própria de food_platform_admins
-- continua visível pela policy self_select antes do MFA, para o bootstrap Auth.
-- CREATE OR REPLACE preserva as permissões EXECUTE já existentes.
create or replace function public.food_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt()->>'aal', '') = 'aal2' and exists (
    select 1 from public.food_platform_admins a
    where a.user_id = auth.uid() and a.active
  );
$$;

create or replace function public.food_guard_store_commercial_write()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if (to_jsonb(new) - array['updated_at']) is not distinct from (to_jsonb(old) - array['updated_at']) then
    return new;
  end if;
  if jsonb_build_array(new.id, new.active, new.approval_status, new.access_status,
       new.archived_at, new.suspended_at, new.suspension_reason, new.self_service, new.billing_asaas_customer_id)
     is not distinct from
     jsonb_build_array(old.id, old.active, old.approval_status, old.access_status,
       old.archived_at, old.suspended_at, old.suspension_reason, old.self_service, old.billing_asaas_customer_id) then
    return new;
  end if;

  -- SECURITY INVOKER preserva o usuário SQL da operação que disparou o
  -- trigger. Cron e funções internas DEFINER sem usuário Auth podem operar;
  -- um JWT anônimo/autenticado direto não ganha esse privilégio.
  if auth.uid() is null and current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;
  if public.food_is_platform_admin() and coalesce(auth.jwt()->>'aal', '') = 'aal2' then
    return new;
  end if;
  raise exception 'A aprovação, o acesso e a situação comercial da loja só podem ser alterados pelo Admin Master com MFA.' using errcode = '42501';
end;
$$;

drop trigger if exists food_stores_commercial_write_guard_trg on public.food_stores;
create trigger food_stores_commercial_write_guard_trg before update on public.food_stores
for each row execute function public.food_guard_store_commercial_write();

create or replace function public.food_guard_financial_entry_tenant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Lookup privilegiado estreito: a RLS da entrada já autoriza a gravação.
  -- Financeiros podem acessar lançamentos sem poder consultar os pedidos.
  -- FOR SHARE serializa este vínculo com uma mudança de loja no registro pai.
  if new.category_id is not null then
    perform 1 from public.food_financial_categories c
      where c.id = new.category_id and c.store_id = new.store_id for share;
    if not found then
      raise exception 'A categoria financeira não pertence à loja deste lançamento.' using errcode = '23503';
    end if;
  end if;
  if new.order_id is not null then
    perform 1 from public.food_orders o
      where o.id = new.order_id and o.store_id = new.store_id for share;
    if not found then
      raise exception 'O pedido não pertence à loja deste lançamento.' using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists food_financial_entries_tenant_guard_trg on public.food_financial_entries;
create trigger food_financial_entries_tenant_guard_trg before insert or update on public.food_financial_entries
for each row execute function public.food_guard_financial_entry_tenant();

-- Preserva a relação também quando uma operação administrativa tenta mover
-- o registro pai para outra loja, depois de um lançamento já existir.
create or replace function public.food_guard_financial_parent_tenant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.store_id is not distinct from old.store_id then return new; end if;
  if tg_table_name = 'food_financial_categories' then
    if exists (select 1 from public.food_financial_entries e
      where e.category_id = old.id and e.store_id is distinct from new.store_id) then
      raise exception 'A categoria possui lançamentos financeiros e não pode ser transferida para outra loja.' using errcode = '23503';
    end if;
  elsif tg_table_name = 'food_orders' then
    if exists (select 1 from public.food_financial_entries e
      where e.order_id = old.id and e.store_id is distinct from new.store_id) then
      raise exception 'O pedido possui lançamentos financeiros e não pode ser transferido para outra loja.' using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists food_financial_categories_tenant_guard_trg on public.food_financial_categories;
create trigger food_financial_categories_tenant_guard_trg before update of store_id on public.food_financial_categories
for each row execute function public.food_guard_financial_parent_tenant();
drop trigger if exists food_orders_financial_tenant_guard_trg on public.food_orders;
create trigger food_orders_financial_tenant_guard_trg before update of store_id on public.food_orders
for each row execute function public.food_guard_financial_parent_tenant();

revoke all on function public.food_guard_store_commercial_write(), public.food_guard_financial_entry_tenant(), public.food_guard_financial_parent_tenant() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
