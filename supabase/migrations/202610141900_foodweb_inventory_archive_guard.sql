begin;

-- Impede arquivar um insumo que ainda participa de uma ficha ativa.
-- Primeiro arquive/edite a automação; assim nenhuma venda fica sem consumo.
create or replace function public.food_inventory_guard_archive_in_use()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.active and not new.active
     and exists (
       select 1
         from public.food_product_recipe_items ri
         join public.food_product_recipes r
           on r.id = ri.recipe_id
          and r.store_id = ri.store_id
          and r.active
        where ri.store_id = new.store_id
          and ri.inventory_item_id = new.id
     ) then
    raise exception 'Não é possível arquivar este insumo enquanto ele estiver em uma ficha técnica ativa. Edite ou arquive a automação primeiro.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.food_inventory_guard_archive_in_use() from public, anon, authenticated;

drop trigger if exists food_inventory_guard_archive_in_use_trg on public.food_inventory_items;
create trigger food_inventory_guard_archive_in_use_trg
before update of active on public.food_inventory_items
for each row execute function public.food_inventory_guard_archive_in_use();

commit;
