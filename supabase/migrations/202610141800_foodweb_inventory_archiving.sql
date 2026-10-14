begin;

do $$
begin
  if to_regclass('public.food_inventory_items') is null then
    raise exception 'food_inventory_items ainda não existe; aplique a fundação de estoque antes desta migração';
  end if;
end $$;

-- Insumos arquivados preservam movimentos, compras e fichas técnicas sem bloquear
-- um novo cadastro ativo com o mesmo nome.
drop index if exists public.food_inventory_items_store_name_uidx;

create unique index if not exists food_inventory_items_store_name_uidx
  on public.food_inventory_items(store_id, lower(trim(name)))
  where active;

comment on index public.food_inventory_items_store_name_uidx is
  'Mantém nomes únicos entre insumos ativos; arquivados preservam histórico e não bloqueiam novo cadastro.';

commit;
