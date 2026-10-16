-- Usa o status inicial configurado no produto para pedidos públicos.
-- A regra só atua durante a montagem do pedido e não sobrescreve um status
-- já alterado pela operação. Para produtos mistos, mantém "received".
begin;

create or replace function public.food_apply_product_default_order_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source text;
  v_current_status text;
  v_min_status text;
  v_max_status text;
  v_target_status text;
begin
  select source, status
    into v_source, v_current_status
    from public.food_orders
   where id = new.order_id;

  if coalesce(v_source, '') <> 'site' or v_current_status not in ('received', 'ready') then
    return new;
  end if;

  select min(coalesce(p.default_order_status, 'received')),
         max(coalesce(p.default_order_status, 'received'))
    into v_min_status, v_max_status
    from public.food_order_items oi
    join public.food_products p on p.id = oi.product_id
   where oi.order_id = new.order_id;

  v_target_status := case
    when v_min_status is not null and v_min_status = v_max_status then v_min_status
    else 'received'
  end;

  update public.food_orders
     set status = v_target_status,
         updated_at = now()
   where id = new.order_id
     and source = 'site'
     and status in ('received', 'ready');

  return new;
end;
$$;

drop trigger if exists food_order_items_product_default_status_trg on public.food_order_items;
create trigger food_order_items_product_default_status_trg
after insert on public.food_order_items
for each row execute function public.food_apply_product_default_order_status();

revoke all on function public.food_apply_product_default_order_status() from public;
grant execute on function public.food_apply_product_default_order_status() to authenticated;

notify pgrst, 'reload schema';
commit;
