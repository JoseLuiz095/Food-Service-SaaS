-- Classificação: food. Preparada em isolamento; NÃO aplicada remotamente.
-- Baseline: catálogo remoto de 28/10/2026 e main 72b20a2.
-- Substitui apenas a RPC de edição; preserva assinatura, grants e regras comerciais.
-- Não depende do PR #100 e não reconcilia pedidos históricos.
begin;

do $baseline$
begin
  if not exists (
    select 1 from pg_proc p
     where p.oid = to_regprocedure('public.food_update_order_items_v1(uuid,jsonb)')
       and md5(regexp_replace(p.prosrc, '\s+', '', 'g')) in
         ('dc63def9a0dd038cbfa000c7b7d31f98', '0a3dbd8734bbc140a28d744554cb2f50')
  ) then
    raise exception 'Baseline de food_update_order_items_v1 divergente; revise a definição instalada antes de continuar.';
  end if;
end;
$baseline$;

CREATE OR REPLACE FUNCTION public.food_update_order_items_v1(p_order_id uuid, p_items jsonb)
 RETURNS TABLE(subtotal numeric, total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order public.food_orders%rowtype;
  v_existing public.food_order_items%rowtype;
  v_product public.food_products%rowtype;
  v_entry jsonb;
  v_item_id uuid;
  v_product_id uuid;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_item_total numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_delivery_fee numeric(12,2) := 0;
  v_seen_ids uuid[] := array[]::uuid[];
  v_reserved integer;
  v_awaiting boolean;
  v_inventory_status text := 'not_tracked';
  v_allow_future boolean := false;
  v_timezone text := 'America/Sao_Paulo';
  v_location_id uuid;
  v_previous_location text;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Informe os produtos do pedido.';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Mantenha pelo menos um produto no pedido.';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'O pedido excede o limite de itens.';
  end if;

  select * into v_order from public.food_orders where id = p_order_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if not public.food_is_store_admin(v_order.store_id) and not public.food_is_platform_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if v_order.payment_status = 'paid' or v_order.inventory_status = 'committed' then
    raise exception 'Itens de um pedido já recebido não podem ser alterados.';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'Um pedido cancelado não pode ser editado.';
  end if;

  select coalesce(s.opening_hours->>'timezone', 'America/Sao_Paulo')
    into v_timezone
    from public.food_stores s where s.id = v_order.store_id;
  v_allow_future := v_order.scheduled_for is not null
    and (v_order.scheduled_for at time zone v_timezone)::date >= ((now() at time zone v_timezone)::date + 1);
  v_delivery_fee := coalesce(v_order.delivery_fee, 0);

  -- Todas as alterações de reserva desta edição pertencem ao local do pedido.
  -- Valide antes de liberar qualquer unidade; nunca use o contexto do chamador
  -- para escolher o local nem aceite um local de outra loja/inativo.
  select l.id into v_location_id
    from public.food_stock_locations l
   where l.store_id = v_order.store_id and l.active
     and l.id = coalesce(v_order.stock_location_id, (
       select d.id from public.food_stock_locations d
        where d.store_id = v_order.store_id and d.is_default and d.active
     ))
   for share;
  if v_location_id is null and (
    exists (
      select 1 from public.food_order_items oi
      join public.food_products p on p.id = oi.product_id
      where oi.order_id = p_order_id and (p.track_stock or oi.inventory_reserved_quantity > 0)
    ) or exists (
      select 1 from jsonb_array_elements(p_items) e
      join public.food_products p on p.id::text = e->>'product_id'
      where p.store_id = v_order.store_id and p.track_stock
    )
  ) then
    raise exception 'Local de estoque indisponível.' using errcode = '23514';
  end if;
  -- Serviços sem estoque podem não possuir nenhum local cadastrado.
  v_previous_location := current_setting('food.order_stock_location', true);
  perform set_config('food.order_stock_location', coalesce(v_location_id::text, ''), true);

  -- Libera a reserva anterior antes de recalcular as linhas. O status volta a
  -- released durante a edição: o trigger INSERT já existente ignora este
  -- estado. A reserva única de todas as linhas é refeita no loop abaixo.
  if v_order.inventory_status in ('reserved', 'awaiting_restock') then
    perform public.food_release_order_inventory(p_order_id);
  end if;
  update public.food_orders set inventory_status = 'released', updated_at = now() where id = p_order_id;

  for v_entry in select * from jsonb_array_elements(p_items) loop
    begin
      v_quantity := (v_entry->>'quantity')::integer;
    exception when others then
      raise exception 'Quantidade inválida.';
    end;
    if v_quantity is null or v_quantity < 1 or v_quantity > 99 then raise exception 'Quantidade inválida.'; end if;

    v_item_id := null;
    begin
      if nullif(v_entry->>'item_id', '') is not null then v_item_id := (v_entry->>'item_id')::uuid; end if;
    exception when others then raise exception 'Item do pedido inválido.'; end;

    if v_item_id is not null then
      if v_item_id = any(v_seen_ids) then raise exception 'Item duplicado no pedido.'; end if;
      select * into v_existing from public.food_order_items where id = v_item_id and order_id = p_order_id for update;
      if not found then raise exception 'Item do pedido não encontrado.'; end if;
      v_unit_price := round(v_existing.item_total / nullif(v_existing.quantity, 0), 2);
      v_item_total := round(v_unit_price * v_quantity, 2);
      update public.food_order_items
         set quantity = v_quantity, item_total = v_item_total
       where id = v_item_id;
    else
      begin v_product_id := (v_entry->>'product_id')::uuid; exception when others then raise exception 'Produto inválido.'; end;
      select * into v_product from public.food_products p
       where p.id = v_product_id and p.store_id = v_order.store_id and p.active
         and p.availability_status <> 'unavailable' and p.stock_status <> 'unavailable';
      if not found then raise exception 'Produto não disponível para edição.'; end if;
      if exists (
        select 1 from public.food_product_option_groups pog
        join public.food_option_groups og on og.id = pog.option_group_id and og.store_id = pog.store_id
        where pog.product_id = v_product.id and pog.store_id = v_order.store_id and og.active and og.min_choices > 0
      ) then
        raise exception 'O produto % exige opções. Abra o pedido original para manter a personalização.', v_product.name;
      end if;
      v_unit_price := round(coalesce(v_product.promotional_price, v_product.price), 2);
      v_item_total := round(v_unit_price * v_quantity, 2);
      insert into public.food_order_items(order_id, product_id, product_name, quantity, unit_price, variant_name, variant_price_delta, addons, item_total)
      values (p_order_id, v_product.id, v_product.name, v_quantity, v_unit_price, null, 0, '[]'::jsonb, v_item_total)
      returning id into v_item_id;
    end if;
    v_seen_ids := array_append(v_seen_ids, v_item_id);
    v_subtotal := v_subtotal + v_item_total;
  end loop;

  delete from public.food_order_items
   where order_id = p_order_id and not (id = any(v_seen_ids));

  -- Atualiza a reserva de cada linha sem depender de chamadas separadas do
  -- navegador. A função de reserva mantém o lock do produto e trata encomenda
  -- futura sem bloquear o pedido quando ainda não há saldo.
  for v_existing in
    select oi.* from public.food_order_items oi where oi.order_id = p_order_id order by oi.created_at
  loop
    if v_existing.product_id is not null and exists (
      select 1 from public.food_products p where p.id = v_existing.product_id and p.track_stock
    ) then
      select r.reserved_quantity, r.awaiting_restock into v_reserved, v_awaiting
        from public.food_reserve_product_inventory(v_existing.product_id, v_existing.quantity, v_allow_future) r;
      update public.food_order_items set inventory_reserved_quantity = coalesce(v_reserved, 0) where id = v_existing.id;
      if v_awaiting then v_inventory_status := 'awaiting_restock';
      elsif coalesce(v_reserved, 0) > 0 and v_inventory_status <> 'awaiting_restock' then v_inventory_status := 'reserved';
      end if;
    end if;
  end loop;

  v_subtotal := round(v_subtotal, 2);
  v_total := round(v_subtotal + v_delivery_fee, 2);
  if v_order.payment_method = 'cash' and v_order.needs_change
     and (v_order.change_for is null or v_order.change_for <= v_total) then
    raise exception 'O novo total exige revisar o valor para troco antes de editar os produtos.';
  end if;
  update public.food_orders
     set subtotal = v_subtotal, total = v_total, inventory_status = v_inventory_status,
         change_amount = case when v_order.payment_method = 'cash' and v_order.needs_change
           then round(v_order.change_for - v_total, 2) else v_order.change_amount end,
         updated_at = now()
   where id = p_order_id;
  -- Em erro, o PostgreSQL reverte também o GUC local junto com a edição.
  perform set_config('food.order_stock_location', coalesce(v_previous_location, ''), true);
  return query select v_subtotal, v_total;
end;
$function$;

commit;
