begin;

-- Food Service SaaS v0.3.0
-- Escada comercial, cobranca recorrente e financeiro gerencial.
-- A migration toca somente objetos food_* e auth via helpers existentes.

-- -----------------------------------------------------------------------------
-- Planos: Demo = trial do Profissional; 3 planos pagos principais.
-- -----------------------------------------------------------------------------
insert into public.food_features(code,name,description,scope) values
('custom_banner','Banners personalizados','Capa e comunicacao visual personalizada da vitrine.','food'),
('billing_pix','Cobranca Pix da assinatura','Renovacao da mensalidade por Pix.','core')
on conflict(code) do update set name=excluded.name,description=excluded.description,scope=excluded.scope,active=true,updated_at=now();

-- Preserva ids para nao quebrar assinaturas existentes.
do $$
begin
  if exists(select 1 from public.food_plans where code='BASIC') and not exists(select 1 from public.food_plans where code='ESSENTIAL') then
    update public.food_plans set code='ESSENTIAL',updated_at=now() where code='BASIC';
  end if;
  if exists(select 1 from public.food_plans where code='PRO') and not exists(select 1 from public.food_plans where code='STARTER') then
    update public.food_plans set code='STARTER',updated_at=now() where code='PRO';
  end if;
  if exists(select 1 from public.food_plans where code='PREMIUM') and not exists(select 1 from public.food_plans where code='PROFESSIONAL') then
    update public.food_plans set code='PROFESSIONAL',updated_at=now() where code='PREMIUM';
  end if;
end $$;

insert into public.food_plans(code,name,product_limit,image_limit_per_product,custom_domain,reports,priority_support,monthly_price,setup_price,category_limit,addon_limit,admin_user_limit,sort_order,active) values
('DEMO','Teste gratis',null,10,false,true,true,0,0,null,null,5,0,true),
('ESSENTIAL','Essencial',40,1,false,false,false,49.90,0,12,40,2,10,true),
('STARTER','Starter',120,5,false,true,false,79.90,0,30,120,4,20,true),
('PROFESSIONAL','Profissional',null,10,false,true,true,119.90,0,null,null,8,30,true)
on conflict(code) do update set
  name=excluded.name,
  product_limit=excluded.product_limit,
  image_limit_per_product=excluded.image_limit_per_product,
  custom_domain=excluded.custom_domain,
  reports=excluded.reports,
  priority_support=excluded.priority_support,
  monthly_price=excluded.monthly_price,
  setup_price=excluded.setup_price,
  category_limit=excluded.category_limit,
  addon_limit=excluded.addon_limit,
  admin_user_limit=excluded.admin_user_limit,
  sort_order=excluded.sort_order,
  active=true,
  updated_at=now();

-- Inativa planos antigos restantes caso uma instalacao ja tivesse codigos novos paralelos.
update public.food_plans set active=false,updated_at=now()
where code in ('BASIC','PRO','PREMIUM');

-- Fonte da verdade de funcionalidades por plano.
delete from public.food_plan_features
where plan_id in (select id from public.food_plans where code in ('DEMO','ESSENTIAL','STARTER','PROFESSIONAL'));

insert into public.food_plan_features(plan_id,feature_code,enabled,limit_value)
select p.id,f.code,true,null
from public.food_plans p
join public.food_features f on f.code in ('catalog','orders','whatsapp','delivery','billing_pix')
where p.code in ('DEMO','ESSENTIAL','STARTER','PROFESSIONAL');

insert into public.food_plan_features(plan_id,feature_code,enabled,limit_value)
select p.id,f.code,true,null
from public.food_plans p
join public.food_features f on f.code in ('analytics','custom_banner')
where p.code in ('DEMO','STARTER','PROFESSIONAL');

insert into public.food_plan_features(plan_id,feature_code,enabled,limit_value)
select p.id,f.code,true,null
from public.food_plans p
join public.food_features f on f.code in ('finance','multi_user')
where p.code in ('DEMO','PROFESSIONAL');

-- Demo de 14 dias, equivalente ao Profissional.
update public.food_platform_settings
set demo_duration_days=14,
    demo_warning_days=3,
    updated_at=now()
where id=1;

-- -----------------------------------------------------------------------------
-- Helpers de feature gating.
-- -----------------------------------------------------------------------------
create or replace function public.food_store_has_feature(p_store_id uuid,p_feature_code text)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select exists(
    select 1
    from public.food_store_subscriptions ss
    join public.food_plan_features pf on pf.plan_id=ss.plan_id and pf.enabled=true
    where ss.store_id=p_store_id
      and ss.status in ('trial','active')
      and (ss.expires_at is null or ss.expires_at>now())
      and pf.feature_code=p_feature_code
    order by ss.started_at desc
    limit 1
  );
