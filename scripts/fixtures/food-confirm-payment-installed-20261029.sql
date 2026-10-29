-- Snapshot somente leitura de pg_get_functiondef em 29/10/2026.
-- md5: e4da399ee7668a3aa515c9ef52bcb00c. Usar apenas no banco isolado de teste.
CREATE OR REPLACE FUNCTION public.food_confirm_order_payment_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_order public.food_orders%rowtype; v_already_paid boolean;
begin
  select * into v_order from public.food_orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if not public.food_is_store_admin(v_order.store_id) and not public.food_is_platform_admin() then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if v_order.status='cancelled' then raise exception 'Não é possível confirmar o recebimento de um pedido cancelado.'; end if;
  if coalesce(v_order.total,0)<=0 then raise exception 'O pedido não possui valor válido para recebimento.'; end if;
  v_already_paid:=v_order.payment_status='paid';
  update public.food_orders set payment_status='paid',payment_received_at=coalesce(payment_received_at,now()),payment_confirmed_by=coalesce(payment_confirmed_by,auth.uid()) where id=p_order_id returning * into v_order;
  return jsonb_build_object('ok',true,'alreadyPaid',v_already_paid,'orderId',v_order.id,'paymentReceivedAt',v_order.payment_received_at,'amount',v_order.total,'inventoryStatus',v_order.inventory_status);
end;
$function$
