-- Ensure initial product balances survive default-location initialization during bulk inserts.
-- A new location may pre-create zero rows for every product visible in the statement.
CREATE OR REPLACE FUNCTION public.food_sync_default_location_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_location_id uuid;
  v_quantity_delta integer;
  v_reserved_delta integer;
  v_quantity integer;
  v_reserved integer;
  v_routed_location uuid;
begin
  if current_setting('food.stock_location_sync', true) = 'on' then return new; end if;
  if tg_op = 'UPDATE' and not coalesce(new.track_stock,false) then return new; end if;
  select id into v_location_id from public.food_stock_locations
   where store_id=new.store_id and is_default and active limit 1;
  if v_location_id is null then
    insert into public.food_stock_locations(store_id,name,location_type,is_default)
    values(new.store_id,'Estoque principal','warehouse',true)
    returning id into v_location_id;
  end if;
  if tg_op = 'INSERT' then
    v_quantity := case when coalesce(new.track_stock,false) then greatest(coalesce(new.stock_quantity,0),0) else 0 end;
    v_reserved := case when coalesce(new.track_stock,false) then least(greatest(coalesce(new.stock_reserved_quantity,0),0),v_quantity) else 0 end;
    insert into public.food_product_location_stock(store_id,product_id,location_id,stock_quantity,stock_reserved_quantity)
    values(new.store_id,new.id,v_location_id,v_quantity,v_reserved)
    on conflict(product_id,location_id) do update
      set stock_quantity=excluded.stock_quantity,
          stock_reserved_quantity=excluded.stock_reserved_quantity,
          updated_at=now();
    return new;
  end if;
  if new.store_id is distinct from old.store_id then
    raise exception 'A loja do produto não pode mudar depois de criar saldos por local.' using errcode='23514';
  end if;
  if new.track_stock is distinct from old.track_stock and not coalesce(new.track_stock,false) then
    raise exception 'Desative o controle por local antes de desativar o estoque do produto.' using errcode='23514';
  end if;
  if coalesce(new.track_stock,false) and not coalesce(old.track_stock,false) then
    insert into public.food_product_location_stock(store_id,product_id,location_id,stock_quantity,stock_reserved_quantity)
    values(new.store_id,new.id,v_location_id,greatest(coalesce(new.stock_quantity,0),0),least(greatest(coalesce(new.stock_reserved_quantity,0),0),greatest(coalesce(new.stock_quantity,0),0)))
    on conflict(product_id,location_id) do update
      set stock_quantity=excluded.stock_quantity,stock_reserved_quantity=excluded.stock_reserved_quantity,updated_at=now();
    return new;
  end if;
  begin v_routed_location := nullif(current_setting('food.order_stock_location',true),'')::uuid; exception when others then raise exception 'Local de estoque inválido.'; end;
  if v_routed_location is not null then
    if not exists(select 1 from public.food_stock_locations where id=v_routed_location and store_id=new.store_id and active) then raise exception 'Local de estoque fora da loja.'; end if;
    v_location_id := v_routed_location;
  end if;
  v_quantity_delta := coalesce(new.stock_quantity,0)-coalesce(old.stock_quantity,0);
  v_reserved_delta := coalesce(new.stock_reserved_quantity,0)-coalesce(old.stock_reserved_quantity,0);
  if v_quantity_delta <> 0 or v_reserved_delta <> 0 then
    insert into public.food_product_location_stock(store_id,product_id,location_id)
    values(new.store_id,new.id,v_location_id) on conflict(product_id,location_id) do nothing;
    update public.food_product_location_stock
       set stock_quantity=stock_quantity+v_quantity_delta,
           stock_reserved_quantity=stock_reserved_quantity+v_reserved_delta,
           updated_at=now()
     where product_id=new.id and location_id=v_location_id
       and stock_quantity+v_quantity_delta>=0
       and stock_reserved_quantity+v_reserved_delta>=0
       and stock_reserved_quantity+v_reserved_delta<=stock_quantity+v_quantity_delta;
    if not found then
      raise exception 'O ajuste do estoque principal não cobre o saldo solicitado; use a operação por local.' using errcode='23514';
    end if;
  end if;
  return new;
end;
$function$

