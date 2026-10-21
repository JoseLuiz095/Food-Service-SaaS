-- shared_future: APIs novas; nenhuma função ou trigger do checkout normal é substituída.
begin;
create function private.food_modules_audit(p_store uuid,p_action text,p_entity uuid,p_details jsonb default '{}')
returns void language sql security definer set search_path='' as $$
 insert into public.food_module_audit(organization_id,store_id,actor_id,action,entity_id,details)
 select organization_id,store_id,auth.uid(),p_action,p_entity,p_details from public.food_module_stores where store_id=p_store
$$;

create function private.food_modules_recalculate(p_order uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.food_module_order_parts p set total_cents=coalesce((select sum(i.total_cents) from public.food_module_order_items i where i.part_id=p.id and i.status='active'),0),
   urgency=case when exists(select 1 from public.food_module_order_items i where i.part_id=p.id and i.status='active' and (i.snapshot->>'urgent')::boolean) then p.urgency else 'not_needed' end
 where p.order_id=p_order;
 update public.food_module_orders o set total_cents=(select coalesce(sum(p.total_cents),0) from public.food_module_order_parts p where p.order_id=p_order) where o.id=p_order;
end $$;

create function private.food_modules_release(p_item uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare i public.food_module_order_items%rowtype;
begin
 select * into strict i from public.food_module_order_items where id=p_item for update;
 if i.inventory_state<>'released' then
   perform 1 from public.food_module_offers where id=i.offer_id for update;
   if i.snapshot->>'stock_tracked'='true' then
     if i.inventory_state='reserved' then
       update public.food_module_offers set reserved_quantity=reserved_quantity-i.quantity where id=i.offer_id;
     else
       update public.food_module_offers set stock_quantity=stock_quantity+i.quantity where id=i.offer_id;
     end if;
   end if;
   update public.food_rental_reservations set status='cancelled' where item_id=i.id and status='reserved';
 end if;
 update public.food_module_order_items set status=p_status,inventory_state='released' where id=i.id;
end $$;

create function private.food_modules_expire() returns void language plpgsql security definer set search_path='' as $$
declare o record; i record;
begin
 for o in select id,seller_store_id from public.food_module_orders
   where status in ('draft','payment_pending') and expires_at<now() order by expires_at limit 30 for update skip locked loop
   for i in select id from public.food_module_order_items where order_id=o.id and status='active' order by offer_id loop
     perform private.food_modules_release(i.id,'cancelled');
   end loop;
   update public.food_module_order_parts set status='cancelled' where order_id=o.id;
   perform private.food_modules_recalculate(o.id);
   update public.food_module_orders set status='cancelled' where id=o.id;
   perform private.food_modules_audit(o.seller_store_id,'order.expired',o.id);
 end loop;
end $$;

-- Só informações deliberadamente publicadas; nunca estoque interno, Pix ou arquivos.
create function public.food_modules_catalog(p_seller uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('offers',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'store_id',o.store_id,'name',o.name,'kind',o.kind,
   'price_cents',o.price_cents,'ready_now',o.ready_now,'lead_hours',greatest(o.lead_hours,m.lead_hours),'max_quantity',least(o.max_quantity,m.max_quantity)))
   from public.food_module_offers o join public.food_module_settings m on m.store_id=o.store_id
   where o.store_id=p_seller and o.published and o.active and private.food_modules_enabled(o.store_id,
     case o.kind when 'rental' then 'rentals' when 'custom' then 'custom' when 'printing3d' then 'custom' else 'events' end)),'[]'::jsonb),
 'combos',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'combo_id',v.combo_id,'version',v.version,'name',v.name,
   'items',(select jsonb_agg(jsonb_build_object('id',i.id,'name',i.snapshot->>'name','store_id',i.store_id,'quantity',i.quantity,
      'price_cents',(i.snapshot->>'price_cents')::bigint,'discount_bps',i.discount_bps,'ready_now',i.snapshot->'ready_now','lead_hours',i.snapshot->'lead_hours'))
     from public.food_combo_items i where i.version_id=v.id))) from public.food_combo_versions v
   where v.seller_store_id=p_seller and v.published and private.food_modules_enabled(p_seller,'combos')
     and not exists(select 1 from public.food_combo_versions newer where newer.combo_id=v.combo_id and newer.published and newer.version>v.version)
     and not exists(select 1 from public.food_combo_items ci join public.food_module_offers o on o.id=ci.offer_id
       where ci.version_id=v.id and (ci.approval<>'approved' or not o.active or not o.published or not private.food_modules_enabled(o.store_id,'combos')))),'[]'::jsonb))
