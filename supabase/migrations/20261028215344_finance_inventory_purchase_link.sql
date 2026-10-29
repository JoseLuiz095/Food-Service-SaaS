-- Classificação: food. Uma compra recebida atualiza o estoque e registra a
-- obrigação financeira na mesma transação; não reconcilia compras antigas.
alter table public.food_financial_entries
  add column if not exists purchase_id uuid;

alter table public.food_inventory_purchases
  add column if not exists finance_request_hash text;

alter table public.food_financial_entries
  drop constraint if exists food_financial_entries_source_check;
alter table public.food_financial_entries
  add constraint food_financial_entries_source_check
  check (source in ('manual','order','adjustment','purchase'));

alter table public.food_financial_entries
  add constraint food_financial_entries_purchase_store_fk
  foreign key (purchase_id, store_id)
  references public.food_inventory_purchases(id, store_id) on delete restrict;
alter table public.food_financial_entries
  add constraint food_financial_entries_purchase_source_check
  check ((source='purchase') = (purchase_id is not null));
create unique index food_financial_entries_purchase_uidx
  on public.food_financial_entries(store_id,purchase_id)
  where purchase_id is not null;

-- Uma compra já recebida não pode ter seu valor editado apenas no financeiro.
-- A quitação de uma obrigação pendente pode ser feita sem mover o estoque.
create or replace function public.food_guard_purchase_financial_entry()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_purchase public.food_inventory_purchases%rowtype;
begin
  if tg_op='INSERT' then
    if new.source='purchase' then
      select * into v_purchase from public.food_inventory_purchases
       where id=new.purchase_id and store_id=new.store_id;
      if not found or v_purchase.finance_request_hash is null
         or new.direction<>'expense' or new.amount is distinct from v_purchase.total_amount
         or new.status not in ('pending','paid') then
        raise exception 'A despesa da compra precisa corresponder ao valor registrado no estoque.' using errcode='23514';
      end if;
    end if;
    return new;
  end if;
  if old.source <> 'purchase' then
    if tg_op='DELETE' then return old; end if;
    if new.source='purchase' then
      raise exception 'Crie uma compra vinculada pelo fluxo de estoque e financeiro.' using errcode='23514';
    end if;
    return new;
  end if;
  if tg_op='DELETE' then
    raise exception 'Uma compra vinculada ao estoque não pode ser excluída do financeiro.' using errcode='23514';
  end if;
  if row(new.store_id,new.purchase_id,new.source,new.direction,new.amount,new.description,
         new.occurred_on,new.category_id,new.counterparty,new.document_type,new.document_number,new.notes)
     is distinct from
     row(old.store_id,old.purchase_id,old.source,old.direction,old.amount,old.description,
         old.occurred_on,old.category_id,old.counterparty,old.document_type,old.document_number,old.notes)
     or new.status not in (old.status,'paid')
     or (new.status='paid' and old.status not in ('pending','paid'))
     or (old.status='paid' and new.paid_at is distinct from old.paid_at)
  then
    raise exception 'Valor e vínculo da compra são imutáveis; somente uma despesa pendente pode ser quitada.' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists food_guard_purchase_financial_entry_trg on public.food_financial_entries;
create trigger food_guard_purchase_financial_entry_trg
before insert or update or delete on public.food_financial_entries
for each row execute function public.food_guard_purchase_financial_entry();

