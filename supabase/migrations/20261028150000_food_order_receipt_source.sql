-- core: origem de comunicação, separada de retirada/local de estoque.
-- Wrapper transacional da RPC existente; não substitui suas validações.
begin;
do $$ begin
 if pg_get_function_result('public.food_create_public_order(jsonb)'::regprocedure) <> 'TABLE(order_id uuid, order_number bigint, order_total numeric)' then raise exception 'Revisar assinatura efetiva do checkout antes de instalar'; end if;
end $$;
create table public.food_order_receipt_sources (
 order_id uuid primary key references public.food_orders(id) on delete cascade,
 store_id uuid not null references public.food_stores(id),
 pickup_location_id uuid,
 foreign key(pickup_location_id,store_id) references public.food_pickup_locations(id,store_id)
);
alter table public.food_order_receipt_sources enable row level security;
revoke all on public.food_order_receipt_sources from public,anon,authenticated;
grant select on public.food_order_receipt_sources to service_role;
create function public.food_create_public_order_with_receipt_v1(payload jsonb)
returns table(order_id uuid,order_number bigint,order_total numeric)
language plpgsql security definer set search_path='' as $$
declare v_store uuid:=(payload->>'store_id')::uuid; v_point uuid:=nullif(payload->>'receipt_pickup_location_id','')::uuid; v_result record;
begin
 if v_point is not null then
  perform 1 from public.food_pickup_locations p join public.food_stock_locations l on l.id=p.stock_location_id and l.store_id=p.store_id and l.active
   where p.id=v_point and p.store_id=v_store and p.active and p.is_public for share of p,l;
  if not found then raise exception 'O ponto de origem do comprovante está indisponível. Confira o link da loja.' using errcode='22023'; end if;
 end if;
 for v_result in select * from public.food_create_public_order(payload-'receipt_pickup_location_id') loop
  -- A origem é gravada na MESMA transação; falha desfaz inclusive o pedido/reservas.
  insert into public.food_order_receipt_sources(order_id,store_id,pickup_location_id)
   select o.id,o.store_id,v_point from public.food_orders o where o.id=v_result.order_id and o.store_id=v_store
   on conflict on constraint food_order_receipt_sources_pkey do nothing;
  if not exists(select 1 from public.food_order_receipt_sources s where s.order_id=v_result.order_id and s.store_id=v_store) then raise exception 'Não foi possível validar a origem do pedido'; end if;
  return query select v_result.order_id::uuid,v_result.order_number::bigint,v_result.order_total::numeric;
 end loop;
end; $$;
revoke all on function public.food_create_public_order_with_receipt_v1(jsonb) from public,anon,authenticated;
grant execute on function public.food_create_public_order_with_receipt_v1(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
