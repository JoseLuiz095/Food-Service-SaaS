-- FoodWeb v0.6.3 - preferencias operacionais e mensagens personalizaveis
alter table public.food_stores add column if not exists sales_recovery_window_hours integer not null default 48 check (sales_recovery_window_hours between 1 and 168);
alter table public.food_stores add column if not exists crm_come_back_days integer not null default 21 check (crm_come_back_days between 1 and 365);
alter table public.food_stores add column if not exists repeat_order_max_age_days integer not null default 90 check (repeat_order_max_age_days between 1 and 365);
alter table public.food_stores add column if not exists customer_message_templates jsonb not null default '{}'::jsonb;
