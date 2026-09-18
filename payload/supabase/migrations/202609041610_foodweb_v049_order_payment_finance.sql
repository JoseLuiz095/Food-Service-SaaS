begin;

-- FoodWeb v0.4.9: a receita nasce quando o lojista confirma o recebimento,
-- e nao mais apenas quando o pedido chega ao status entregue/retirado.

alter table public.food_orders
  add column if not exists payment_status text not null default 'pending',
  add column if not exists payment_received_at timestamptz,
  add column if not exists payment_confirmed_by uuid references auth.users(id) on delete set null;

update public.food_orders set payment_status='pending' where payment_status is null;
alter table public.food_orders alter column payment_status set default 'pending';
alter table public.food_orders alter column payment_status set not null;
alter table public.food_orders drop constraint if exists food_orders_payment_status_check;
alter table public.food_orders add constraint food_orders_payment_status_check check(payment_status in ('pending','paid'));

create index if not exists food_orders_store_payment_status_idx
  on public.food_orders(store_id,payment_status,created_at desc);

-- Preserva a leitura historica: pedidos que ja geraram receita pela regra anterior
-- passam a aparecer como recebidos no novo campo.
update public.food_orders o
   set payment_status='paid',
       payment_received_at=coalesce(o.payment_received_at,f.paid_at,f.updated_at,o.updated_at),
       payment_confirmed_by=coalesce(o.payment_confirmed_by,f.created_by)
  from public.food_financial_entries f
 where f.order_id=o.id
   and f.store_id=o.store_id
   and f.source='order'
   and f.status='paid'
   and o.payment_status<>'paid';

create or replace function public.food_sync_order_financial_entry()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_category uuid;
  v_received_at timestamptz;
  v_occurred_on date;
begin
  if new.status='cancelled' then
    update public.food_financial_entries
       set status='cancelled',updated_at=now()
     where store_id=new.store_id
       and order_id=new.id
       and source='order';
    return new;
  end if;

  if new.payment_status='paid' then
    if coalesce(new.total,0)<=0 then
      raise exception 'Pedido sem valor valido para lancamento financeiro.';
    end if;

    perform public.food_seed_financial_categories(new.store_id);
    select id into v_category
      from public.food_financial_categories
     where store_id=new.store_id and name='Vendas'
     limit 1;

    v_received_at:=coalesce(new.payment_received_at,now());
    v_occurred_on:=(v_received_at at time zone 'America/Sao_Paulo')::date;

    insert into public.food_financial_entries(
      store_id,direction,source,order_id,category_id,description,amount,
      occurred_on,paid_at,status,payment_method,counterparty,
      document_type,document_number,notes,created_by
    ) values(
      new.store_id,'income','order',new.id,v_category,
      'Pedido #'||new.order_number,new.total,
      v_occurred_on,v_received_at,'paid',new.payment_method,new.customer_name,
      'none',new.order_number::text,
      'Entrada gerada automaticamente apos confirmacao manual do recebimento do pedido.',
      new.payment_confirmed_by
    )
    on conflict(store_id,order_id) where source='order' and order_id is not null
    do update set
      category_id=excluded.category_id,
      description=excluded.description,
      amount=excluded.amount,
      occurred_on=excluded.occurred_on,
      paid_at=excluded.paid_at,
      status='paid',
      payment_method=excluded.payment_method,
      counterparty=excluded.counterparty,
      document_number=excluded.document_number,
      notes=excluded.notes,
      updated_at=now();
  end if;

  return new;
end $$;

revoke all on function public.food_sync_order_financial_entry() from public;

drop trigger if exists food_orders_financial_sync_trg on public.food_orders;
create trigger food_orders_financial_sync_trg
after insert or update of status,total,payment_status,payment_received_at,payment_method
on public.food_orders
for each row execute function public.food_sync_order_financial_entry();

create or replace function public.food_confirm_order_payment_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_order public.food_orders%rowtype;
  v_already_paid boolean;
begin
  select * into v_order
    from public.food_orders
   where id=p_order_id
   for update;

  if not found then
    raise exception 'Pedido nao encontrado.';
  end if;

  if not public.food_is_store_admin(v_order.store_id) and not public.food_is_platform_admin() then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

  if v_order.status='cancelled' then
    raise exception 'Nao e possivel confirmar o recebimento de um pedido cancelado.';
  end if;

  if coalesce(v_order.total,0)<=0 then
    raise exception 'O pedido nao possui valor valido para recebimento.';
  end if;

  v_already_paid:=v_order.payment_status='paid';

  update public.food_orders
     set payment_status='paid',
         payment_received_at=coalesce(payment_received_at,now()),
         payment_confirmed_by=coalesce(payment_confirmed_by,auth.uid())
   where id=p_order_id
   returning * into v_order;

  return jsonb_build_object(
    'ok',true,
    'alreadyPaid',v_already_paid,
    'orderId',v_order.id,
    'paymentReceivedAt',v_order.payment_received_at,
    'amount',v_order.total
  );
end $$;

revoke all on function public.food_confirm_order_payment_v1(uuid) from public;
grant execute on function public.food_confirm_order_payment_v1(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