$$;
revoke all on function public.food_store_has_feature(uuid,text) from public;
grant execute on function public.food_store_has_feature(uuid,text) to authenticated,service_role;

create or replace function public.food_can_manage_finance(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select public.food_is_platform_admin()
    or (
      public.food_store_has_feature(p_store_id,'finance')
      and exists(
        select 1 from public.food_store_users su
        where su.store_id=p_store_id and su.user_id=auth.uid() and su.active=true
          and su.role in ('owner','admin','manager','finance')
      )
    );
$$;
revoke all on function public.food_can_manage_finance(uuid) from public;
grant execute on function public.food_can_manage_finance(uuid) to authenticated,service_role;

-- -----------------------------------------------------------------------------
-- Dados de cobranca da loja e configuracao da plataforma.
-- -----------------------------------------------------------------------------
alter table public.food_stores add column if not exists billing_document text;
alter table public.food_stores add column if not exists billing_phone text;
alter table public.food_stores add column if not exists billing_asaas_customer_id text;

alter table public.food_platform_settings add column if not exists billing_provider text not null default 'manual';
alter table public.food_platform_settings add column if not exists billing_pix_key_type text;
alter table public.food_platform_settings add column if not exists billing_pix_key text;
alter table public.food_platform_settings add column if not exists billing_pix_holder_name text;
alter table public.food_platform_settings add column if not exists billing_pix_copy_paste text;
alter table public.food_platform_settings add column if not exists billing_whatsapp text;
alter table public.food_platform_settings add column if not exists billing_proof_required boolean not null default true;
alter table public.food_platform_settings add column if not exists billing_auto_renew boolean not null default false;
alter table public.food_platform_settings add column if not exists billing_grace_days integer not null default 3;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='food_platform_settings_billing_provider_ck') then
    alter table public.food_platform_settings add constraint food_platform_settings_billing_provider_ck check (billing_provider in ('manual','asaas'));
  end if;
  if not exists(select 1 from pg_constraint where conname='food_platform_settings_grace_ck') then
    alter table public.food_platform_settings add constraint food_platform_settings_grace_ck check (billing_grace_days between 0 and 30);
  end if;
end $$;

create table if not exists public.food_subscription_payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  subscription_id uuid references public.food_store_subscriptions(id) on delete set null,
  plan_id uuid not null references public.food_plans(id),
  amount numeric(12,2) not null check (amount>0),
  due_date date not null,
  provider text not null default 'manual' check (provider in ('manual','asaas')),
  provider_payment_id text,
  status text not null default 'pending' check (status in ('pending','proof_sent','paid','expired','cancelled','refunded')),
  pix_payload text,
  pix_qr_base64 text,
  provider_expiration_at timestamptz,
  proof_required boolean not null default true,
  proof_sent_at timestamptz,
  paid_at timestamptz,
  provider_raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists food_subscription_payments_store_idx on public.food_subscription_payments(store_id,created_at desc);
create unique index if not exists food_subscription_payments_provider_uidx on public.food_subscription_payments(provider,provider_payment_id) where provider_payment_id is not null;

create table if not exists public.food_billing_webhook_events (
  event_id text primary key,
  event_type text,
  provider text not null default 'asaas',
  payload jsonb not null,
  processed_at timestamptz,
  received_at timestamptz not null default now()
);

alter table public.food_subscription_payments enable row level security;
alter table public.food_billing_webhook_events enable row level security;

drop policy if exists food_subscription_payments_member_read on public.food_subscription_payments;
create policy food_subscription_payments_member_read on public.food_subscription_payments for select to authenticated
using (public.food_is_store_member(store_id));
drop policy if exists food_subscription_payments_master_all on public.food_subscription_payments;
create policy food_subscription_payments_master_all on public.food_subscription_payments for all to authenticated
using (public.food_is_platform_admin()) with check (public.food_is_platform_admin());
drop policy if exists food_billing_webhook_master_read on public.food_billing_webhook_events;
create policy food_billing_webhook_master_read on public.food_billing_webhook_events for select to authenticated
using (public.food_is_platform_admin());

