-- Valida encomendas de festa no banco, independentemente do navegador usado.
-- O preço-base do produto é mantido como preço por pacote pela tela de
-- cadastro; esta trigger também recalcula adicionais e impede quantidades ou
-- datas fora da configuração do produto.
begin;

create or replace function public.food_validate_party_order_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.food_products%rowtype;
  v_order public.food_orders%rowtype;
  v_timezone text;
  v_local_scheduled date;
  v_local_today date;
  v_options_total numeric(12,2) := 0;
  v_base_price numeric(12,2);
begin
  select * into v_product
    from public.food_products
   where id = new.product_id;

  if v_product.id is null or not coalesce(v_product.party_order_enabled, false) then
    return new;
  end if;

  if new.quantity < coalesce(v_product.party_minimum_packages, 1) then
    raise exception 'A encomenda de % exige pelo menos % pacote(s).',
      v_product.name, coalesce(v_product.party_minimum_packages, 1);
  end if;

  select * into v_order from public.food_orders where id = new.order_id;
  if v_order.id is null or v_order.scheduled_for is null then
    raise exception 'A encomenda de % precisa de uma data agendada.', v_product.name;
  end if;

  select coalesce(nullif(v_store.opening_hours->>'timezone',''), 'America/Sao_Paulo')
    into v_timezone
    from public.food_stores v_store
   where v_store.id = v_order.store_id;
  v_local_scheduled := v_order.scheduled_for at time zone coalesce(v_timezone, 'America/Sao_Paulo');
  v_local_today := now() at time zone coalesce(v_timezone, 'America/Sao_Paulo');
  if v_local_scheduled < v_local_today + coalesce(v_product.party_lead_time_days, 0) then
    raise exception 'A encomenda de % precisa de pelo menos % dia(s) de antecedência.',
      v_product.name, coalesce(v_product.party_lead_time_days, 0);
  end if;

  select coalesce(sum(
    coalesce(nullif(entry->>'price_delta', '')::numeric, 0)
      * greatest(1, coalesce(nullif(entry->>'quantity', '')::integer, 1))
  ), 0)
    into v_options_total
    from jsonb_array_elements(coalesce(new.addons, '[]'::jsonb)) entry;

  v_base_price := round(coalesce(
    nullif(v_product.party_price_per_gram, 0) * nullif(v_product.party_package_weight_grams, 0),
    v_product.price
  ), 2);
  new.unit_price := round(v_base_price + v_options_total, 2);
  new.item_total := round(new.unit_price * new.quantity, 2);
  return new;
end;
$$;

drop trigger if exists food_order_items_party_guard_trg on public.food_order_items;
create trigger food_order_items_party_guard_trg
before insert on public.food_order_items
for each row execute function public.food_validate_party_order_item();

revoke all on function public.food_validate_party_order_item() from public;
grant execute on function public.food_validate_party_order_item() to authenticated;

notify pgrst, 'reload schema';
commit;
