-- FoodWeb v0.6.2 - configuracoes leves de operacao e crescimento
alter table public.food_stores add column if not exists kds_notify_customer boolean not null default true;
alter table public.food_stores add column if not exists sales_recovery_enabled boolean not null default true;
alter table public.food_stores add column if not exists sales_recovery_minutes integer not null default 10 check (sales_recovery_minutes between 5 and 1440);
alter table public.food_stores add column if not exists crm_enabled boolean not null default true;
alter table public.food_stores add column if not exists repeat_order_enabled boolean not null default true;
alter table public.food_stores add column if not exists upsell_enabled boolean not null default true;
alter table public.food_stores add column if not exists upsell_limit integer not null default 3 check (upsell_limit between 1 and 6);
