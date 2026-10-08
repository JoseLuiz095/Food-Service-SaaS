-- Assinaturas Web Push dos administradores. O segredo VAPID nunca fica no navegador.
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
create policy food_push_subscriptions_select_admin
  on public.food_push_subscriptions for select to authenticated
  using (exists (
    select 1 from public.food_store_users su
    where su.store_id = food_push_subscriptions.store_id
      and su.user_id = auth.uid()
      and su.active = true
      and su.role in ('owner', 'admin')
  ));

drop policy if exists food_push_subscriptions_insert_admin on public.food_push_subscriptions;
create policy food_push_subscriptions_insert_admin
  on public.food_push_subscriptions for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.food_store_users su
    where su.store_id = food_push_subscriptions.store_id
      and su.user_id = auth.uid()
      and su.active = true
      and su.role in ('owner', 'admin')
  ));

drop policy if exists food_push_subscriptions_update_admin on public.food_push_subscriptions;
create policy food_push_subscriptions_update_admin
  on public.food_push_subscriptions for update to authenticated
  using (user_id = auth.uid() and exists (
    select 1 from public.food_store_users su
    where su.store_id = food_push_subscriptions.store_id
      and su.user_id = auth.uid()
      and su.active = true
      and su.role in ('owner', 'admin')
  ))
  with check (user_id = auth.uid());

comment on table public.food_push_subscriptions is 'Assinaturas Web Push dos administradores por loja; usadas pela Edge Function com VAPID.';