create or replace function public.food_create_manual_subscription_payment(p_store_id uuid,p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_plan public.food_plans%rowtype;
  v_settings public.food_platform_settings%rowtype;
  v_sub public.food_store_subscriptions%rowtype;
  v_payment public.food_subscription_payments%rowtype;
begin
  if not public.food_is_store_admin(p_store_id) then raise exception 'Sem permissao para gerar cobranca desta loja.'; end if;
  select * into v_plan from public.food_plans where id=p_plan_id and active=true;
  if not found or v_plan.code='DEMO' then raise exception 'Plano pago invalido.'; end if;
  select * into v_settings from public.food_platform_settings where id=1;
  if nullif(trim(coalesce(v_settings.billing_pix_key,'')),'') is null
     and nullif(trim(coalesce(v_settings.billing_pix_copy_paste,'')),'') is null then
    raise exception 'O Admin Master precisa configurar uma chave PIX ou PIX copia e cola antes de liberar cobrancas manuais.';
  end if;
  if coalesce(v_settings.billing_proof_required,true)
     and nullif(regexp_replace(coalesce(v_settings.billing_whatsapp,''),'\D','','g'),'') is null then
    raise exception 'O Admin Master precisa configurar o WhatsApp de cobranca para receber comprovantes.';
  end if;
  select * into v_sub from public.food_store_subscriptions where store_id=p_store_id order by started_at desc limit 1;

  select * into v_payment from public.food_subscription_payments
  where store_id=p_store_id and plan_id=p_plan_id and provider='manual' and status in ('pending','proof_sent') and due_date>=current_date
  order by created_at desc limit 1;

  if v_payment.id is null then
    insert into public.food_subscription_payments(store_id,subscription_id,plan_id,amount,due_date,provider,status,proof_required,pix_payload)
    values(p_store_id,v_sub.id,p_plan_id,v_plan.monthly_price,current_date+interval '3 days','manual','pending',coalesce(v_settings.billing_proof_required,true),v_settings.billing_pix_copy_paste)
    returning * into v_payment;
  end if;

  return jsonb_build_object(
    'payment',to_jsonb(v_payment),
    'plan',jsonb_build_object('id',v_plan.id,'code',v_plan.code,'name',v_plan.name,'monthlyPrice',v_plan.monthly_price),
    'billing',jsonb_build_object(
      'provider',v_settings.billing_provider,
      'pixKeyType',v_settings.billing_pix_key_type,
      'pixKey',v_settings.billing_pix_key,
      'pixHolderName',v_settings.billing_pix_holder_name,
      'pixCopyPaste',v_settings.billing_pix_copy_paste,
      'whatsapp',v_settings.billing_whatsapp,
      'proofRequired',v_settings.billing_proof_required,
      'autoRenew',v_settings.billing_auto_renew
    )
  );
end $$;
revoke all on function public.food_create_manual_subscription_payment(uuid,uuid) from public;
grant execute on function public.food_create_manual_subscription_payment(uuid,uuid) to authenticated;

create or replace function public.food_mark_subscription_proof_sent(p_payment_id uuid)
returns public.food_subscription_payments
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_payment public.food_subscription_payments%rowtype;
begin
  select * into v_payment from public.food_subscription_payments where id=p_payment_id;
  if not found or not public.food_is_store_admin(v_payment.store_id) then raise exception 'Cobranca nao encontrada ou sem permissao.'; end if;
  update public.food_subscription_payments set status=case when status='pending' then 'proof_sent' else status end,proof_sent_at=coalesce(proof_sent_at,now()),updated_at=now()
  where id=p_payment_id returning * into v_payment;
  return v_payment;
end $$;
revoke all on function public.food_mark_subscription_proof_sent(uuid) from public;
grant execute on function public.food_mark_subscription_proof_sent(uuid) to authenticated;

create or replace function public.food_confirm_subscription_payment(p_payment_id uuid,p_paid_at timestamptz default now(),p_provider_event_id text default null)
returns public.food_subscription_payments
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_payment public.food_subscription_payments%rowtype;
  v_sub public.food_store_subscriptions%rowtype;
  v_next_due date;
begin
  if auth.role()<>'service_role' and not public.food_is_platform_admin() then raise exception 'Somente a plataforma pode confirmar pagamentos.'; end if;
  select * into v_payment from public.food_subscription_payments where id=p_payment_id for update;
  if not found then raise exception 'Cobranca nao encontrada.'; end if;
  if v_payment.status='paid' then return v_payment; end if;
  if v_payment.provider='manual' and v_payment.proof_required and v_payment.proof_sent_at is null then raise exception 'O comprovante deve ser enviado antes da confirmacao manual.'; end if;

  select * into v_sub from public.food_store_subscriptions where id=v_payment.subscription_id;
  if v_sub.id is null then select * into v_sub from public.food_store_subscriptions where store_id=v_payment.store_id order by started_at desc limit 1; end if;

  -- Pagamento antecipado preserva os dias ja pagos; pagamento vencido reinicia a partir da quitacao.
  v_next_due := (greatest(coalesce(v_sub.next_due_date,coalesce(p_paid_at,now())::date),coalesce(p_paid_at,now())::date) + interval '1 month')::date;

  if v_sub.id is null then
    insert into public.food_store_subscriptions(store_id,plan_id,status,started_at,billing_amount,next_due_date)
    values(v_payment.store_id,v_payment.plan_id,'active',now(),v_payment.amount,v_next_due)
    returning * into v_sub;
  else
    update public.food_store_subscriptions
      set plan_id=v_payment.plan_id,status='active',status_before_suspension=null,expires_at=null,billing_amount=v_payment.amount,next_due_date=v_next_due,updated_at=now()
      where id=v_sub.id returning * into v_sub;
  end if;

  update public.food_stores set access_status='online',suspended_at=null,suspension_reason=null,updated_at=now() where id=v_payment.store_id;
  update public.food_subscription_payments set status='paid',paid_at=coalesce(p_paid_at,now()),subscription_id=v_sub.id,updated_at=now() where id=v_payment.id returning * into v_payment;

  if p_provider_event_id is not null then
    update public.food_billing_webhook_events set processed_at=now() where event_id=p_provider_event_id;
  end if;
  return v_payment;
end $$;
revoke all on function public.food_confirm_subscription_payment(uuid,timestamptz,text) from public;
grant execute on function public.food_confirm_subscription_payment(uuid,timestamptz,text) to authenticated,service_role;

-- -----------------------------------------------------------------------------
-- Financeiro gerencial.
-- -----------------------------------------------------------------------------
create table if not exists public.food_financial_categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  name text not null,
  direction text not null default 'both' check(direction in ('income','expense','both')),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,name)
);

