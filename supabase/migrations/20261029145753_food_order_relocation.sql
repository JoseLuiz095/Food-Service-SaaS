-- Requer a edição de itens com contexto de local, já revisada no PR #101.
begin;
do $$begin
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.food_guard_order_stock_location()') and md5(regexp_replace(prosrc,'\s+','','g'))='b1a21b91e66a71290793df6b86b0fd7a') then raise exception 'Guard de local divergente: revisar baseline antes de instalar.'; end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.food_update_order_items_v1(uuid,jsonb)') and md5(regexp_replace(prosrc,'\s+','','g'))='0a3dbd8734bbc140a28d744554cb2f50') then raise exception 'Edição de itens divergente: revisar reserva por local antes de instalar.'; end if;
end$$;
create or replace function public.food_guard_order_stock_location()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.stock_location_id is distinct from old.stock_location_id or new.pickup_location_id is distinct from old.pickup_location_id then
  if exists(select 1 from public.food_order_items where order_id=old.id) then
   if current_user <> 'postgres' or current_setting('food.relocating_order',true) is distinct from old.id::text
      or old.inventory_status <> 'released' or exists(select 1 from public.food_order_items where order_id=old.id and inventory_reserved_quantity>0) then
    raise exception 'Use a edição segura do ponto de retirada para mover a reserva.' using errcode='23514';
   end if;
  end if;
 end if;
 return new;
end$$;

create function public.food_edit_order_pickup_v1(p_order_id uuid,p_pickup_id uuid,p_expected_pickup_id uuid,p_details jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare o public.food_orders%rowtype; destination uuid; previous_flag text; previous_location text;
 item record; reserved integer; awaiting boolean; inventory text:='not_tracked'; tz text; future boolean; moved boolean;
begin
 select * into o from public.food_orders where id=p_order_id for update;
 if not found or auth.uid() is null or not coalesce(public.food_is_store_admin(o.store_id),false) then
  raise exception 'Sem permissão para editar este pedido.' using errcode='42501';
 end if;
 if o.status in ('cancelled','delivered','picked_up') or o.inventory_status='committed' then
  raise exception 'Um pedido encerrado não pode trocar o local de retirada.';
 end if;
 if o.delivery_type<>'pickup' then raise exception 'Esta operação exige um pedido para retirada.'; end if;
 if char_length(btrim(coalesce(p_details->>'customerName','')))<2 then raise exception 'Informe o nome do cliente.'; end if;
 if o.pickup_location_id is distinct from p_expected_pickup_id and o.pickup_location_id is distinct from p_pickup_id then
  raise exception 'O ponto do pedido mudou. Reabra o detalhe antes de salvar.' using errcode='40001';
 end if;
 select p.stock_location_id into destination from public.food_pickup_locations p
 join public.food_stock_locations l on l.id=p.stock_location_id and l.store_id=p.store_id and l.active
 where p.id=p_pickup_id and p.store_id=o.store_id and p.active for share of p,l;
 if destination is null then raise exception 'Ponto de retirada sem local de estoque ativo nesta loja.'; end if;
 moved:=o.pickup_location_id is distinct from p_pickup_id or o.stock_location_id is distinct from destination;
 previous_location:=current_setting('food.order_stock_location',true);
 previous_flag:=current_setting('food.relocating_order',true);
 -- Locks dos produtos são mantidos até o commit ou rollback da edição inteira.
 perform p.id from public.food_products p where p.id in(select product_id from public.food_order_items where order_id=o.id) order by p.id for update;
 if moved then
  perform public.food_release_order_inventory(o.id);
  update public.food_orders set inventory_status='released' where id=o.id;
  perform set_config('food.relocating_order',o.id::text,true);
  update public.food_orders set pickup_location_id=p_pickup_id,stock_location_id=destination where id=o.id;
  perform set_config('food.relocating_order',coalesce(previous_flag,''),true);
 end if;
 update public.food_orders set customer_name=btrim(p_details->>'customerName'),
 customer_phone=nullif(btrim(p_details->>'customerPhone'),''),notes=nullif(btrim(p_details->>'notes'),''),
 scheduled_for=nullif(p_details->>'scheduledFor','')::timestamptz,updated_at=now() where id=o.id;
 perform set_config('food.order_stock_location',destination::text,true);
 if jsonb_typeof(p_details->'items')='array' then
  -- Esta RPC existente revalida quantidades, preço/opções e recusa editar itens pagos.
  perform public.food_update_order_items_v1(o.id,p_details->'items');
 elsif moved then
  select opening_hours->>'timezone' into tz from public.food_stores where id=o.store_id;
  if tz is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=tz) then tz:='America/Sao_Paulo'; end if;
  future:=nullif(p_details->>'scheduledFor','')::timestamptz is not null and
    (nullif(p_details->>'scheduledFor','')::timestamptz at time zone tz)::date > (now() at time zone tz)::date;
  for item in select oi.* from public.food_order_items oi join public.food_products p on p.id=oi.product_id
    where oi.order_id=o.id and p.store_id=o.store_id and p.track_stock order by oi.product_id,oi.id loop
   select r.reserved_quantity,r.awaiting_restock into reserved,awaiting from public.food_reserve_product_inventory(item.product_id,item.quantity,coalesce(future,false)) r;
   update public.food_order_items set inventory_reserved_quantity=reserved where id=item.id;
   if awaiting then inventory:='awaiting_restock'; elsif reserved>0 and inventory<>'awaiting_restock' then inventory:='reserved'; end if;
  end loop;
  update public.food_orders set inventory_status=inventory where id=o.id;
 end if;
 perform set_config('food.order_stock_location',coalesce(previous_location,''),true);
 if moved then
  insert into public.food_platform_event_log(actor_user_id,store_id,kind,action,result,route,metadata)
  values(auth.uid(),o.store_id,'audit','order_pickup_changed','success','/admin/pedidos',
    jsonb_build_object('order_id',o.id,'from_stock_location',o.stock_location_id,'to_stock_location',destination,'from_pickup',o.pickup_location_id,'to_pickup',p_pickup_id));
 end if;
end$$;
revoke all on function public.food_edit_order_pickup_v1(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.food_edit_order_pickup_v1(uuid,uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
