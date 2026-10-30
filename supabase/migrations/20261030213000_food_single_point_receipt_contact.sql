-- One receipt destination per pickup point. Keep existing proof destinations only.
begin;
set local lock_timeout = '5s';
do $$ begin
  if to_regprocedure('public.food_save_pickup_point_contacts_v1(uuid,uuid,jsonb)') is null then
    raise exception 'Install the reviewed pickup-point contacts migration first.';
  end if;
end $$;

-- A legacy binding must not resurrect a confirmation-only contact as a proof destination.
delete from public.food_pickup_receipt_contacts m
where exists(select 1 from public.food_pickup_point_contacts c
  where c.store_id=m.store_id and c.pickup_location_id=m.pickup_location_id);
delete from public.food_pickup_point_contacts where purpose='confirmation';
delete from public.food_pickup_point_contacts second
using public.food_pickup_point_contacts first
where second.store_id=first.store_id and second.pickup_location_id=first.pickup_location_id
  and second.slot>first.slot;
update public.food_pickup_point_contacts set slot=1 where slot=2;
update public.food_pickup_point_contacts set purpose='proof' where purpose='both';
alter table public.food_pickup_point_contacts
  add constraint food_pickup_point_contacts_single_slot check(slot=1),
  add constraint food_pickup_point_contacts_proof_only check(purpose='proof');

create or replace function public.food_save_pickup_point_contacts_v1(p_store_id uuid,p_point_id uuid,p_contacts jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare c jsonb;
begin
  if auth.uid() is null or not coalesce(public.food_is_store_admin(p_store_id),false) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  perform 1 from public.food_pickup_locations where store_id=p_store_id and id=p_point_id for update;
  if not found then raise exception 'Ponto indisponível.' using errcode='22023'; end if;
  if jsonb_typeof(p_contacts) is distinct from 'array' or jsonb_array_length(p_contacts)>1 then
    raise exception 'Cadastre apenas um WhatsApp para comprovantes.' using errcode='22023';
  end if;
  for c in select value from jsonb_array_elements(p_contacts) loop
    if jsonb_typeof(c) is distinct from 'object' or c->>'slot' is distinct from '1'
       or coalesce(length(btrim(c->>'name')),0) not between 1 and 60
       or coalesce(c->>'phone','') !~ '^[1-9][0-9]{9,14}$'
       or coalesce(c->>'purpose','proof') <> 'proof' then
      raise exception 'Informe nome e telefone internacional do comprovante.' using errcode='22023';
    end if;
  end loop;
  delete from public.food_pickup_point_contacts where store_id=p_store_id and pickup_location_id=p_point_id;
  delete from public.food_pickup_receipt_contacts where store_id=p_store_id and pickup_location_id=p_point_id;
  insert into public.food_pickup_point_contacts(store_id,pickup_location_id,slot,name,phone,purpose)
  select p_store_id,p_point_id,1,btrim(value->>'name'),value->>'phone','proof'
  from jsonb_array_elements(p_contacts) as entry(value);
end $$;
revoke all on function public.food_save_pickup_point_contacts_v1(uuid,uuid,jsonb) from public,anon;
grant execute on function public.food_save_pickup_point_contacts_v1(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
