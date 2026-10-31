-- core: gestão de pontos de qualquer loja; mantém estoques e pedidos existentes.
begin;
set local lock_timeout='5s';
create function public.food_edit_pickup_point_v1(
 p_store_id uuid,p_point_id uuid,p_name text,p_stock_location_id uuid,p_expected_stock_location_id uuid
) returns void language plpgsql security definer set search_path='' as $$
declare point public.food_pickup_locations%rowtype;
begin
 if auth.uid() is null or not coalesce(public.food_is_store_admin(p_store_id),false) then
  raise exception 'Acesso negado.' using errcode='42501';
 end if;
 select * into point from public.food_pickup_locations where id=p_point_id and store_id=p_store_id for update;
 if not found then raise exception 'Ponto indisponível.' using errcode='22023';end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 80 then raise exception 'Informe um nome de até 80 caracteres.' using errcode='22023';end if;
 if point.stock_location_id is distinct from p_expected_stock_location_id then
  raise exception 'O estoque deste ponto mudou. Reabra a edição antes de salvar.' using errcode='40001';
 end if;
 if point.stock_location_id is distinct from p_stock_location_id then
  perform 1 from public.food_stock_locations where id=p_stock_location_id and store_id=p_store_id and active for share;
  if not found then raise exception 'Escolha um estoque ativo desta loja.' using errcode='22023';end if;
  if exists(select 1 from public.food_orders where pickup_location_id=point.id and store_id=p_store_id)
    or exists(select 1 from public.food_order_receipt_sources where pickup_location_id=point.id and store_id=p_store_id) then
   raise exception 'Este ponto tem pedidos vinculados. Crie outro ponto para usar um novo estoque; os pedidos existentes mantêm sua origem.' using errcode='23514';
  end if;
 end if;
 update public.food_pickup_locations set name=btrim(p_name),stock_location_id=p_stock_location_id,updated_at=now()
  where id=point.id and store_id=p_store_id;
 insert into public.food_platform_event_log(actor_user_id,store_id,kind,action,result,route,metadata)
 values(auth.uid(),p_store_id,'audit','pickup_point_edited','success','/admin/estoque',
  jsonb_build_object('pickup_location_id',point.id,'from_stock_location',point.stock_location_id,'to_stock_location',p_stock_location_id));
end$$;
revoke all on function public.food_edit_pickup_point_v1(uuid,uuid,text,uuid,uuid) from public,anon;
grant execute on function public.food_edit_pickup_point_v1(uuid,uuid,text,uuid,uuid) to authenticated;

create function public.food_retire_pickup_point_v1(p_store_id uuid,p_point_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare point public.food_pickup_locations%rowtype; result text;
begin
 if auth.uid() is null or not coalesce(public.food_is_store_admin(p_store_id),false) then
  raise exception 'Acesso negado.' using errcode='42501';
 end if;
 select * into point from public.food_pickup_locations where id=p_point_id and store_id=p_store_id for update;
 if not found then raise exception 'Ponto indisponível.' using errcode='22023';end if;
 if exists(select 1 from public.food_orders where pickup_location_id=point.id and store_id=p_store_id)
    or exists(select 1 from public.food_order_receipt_sources where pickup_location_id=point.id and store_id=p_store_id) then
  update public.food_pickup_locations set active=false,is_public=false,updated_at=now() where id=point.id and store_id=p_store_id;
  result:='archived';
 else
  delete from public.food_pickup_point_contacts where pickup_location_id=point.id and store_id=p_store_id;
  delete from public.food_pickup_receipt_contacts where pickup_location_id=point.id and store_id=p_store_id;
  delete from public.food_pickup_locations where id=point.id and store_id=p_store_id;
  result:='deleted';
 end if;
 insert into public.food_platform_event_log(actor_user_id,store_id,kind,action,result,route,metadata)
 values(auth.uid(),p_store_id,'audit','pickup_point_retired','success','/admin/estoque',
  jsonb_build_object('pickup_location_id',point.id,'action',result));
 return jsonb_build_object('action',result);
end$$;
revoke all on function public.food_retire_pickup_point_v1(uuid,uuid) from public,anon;
grant execute on function public.food_retire_pickup_point_v1(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
