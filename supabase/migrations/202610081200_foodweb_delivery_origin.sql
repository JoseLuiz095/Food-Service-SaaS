-- Janela mínima de entrega fica em food_stores.opening_hours.delivery_start_time
-- para evitar uma coluna adicional e manter compatibilidade com configurações antigas.

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

comment on column public.food_orders.customer_instagram is 'Identificador opcional informado pelo cliente para contato/atribuição.';
comment on column public.food_orders.acquisition_source is 'Canal declarado pelo cliente no checkout.';

create or replace function public.food_validate_delivery_start_time()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_hours jsonb;
  v_start time;
  v_local timestamp;
  v_timezone text;
begin
  if new.delivery_type <> 'delivery' then return new; end if;
  select opening_hours into v_hours from public.food_stores where id = new.store_id;
  begin
    v_start := nullif(v_hours->>'delivery_start_time', '')::time;
  exception when others then
    v_start := null;
  end;
  if v_start is null then return new; end if;
  v_timezone := coalesce(nullif(v_hours->>'timezone', ''), 'America/Sao_Paulo');
  begin
    v_local := (coalesce(new.scheduled_for, now()) at time zone v_timezone);
  exception when others then
    v_local := (coalesce(new.scheduled_for, now()) at time zone 'America/Sao_Paulo');
  end;
  if v_local::time < v_start then
    raise exception 'As entregas começam às %. Selecione retirada ou agende para esse horário.', to_char(v_start, 'HH24:MI');
  end if;
  return new;
end;
$$;

drop trigger if exists food_orders_delivery_start_time_trg on public.food_orders;
create trigger food_orders_delivery_start_time_trg
before insert on public.food_orders
for each row execute function public.food_validate_delivery_start_time();
