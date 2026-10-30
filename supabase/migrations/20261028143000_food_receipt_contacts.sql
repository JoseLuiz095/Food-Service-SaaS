-- core: destinos comerciais de comprovante; não altera pedidos, pagamentos ou estoque.
-- Preparada em isolamento. Revisar schema/grants antes de aplicar ao projeto compartilhado.
begin;
create table public.food_receipt_contacts (
 store_id uuid not null references public.food_stores(id) on delete cascade,
 slot smallint not null check(slot in (1,2)),
 name text not null check(length(btrim(name)) between 1 and 60),
 phone text not null check(phone ~ '^[1-9][0-9]{9,14}$'),
 primary key(store_id,slot)
);
create table public.food_pickup_receipt_contacts (
 store_id uuid not null,
 pickup_location_id uuid not null,
 contact_slot smallint not null,
 primary key(store_id,pickup_location_id),
 foreign key(pickup_location_id,store_id) references public.food_pickup_locations(id,store_id) on delete cascade,
 foreign key(store_id,contact_slot) references public.food_receipt_contacts(store_id,slot)
);
alter table public.food_receipt_contacts enable row level security;
alter table public.food_pickup_receipt_contacts enable row level security;
revoke all on public.food_receipt_contacts,public.food_pickup_receipt_contacts from public,anon,authenticated;
grant select on public.food_receipt_contacts,public.food_pickup_receipt_contacts to authenticated;
create policy food_receipt_contacts_admin_read on public.food_receipt_contacts for select to authenticated using(public.food_is_store_admin(store_id));
create policy food_pickup_receipt_contacts_admin_read on public.food_pickup_receipt_contacts for select to authenticated using(public.food_is_store_admin(store_id));

create function public.food_save_receipt_contacts_v1(p_store_id uuid,p_contacts jsonb,p_points jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare c jsonb; p jsonb;
begin
 if auth.uid() is null or not public.food_is_store_admin(p_store_id) then raise exception 'Sem permissão para configurar comprovantes' using errcode='42501'; end if;
 -- Serializa configurações da mesma loja; substituição completa é idempotente em retry.
 perform 1 from public.food_stores where id=p_store_id for update;
 if jsonb_typeof(p_contacts) is distinct from 'array' or jsonb_typeof(p_points) is distinct from 'array' then raise exception 'Configuração inválida'; end if;
 if jsonb_array_length(p_contacts)>2 then raise exception 'Cadastre no máximo dois contatos'; end if;
 if exists(select 1 from jsonb_array_elements(p_contacts) a group by a->>'slot' having count(*)>1) then raise exception 'Contato duplicado'; end if;
 if exists(select 1 from jsonb_array_elements(p_points) a group by a->>'pickup_location_id' having count(*)>1) then raise exception 'Ponto duplicado'; end if;
 for c in select value from jsonb_array_elements(p_contacts) loop
  if (c->>'slot') is null or c->>'slot' not in ('1','2') or coalesce(length(btrim(c->>'name')),0) not between 1 and 60 or coalesce(c->>'phone','') !~ '^[1-9][0-9]{9,14}$' then raise exception 'Contato inválido: informe nome e telefone com código do país'; end if;
 end loop;
 for p in select value from jsonb_array_elements(p_points) loop
  if not exists(select 1 from public.food_pickup_locations l where l.id=(p->>'pickup_location_id')::uuid and l.store_id=p_store_id) or not exists(select 1 from jsonb_array_elements(p_contacts) contact_value where contact_value->>'slot'=p->>'contact_slot') then raise exception 'Ponto ou contato não pertence à configuração da loja'; end if;
 end loop;
 delete from public.food_pickup_receipt_contacts where store_id=p_store_id;
 delete from public.food_receipt_contacts where store_id=p_store_id;
 insert into public.food_receipt_contacts(store_id,slot,name,phone) select p_store_id,(v->>'slot')::smallint,btrim(v->>'name'),v->>'phone' from jsonb_array_elements(p_contacts) v;
 insert into public.food_pickup_receipt_contacts(store_id,pickup_location_id,contact_slot) select p_store_id,(v->>'pickup_location_id')::uuid,(v->>'contact_slot')::smallint from jsonb_array_elements(p_points) v;
end; $$;
revoke all on function public.food_save_receipt_contacts_v1(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.food_save_receipt_contacts_v1(uuid,jsonb,jsonb) to authenticated;

create function public.food_get_receipt_destinations_v1(p_store_id uuid,p_pickup_location_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_slot smallint; v_mode text:='general';
begin
 if not public.food_store_accessible(p_store_id) then return jsonb_build_object('mode','unavailable','contacts','[]'::jsonb); end if;
 if p_pickup_location_id is not null then
  if not exists(select 1 from public.food_pickup_locations p join public.food_stock_locations l on l.id=p.stock_location_id and l.store_id=p.store_id and l.active where p.id=p_pickup_location_id and p.store_id=p_store_id and p.active and p.is_public) then return jsonb_build_object('mode','unavailable','contacts','[]'::jsonb); end if;
  select contact_slot into v_slot from public.food_pickup_receipt_contacts where store_id=p_store_id and pickup_location_id=p_pickup_location_id;
  v_mode:=case when v_slot is null then 'unassigned' else 'point' end;
 end if;
 return jsonb_build_object('mode',v_mode,'contacts',coalesce((select jsonb_agg(jsonb_build_object('slot',slot,'name',name,'phone',phone) order by slot) from public.food_receipt_contacts where store_id=p_store_id and (p_pickup_location_id is null or slot=v_slot)),'[]'::jsonb));
end; $$;
revoke all on function public.food_get_receipt_destinations_v1(uuid,uuid) from public;
grant execute on function public.food_get_receipt_destinations_v1(uuid,uuid) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
