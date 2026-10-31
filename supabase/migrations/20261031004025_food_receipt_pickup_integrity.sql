-- core: declaração operacional separada da conferência bancária.
-- Aplicar após customer_receipt_payment e pickup_receipt_closeout, na mesma
-- implantação, antes de habilitar flags ou políticas. Não altera pedidos antigos.
begin;
set local lock_timeout='5s';

create or replace function public.food_save_receipt_policy_v1(
 p_store_id uuid,p_contacts jsonb,p_points jsonb,p_auto_paid boolean
) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.food_is_store_admin(p_store_id),false) then
  raise exception 'Acesso negado.' using errcode='42501';
 end if;
 perform 1 from public.food_stores where id=p_store_id for update;
 perform public.food_save_receipt_contacts_v1(p_store_id,p_contacts,p_points);
 -- Lojas que operam apenas por pontos não precisam duplicar um contato geral.
 if p_auto_paid and not exists(select 1 from public.food_receipt_contacts where store_id=p_store_id)
    and not exists(select 1 from public.food_pickup_locations p
      where p.store_id=p_store_id and p.active and p.is_public
        and public.food_get_receipt_destinations_v1(p_store_id,p.id)->>'mode'='point') then
  raise exception 'Cadastre um contato geral ou o WhatsApp de um ponto ativo.' using errcode='22023';
 end if;
 update public.food_stores set receipt_click_marks_paid=coalesce(p_auto_paid,false),updated_at=now()
 where id=p_store_id;
end$$;
revoke all on function public.food_save_receipt_policy_v1(uuid,jsonb,jsonb,boolean) from public,anon;
grant execute on function public.food_save_receipt_policy_v1(uuid,jsonb,jsonb,boolean) to authenticated;

create or replace function public.food_declare_order_receipt_v1(
 p_store_id uuid,p_order_id uuid,p_amount numeric,p_version integer
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.food_orders%rowtype; enabled boolean; v_auto_pickup boolean:=false;
begin
 select * into o from public.food_orders where id=p_order_id and store_id=p_store_id for update;
 if not found then raise exception 'Pedido indisponível.';end if;
 select receipt_click_marks_paid into enabled from public.food_stores
  where id=o.store_id and active and access_status='online' for share;
 if enabled is distinct from true then raise exception 'A declaração de pagamento não está habilitada nesta loja.';end if;
 if p_version is distinct from o.payment_receipt_version or p_version<>0 or p_amount is distinct from o.total then
  raise exception 'O pedido foi alterado ou revisado. Solicite orientação à loja.' using errcode='40001';
 end if;
 -- Cancelamento deve ser validado ANTES do retorno idempotente.
 if o.status='cancelled' or o.payment_method<>'pix' or o.total<=0 then
  raise exception 'Este pedido não aceita declaração de pagamento.';
 end if;
 if o.payment_status='paid' and o.payment_reported_by_customer then
  return jsonb_build_object('ok',true,'alreadyPaid',true,'autoPickedUp',o.status='picked_up');
 end if;
 if o.status in ('delivered','picked_up') or o.payment_status<>'pending' then
  raise exception 'Este pedido não aceita declaração de pagamento.';
 end if;
 if o.source='site' and o.delivery_type='pickup' and o.pickup_location_id is not null and o.scheduled_for is null then
  select coalesce(p.auto_pickup_on_receipt,false) into v_auto_pickup
  from public.food_pickup_locations p
  join public.food_stock_locations l on l.id=p.stock_location_id and l.store_id=p.store_id and l.active
  where p.id=o.pickup_location_id and p.store_id=o.store_id and p.active and p.is_public
    and l.id=o.stock_location_id for share of p,l;
  v_auto_pickup:=coalesce(v_auto_pickup,false);
 end if;
 if v_auto_pickup then
  -- O fluxo automático só conclui estoque já reservado. Não tenta suprir
  -- diferenças a partir do estoque principal nem de outro ponto.
  perform p.id from public.food_products p
   where p.store_id=o.store_id and p.id in(select product_id from public.food_order_items where order_id=o.id)
   order by p.id for update;
  if o.inventory_status in ('released','awaiting_restock')
     or not exists(select 1 from public.food_order_items where order_id=o.id)
     or exists(select 1 from public.food_order_items i
       left join public.food_products p on p.id=i.product_id and p.store_id=o.store_id
       where i.order_id=o.id and (p.id is null or i.quantity<=0
         or (p.track_stock and i.inventory_reserved_quantity is distinct from i.quantity))) then
   raise exception 'A retirada automática exige reserva integral no estoque deste ponto.' using errcode='23514';
  end if;
 end if;
 update public.food_orders set payment_status='paid',payment_reported_by_customer=true,
  payment_reported_at=now(),payment_received_at=null,payment_confirmed_by=null,
  status=case when v_auto_pickup then 'picked_up' else status end,updated_at=now()
 where id=o.id;
 insert into public.food_platform_event_log(store_id,kind,action,result,route,metadata)
  values(o.store_id,'audit','order_receipt_declared','success','/pagamento',
   jsonb_build_object('order_id',o.id,'source','customer_declaration','auto_picked_up',v_auto_pickup));
 return jsonb_build_object('ok',true,'alreadyPaid',false,'autoPickedUp',v_auto_pickup);
end$$;
revoke all on function public.food_declare_order_receipt_v1(uuid,uuid,numeric,integer) from public,anon,authenticated;
grant execute on function public.food_declare_order_receipt_v1(uuid,uuid,numeric,integer) to service_role;
notify pgrst,'reload schema';
commit;
