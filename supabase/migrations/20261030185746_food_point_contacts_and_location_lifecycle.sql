-- Core: contacts belong to a pickup point; stock locations retain historical references.
-- Requires the reviewed receipt-contacts migration. Apply only after schema comparison.
begin;
set local lock_timeout = '5s';
do $$ begin
  if to_regprocedure('public.food_get_receipt_destinations_v1(uuid,uuid)') is null then
    raise exception 'Install the reviewed receipt contacts contract first';
  end if;
end $$;
create table public.food_pickup_point_contacts (
  store_id uuid not null,
  pickup_location_id uuid not null,
  slot smallint not null check (slot in (1,2)),
  name text not null check (length(btrim(name)) between 1 and 60),
  phone text not null check (phone ~ '^[1-9][0-9]{9,14}$'),
  purpose text not null check (purpose in ('confirmation','proof','both')),
  primary key (store_id,pickup_location_id,slot),
  foreign key (pickup_location_id,store_id) references public.food_pickup_locations(id,store_id)
);
alter table public.food_pickup_point_contacts enable row level security;
revoke all on public.food_pickup_point_contacts from public,anon,authenticated;
grant select on public.food_pickup_point_contacts to authenticated;
create policy food_pickup_point_contacts_admin_read on public.food_pickup_point_contacts
  for select to authenticated using (public.food_is_store_admin(store_id));
-- Preserve explicitly configured destinations; no new assignment is inferred.
insert into public.food_pickup_point_contacts(store_id,pickup_location_id,slot,name,phone,purpose)
select m.store_id,m.pickup_location_id,1,c.name,c.phone,'both'
from public.food_pickup_receipt_contacts m
join public.food_receipt_contacts c on c.store_id=m.store_id and c.slot=m.contact_slot;

