-- shared_future: modo simples por padrão, mantendo os dados multi-local existentes.
-- Depende de 20261023140000_food_multilocation_stock.sql e 20261024001500_food_location_initial_balance_upsert.sql.
begin;
create table public.food_stock_preferences (
  store_id uuid primary key references public.food_stores(id) on delete cascade,
  multi_location_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.food_stock_preferences enable row level security;
revoke all on public.food_stock_preferences from public,anon,authenticated;
-- Sem DML direto, inclusive para o proprietário. RPC única valida a loja.
insert into public.food_stock_preferences(store_id,multi_location_enabled)
select s.id,exists(
  select 1 from public.food_stock_locations l where l.store_id=s.id and not l.is_default and l.active
  union all
  select 1 from public.food_product_location_stock b join public.food_stock_locations l on l.id=b.location_id and l.store_id=b.store_id
  where b.store_id=s.id and not l.is_default and (b.stock_quantity>0 or b.stock_reserved_quantity>0)
) from public.food_stores s;
create function public.food_stock_mode_v1(p_store_id uuid,p_enabled boolean default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_mode boolean; actor uuid;
begin
 actor:=auth.uid();
 if actor is null or not public.food_is_store_admin(p_store_id) then raise exception 'Sem permissão para o estoque desta loja.' using errcode='42501'; end if;
 -- Locks serializam duas mudanças de configuração; não modificam nenhum saldo.
 perform 1 from public.food_stores where id=p_store_id for update;
 if not found then raise exception 'Loja indisponível.' using errcode='42501'; end if;
 select multi_location_enabled into current_mode from public.food_stock_preferences where store_id=p_store_id;
 if not found then current_mode:=false; end if;
 -- O estado efetivo nunca oculta dados se outro fluxo criou saldo/retirada após a última preferência.
 if exists(select 1 from public.food_product_location_stock b join public.food_stock_locations l on l.id=b.location_id and l.store_id=b.store_id
   where b.store_id=p_store_id and not l.is_default and (b.stock_quantity>0 or b.stock_reserved_quantity>0))
 or exists(select 1 from public.food_pickup_locations p join public.food_stock_locations l on l.id=p.stock_location_id and l.store_id=p.store_id
   where p.store_id=p_store_id and p.active and not l.is_default) then current_mode:=true; end if;
 if p_enabled is not null and p_enabled is distinct from current_mode then
   if not p_enabled and exists(
     select 1 from public.food_product_location_stock b join public.food_stock_locations l
       on l.id=b.location_id and l.store_id=b.store_id
      where b.store_id=p_store_id and not l.is_default and (b.stock_quantity<>0 or b.stock_reserved_quantity<>0)
   ) then raise exception 'Transfira os saldos dos locais secundários ao principal antes de usar o modo simples.' using errcode='23514'; end if;
   if not p_enabled and exists(
     select 1 from public.food_pickup_locations p join public.food_stock_locations l on l.id=p.stock_location_id and l.store_id=p.store_id
     where p.store_id=p_store_id and p.active and not l.is_default
   ) then raise exception 'Desative ou remapeie os pontos de retirada associados a locais secundários.' using errcode='23514'; end if;
   insert into public.food_stock_preferences(store_id,multi_location_enabled,updated_by)
   values(p_store_id,p_enabled,actor)
   on conflict(store_id) do update set multi_location_enabled=excluded.multi_location_enabled,updated_at=now(),updated_by=actor;
   current_mode:=p_enabled;
 end if;
 return jsonb_build_object('multi_location_enabled',current_mode);
end $$;
revoke all on function public.food_stock_mode_v1(uuid,boolean) from public,anon;
grant execute on function public.food_stock_mode_v1(uuid,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
