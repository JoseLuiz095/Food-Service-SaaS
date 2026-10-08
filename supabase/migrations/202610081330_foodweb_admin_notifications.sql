-- Preferências de alertas do painel. Defaults preservam lojas já existentes.
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

comment on column public.food_stores.notifications_new_order_enabled is 'Exibe alertas no painel quando um novo pedido chega.';
comment on column public.food_stores.notifications_scheduled_enabled is 'Exibe lembretes para pedidos agendados próximos.';
comment on column public.food_stores.notifications_scheduled_lead_minutes is 'Antecedência dos lembretes de pedidos agendados, em minutos.';
comment on column public.food_stores.notifications_desktop_enabled is 'Permite avisos do navegador quando a permissão local estiver concedida.';
comment on column public.food_stores.notifications_sound_enabled is 'Toca um som discreto junto dos alertas do painel.';