$$;
revoke all on function public.food_modules_catalog(uuid) from public;
grant execute on function public.food_modules_catalog(uuid) to anon,authenticated,service_role;

create function public.food_modules_directory() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sessão obrigatória.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'store_id',o.store_id,'store_name',s.name,'name',o.name,'kind',o.kind,
   'price_cents',o.price_cents,'max_quantity',least(o.max_quantity,m.max_quantity),'lead_hours',greatest(o.lead_hours,m.lead_hours),'ready_now',o.ready_now))
   from public.food_module_offers o join public.food_stores s on s.id=o.store_id join public.food_module_settings m on m.store_id=o.store_id
   where o.active and o.published and private.food_modules_enabled(o.store_id,'combos')),'[]'::jsonb);
end $$;
revoke all on function public.food_modules_directory() from public,anon;
grant execute on function public.food_modules_directory() to authenticated;

-- Ponto único de comandos administrativos. Tabelas não aceitam DML dos clientes.
create function public.food_modules_command(p_store uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 org uuid; obj uuid; parent uuid; v_version uuid; v_count integer; v_number integer; v_offer public.food_module_offers%rowtype;
 v_item jsonb; v_row record; v_order public.food_module_orders%rowtype; v_part public.food_module_order_parts%rowtype;
 v_settings public.food_module_settings%rowtype; v_custom public.food_custom_requests%rowtype;
 v_kind text; v_total bigint; v_ref text; v_amount bigint; v_base bigint; v_suggested bigint;
begin
 if auth.uid() is null then raise exception 'Sessão obrigatória.' using errcode='42501'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Dados inválidos.'; end if;
 select organization_id into org from public.food_module_stores where store_id=p_store;
 if p_action='settings' and org is null then
   if not (private.food_modules_master() or exists(select 1 from public.food_store_users su join public.food_stores s on s.id=su.store_id
     where su.store_id=p_store and su.user_id=auth.uid() and su.active and su.role in ('owner','admin','manager') and s.active and s.archived_at is null)) then
     raise exception 'Acesso negado.' using errcode='42501'; end if;
   -- Serializa o primeiro provisionamento; não modifica a loja legada.
   perform pg_advisory_xact_lock(hashtextextended(p_store::text,0));
   select organization_id into org from public.food_module_stores where store_id=p_store;
   if org is null then
     if nullif(p_data->>'organization_id','') is not null and private.food_modules_master() then
       org:=(p_data->>'organization_id')::uuid;
     else
       insert into public.food_module_organizations(name) select name from public.food_stores where id=p_store returning id into org;
     end if;
     insert into public.food_module_stores(store_id,organization_id) values(p_store,org);
     insert into public.food_module_settings(store_id,organization_id) values(p_store,org);
   end if;
 end if;
 if not coalesce(private.food_modules_access(org,p_store,true),false) then raise exception 'Acesso negado.' using errcode='42501'; end if;
 select * into strict v_settings from public.food_module_settings where store_id=p_store for update;
 if p_action='settings' then
   update public.food_module_settings set events_enabled=coalesce((p_data->>'events_enabled')::boolean,false),
     combos_enabled=coalesce((p_data->>'combos_enabled')::boolean,false),rentals_enabled=coalesce((p_data->>'rentals_enabled')::boolean,false),
     custom_enabled=coalesce((p_data->>'custom_enabled')::boolean,false),max_quantity=coalesce((p_data->>'max_quantity')::integer,100),
     lead_hours=coalesce((p_data->>'lead_hours')::integer,24),urgency_bps=coalesce((p_data->>'urgency_bps')::integer,0) where store_id=p_store;
   obj:=p_store;
 elsif p_action='offer_save' then
   obj:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid()); v_kind:=p_data->>'kind';
   if not private.food_modules_enabled(p_store,case v_kind when 'rental' then 'rentals' when 'custom' then 'custom' when 'printing3d' then 'custom' else 'events' end) then raise exception 'Módulo desativado.'; end if;
   if exists(select 1 from public.food_module_offers where id=obj and store_id<>p_store) then raise exception 'Oferta de outra loja.' using errcode='42501'; end if;
   insert into public.food_module_offers(id,organization_id,store_id,name,kind,price_cents,published,active,ready_now,max_quantity,lead_hours,stock_quantity)
   values(obj,org,p_store,trim(p_data->>'name'),v_kind,(p_data->>'price_cents')::bigint,coalesce((p_data->>'published')::boolean,false),
     coalesce((p_data->>'active')::boolean,true),coalesce((p_data->>'ready_now')::boolean,false),
     least(coalesce((p_data->>'max_quantity')::integer,v_settings.max_quantity),v_settings.max_quantity),
     coalesce((p_data->>'lead_hours')::integer,v_settings.lead_hours),nullif(p_data->>'stock_quantity','')::integer)
   on conflict(id) do update set name=excluded.name,price_cents=excluded.price_cents,published=excluded.published,active=excluded.active,
     ready_now=excluded.ready_now,max_quantity=excluded.max_quantity,lead_hours=excluded.lead_hours,stock_quantity=excluded.stock_quantity;
   if v_kind='rental' then
     insert into public.food_rental_assets(offer_id,organization_id,store_id) values(obj,org,p_store) on conflict do nothing;
   end if;
 elsif p_action='combo_save' then
   if not private.food_modules_enabled(p_store,'combos') then raise exception 'Combos desativados.'; end if;
   if jsonb_typeof(p_data->'items') is distinct from 'array' or jsonb_array_length(p_data->'items') not between 1 and 50 then raise exception 'Selecione de 1 a 50 ofertas.'; end if;
   parent:=nullif(p_data->>'combo_id','')::uuid;
   if parent is null then
     insert into public.food_combos(organization_id,seller_store_id,created_by) values(org,p_store,auth.uid()) returning id into parent;
   else
     perform 1 from public.food_combos where id=parent and seller_store_id=p_store for update;
     if not found then raise exception 'Combo indisponível.'; end if;
   end if;
   select coalesce(max(version),0)+1 into v_number from public.food_combo_versions where combo_id=parent;
   insert into public.food_combo_versions(combo_id,organization_id,seller_store_id,version,name)
     values(parent,org,p_store,v_number,trim(p_data->>'name')) returning id into obj;
   for v_item in select * from jsonb_array_elements(p_data->'items') loop
     select * into strict v_offer from public.food_module_offers where id=(v_item->>'offer_id')::uuid and active and published;
     if not private.food_modules_enabled(v_offer.store_id,'combos') then raise exception 'Fornecedor não habilitou combos.'; end if;
     if (v_item->>'quantity')::integer>v_offer.max_quantity then raise exception 'Quantidade excede limite da oferta.'; end if;
     insert into public.food_combo_items(version_id,offer_id,organization_id,store_id,quantity,discount_bps,snapshot)
     values(obj,v_offer.id,v_offer.organization_id,v_offer.store_id,(v_item->>'quantity')::integer,coalesce((v_item->>'discount_bps')::integer,0),
       jsonb_build_object('name',v_offer.name,'kind',v_offer.kind,'price_cents',v_offer.price_cents,'ready_now',v_offer.ready_now,
         'max_quantity',v_offer.max_quantity,'lead_hours',v_offer.lead_hours));
   end loop;
 elsif p_action='combo_approve' then
   obj:=(p_data->>'item_id')::uuid;
   select version_id into strict v_version from public.food_combo_items where id=obj and store_id=p_store for update;
   -- Nem o Master substitui a aprovação do proprietário fornecedor.
   if not exists(select 1 from public.food_store_users where store_id=p_store and user_id=auth.uid() and active and role in ('owner','admin','manager')) then
     raise exception 'Aprovação exige responsável da loja fornecedora.' using errcode='42501'; end if;
   perform 1 from public.food_combo_versions where id=v_version for update;
   if exists(select 1 from public.food_combo_versions where id=v_version and published) then raise exception 'Versão publicada é imutável.'; end if;
   update public.food_combo_items set approval=case when (p_data->>'approve')::boolean then 'approved' else 'rejected' end,
     approved_by=auth.uid(),approved_at=now() where id=obj;
 elsif p_action='combo_publish' then
   obj:=(p_data->>'version_id')::uuid;
   if not private.food_modules_enabled(p_store,'combos') then raise exception 'Combos desativados.'; end if;
   perform 1 from public.food_combo_versions where id=obj and seller_store_id=p_store for update;
   if not found then raise exception 'Versão indisponível.'; end if;
   select count(*) into v_count from public.food_combo_items where version_id=obj;
   if v_count=0 or exists(select 1 from public.food_combo_items where version_id=obj and approval<>'approved') then raise exception 'Todos os fornecedores precisam aprovar esta versão.'; end if;
   update public.food_combo_versions set published=true where id=obj;
 elsif p_action in ('urgency','payment','cancel','settle','refund') then
   obj:=(p_data->>'order_id')::uuid;
   select * into strict v_order from public.food_module_orders where id=obj for update;
   if p_action='urgency' then
     select * into strict v_part from public.food_module_order_parts where order_id=obj and store_id=p_store for update;
     if v_order.status<>'draft' or v_part.urgency not in ('pending','accepted','rejected') then raise exception 'Urgência indisponível.'; end if;
     update public.food_module_order_parts set urgency=case when (p_data->>'accept')::boolean then 'accepted' else 'rejected' end where id=v_part.id;
   elsif p_action='payment' then
     if v_order.seller_store_id<>p_store then raise exception 'Somente a loja vendedora confere o pagamento.' using errcode='42501'; end if;
     if v_order.status='paid' then return jsonb_build_object('id',obj,'already_paid',true); end if;
     v_ref:=trim(coalesce(p_data->>'reference','')); v_amount:=(p_data->>'amount_cents')::bigint;
     if v_order.status<>'payment_pending' or v_order.expires_at<=now() or length(v_ref)<3 or v_amount is distinct from v_order.charged_cents or v_order.total_cents<>v_order.charged_cents then
       raise exception 'Confira crédito, valor e referência bancária. Cobrança expirada ou alterada não pode ser confirmada.'; end if;
     for v_row in select * from public.food_module_order_items where order_id=obj and status='active' order by offer_id for update loop
       if v_row.snapshot->>'stock_tracked'='true' then
         update public.food_module_offers set stock_quantity=stock_quantity-v_row.quantity,reserved_quantity=reserved_quantity-v_row.quantity where id=v_row.offer_id;
       end if;
       update public.food_module_order_items set inventory_state='consumed' where id=v_row.id;
     end loop;
     update public.food_module_orders set status='paid',paid_cents=v_amount,paid_at=now(),payment_reference=v_ref where id=obj;
     insert into public.food_module_receivables(part_id,organization_id,store_id,amount_cents)
       select id,organization_id,store_id,total_cents from public.food_module_order_parts where order_id=obj and store_id<>p_store and total_cents>0;
   elsif p_action='cancel' then
     if coalesce((p_data->>'all')::boolean,false) and not private.food_modules_master() then raise exception 'Somente Master AAL2 cancela tudo.' using errcode='42501'; end if;
     for v_part in select * from public.food_module_order_parts where order_id=obj and status='active'
       and (store_id=p_store or (coalesce((p_data->>'all')::boolean,false) and private.food_modules_master())) order by store_id for update loop
       for v_row in select id from public.food_module_order_items where part_id=v_part.id and status='active' order by offer_id loop
         perform private.food_modules_release(v_row.id,'cancelled');
       end loop;
       if v_order.paid_cents>0 and v_part.total_cents>0 then
         insert into public.food_module_refunds(order_id,part_id,organization_id,store_id,amount_cents)
           values(obj,v_part.id,v_part.organization_id,v_part.store_id,v_part.total_cents) on conflict(part_id) do nothing;
       end if;
       update public.food_module_receivables set amount_cents=0,status=case when settled_cents>0 then 'recovery_due' else 'cancelled' end where part_id=v_part.id;
       update public.food_module_order_parts set status='cancelled' where id=v_part.id;
       perform private.food_modules_audit(v_part.store_id,'part.cancelled',v_part.id);
     end loop;
     perform private.food_modules_recalculate(obj);
     update public.food_module_orders set status='cancelled' where id=obj and total_cents=0;
   elsif p_action='settle' then
     if not private.food_modules_master() then raise exception 'Liquidação exige Master AAL2.' using errcode='42501'; end if;
     v_ref:=trim(coalesce(p_data->>'reference',''));
     if length(v_ref)<3 then raise exception 'Informe referência do repasse.'; end if;
     update public.food_module_receivables set status='settled',settled_cents=amount_cents,reference=v_ref,settled_at=now()
       where part_id=(p_data->>'part_id')::uuid and status='pending' and part_id in(select id from public.food_module_order_parts where order_id=obj);
   else
     if v_order.seller_store_id<>p_store and not private.food_modules_master() then raise exception 'Reembolso exige vendedor ou Master.' using errcode='42501'; end if;
     v_ref:=trim(coalesce(p_data->>'reference',''));
     if length(v_ref)<3 then raise exception 'Informe referência bancária do reembolso.'; end if;
     update public.food_module_refunds set status='paid',reference=v_ref,paid_at=now() where id=(p_data->>'refund_id')::uuid and order_id=obj and status='pending';
   end if;
 elsif p_action='custom_save' then
   if not private.food_modules_enabled(p_store,'custom') then raise exception 'Personalizados desativados.'; end if;
   obj:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid());
   if exists(select 1 from public.food_custom_requests where id=obj and store_id<>p_store) then raise exception 'Acesso negado.' using errcode='42501'; end if;
   if jsonb_typeof(p_data->'quote')='object' then
     -- Mesma fórmula da calculadora; preço final é uma escolha explícita do lojista.
     v_item:=p_data->'quote';
     if exists(select 1 from jsonb_each_text(v_item) q where q.value::numeric<0 or q.value::numeric>100000000) then raise exception 'Custo inválido.'; end if;
     if coalesce((v_item->>'margin_bps')::integer,0)>=10000 then raise exception 'Margem deve ser menor que 100%%.'; end if;
     v_base:=round(coalesce((v_item->>'grams')::numeric,0)*coalesce((v_item->>'cents_per_gram')::numeric,0)
       +coalesce((v_item->>'hours')::numeric,0)*(coalesce((v_item->>'watts')::numeric,0)/1000*coalesce((v_item->>'energy_cents_kwh')::numeric,0)+coalesce((v_item->>'machine_cents_hour')::numeric,0))
       +coalesce((v_item->>'labor_cents')::numeric,0)+coalesce((v_item->>'finishing_cents')::numeric,0));
     v_suggested:=round(v_base::numeric*10000/(10000-coalesce((v_item->>'margin_bps')::integer,0))*(10000+v_settings.urgency_bps*case when coalesce((p_data->>'urgent')::boolean,false) then 1 else 0 end)/10000);
     p_data:=jsonb_set(p_data,'{quote}',v_item||jsonb_build_object('base_cents',v_base,'suggested_cents',v_suggested,'urgency_bps',v_settings.urgency_bps));
   end if;
   insert into public.food_custom_requests(id,organization_id,store_id,customer_name,customer_phone,quantity,size,material,color,due_at,notes,quote,final_cents,status)
     values(obj,org,p_store,trim(p_data->>'customer_name'),trim(p_data->>'customer_phone'),(p_data->>'quantity')::integer,
       left(p_data->>'size',200),left(p_data->>'material',100),left(p_data->>'color',100),(p_data->>'due_at')::timestamptz,
       left(coalesce(p_data->>'notes',''),2000),p_data->'quote',nullif(p_data->>'final_cents','')::bigint,coalesce(p_data->>'status','quote'))
     on conflict(id) do update set quantity=excluded.quantity,size=excluded.size,material=excluded.material,color=excluded.color,
       due_at=excluded.due_at,notes=excluded.notes,quote=excluded.quote,final_cents=excluded.final_cents,status=excluded.status;
 elsif p_action='file_register' then
   select * into strict v_custom from public.food_custom_requests where id=(p_data->>'request_id')::uuid and store_id=p_store;
   if not private.food_modules_file_access(p_data->>'storage_path') then raise exception 'Arquivo ou caminho inválido.'; end if;
   if not exists(select 1 from storage.objects where bucket_id='food-custom-files' and name=p_data->>'storage_path') then raise exception 'Envie o arquivo antes de registrá-lo.'; end if;
   insert into public.food_custom_files(request_id,organization_id,store_id,storage_path,name,size_bytes)
     values(v_custom.id,org,p_store,p_data->>'storage_path',left(p_data->>'name',200),(p_data->>'size_bytes')::integer) returning id into obj;
 elsif p_action='rental_asset' then
   obj:=(p_data->>'offer_id')::uuid;
   update public.food_rental_assets set maintenance=(p_data->>'maintenance')::boolean,maintenance_notes=left(coalesce(p_data->>'notes',''),2000)
     where offer_id=obj and store_id=p_store;
   if not found then raise exception 'Ativo indisponível.'; end if;
 elsif p_action='rental_update' then
   obj:=(p_data->>'id')::uuid;
   if jsonb_typeof(coalesce(p_data->'assembly_checklist','[]'))<>'array' or jsonb_typeof(coalesce(p_data->'return_checklist','[]'))<>'array' then raise exception 'Checklist inválido.'; end if;
   update public.food_rental_reservations set deposit_cents=coalesce((p_data->>'deposit_cents')::bigint,0),
     deposit_reference=nullif(p_data->>'deposit_reference',''),contract=left(coalesce(p_data->>'contract',''),20000),
     assembly_checklist=coalesce(p_data->'assembly_checklist','[]'),return_checklist=coalesce(p_data->'return_checklist','[]')
     where id=obj and store_id=p_store;
   if not found then raise exception 'Reserva indisponível.'; end if;
 else raise exception 'Comando desconhecido.';
 end if;
 perform private.food_modules_audit(p_store,p_action,obj);
 return jsonb_build_object('id',obj);