create table if not exists public.food_financial_entries (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  direction text not null check(direction in ('income','expense')),
  source text not null default 'manual' check(source in ('manual','order','adjustment')),
  order_id uuid references public.food_orders(id) on delete set null,
  category_id uuid references public.food_financial_categories(id) on delete set null,
  description text not null,
  amount numeric(12,2) not null check(amount>0),
  occurred_on date not null default current_date,
  due_on date,
  paid_at timestamptz,
  status text not null default 'paid' check(status in ('pending','paid','cancelled')),
  payment_method text,
  counterparty text,
  document_type text not null default 'none' check(document_type in ('nfe','nfce','nfse','receipt','boleto','coupon','other','none')),
  document_number text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists food_financial_entries_order_uidx on public.food_financial_entries(store_id,order_id) where source='order' and order_id is not null;
create index if not exists food_financial_entries_store_date_idx on public.food_financial_entries(store_id,occurred_on desc);

create table if not exists public.food_financial_documents (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  entry_id uuid references public.food_financial_entries(id) on delete set null,
  storage_path text not null,
  original_name text not null,
  mime_type text,
  extraction_status text not null default 'pending' check(extraction_status in ('pending','processed','failed','manual')),
  extracted_text text,
  extracted_json jsonb,
  confidence numeric(5,4),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists food_financial_documents_store_idx on public.food_financial_documents(store_id,created_at desc);

alter table public.food_financial_categories enable row level security;
alter table public.food_financial_entries enable row level security;
alter table public.food_financial_documents enable row level security;

drop policy if exists food_financial_categories_manage on public.food_financial_categories;
create policy food_financial_categories_manage on public.food_financial_categories for all to authenticated
using(public.food_can_manage_finance(store_id)) with check(public.food_can_manage_finance(store_id));
drop policy if exists food_financial_entries_manage on public.food_financial_entries;
create policy food_financial_entries_manage on public.food_financial_entries for all to authenticated
using(public.food_can_manage_finance(store_id)) with check(public.food_can_manage_finance(store_id));
drop policy if exists food_financial_documents_manage on public.food_financial_documents;
create policy food_financial_documents_manage on public.food_financial_documents for all to authenticated
using(public.food_can_manage_finance(store_id)) with check(public.food_can_manage_finance(store_id));

create or replace function public.food_seed_financial_categories(p_store_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  insert into public.food_financial_categories(store_id,name,direction,sort_order) values
  (p_store_id,'Vendas','income',10),(p_store_id,'Outras receitas','income',20),
  (p_store_id,'Ingredientes','expense',100),(p_store_id,'Bebidas','expense',110),(p_store_id,'Embalagens','expense',120),
  (p_store_id,'Gas','expense',130),(p_store_id,'Energia','expense',140),(p_store_id,'Agua','expense',150),
  (p_store_id,'Aluguel','expense',160),(p_store_id,'Funcionarios','expense',170),(p_store_id,'Marketing','expense',180),
  (p_store_id,'Delivery','expense',190),(p_store_id,'Taxas bancarias','expense',200),(p_store_id,'Impostos','expense',210),
  (p_store_id,'Manutencao','expense',220),(p_store_id,'Outros','both',999)
  on conflict(store_id,name) do nothing;
end $$;
revoke all on function public.food_seed_financial_categories(uuid) from public;
grant execute on function public.food_seed_financial_categories(uuid) to authenticated,service_role;

-- Categorias para lojas atuais.
do $$ declare r record; begin for r in select id from public.food_stores loop perform public.food_seed_financial_categories(r.id); end loop; end $$;

create or replace function public.food_seed_financial_categories_on_store()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ begin perform public.food_seed_financial_categories(new.id); return new; end $$;
drop trigger if exists food_stores_financial_categories_trg on public.food_stores;
create trigger food_stores_financial_categories_trg after insert on public.food_stores for each row execute function public.food_seed_financial_categories_on_store();

-- Receita nasce do pedido somente quando a venda e concluida. Cancelamento invalida a receita.
create or replace function public.food_sync_order_financial_entry()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_category uuid;
begin
  if new.status in ('delivered','picked_up') then
    perform public.food_seed_financial_categories(new.store_id);
    select id into v_category from public.food_financial_categories where store_id=new.store_id and name='Vendas' limit 1;
    insert into public.food_financial_entries(store_id,direction,source,order_id,category_id,description,amount,occurred_on,paid_at,status,payment_method,counterparty,document_type)
    values(new.store_id,'income','order',new.id,v_category,'Pedido #'||new.order_number,new.total,coalesce(new.updated_at,new.created_at)::date,coalesce(new.updated_at,now()),'paid',new.payment_method,new.customer_name,'none')
    on conflict(store_id,order_id) where source='order' and order_id is not null
    do update set amount=excluded.amount,occurred_on=excluded.occurred_on,paid_at=excluded.paid_at,status='paid',payment_method=excluded.payment_method,counterparty=excluded.counterparty,updated_at=now();
  elsif new.status='cancelled' then
    update public.food_financial_entries set status='cancelled',updated_at=now() where store_id=new.store_id and order_id=new.id and source='order';
  end if;
  return new;
end $$;
drop trigger if exists food_orders_financial_sync_trg on public.food_orders;
create trigger food_orders_financial_sync_trg after insert or update of status,total on public.food_orders for each row execute function public.food_sync_order_financial_entry();

-- Backfill de pedidos concluidos existentes.
insert into public.food_financial_entries(store_id,direction,source,order_id,category_id,description,amount,occurred_on,paid_at,status,payment_method,counterparty,document_type)
select o.store_id,'income','order',o.id,c.id,'Pedido #'||o.order_number,o.total,o.updated_at::date,o.updated_at,'paid',o.payment_method,o.customer_name,'none'
from public.food_orders o
left join public.food_financial_categories c on c.store_id=o.store_id and c.name='Vendas'
where o.status in ('delivered','picked_up')
on conflict(store_id,order_id) where source='order' and order_id is not null do nothing;

-- Bucket privado para documentos financeiros.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('food-finance-documents','food-finance-documents',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists food_finance_documents_storage_select on storage.objects;
create policy food_finance_documents_storage_select on storage.objects for select to authenticated using(
  bucket_id='food-finance-documents' and public.food_can_manage_finance((split_part(name,'/',2))::uuid)
);
drop policy if exists food_finance_documents_storage_insert on storage.objects;
create policy food_finance_documents_storage_insert on storage.objects for insert to authenticated with check(
  bucket_id='food-finance-documents' and public.food_can_manage_finance((split_part(name,'/',2))::uuid)
);
drop policy if exists food_finance_documents_storage_update on storage.objects;
create policy food_finance_documents_storage_update on storage.objects for update to authenticated using(
  bucket_id='food-finance-documents' and public.food_can_manage_finance((split_part(name,'/',2))::uuid)
) with check(
  bucket_id='food-finance-documents' and public.food_can_manage_finance((split_part(name,'/',2))::uuid)
);
drop policy if exists food_finance_documents_storage_delete on storage.objects;
create policy food_finance_documents_storage_delete on storage.objects for delete to authenticated using(
  bucket_id='food-finance-documents' and public.food_can_manage_finance((split_part(name,'/',2))::uuid)
);


-- Configuracao de cobranca nao secreta para o painel da loja.
create or replace function public.food_get_billing_settings_for_store(p_store_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v public.food_platform_settings%rowtype;
begin
  if not public.food_is_store_member(p_store_id) then raise exception 'Sem permissao para esta loja.'; end if;
  select * into v from public.food_platform_settings where id=1;
  return jsonb_build_object('provider',v.billing_provider,'pixKeyType',v.billing_pix_key_type,'pixKey',v.billing_pix_key,'pixHolderName',v.billing_pix_holder_name,'pixCopyPaste',v.billing_pix_copy_paste,'whatsapp',v.billing_whatsapp,'proofRequired',v.billing_proof_required,'autoRenew',v.billing_auto_renew,'graceDays',v.billing_grace_days);
end $$;
revoke all on function public.food_get_billing_settings_for_store(uuid) from public;
grant execute on function public.food_get_billing_settings_for_store(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Regras comerciais no servidor: limites de plano e vencimento da assinatura.
-- -----------------------------------------------------------------------------
create or replace function public.food_current_plan_image_limit(p_store_id uuid)
returns integer
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select p.image_limit_per_product
  from public.food_store_subscriptions ss
  join public.food_plans p on p.id=ss.plan_id
  where ss.store_id=p_store_id
    and ss.status in ('trial','active')
    and (ss.expires_at is null or ss.expires_at>now())
  order by ss.started_at desc
  limit 1;
$$;
revoke all on function public.food_current_plan_image_limit(uuid) from public;
grant execute on function public.food_current_plan_image_limit(uuid) to authenticated,service_role;

create or replace function public.food_enforce_product_image_plan_limit()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_store_id uuid;
  v_limit integer;
  v_count integer;
begin
  select store_id into v_store_id from public.food_products where id=new.product_id;
  if v_store_id is null then raise exception 'Produto nao encontrado.'; end if;
  v_limit:=public.food_current_plan_image_limit(v_store_id);
  if v_limit is null then return new; end if;
  select count(*) into v_count
  from public.food_product_images pi
  where pi.product_id=new.product_id
    and (tg_op='INSERT' or pi.id<>new.id);
  if v_count>=v_limit then
    raise exception 'Seu plano permite no maximo % foto(s) por produto.',v_limit;
  end if;
  return new;
end $$;
drop trigger if exists food_product_images_plan_limit_trg on public.food_product_images;
create trigger food_product_images_plan_limit_trg
before insert or update of product_id on public.food_product_images
for each row execute function public.food_enforce_product_image_plan_limit();

create or replace function public.food_enforce_custom_banner_plan()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if (new.cover_url is distinct from old.cover_url or new.cover_storage_path is distinct from old.cover_storage_path)
     and (new.cover_url is not null or new.cover_storage_path is not null)
     and auth.role()<>'service_role'
     and not public.food_is_platform_admin()
     and not public.food_store_has_feature(new.id,'custom_banner') then
    raise exception 'Banners personalizados nao estao incluidos no plano atual.';
  end if;
  return new;
end $$;
drop trigger if exists food_stores_custom_banner_plan_trg on public.food_stores;
create trigger food_stores_custom_banner_plan_trg
before update of cover_url,cover_storage_path on public.food_stores
for each row execute function public.food_enforce_custom_banner_plan();

-- Suspende planos pagos vencidos somente apos o periodo de carencia configurado.
create or replace function public.food_suspend_overdue_paid_subscriptions()
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_count integer:=0;
  v_grace integer:=3;
begin
  select coalesce(billing_grace_days,3) into v_grace from public.food_platform_settings where id=1;
  with overdue as (
    update public.food_store_subscriptions ss
    set status='suspended',status_before_suspension='active',updated_at=now()
    where ss.status='active'
      and ss.next_due_date is not null
      and current_date>(ss.next_due_date+v_grace)
    returning ss.store_id
  )
  update public.food_stores s
  set access_status='suspended',
      suspended_at=coalesce(s.suspended_at,now()),
      suspension_reason='Mensalidade vencida',
      updated_at=now()
  where s.id in (select store_id from overdue);
  get diagnostics v_count=row_count;
  return v_count;
end $$;
revoke all on function public.food_suspend_overdue_paid_subscriptions() from public,anon,authenticated;
grant execute on function public.food_suspend_overdue_paid_subscriptions() to service_role;

do $$
declare v_jobid bigint;
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    for v_jobid in select jobid from cron.job where jobname='foodservice-paid-expiration-hourly' loop
      perform cron.unschedule(v_jobid);
    end loop;
    perform cron.schedule('foodservice-paid-expiration-hourly','25 * * * *','select public.food_suspend_overdue_paid_subscriptions();');
  end if;
exception when others then
  raise notice 'pg_cron indisponivel; execute food_suspend_overdue_paid_subscriptions por agendamento externo. %',sqlerrm;
end $$;

-- A vitrine respeita o entitlement atual sem apagar ativos de um plano anterior.
-- Se a loja fizer downgrade, banner customizado fica oculto e o numero de fotos
-- publicas segue o limite do plano atual.
create or replace function public.food_get_public_storefront_v1(p_slug text default null, p_hostname text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_store public.food_stores%rowtype;
  v_store_id uuid;
  v_image_limit integer;
  v_custom_banner boolean:=false;
begin
  if nullif(trim(coalesce(p_hostname,'')),'') is not null then
    select sd.store_id into v_store_id from public.food_store_domains sd
    where sd.active and lower(sd.domain)=lower(trim(p_hostname))
    order by sd.is_primary desc,sd.created_at asc limit 1;
  end if;
  if v_store_id is not null then
    select * into v_store from public.food_stores where id=v_store_id and archived_at is null limit 1;
  elsif nullif(trim(coalesce(p_slug,'')),'') is not null then
    select * into v_store from public.food_stores where lower(slug)=lower(trim(p_slug)) and archived_at is null limit 1;
  end if;
  if v_store.id is null then return jsonb_build_object('found',false); end if;
  if not public.food_store_accessible(v_store.id) then
    return jsonb_build_object('found',true,'status','unavailable','store',jsonb_build_object('id',v_store.id,'slug',v_store.slug,'name',v_store.name));
  end if;

  v_image_limit:=public.food_current_plan_image_limit(v_store.id);
  v_custom_banner:=public.food_store_has_feature(v_store.id,'custom_banner');

  return jsonb_build_object(
    'found',true,'status','online',
    'store',(to_jsonb(v_store) - 'owner_email' - 'owner_name' - 'suspension_reason') || jsonb_build_object(
      'cover_url',case when v_custom_banner then v_store.cover_url else null end,
      'cover_storage_path',case when v_custom_banner then v_store.cover_storage_path else null end
    ),
    'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order,c.name) from public.food_categories c where c.store_id=v_store.id and c.active),'[]'::jsonb),
    'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.featured desc,p.sort_order,p.name)
      from public.food_products p join public.food_categories c on c.id=p.category_id and c.store_id=p.store_id and c.active
      where p.store_id=v_store.id and p.active and p.availability_status='available' and p.stock_status<>'unavailable' and (not p.track_stock or coalesce(p.stock_quantity,0)>0)),'[]'::jsonb),
    'product_images',coalesce((
      select jsonb_agg(to_jsonb(img) - 'rn' order by img.product_id,img.sort_order,img.created_at)
      from (
        select pi.*,row_number() over(partition by pi.product_id order by pi.is_primary desc,pi.sort_order,pi.created_at) rn
        from public.food_product_images pi
        join public.food_products p on p.id=pi.product_id
        where p.store_id=v_store.id and p.active
      ) img
      where v_image_limit is null or img.rn<=v_image_limit
    ),'[]'::jsonb),
    'option_groups',coalesce((select jsonb_agg(to_jsonb(og) order by og.sort_order,og.name) from public.food_option_groups og where og.store_id=v_store.id and og.active),'[]'::jsonb),
    'option_items',coalesce((select jsonb_agg(to_jsonb(oi) order by oi.sort_order,oi.name) from public.food_option_items oi where oi.store_id=v_store.id and oi.active),'[]'::jsonb),
    'product_option_groups',coalesce((select jsonb_agg(to_jsonb(pog) order by pog.sort_order) from public.food_product_option_groups pog where pog.store_id=v_store.id),'[]'::jsonb),
    'product_variants','[]'::jsonb,'addons','[]'::jsonb,'product_addons','[]'::jsonb,
    'delivery_zones',coalesce((select jsonb_agg(to_jsonb(dz) order by dz.sort_order,dz.name) from public.food_delivery_zones dz where dz.store_id=v_store.id and dz.active),'[]'::jsonb)
  );
end $$;
revoke all on function public.food_get_public_storefront_v1(text,text) from public;
grant execute on function public.food_get_public_storefront_v1(text,text) to anon,authenticated;

-- Analytics e um recurso de plano tambem no servidor; eventos publicos continuam
-- sendo coletados sem PII para preservar historico caso a loja faca upgrade.
create or replace function public.food_get_store_analytics_v1(p_store_id uuid,p_from timestamptz default null,p_to timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_from timestamptz:=coalesce(p_from,now()-interval '30 days');
  v_to timestamptz:=coalesce(p_to,now());
  v_storefront integer:=0;
  v_product_views integer:=0;
  v_product_sessions integer:=0;
  v_cart integer:=0;
  v_checkout integer:=0;
  v_order_sessions integer:=0;
  v_orders integer:=0;
  v_whatsapp integer:=0;
  v_revenue numeric:=0;
  v_average numeric:=0;
  v_top jsonb:='[]'::jsonb;
  v_not_sold jsonb:='[]'::jsonb;
begin
  if not public.food_is_store_admin(p_store_id) then raise exception 'Acesso negado.'; end if;
  if not public.food_store_has_feature(p_store_id,'analytics') and not public.food_is_platform_admin() then
    raise exception 'Analytics nao esta incluido no plano atual.';
  end if;

  select count(distinct session_id) into v_storefront from public.food_analytics_events where store_id=p_store_id and event_name='storefront_view' and occurred_at between v_from and v_to;
  select count(*) into v_product_views from public.food_analytics_events where store_id=p_store_id and event_name='product_view' and occurred_at between v_from and v_to;
  select count(distinct session_id) into v_product_sessions from public.food_analytics_events where store_id=p_store_id and event_name='product_view' and occurred_at between v_from and v_to;
  select count(distinct session_id) into v_cart from public.food_analytics_events where store_id=p_store_id and event_name='add_to_cart' and occurred_at between v_from and v_to;
  select count(distinct session_id) into v_checkout from public.food_analytics_events where store_id=p_store_id and event_name='checkout_started' and occurred_at between v_from and v_to;
  select count(distinct session_id) into v_order_sessions from public.food_analytics_events where store_id=p_store_id and event_name='order_created' and occurred_at between v_from and v_to;
  select count(*)::integer,coalesce(sum(total),0),coalesce(avg(total),0) into v_orders,v_revenue,v_average from public.food_orders where store_id=p_store_id and status<>'cancelled' and created_at between v_from and v_to;
  select count(*) into v_whatsapp from public.food_analytics_events where store_id=p_store_id and event_name='whatsapp_clicked' and occurred_at between v_from and v_to;

  with views as (
    select product_id,count(*)::integer views,count(distinct session_id)::integer cart_sessions
    from public.food_analytics_events
    where store_id=p_store_id and occurred_at between v_from and v_to and product_id is not null and event_name in ('product_view','add_to_cart')
    group by product_id
  ), agg as (
    select p.id,p.name,
      coalesce((select count(*) from public.food_analytics_events e where e.store_id=p_store_id and e.product_id=p.id and e.event_name='product_view' and e.occurred_at between v_from and v_to),0)::integer views,
      coalesce((select count(distinct session_id) from public.food_analytics_events e where e.store_id=p_store_id and e.product_id=p.id and e.event_name='add_to_cart' and e.occurred_at between v_from and v_to),0)::integer cart_sessions,
      coalesce((select sum(oi.quantity) from public.food_order_items oi join public.food_orders o on o.id=oi.order_id where o.store_id=p_store_id and oi.product_id=p.id and o.status<>'cancelled' and o.created_at between v_from and v_to),0)::integer sold_units
    from public.food_products p
    where p.store_id=p_store_id and exists(select 1 from views v where v.product_id=p.id)
  )
  select coalesce(jsonb_agg(jsonb_build_object('productId',id,'name',name,'views',views,'addToCartSessions',cart_sessions,'soldUnits',sold_units) order by views desc,sold_units desc),'[]'::jsonb)
  into v_top from (select * from agg order by views desc,sold_units desc limit 8) q;

  with agg as (
    select p.id,p.name,
      count(*) filter(where e.event_name='product_view')::integer views,
      count(distinct e.session_id) filter(where e.event_name='add_to_cart')::integer cart_sessions,
      coalesce((select sum(oi.quantity) from public.food_order_items oi join public.food_orders o on o.id=oi.order_id where o.store_id=p_store_id and oi.product_id=p.id and o.status<>'cancelled' and o.created_at between v_from and v_to),0)::integer sold_units
    from public.food_products p
    join public.food_analytics_events e on e.product_id=p.id and e.store_id=p_store_id and e.occurred_at between v_from and v_to
    where p.store_id=p_store_id
    group by p.id,p.name
  )
  select coalesce(jsonb_agg(jsonb_build_object('productId',id,'name',name,'views',views,'addToCartSessions',cart_sessions,'soldUnits',sold_units) order by views desc),'[]'::jsonb)
  into v_not_sold from (select * from agg where views>0 and sold_units=0 order by views desc limit 8) q;

  return jsonb_build_object(
    'from',v_from,'to',v_to,
    'storefrontSessions',v_storefront,'productViews',v_product_views,'productViewSessions',v_product_sessions,
    'addToCartSessions',v_cart,'checkoutSessions',v_checkout,'orderSessions',v_order_sessions,'orders',v_orders,'whatsappClicks',v_whatsapp,
    'conversionRate',case when v_storefront>0 then round(100.0*v_order_sessions/v_storefront,1) else 0 end,
    'cartAbandonmentRate',case when v_cart>0 then greatest(0,round(100.0*(v_cart-v_checkout)/v_cart,1)) else 0 end,
    'checkoutAbandonmentRate',case when v_checkout>0 then greatest(0,round(100.0*(v_checkout-v_order_sessions)/v_checkout,1)) else 0 end,
    'whatsappRate',case when v_orders>0 then round(100.0*v_whatsapp/v_orders,1) else 0 end,
    'revenue',v_revenue,'averageTicket',v_average,'topProducts',v_top,'viewedNotSold',v_not_sold
  );
end $$;
revoke all on function public.food_get_store_analytics_v1(uuid,timestamptz,timestamptz) from public;
grant execute on function public.food_get_store_analytics_v1(uuid,timestamptz,timestamptz) to authenticated;


commit;
