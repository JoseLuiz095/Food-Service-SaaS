-- Evita bloquear a reconciliação automática de fichas técnicas quando uma
-- reposição de insumo dispara o próprio gatilho de atualização de saldo.
-- A função chamada no loop já possui o guard transacional; o gatilho externo
-- não deve ativá-lo antes da chamada.
begin;

create or replace function public.food_reconcile_recipe_orders_on_inventory_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
begin
  if coalesce(current_setting('foodweb.recipe_reconcile', true), '') = 'on' then
    return new;
  end if;
  if new.current_quantity <= old.current_quantity then
    return new;
  end if;

  for v_order_id in
    select distinct c.order_id
      from public.food_inventory_order_consumptions c
      join public.food_orders o on o.id = c.order_id
     where c.store_id = new.store_id
       and c.inventory_item_id = new.id
       and c.target_quantity > c.consumed_quantity
       and o.payment_status = 'paid'
       and o.status <> 'cancelled'
     order by c.order_id
  loop
    begin
      perform public.food_reconcile_order_recipe_consumption(v_order_id, true);
    exception when others then
      -- Uma reposição não deve falhar por causa de outro pedido inconsistente;
      -- o saldo pendente permanece visível para uma nova tentativa.
      null;
    end;
  end loop;
  return new;
end;
$$;

revoke all on function public.food_reconcile_recipe_orders_on_inventory_update() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
