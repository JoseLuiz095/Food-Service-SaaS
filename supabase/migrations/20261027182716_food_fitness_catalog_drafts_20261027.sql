-- Produtos físicos Fitness ficam em rascunho até que preço, variantes e
-- quantidade por variante sejam confirmados em um fluxo de publicação próprio.
-- Não altera saldos, produtos ou pedidos de lojas já existentes.
begin;
create function food_fitness_private.guard_product_publication()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.active and food_fitness_private.is_fitness(new.store_id) then
    raise exception 'Produto Fitness permanece em rascunho até confirmar preço, variantes e estoque por variante.' using errcode='22023';
  end if;
  return new;
end; $$;
create trigger food_fitness_guard_product_publication before insert or update of active,store_id
on public.food_products for each row execute function food_fitness_private.guard_product_publication();
revoke all on function food_fitness_private.guard_product_publication() from public,anon,authenticated;
commit;
