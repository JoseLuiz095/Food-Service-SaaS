-- Janela independente para retirada.
-- O delivery continua usando delivery_start_time (ex.: 18:00), enquanto a
-- retirada pode funcionar em uma faixa mais ampla (padrão recomendado: 07:00–22:00).
create or replace function public.food_store_is_accepting_orders(p_store_id uuid, p_at timestamptz default now())
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_hours jsonb;
  v_timezone text;
  v_local timestamp;
  v_time time;
  v_day integer;
  v_prev_day integer;
  v_today jsonb;
  v_prev jsonb;
  v_open time;
  v_close time;
  v_pickup_start time;
  v_pickup_end time;
begin
  if not public.food_store_accessible(p_store_id) then return false; end if;
  select opening_hours into v_hours from public.food_stores where id=p_store_id;
  if jsonb_typeof(v_hours->'days') <> 'array' or jsonb_array_length(v_hours->'days')=0 then return true; end if;
  v_timezone := coalesce(nullif(v_hours->>'timezone',''),'America/Sao_Paulo');
  begin v_local := p_at at time zone v_timezone; exception when others then v_local := p_at at time zone 'America/Sao_Paulo'; end;
  v_time := v_local::time;
  v_day := extract(dow from v_local)::integer;
  v_prev_day := (v_day + 6) % 7;

  select value into v_today from jsonb_array_elements(v_hours->'days') where (value->>'day')::integer=v_day limit 1;
  select value into v_prev from jsonb_array_elements(v_hours->'days') where (value->>'day')::integer=v_prev_day limit 1;

  -- Quando configurada, a janela de retirada substitui apenas os horários
  -- internos de abertura/fechamento, preservando os dias habilitados.
  begin v_pickup_start := nullif(v_hours->>'pickup_start_time','')::time; exception when others then v_pickup_start := null; end;
  begin v_pickup_end := nullif(v_hours->>'pickup_end_time','')::time; exception when others then v_pickup_end := null; end;
  if v_pickup_start is not null and v_pickup_end is not null then
    if coalesce((v_today->>'enabled')::boolean,false) then
      if v_pickup_end > v_pickup_start and v_time >= v_pickup_start and v_time < v_pickup_end then return true; end if;
      if v_pickup_end <= v_pickup_start and v_time >= v_pickup_start then return true; end if;
    end if;
    if coalesce((v_prev->>'enabled')::boolean,false) and v_pickup_end <= v_pickup_start and v_time < v_pickup_end then return true; end if;
    return false;
  end if;

  if coalesce((v_today->>'enabled')::boolean,false) then
    begin
      v_open := (v_today->>'open')::time; v_close := (v_today->>'close')::time;
      if v_close > v_open and v_time >= v_open and v_time < v_close then return true; end if;
      if v_close <= v_open and v_time >= v_open then return true; end if;
    exception when others then null; end;
  end if;
  if coalesce((v_prev->>'enabled')::boolean,false) then
    begin
      v_open := (v_prev->>'open')::time; v_close := (v_prev->>'close')::time;
      if v_close <= v_open and v_time < v_close then return true; end if;
    exception when others then null; end;
  end if;
  return false;
end;
$$;

revoke all on function public.food_store_is_accepting_orders(uuid,timestamptz) from public;
grant execute on function public.food_store_is_accepting_orders(uuid,timestamptz) to anon, authenticated;

notify pgrst, 'reload schema';
