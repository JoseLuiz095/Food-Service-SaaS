
-- Convergência do ambiente publicado: origem do pedido, preferências de aviso
-- e as assinaturas Web Push precisam existir antes de o frontend usá-las.
alter table public.food_orders
  add column if not exists customer_instagram text,
  add column if not exists acquisition_source text;

alter table public.food_orders
  drop constraint if exists food_orders_acquisition_source_check;
alter table public.food_orders
  add constraint food_orders_acquisition_source_check
  check (acquisition_source is null or acquisition_source in ('instagram','whatsapp','google','indicacao','outro'));
create index if not exists food_orders_store_acquisition_source_idx
  on public.food_orders(store_id, acquisition_source, created_at desc)
  where acquisition_source is not null;

alter table public.food_stores
  add column if not exists notifications_new_order_enabled boolean not null default true,
  add column if not exists notifications_scheduled_enabled boolean not null default true,
  add column if not exists notifications_scheduled_lead_minutes integer not null default 30,
  add column if not exists notifications_desktop_enabled boolean not null default true,
  add column if not exists notifications_sound_enabled boolean not null default true;
alter table public.food_stores
  drop constraint if exists food_stores_notifications_scheduled_lead_minutes_check;
alter table public.food_stores
  add constraint food_stores_notifications_scheduled_lead_minutes_check
  check (notifications_scheduled_lead_minutes between 5 and 1440);

create table if not exists public.food_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, endpoint)
);
create index if not exists food_push_subscriptions_store_active_idx
  on public.food_push_subscriptions(store_id, active);
alter table public.food_push_subscriptions enable row level security;

drop policy if exists food_push_subscriptions_select_admin on public.food_push_subscriptions;
create policy food_push_subscriptions_select_admin on public.food_push_subscriptions for select to authenticated
  using (exists (select 1 from public.food_store_users su where su.store_id=food_push_subscriptions.store_id and su.user_id=auth.uid() and su.active=true and su.role in ('owner','admin')));
drop policy if exists food_push_subscriptions_insert_admin on public.food_push_subscriptions;
create policy food_push_subscriptions_insert_admin on public.food_push_subscriptions for insert to authenticated
  with check (user_id=auth.uid() and exists (select 1 from public.food_store_users su where su.store_id=food_push_subscriptions.store_id and su.user_id=auth.uid() and su.active=true and su.role in ('owner','admin')));
drop policy if exists food_push_subscriptions_update_admin on public.food_push_subscriptions;
create policy food_push_subscriptions_update_admin on public.food_push_subscriptions for update to authenticated
  using (user_id=auth.uid() and exists (select 1 from public.food_store_users su where su.store_id=food_push_subscriptions.store_id and su.user_id=auth.uid() and su.active=true and su.role in ('owner','admin')))
  with check (user_id=auth.uid());

-- Não permita que o último item inserido esconda outro que está aguardando
-- reposição. O estado do pedido passa a ser sempre derivado de todos os itens.
create or replace function public.food_reserve_inventory_on_item_insert()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_order public.food_orders%rowtype; v_product public.food_products%rowtype; v_store public.food_stores%rowtype;
  v_reserved integer; v_awaiting boolean; v_allow_future boolean := false; v_timezone text;
  v_local_scheduled_date date; v_local_today date; v_inventory_status text;
begin
  select * into v_order from public.food_orders where id=new.order_id for update;
  if not found or new.product_id is null or v_order.inventory_status='released' then return new; end if;
  select * into v_product from public.food_products where id=new.product_id for update;
  if not found or not v_product.track_stock then return new; end if;
  select * into v_store from public.food_stores where id=v_order.store_id;
  v_timezone:=coalesce(v_store.opening_hours->>'timezone','America/Sao_Paulo');
  v_local_today:=(now() at time zone v_timezone)::date;
  if v_order.scheduled_for is not null then v_local_scheduled_date:=(v_order.scheduled_for at time zone v_timezone)::date; end if;
  v_allow_future:=v_order.scheduled_for is not null and (v_local_scheduled_date>=v_local_today+1 or coalesce(v_order.desired_date,date '1900-01-01')>=v_local_today+1);
  if to_regprocedure('public.food_reserve_product_inventory(uuid,integer,boolean)') is null then return new; end if;
  select r.reserved_quantity,r.awaiting_restock into v_reserved,v_awaiting from public.food_reserve_product_inventory(new.product_id,new.quantity,v_allow_future) r;
  update public.food_order_items set inventory_reserved_quantity=coalesce(v_reserved,0) where id=new.id;
  select case
    when exists (select 1 from public.food_order_items oi join public.food_products p on p.id=oi.product_id where oi.order_id=new.order_id and p.track_stock and coalesce(oi.inventory_reserved_quantity,0)<oi.quantity) then 'awaiting_restock'
    when exists (select 1 from public.food_order_items oi join public.food_products p on p.id=oi.product_id where oi.order_id=new.order_id and p.track_stock and coalesce(oi.inventory_reserved_quantity,0)>0) then 'reserved'
    else coalesce(v_order.inventory_status,'not_tracked') end into v_inventory_status;
  update public.food_orders set inventory_status=v_inventory_status,updated_at=now() where id=new.order_id;
  if v_order.payment_status='paid' and v_inventory_status<>'awaiting_restock' and to_regprocedure('public.food_commit_order_inventory(uuid)') is not null then perform public.food_commit_order_inventory(new.order_id); end if;
  return new;
end;
$$;
revoke all on function public.food_reserve_inventory_on_item_insert() from public,anon,authenticated;
drop trigger if exists food_order_items_inventory_reserve_trg on public.food_order_items;
create trigger food_order_items_inventory_reserve_trg after insert on public.food_order_items for each row execute function public.food_reserve_inventory_on_item_insert();

notify pgrst,'reload schema';
