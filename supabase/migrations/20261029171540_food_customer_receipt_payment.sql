-- Opt-in por loja: clique do cliente é declaração, não confirmação bancária.
begin;
set local lock_timeout='5s';
do $$begin
 if to_regprocedure('public.food_save_receipt_contacts_v1(uuid,jsonb,jsonb)') is null then
  raise exception 'Instale e revise primeiro os contatos/destinos de comprovantes.';
 end if;
end$$;
alter table public.food_stores add column receipt_click_marks_paid boolean not null default false;
alter table public.food_orders add column payment_reported_by_customer boolean not null default false,
 add column payment_receipt_version integer not null default 0 check(payment_receipt_version>=0),
 add column payment_reported_at timestamptz;

create function public.food_guard_receipt_report_fields() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 -- Compatibilidade: a confirmação administrativa existente também invalida a declaração.
 if tg_op='UPDATE' and old.payment_reported_by_customer and new.payment_reported_by_customer
   and new.payment_confirmed_by is not null and current_user in ('postgres','service_role','supabase_admin') then
  new.payment_reported_by_customer:=false;new.payment_receipt_version:=old.payment_receipt_version+1;
  insert into public.food_platform_event_log(actor_user_id,store_id,kind,action,result,route,metadata)
   values(new.payment_confirmed_by,new.store_id,'audit','order_receipt_verified','success','/admin/pedidos',jsonb_build_object('order_id',new.id));
 end if;
 if (tg_op='INSERT' and (new.payment_reported_by_customer or new.payment_receipt_version<>0 or new.payment_reported_at is not null))
 or (tg_op='UPDATE' and (new.payment_reported_by_customer,new.payment_receipt_version,new.payment_reported_at) is distinct from (old.payment_reported_by_customer,old.payment_receipt_version,old.payment_reported_at)) then
  if current_user not in ('postgres','service_role','supabase_admin') then raise exception 'Use a conferência autorizada do comprovante.' using errcode='42501'; end if;
 end if;
 return new;
end$$;
revoke all on function public.food_guard_receipt_report_fields() from public,anon,authenticated;
create trigger food_orders_receipt_report_guard before insert or update on public.food_orders for each row execute function public.food_guard_receipt_report_fields();

-- A sincronização financeira legada usa texto de confirmação manual em todo UPDATE pago.
-- Executar após ela mantém a origem correta também quando total/itens são editados.
create function public.food_note_customer_receipt_finance() returns trigger language plpgsql security definer set search_path='' as $$begin
 update public.food_financial_entries set notes='Pagamento informado pelo cliente ao abrir o envio de comprovante; aguardando conferência da loja.',created_by=null where store_id=new.store_id and order_id=new.id and source='order';
 return new;
end$$;
revoke all on function public.food_note_customer_receipt_finance() from public,anon,authenticated;
create trigger zz_food_orders_receipt_finance_note after insert or update of status,total,payment_status,payment_received_at,payment_method on public.food_orders for each row when(new.payment_reported_by_customer and new.payment_status='paid') execute function public.food_note_customer_receipt_finance();

create function public.food_save_receipt_policy_v1(p_store_id uuid,p_contacts jsonb,p_points jsonb,p_auto_paid boolean)
returns void language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or not coalesce(public.food_is_store_admin(p_store_id),false) then raise exception 'Acesso negado.' using errcode='42501';end if;
 if p_auto_paid and (jsonb_typeof(p_contacts)<>'array' or jsonb_array_length(p_contacts)<1) then raise exception 'Cadastre ao menos um contato para o aviso de pagamento.';end if;
 perform 1 from public.food_stores where id=p_store_id for update;
 perform public.food_save_receipt_contacts_v1(p_store_id,p_contacts,p_points);
 update public.food_stores set receipt_click_marks_paid=coalesce(p_auto_paid,false),updated_at=now() where id=p_store_id;
end$$;
revoke all on function public.food_save_receipt_policy_v1(uuid,jsonb,jsonb,boolean) from public,anon;
grant execute on function public.food_save_receipt_policy_v1(uuid,jsonb,jsonb,boolean) to authenticated;