end $$;
revoke all on function public.food_modules_command(uuid,text,jsonb) from public,anon;
grant execute on function public.food_modules_command(uuid,text,jsonb) to authenticated;

-- Capability do comprador: nunca consultar pedido por UUID público apenas.
create function private.food_modules_customer_view(p_order uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',o.id,'code',o.code,'seller_store_id',o.seller_store_id,'status',o.status,'total_cents',o.total_cents,
   'charged_cents',o.charged_cents,'paid_cents',o.paid_cents,'expires_at',o.expires_at,'pix',o.pix_snapshot,
   'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.snapshot->>'name','kind',i.snapshot->>'kind','quantity',i.quantity,
     'store_id',i.store_id,'total_cents',i.total_cents,'status',i.status,'urgent',i.snapshot->'urgent','urgency_bps',i.snapshot->'urgency_bps',
     'ready_now',i.snapshot->'ready_now','lead_hours',i.snapshot->'lead_hours','urgency',p.urgency)) from public.food_module_order_items i
     join public.food_module_order_parts p on p.id=i.part_id where i.order_id=o.id),'[]'::jsonb),
   'refund_due_cents',coalesce((select sum(amount_cents) from public.food_module_refunds where order_id=o.id and status='pending'),0))
 from public.food_module_orders o where o.id=p_order
