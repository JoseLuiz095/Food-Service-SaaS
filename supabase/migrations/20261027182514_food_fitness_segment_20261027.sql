-- shared_future: adiciona Fitness/Academia sem alterar segmentos existentes.
-- Aplicar somente após comparar o histórico remoto e revisar este diff.
begin;

alter table public.food_business_profiles
  drop constraint food_business_profiles_primary_segment_check;
alter table public.food_business_profiles
  add constraint food_business_profiles_primary_segment_check
  check (primary_segment in ('food','florist','retail','rentals','personal','nutrition','creator','confectionery','printing3d','services','fitness'));

create or replace function food_business_private.segment_defaults(p_segment text)
returns text[] language sql immutable set search_path='' as $$
  select case p_segment
    when 'personal' then array['clients','appointments','training']
    when 'fitness' then array['clients','appointments','training']
    when 'nutrition' then array['clients','appointments','nutrition']
    when 'creator' then array['creator']
    when 'florist' then array['florist']
    when 'rentals' then array['clients','appointments']
    when 'services' then array['clients','appointments']
    else array[]::text[] end;
$$;

create or replace function food_business_private.set_segment(p_store uuid,p_segment text,p_preserve_legacy boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare defaults text[]; old_profile public.food_business_profiles%rowtype; m text; flags public.food_module_settings%rowtype;
begin
 if auth.uid() is null and coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Sessão obrigatória.' using errcode='42501'; end if;
 if p_segment not in ('food','florist','retail','rentals','personal','nutrition','creator','confectionery','printing3d','services','fitness') or p_segment is null then raise exception 'Segmento inválido.' using errcode='22023'; end if;
 if p_segment='fitness' and exists(select 1 from public.food_products where store_id=p_store and active) then raise exception 'Oculte os produtos existentes antes de ativar Fitness/Academia; preços e estoque precisam de revisão.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('food-business:'||p_store::text,0));
 select * into old_profile from public.food_business_profiles where store_id=p_store for update;
 select * into flags from public.food_module_settings where store_id=p_store;
 if old_profile.store_id is null and (coalesce(flags.events_enabled,false) or coalesce(flags.combos_enabled,false) or coalesce(flags.rentals_enabled,false) or coalesce(flags.custom_enabled,false)) and not (p_preserve_legacy and food_business_private.is_master()) then
   raise exception 'Este negócio possui módulos legados ativos. O Master precisa preservar os direitos existentes antes da inicialização.' using errcode='22023';
 end if;
 defaults:=food_business_private.segment_defaults(p_segment);
 insert into public.food_business_profiles(store_id,primary_segment,initialized_by) values(p_store,p_segment,auth.uid())
 on conflict(store_id) do update set primary_segment=excluded.primary_segment,updated_at=now();
 update public.food_business_entitlements set enabled=false,updated_at=now(),reason='Pacote do segmento anterior substituído' where store_id=p_store and source='segment' and not(module_code=any(defaults));
 foreach m in array defaults loop
  insert into public.food_business_entitlements(store_id,module_code,enabled,source,reason,granted_by) values(p_store,m,true,'segment','Incluído no segmento principal',auth.uid())
  on conflict(store_id,module_code) do update set enabled=true,source='segment',reason=excluded.reason,expires_at=null,granted_by=excluded.granted_by,updated_at=now();
 end loop;
 if old_profile.store_id is null and p_preserve_legacy and food_business_private.is_master() then
  foreach m in array array['events','combos','rentals','custom'] loop
   if (case m when 'events' then flags.events_enabled when 'combos' then flags.combos_enabled when 'rentals' then flags.rentals_enabled else flags.custom_enabled end) then
    insert into public.food_business_entitlements(store_id,module_code,enabled,source,reason,granted_by) values(p_store,m,true,'exception','Migração de direitos existentes',auth.uid())
    on conflict(store_id,module_code) do nothing;
   end if;
  end loop;
 end if;
 if exists(select 1 from public.food_business_entitlements e cross join lateral unnest(food_business_private.dependencies(e.module_code)) dep where e.store_id=p_store and e.enabled and not food_business_private.granted(p_store,dep)) then
  raise exception 'A mudança removeria uma dependência de módulo ativo. Revise as concessões no Master.' using errcode='22023';
 end if;
 update public.food_stores set visual_theme=coalesce(visual_theme,'{}'::jsonb)||jsonb_build_object('businessSegment',p_segment),updated_at=now() where id=p_store;
 insert into public.food_business_audit(store_id,actor_id,action,details) values(p_store,auth.uid(),'set_segment',jsonb_build_object('previous_segment',old_profile.primary_segment,'segment',p_segment,'preserve_legacy',p_preserve_legacy));
end;
$$;

-- O provisionamento oficial chama este seed antes do convite. Para Fitness,
-- nenhuma categoria Food ou zona de entrega é criada.
create or replace function public.food_platform_seed_new_store(p_store_id uuid,p_city text,p_state text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.food_stores where id=p_store_id and visual_theme->>'businessSegment'='fitness') then return; end if;
  insert into public.food_categories(store_id,name,slug,active,sort_order) values
    (p_store_id,'Lanches','lanches',true,10),
    (p_store_id,'Porções','porcoes',true,20),
    (p_store_id,'Bebidas','bebidas',true,30),
    (p_store_id,'Sobremesas','sobremesas',true,40)
  on conflict(store_id,slug) do nothing;
  if lower(trim(coalesce(p_city,'')))='linhares' and upper(trim(coalesce(p_state,'')))='ES' then
    insert into public.food_delivery_zones(store_id,name,aliases,city,state,fee,active,sort_order)
    select p_store_id,x.name,'{}'::text[],'Linhares','ES',0,false,x.ord*10
    from unnest(array['Centro','Aviso','Interlagos','Shell','Jardim Laguna']) with ordinality x(name,ord)
    where not exists(select 1 from public.food_delivery_zones dz where dz.store_id=p_store_id and lower(dz.name)=lower(x.name));
  end if;
end; $$;
revoke all on function public.food_platform_seed_new_store(uuid,text,text) from public,anon,authenticated;
grant execute on function public.food_platform_seed_new_store(uuid,text,text) to service_role;

commit;