-- O RPC antigo continua disponível para lojas sem o módulo financeiro.
-- Este RPC exige os dois acessos e evita estado parcial ao registrar a compra.
create or replace function public.food_record_financed_purchase_v1(p_request jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_store uuid;
  v_purchase uuid;
  v_category uuid;
  v_entry uuid;
  v_total numeric(14,2);
  v_result jsonb;
  v_existing_hash text;
  v_fingerprint text;
  v_key text;
  v_status text;
  v_doc_type text;
  v_description text;
  v_duplicate boolean;
begin
  if p_request is null or jsonb_typeof(p_request)<>'object' then
    raise exception 'Compra inválida.' using errcode='22023';
  end if;
  begin
    v_store:=(p_request->>'store_id')::uuid;
    v_category:=nullif(p_request->>'category_id','')::uuid;
  exception when others then
    raise exception 'Loja ou categoria inválida.' using errcode='22023';
  end;
  if auth.uid() is null or not public.food_is_store_admin(v_store)
     or not public.food_can_manage_finance(v_store) then
    raise exception 'Sem acesso ao estoque e financeiro desta loja.' using errcode='42501';
  end if;
  v_key:=nullif(trim(p_request->>'idempotency_key'),'');
  if v_key is null or length(v_key)>128 then
    raise exception 'Identificador da compra inválido.' using errcode='22023';
  end if;
  v_status:=coalesce(nullif(p_request->>'payment_status',''),'pending');
  if v_status not in ('pending','paid') then
    raise exception 'Situação do pagamento inválida.' using errcode='22023';
  end if;
  v_doc_type:=coalesce(nullif(p_request->>'document_type',''),'none');
  if v_doc_type not in ('none','nfe','nfce','nfse','receipt','boleto','coupon','other') then
    raise exception 'Tipo de documento inválido.' using errcode='22023';
  end if;
  if v_category is not null and not exists (
    select 1 from public.food_financial_categories c
    where c.id=v_category and c.store_id=v_store and c.active and c.direction in ('expense','both')
  ) then
    raise exception 'Categoria financeira inválida para esta loja.' using errcode='22023';
  end if;
  v_fingerprint:=md5((p_request - 'idempotency_key')::text);
  select p.id,p.finance_request_hash into v_purchase,v_existing_hash
    from public.food_inventory_purchases p
   where p.store_id=v_store and p.idempotency_key=v_key for update;
  if found and v_existing_hash is distinct from v_fingerprint then
    raise exception 'Esta tentativa já foi usada para outra compra.' using errcode='23505';
  end if;
  v_result:=public.food_record_inventory_purchase(
    v_store,p_request->'items',nullif(p_request->>'supplier',''),
    coalesce(nullif(p_request->>'occurred_on','')::date,current_date),
    nullif(p_request->>'payment_method',''),nullif(p_request->>'document_type',''),
    nullif(p_request->>'document_number',''),nullif(p_request->>'notes',''),v_key
  );
  v_purchase:=(v_result->>'purchase_id')::uuid;
  v_total:=(v_result->>'total_amount')::numeric;
  v_duplicate:=coalesce((v_result->>'duplicate')::boolean,false);
  if v_total<=0 then
    raise exception 'Informe o custo da compra para integrar ao financeiro.' using errcode='22023';
  end if;
  if v_duplicate and v_existing_hash is null then
    raise exception 'Esta tentativa pertence a uma compra sem vínculo financeiro.' using errcode='23505';
  end if;
  if not v_duplicate then
    update public.food_inventory_purchases set finance_request_hash=v_fingerprint where id=v_purchase and store_id=v_store;
  end if;
  v_description:=left(coalesce(nullif(trim(p_request->>'description'),''),
    'Compra de insumos' || coalesce(' · '||nullif(trim(p_request->>'supplier'),''),'')),200);
  insert into public.food_financial_entries
    (store_id,direction,source,purchase_id,category_id,description,amount,occurred_on,
     paid_at,status,payment_method,counterparty,document_type,document_number,notes,created_by)
  values
    (v_store,'expense','purchase',v_purchase,v_category,v_description,v_total,
     coalesce(nullif(p_request->>'occurred_on','')::date,current_date),
     case when v_status='paid' then now() else null end,v_status,
     nullif(p_request->>'payment_method',''),nullif(p_request->>'supplier',''),
     v_doc_type,nullif(p_request->>'document_number',''),nullif(p_request->>'notes',''),auth.uid())
  on conflict (store_id,purchase_id) where purchase_id is not null do nothing
  returning id into v_entry;
  if v_entry is null then
    select id into v_entry from public.food_financial_entries
     where store_id=v_store and purchase_id=v_purchase;
  end if;
  return jsonb_build_object('purchase_id',v_purchase,'financial_entry_id',v_entry,
    'total_amount',v_total,'duplicate',v_duplicate);
end;
$$;
revoke all on function public.food_record_financed_purchase_v1(jsonb) from public,anon;
grant execute on function public.food_record_financed_purchase_v1(jsonb) to authenticated;
revoke all on function public.food_guard_purchase_financial_entry() from public,anon,authenticated;