$$;

create function public.food_modules_customer(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 o public.food_module_orders%rowtype; s public.food_stores%rowtype; m public.food_module_settings%rowtype;
 offer public.food_module_offers%rowtype; ci record; x jsonb; terms jsonb; arr jsonb; part uuid; item uuid; ord uuid;
 seller uuid; ver uuid; org uuid; token text; req uuid; qty integer; limit_qty integer; lead integer; urgent boolean;
 starts timestamptz; ends timestamptz; unit_cents bigint; base_cents bigint; line_cents bigint; discount integer; urgency_rate integer;
begin
 -- ACL service_role: somente a nova Edge Function valida origem, Turnstile e rate limit.
 if coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','')<>'service_role' and session_user<>'postgres' then raise exception 'Acesso negado.' using errcode='42501'; end if;
 token:=p_data->>'token';
 if token is null or token !~ '^[a-f0-9]{64}$' then raise exception 'Credencial inválida.' using errcode='42501'; end if;
 if p_action='create' then
   perform private.food_modules_expire();
   seller:=(p_data->>'seller_store_id')::uuid; req:=(p_data->>'request_id')::uuid;
   perform pg_advisory_xact_lock(hashtextextended(seller::text||req::text,0));
   select * into o from public.food_module_orders where seller_store_id=seller and request_id=req;
   if found then
     if o.capability_hash<>sha256(convert_to(token,'UTF8')) then raise exception 'Credencial inválida.' using errcode='42501'; end if;
     return private.food_modules_customer_view(o.id);
   end if;
   select * into strict s from public.food_stores where id=seller;
   select * into strict m from public.food_module_settings where store_id=seller;
   starts:=(p_data->>'scheduled_for')::timestamptz; ends:=(p_data->>'ends_at')::timestamptz;
   if starts is null or ends is null or starts<=now() or ends<=starts or ends>starts+interval '30 days' then raise exception 'Informe agendamento e término futuros válidos (até 30 dias).'; end if;
   ver:=nullif(p_data->>'version_id','')::uuid;
   if ver is not null then
     if not private.food_modules_enabled(seller,'combos') then raise exception 'Combos desativados.'; end if;
     perform 1 from public.food_combo_versions where id=ver and seller_store_id=seller and published for update;
     if not found then raise exception 'Combo indisponível.'; end if;
     select jsonb_agg(jsonb_build_object('offer_id',i.offer_id,'quantity',i.quantity,'combo_item_id',i.id,'terms',i.snapshot,'discount_bps',i.discount_bps)) into arr
       from public.food_combo_items i where i.version_id=ver and i.approval='approved';
     if exists(select 1 from public.food_combo_items where version_id=ver and approval<>'approved') then raise exception 'Combo sem aprovação.'; end if;
   else
     arr:=p_data->'items';
   end if;
   if jsonb_typeof(arr) is distinct from 'array' or jsonb_array_length(arr) not between 1 and 50 then raise exception 'Pedido precisa de 1 a 50 itens.'; end if;
   insert into public.food_module_orders(organization_id,seller_store_id,version_id,request_id,capability_hash,customer_name,customer_phone,scheduled_for,ends_at)
     values(m.organization_id,seller,ver,req,sha256(convert_to(token,'UTF8')),trim(p_data->>'customer_name'),trim(p_data->>'customer_phone'),starts,ends) returning id into ord;
   -- Locks em ordem estável impedem overselling e reservas simultâneas do mesmo ativo.
   for x in select value from jsonb_array_elements(arr) order by value->>'offer_id' loop
     select * into strict offer from public.food_module_offers where id=(x->>'offer_id')::uuid and active and published for update;
     if ver is null and offer.store_id<>seller then raise exception 'Venda direta exige oferta da loja vendedora.'; end if;
     if not private.food_modules_enabled(offer.store_id,case offer.kind when 'rental' then 'rentals' when 'custom' then 'custom' when 'printing3d' then 'custom' else 'events' end)
       or (ver is not null and not private.food_modules_enabled(offer.store_id,'combos')) then raise exception 'Módulo do fornecedor desativado.'; end if;
     select * into strict m from public.food_module_settings where store_id=offer.store_id;
     qty:=(x->>'quantity')::integer;
     terms:=case when ver is null then jsonb_build_object('name',offer.name,'kind',offer.kind,'price_cents',offer.price_cents,'ready_now',offer.ready_now,'max_quantity',offer.max_quantity,'lead_hours',offer.lead_hours) else x->'terms' end;
     limit_qty:=least(offer.max_quantity,m.max_quantity,(terms->>'max_quantity')::integer);
     if qty is null or qty<1 or qty>limit_qty then raise exception 'Quantidade excede limite do fornecedor.'; end if;
     lead:=greatest(offer.lead_hours,m.lead_hours,(terms->>'lead_hours')::integer);
     urgent:=starts<now()+make_interval(hours=>lead); urgency_rate:=case when urgent then m.urgency_bps else 0 end;
     discount:=case when ver is null then 0 else (x->>'discount_bps')::integer end;
     unit_cents:=(terms->>'price_cents')::bigint;
     base_cents:=round(unit_cents::numeric*qty*(10000-discount)/10000);
     line_cents:=round(base_cents::numeric*(10000+urgency_rate)/10000);
     terms:=terms||jsonb_build_object('lead_hours',lead,'max_quantity',limit_qty,'urgent',urgent,'urgency_bps',urgency_rate,'discount_bps',discount,'stock_tracked',offer.stock_quantity is not null);
     if offer.kind='rental' then
       if qty<>1 then raise exception 'Cadastre cada ativo de aluguel separadamente; quantidade deve ser 1.'; end if;
       perform 1 from public.food_rental_assets where offer_id=offer.id and not maintenance for update;
       if not found then raise exception 'Ativo em manutenção ou indisponível.'; end if;
       if exists(select 1 from public.food_rental_reservations r where r.offer_id=offer.id and r.status='reserved' and r.starts_at<ends and r.ends_at>starts) then raise exception 'Ativo já reservado neste período.'; end if;
     end if;
     if offer.stock_quantity is not null then
       if offer.stock_quantity-offer.reserved_quantity<qty then raise exception 'Saldo destinado ao módulo insuficiente.'; end if;
       update public.food_module_offers set reserved_quantity=reserved_quantity+qty where id=offer.id;
     end if;
     insert into public.food_module_order_parts(order_id,organization_id,store_id,code,scheduled_for,urgency)
       select ord,offer.organization_id,offer.store_id,code,starts,case when urgent then 'pending' else 'not_needed' end from public.food_module_orders where id=ord
       on conflict(order_id,store_id) do update set urgency=case when excluded.urgency='pending' then 'pending' else food_module_order_parts.urgency end returning id into part;
     insert into public.food_module_order_items(order_id,part_id,organization_id,store_id,offer_id,combo_item_id,quantity,snapshot,total_cents)
       values(ord,part,offer.organization_id,offer.store_id,offer.id,nullif(x->>'combo_item_id','')::uuid,qty,terms,line_cents) returning id into item;
     if offer.kind='rental' then
       insert into public.food_rental_reservations(offer_id,item_id,organization_id,store_id,starts_at,ends_at) values(offer.id,item,offer.organization_id,offer.store_id,starts,ends);
     end if;
     perform private.food_modules_audit(offer.store_id,'part.created',part);
   end loop;
   perform private.food_modules_recalculate(ord);
   perform private.food_modules_audit(seller,'order.created',ord);
 else
   ord:=(p_data->>'order_id')::uuid;
   select * into strict o from public.food_module_orders where id=ord for update;
   if o.capability_hash<>sha256(convert_to(token,'UTF8')) then raise exception 'Credencial inválida.' using errcode='42501'; end if;
   if p_action='remove' then
     if o.status<>'draft' or o.expires_at<=now() then raise exception 'Revisão encerrada ou expirada.'; end if;
     item:=(p_data->>'item_id')::uuid;
     perform 1 from public.food_module_order_items where id=item and order_id=ord and status='active';
     if not found then raise exception 'Item indisponível.'; end if;
     perform private.food_modules_release(item,'removed');
     perform private.food_modules_recalculate(ord);
     perform private.food_modules_audit(o.seller_store_id,'customer.item_removed',item);
   elsif p_action='freeze' then
     if o.status='payment_pending' then return private.food_modules_customer_view(ord); end if;
     if o.status<>'draft' or o.expires_at<=now() or o.total_cents<=0 then raise exception 'Pedido indisponível ou vazio.'; end if;
     if exists(select 1 from public.food_module_order_parts where order_id=ord and total_cents>0 and urgency in ('pending','rejected')) then raise exception 'Prazo mínimo não atendido: aguarde decisão de urgência dos fornecedores ou remova os itens recusados.'; end if;
     select * into strict s from public.food_stores where id=o.seller_store_id;
     if not s.pix_enabled then raise exception 'Pix da loja vendedora indisponível.'; end if;
     if o.total_cents is distinct from (p_data->>'expected_cents')::bigint then raise exception 'Total alterado. Revise o pedido.'; end if;
     update public.food_module_orders set status='payment_pending',charged_cents=total_cents,
       pix_snapshot=jsonb_build_object('receiptMode',s.pix_receipt_mode,'key',s.pix_key,'copyPaste',s.pix_copy_paste,'receiver',s.pix_holder_name,'city',s.city)
       where id=ord;
     perform private.food_modules_audit(o.seller_store_id,'charge.created',ord);
   elsif p_action<>'get' then raise exception 'Comando público desconhecido.';
   end if;
 end if;
 return private.food_modules_customer_view(ord);
end $$;
revoke all on function public.food_modules_customer(text,jsonb) from public,anon,authenticated;
grant execute on function public.food_modules_customer(text,jsonb) to service_role;

-- Rate limit sem IP em claro, exclusivo dos módulos. Gateway envia hash e não aceita do browser.
create table private.food_module_rate_limits (key text not null,window_at timestamptz not null,hits integer not null,primary key(key,window_at));
alter table private.food_module_rate_limits enable row level security;
revoke all on private.food_module_rate_limits from public,anon,authenticated;
create function public.food_modules_rate_limit(p_key text) returns void language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 insert into private.food_module_rate_limits(key,window_at,hits) values(p_key,date_trunc('minute',now()),1)
 on conflict(key,window_at) do update set hits=food_module_rate_limits.hits+1 returning hits into n;
 if n>40 then raise exception 'Muitas solicitações. Aguarde um minuto.'; end if;
 delete from private.food_module_rate_limits where window_at<now()-interval '1 day';
end $$;
revoke all on function public.food_modules_rate_limit(text) from public,anon,authenticated;
grant execute on function public.food_modules_rate_limit(text) to service_role;

revoke all on function private.food_modules_audit(uuid,text,uuid,jsonb),private.food_modules_recalculate(uuid),
 private.food_modules_release(uuid,text),private.food_modules_expire(),private.food_modules_customer_view(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