create function public.food_save_pickup_point_contacts_v1(p_store_id uuid,p_point_id uuid,p_contacts jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare c jsonb;
begin
  if auth.uid() is null or not coalesce(public.food_is_store_admin(p_store_id),false) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  perform 1 from public.food_pickup_locations where store_id=p_store_id and id=p_point_id for update;
  if not found then raise exception 'Ponto indisponível.' using errcode='22023'; end if;
  if jsonb_typeof(p_contacts) is distinct from 'array' or jsonb_array_length(p_contacts)>2 or
     exists(select 1 from jsonb_array_elements(p_contacts) as entry(value) group by value->>'slot' having count(*)>1) or
     exists(select 1 from jsonb_array_elements(p_contacts) as entry(value) group by value->>'phone' having count(*)>1) then
    raise exception 'Contatos inválidos ou duplicados.' using errcode='22023';
  end if;
  for c in select value from jsonb_array_elements(p_contacts) loop
    if c->>'slot' not in ('1','2') or coalesce(length(btrim(c->>'name')),0) not between 1 and 60 or
       coalesce(c->>'phone','') !~ '^[1-9][0-9]{9,14}$' or
       c->>'purpose' not in ('confirmation','proof','both') then
      raise exception 'Informe nome, telefone internacional e finalidade.' using errcode='22023';
    end if;
  end loop;
  delete from public.food_pickup_point_contacts where store_id=p_store_id and pickup_location_id=p_point_id;
  -- An explicit edit replaces the legacy binding, including removal of all contacts.
  delete from public.food_pickup_receipt_contacts where store_id=p_store_id and pickup_location_id=p_point_id;
  insert into public.food_pickup_point_contacts(store_id,pickup_location_id,slot,name,phone,purpose)
  select p_store_id,p_point_id,(value->>'slot')::smallint,btrim(value->>'name'),value->>'phone',value->>'purpose'
  from jsonb_array_elements(p_contacts) as entry(value);
end $$;
revoke all on function public.food_save_pickup_point_contacts_v1(uuid,uuid,jsonb) from public,anon;
grant execute on function public.food_save_pickup_point_contacts_v1(uuid,uuid,jsonb) to authenticated;

-- General-link contacts are separate. An unassigned point never inherits them.
create or replace function public.food_get_receipt_destinations_v1(p_store_id uuid,p_pickup_location_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_slot smallint; v_contacts jsonb;
begin
  if not public.food_store_accessible(p_store_id) then
    return jsonb_build_object('mode','unavailable','contacts','[]'::jsonb);
  end if;
  if p_pickup_location_id is not null then
    if not exists(select 1 from public.food_pickup_locations p
      join public.food_stock_locations l on l.id=p.stock_location_id and l.store_id=p.store_id and l.active
      where p.id=p_pickup_location_id and p.store_id=p_store_id and p.active and p.is_public) then
      return jsonb_build_object('mode','unavailable','contacts','[]'::jsonb);
    end if;
    select jsonb_agg(jsonb_build_object('slot',slot,'name',name,'phone',phone) order by slot)
      into v_contacts from public.food_pickup_point_contacts
      where store_id=p_store_id and pickup_location_id=p_pickup_location_id and purpose in ('proof','both');
    if v_contacts is not null then return jsonb_build_object('mode','point','contacts',v_contacts); end if;
    -- Existing explicit point bindings remain valid during migration.
    select contact_slot into v_slot from public.food_pickup_receipt_contacts
      where store_id=p_store_id and pickup_location_id=p_pickup_location_id;
    if v_slot is null then return jsonb_build_object('mode','unassigned','contacts','[]'::jsonb); end if;
    select jsonb_agg(jsonb_build_object('slot',slot,'name',name,'phone',phone)) into v_contacts
      from public.food_receipt_contacts where store_id=p_store_id and slot=v_slot;
    return jsonb_build_object('mode','point','contacts',coalesce(v_contacts,'[]'::jsonb));
  end if;
  select jsonb_agg(jsonb_build_object('slot',slot,'name',name,'phone',phone) order by slot)
    into v_contacts from public.food_receipt_contacts where store_id=p_store_id;
  return jsonb_build_object('mode','general','contacts',coalesce(v_contacts,'[]'::jsonb));
end $$;
revoke all on function public.food_get_receipt_destinations_v1(uuid,uuid) from public;
grant execute on function public.food_get_receipt_destinations_v1(uuid,uuid) to anon,authenticated,service_role;

create function public.food_retire_stock_location_v1(p_store_id uuid,p_location_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_location public.food_stock_locations%rowtype; v_reason text;
begin
  if auth.uid() is null or not coalesce(public.food_is_store_admin(p_store_id),false) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  perform 1 from public.food_stores where id=p_store_id for update;
  select * into v_location from public.food_stock_locations
    where id=p_location_id and store_id=p_store_id for update;
  if not found then raise exception 'Local indisponível.' using errcode='22023'; end if;
  if v_location.is_default or (v_location.active and (select count(*) from public.food_stock_locations where store_id=p_store_id and active)<=1) then
    raise exception 'Mantenha o local principal e pelo menos um local ativo.' using errcode='22023';
  end if;
  if exists(select 1 from public.food_product_location_stock where store_id=p_store_id and location_id=p_location_id and (stock_quantity<>0 or stock_reserved_quantity<>0)) then
    raise exception 'Transfira ou ajuste o saldo e as reservas antes de retirar este local.' using errcode='22023';
  end if;
  if exists(select 1 from public.food_pickup_locations where store_id=p_store_id and stock_location_id=p_location_id) then v_reason:='pontos de retirada'; end if;
  if exists(select 1 from public.food_orders where store_id=p_store_id and stock_location_id=p_location_id) then v_reason:=concat_ws(', ',v_reason,'pedidos'); end if;
  if exists(select 1 from public.food_stock_location_movements where store_id=p_store_id and (from_location_id=p_location_id or to_location_id=p_location_id)) then v_reason:=concat_ws(', ',v_reason,'movimentações'); end if;
  if exists(select 1 from public.food_order_stock_movements where store_id=p_store_id and location_id=p_location_id) then v_reason:=concat_ws(', ',v_reason,'histórico de estoque'); end if;
  if v_reason is null then
    begin
      delete from public.food_stock_locations where id=p_location_id and store_id=p_store_id;
      return jsonb_build_object('action','deleted');
    exception when foreign_key_violation then
      v_reason:='outros vínculos históricos';
    end;
  end if;
  update public.food_pickup_locations set active=false,is_public=false,updated_at=now()
    where store_id=p_store_id and stock_location_id=p_location_id;
  update public.food_stock_locations set active=false,updated_at=now()
    where store_id=p_store_id and id=p_location_id;
  return jsonb_build_object('action','archived','reason',v_reason);
end $$;
revoke all on function public.food_retire_stock_location_v1(uuid,uuid) from public,anon;
grant execute on function public.food_retire_stock_location_v1(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
