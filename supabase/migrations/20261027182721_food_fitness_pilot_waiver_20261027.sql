-- Isenção explícita do plano comercial do piloto Fitness. Não altera planos,
-- valores ou assinaturas de outras lojas.
begin;
create function food_fitness_private.guard_waived_subscription()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.notes like 'FITNESS_PILOT_WAIVER:%' and
    (food_fitness_private.is_fitness(new.store_id) or exists(select 1 from public.food_stores where id=new.store_id and visual_theme->>'businessSegment'='fitness')) and
    (new.billing_amount is distinct from 0 or new.due_day is not null or new.next_due_date is not null or new.expires_at is not null) then
    raise exception 'Isenção Fitness exige valor zero e ausência de vencimento.' using errcode='22023';
  end if;
  return new;
end; $$;
create trigger food_fitness_guard_waived_subscription before insert or update on public.food_store_subscriptions
for each row execute function food_fitness_private.guard_waived_subscription();
revoke all on function food_fitness_private.guard_waived_subscription() from public,anon,authenticated;

create function food_fitness_private.guard_waived_payment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if food_fitness_private.is_fitness(new.store_id) and exists (
    select 1 from public.food_store_subscriptions s
    where s.store_id=new.store_id and s.notes like 'FITNESS_PILOT_WAIVER:%'
      and s.billing_amount=0 and s.next_due_date is null and s.status in ('active','trial')
  ) then
    raise exception 'Esta loja Fitness possui isenção ativa; nenhuma cobrança pode ser gerada.' using errcode='42501';
  end if;
  return new;
end; $$;
create trigger food_fitness_guard_waived_payment before insert or update on public.food_subscription_payments
for each row execute function food_fitness_private.guard_waived_payment();
revoke all on function food_fitness_private.guard_waived_payment() from public,anon,authenticated;

-- A Edge Function exige este marcador antes de começar o provisionamento.
create function public.food_fitness_pilot_contract()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from pg_catalog.pg_trigger where tgname='food_fitness_guard_waived_payment' and tgenabled='O')
    and exists(select 1 from pg_catalog.pg_trigger where tgname='food_fitness_guard_product_publication' and tgenabled='O');
$$;
revoke all on function public.food_fitness_pilot_contract() from public,anon,authenticated;
grant execute on function public.food_fitness_pilot_contract() to service_role;
commit;