-- Só a Edge Function, após abrir capability autenticada, pode chamar esta RPC.
create function public.food_declare_order_receipt_v1(p_store_id uuid,p_order_id uuid,p_amount numeric,p_version integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.food_orders%rowtype;enabled boolean;
begin
 select * into o from public.food_orders where id=p_order_id and store_id=p_store_id for update;
 if not found then raise exception 'Pedido indisponível.';end if;
 select receipt_click_marks_paid into enabled from public.food_stores where id=o.store_id and active and access_status='online' for share;
 if enabled is distinct from true then raise exception 'A declaração de pagamento não está habilitada nesta loja.';end if;
 if p_version is distinct from o.payment_receipt_version or p_version<>0 or p_amount is distinct from o.total then raise exception 'O pedido foi alterado ou revisado. Solicite orientação à loja.' using errcode='40001';end if;
 if o.status in ('cancelled','delivered','picked_up') or o.payment_method<>'pix' or o.total<=0 then raise exception 'Este pedido não aceita declaração de pagamento.';end if;
 if o.payment_status='paid' and o.payment_reported_by_customer then return jsonb_build_object('ok',true,'alreadyPaid',true);end if;
 if o.payment_status<>'pending' then raise exception 'Este pedido não aceita declaração de pagamento.';end if;
 update public.food_orders set payment_status='paid',payment_reported_by_customer=true,payment_reported_at=now(),payment_received_at=now(),payment_confirmed_by=null,updated_at=now() where id=o.id;
 -- O trigger financeiro existente faz upsert único; a guarda posterior anota a origem.
 insert into public.food_platform_event_log(store_id,kind,action,result,route,metadata) values(o.store_id,'audit','order_receipt_declared','success','/pagamento',jsonb_build_object('order_id',o.id,'source','customer_declaration'));
 return jsonb_build_object('ok',true,'alreadyPaid',false);
end$$;
revoke all on function public.food_declare_order_receipt_v1(uuid,uuid,numeric,integer) from public,anon,authenticated;
grant execute on function public.food_declare_order_receipt_v1(uuid,uuid,numeric,integer) to service_role;

create function public.food_review_receipt_report_v1(p_order_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.food_orders%rowtype;
begin
 select * into o from public.food_orders where id=p_order_id for update;
 if not found or auth.uid() is null or not coalesce(public.food_is_store_admin(o.store_id),false) then raise exception 'Acesso negado.' using errcode='42501';end if;
 if p_accept is null or o.status='cancelled' then raise exception 'Pedido ou decisão inválida.';end if;
 if not o.payment_reported_by_customer then
  if (p_accept and o.payment_status='paid') or (not p_accept and o.payment_status='pending') then return jsonb_build_object('ok',true,'alreadyPaid',p_accept);end if;
  raise exception 'Este pagamento já foi conferido pela loja.';
 end if;
 if p_accept then
  update public.food_orders set payment_reported_by_customer=false,payment_receipt_version=payment_receipt_version+1,payment_status='paid',payment_received_at=now(),payment_confirmed_by=auth.uid(),updated_at=now() where id=o.id;
 else
  update public.food_orders set payment_reported_by_customer=false,payment_receipt_version=payment_receipt_version+1,payment_status='pending',payment_received_at=null,payment_confirmed_by=null,updated_at=now() where id=o.id;
  -- O trigger legado não desfaz lançamento pago ao voltar para pending.
  update public.food_financial_entries set status='pending',paid_at=null,notes='Declaração do cliente devolvida para A receber pela loja.',updated_at=now() where store_id=o.store_id and order_id=o.id and source='order';
 end if;
 insert into public.food_platform_event_log(actor_user_id,store_id,kind,action,result,route,metadata) values(auth.uid(),o.store_id,'audit',case when p_accept then 'order_receipt_verified' else 'order_receipt_returned' end,'success','/admin/pedidos',jsonb_build_object('order_id',o.id));
 return jsonb_build_object('ok',true,'alreadyPaid',false,'paymentReceivedAt',case when p_accept then now() else null end);
end$$;
revoke all on function public.food_review_receipt_report_v1(uuid,boolean) from public,anon;
grant execute on function public.food_review_receipt_report_v1(uuid,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
