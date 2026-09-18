-- FoodWeb - hardening de elegibilidade do Demo / REV2
-- Complementa a migration de auto cadastro. Pode ser reaplicada com seguranca.
-- Regra: o bloqueio do teste gratuito nao depende apenas do e-mail.
-- E-mail + WhatsApp comercial + CNPJ (quando informado) geram chaves SHA-256.
-- A reserva definitiva ocorre apenas na aprovacao do Admin Master.

begin;
create extension if not exists pgcrypto;

alter table public.food_self_service_signup_requests
  add column if not exists contact_phone text,
  add column if not exists business_document text;

create table if not exists public.food_trial_claim_keys (
  claim_type text not null check (claim_type in ('email','phone','cnpj')),
  claim_hash text not null,
  user_id uuid references auth.users(id) on delete set null,
  store_id uuid references public.food_stores(id) on delete set null,
  claimed_at timestamptz not null default now(),
  primary key (claim_type,claim_hash)
);

alter table public.food_trial_claim_keys enable row level security;
revoke all on table public.food_trial_claim_keys from anon,authenticated;

create or replace function public.food_trial_claim_hash_v1(p_type text,p_value text)
returns text
language sql
immutable
set search_path=public,pg_temp
as $$
  select encode(digest(lower(trim(coalesce(p_type,''))) || ':' || regexp_replace(lower(trim(coalesce(p_value,''))), '[^a-z0-9@._+-]', '', 'g'), 'sha256'),'hex');
$$;
revoke all on function public.food_trial_claim_hash_v1(text,text) from public;
grant execute on function public.food_trial_claim_hash_v1(text,text) to authenticated,service_role;

-- A versao anterior reservava o e-mail ainda na solicitacao pendente.
-- REV2 libera essas reservas quando o Master ainda nao aprovou o cadastro.
delete from public.food_trial_claim_keys k
using public.food_self_service_signup_requests r
where k.store_id=r.store_id and r.status<>'approved';

delete from public.food_trial_claims c
using public.food_self_service_signup_requests r
where c.store_id=r.store_id and r.status<>'approved';

-- Backfill dos e-mails historicos ja marcados pela regra anterior.
insert into public.food_trial_claim_keys(claim_type,claim_hash,user_id,store_id,claimed_at)
select 'email',public.food_trial_claim_hash_v1('email',c.email_normalized),c.user_id,c.store_id,c.claimed_at
from public.food_trial_claims c
where nullif(trim(c.email_normalized),'') is not null
on conflict(claim_type,claim_hash) do nothing;

create or replace function public.food_complete_self_service_signup_v2(
  p_store_name text default null,
  p_owner_name text default null,
  p_plan_code text default null,
  p_city text default null,
  p_state text default null,
  p_contact_phone text default null,
  p_business_document text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_user auth.users%rowtype;
  v_meta jsonb;
  v_store_name text;
  v_owner_name text;
  v_plan_code text;
  v_city text;
  v_state text;
  v_phone text;
  v_cnpj text;
  v_plan public.food_plans%rowtype;
  v_settings public.food_platform_settings%rowtype;
  v_existing_store uuid;
  v_store_id uuid;
  v_slug_base text;
  v_slug text;
  v_suffix integer:=1;
  v_trial boolean:=false;
  v_request_id uuid;
  v_email text;
begin
  if auth.uid() is null then raise exception 'Autenticacao obrigatoria para concluir o cadastro.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('food_self-signup:' || auth.uid()::text,0));

  select * into v_user from auth.users where id=auth.uid();
  if v_user.id is null then raise exception 'Usuario autenticado nao encontrado.'; end if;
  v_email:=lower(trim(coalesce(v_user.email,'')));
  if v_email='' then raise exception 'E-mail do usuario nao encontrado.'; end if;

  select su.store_id into v_existing_store
  from public.food_store_users su
  where su.user_id=auth.uid() and su.active
  order by su.created_at asc limit 1;
  if v_existing_store is not null then
    update public.food_self_service_signup_requests
    set contact_phone=coalesce(nullif(regexp_replace(coalesce(p_contact_phone,''),'\D','','g'),''),contact_phone),
        business_document=coalesce(nullif(regexp_replace(coalesce(p_business_document,''),'\D','','g'),''),business_document),
        updated_at=now()
    where store_id=v_existing_store and status='pending';
    return jsonb_build_object('ok',true,'existing',true,'storeId',v_existing_store,
      'requestStatus',coalesce((select r.status from public.food_self_service_signup_requests r where r.store_id=v_existing_store limit 1),'approved'));
  end if;

  v_meta:=coalesce(v_user.raw_user_meta_data->'foodweb_signup','{}'::jsonb);
  v_store_name:=trim(coalesce(nullif(p_store_name,''),v_meta->>'store_name',''));
  v_owner_name:=trim(coalesce(nullif(p_owner_name,''),v_meta->>'owner_name',''));
  v_plan_code:=upper(trim(coalesce(nullif(p_plan_code,''),v_meta->>'plan_code','DEMO')));
  v_city:=trim(coalesce(p_city,v_meta->>'city',''));
  v_state:=upper(left(trim(coalesce(p_state,v_meta->>'state','')),2));
  v_phone:=regexp_replace(coalesce(nullif(p_contact_phone,''),v_meta->>'contact_phone',''),'\D','','g');
  v_cnpj:=regexp_replace(coalesce(nullif(p_business_document,''),v_meta->>'business_document',''),'\D','','g');

  if length(v_store_name)<2 or length(v_store_name)>120 then raise exception 'Informe o nome do estabelecimento.'; end if;
  if length(v_owner_name)<2 or length(v_owner_name)>120 then raise exception 'Informe o nome do responsavel.'; end if;
  if length(v_phone)<10 or length(v_phone)>13 then raise exception 'Informe um WhatsApp comercial valido.'; end if;
  if v_cnpj<>'' and length(v_cnpj)<>14 then raise exception 'O CNPJ deve possuir 14 digitos.'; end if;
  if v_plan_code not in ('DEMO','ESSENTIAL','STARTER','PROFESSIONAL') then raise exception 'Plano indisponivel para auto cadastro.'; end if;

  select * into v_plan from public.food_plans where upper(code)=v_plan_code and active limit 1;
  if v_plan.id is null then raise exception 'Plano selecionado nao esta disponivel.'; end if;
  select * into v_settings from public.food_platform_settings where id=1;
  if v_settings.id is null then raise exception 'Configuracao global do FoodWeb nao encontrada.'; end if;

  if exists(select 1 from public.food_stores s where lower(trim(coalesce(s.owner_email,'')))=v_email) then
    raise exception 'Este e-mail ja possui cadastro no FoodWeb. Entre com a conta existente ou solicite revisao ao Admin Master.';
  end if;

  v_trial:=upper(v_plan.code)='DEMO';
  if v_trial then
    if v_settings.demo_enabled is false then raise exception 'O plano Demo esta temporariamente indisponivel.'; end if;
    if exists(select 1 from public.food_trial_claims c where c.email_normalized=v_email and c.store_id is distinct from v_existing_store)
       or exists(select 1 from public.food_trial_claim_keys c where c.claim_type='email' and c.claim_hash=public.food_trial_claim_hash_v1('email',v_email))
       or exists(select 1 from public.food_trial_claim_keys c where c.claim_type='phone' and c.claim_hash=public.food_trial_claim_hash_v1('phone',v_phone))
       or (v_cnpj<>'' and exists(select 1 from public.food_trial_claim_keys c where c.claim_type='cnpj' and c.claim_hash=public.food_trial_claim_hash_v1('cnpj',v_cnpj))) then
      raise exception 'Este cadastro nao esta elegivel para um novo periodo de demonstracao. Escolha um plano comercial ou fale com o suporte.';
    end if;
  end if;

  v_slug_base:=public.food_self_service_slug(v_store_name);
  v_slug:=v_slug_base;
  while exists(select 1 from public.food_stores s where lower(s.slug)=lower(v_slug))
     or v_slug in ('admin','admin-master','produto','carrinho','finalizar','pedido','404','cadastro') loop
    v_suffix:=v_suffix+1;
    v_slug:=left(v_slug_base,38)||'-'||v_suffix::text;
  end loop;

  insert into public.food_stores(slug,name,city,state,owner_name,owner_email,active,access_status,approval_status,self_service,suspended_at,suspension_reason)
  values(v_slug,v_store_name,nullif(v_city,''),nullif(v_state,''),v_owner_name,v_email,true,'suspended','pending',true,now(),'Aguardando aprovacao do Admin Master')
  returning id into v_store_id;

  insert into public.food_store_users(store_id,user_id,role,active,must_change_password)
  values(v_store_id,auth.uid(),'owner',true,false);

  insert into public.food_store_subscriptions(store_id,plan_id,status,status_before_suspension,expires_at,billing_amount,due_day,next_due_date,notes)
  values(v_store_id,v_plan.id,'trial',null,null,case when v_trial then 0 else v_plan.monthly_price end,
         case when v_trial then null else 10 end,null,
         case when v_trial then 'Auto cadastro FoodWeb - Demo aguardando aprovacao' else 'Auto cadastro FoodWeb - plano escolhido aguardando aprovacao' end);

  begin
    perform public.food_platform_seed_new_store(v_store_id,v_city,v_state);
  exception when others then
    raise notice 'Seed inicial nao aplicado ao auto cadastro: %', sqlerrm;
  end;

  insert into public.food_self_service_signup_requests(user_id,store_id,email,owner_name,contact_phone,business_document,requested_plan_id,requested_plan_code,status,trial_granted,trial_expires_at)
  values(auth.uid(),v_store_id,v_email,v_owner_name,v_phone,nullif(v_cnpj,''),v_plan.id,v_plan.code,'pending',v_trial,null)
  returning id into v_request_id;

  return jsonb_build_object('ok',true,'existing',false,'requestId',v_request_id,'storeId',v_store_id,'slug',v_slug,
    'requestStatus','pending','trialGranted',v_trial,'trialExpiresAt',null,'workspaceLimited',true);
end;
$$;
revoke all on function public.food_complete_self_service_signup_v2(text,text,text,text,text,text,text) from public;
grant execute on function public.food_complete_self_service_signup_v2(text,text,text,text,text,text,text) to authenticated;

create or replace function public.food_platform_list_self_service_signups_v2()
returns table(
  id uuid,store_id uuid,store_name text,store_slug text,email text,owner_name text,contact_phone text,business_document text,
  requested_plan_id uuid,requested_plan_code text,requested_plan_name text,status text,
  trial_granted boolean,trial_expires_at timestamptz,approval_status text,access_status text,
  created_at timestamptz,reviewed_at timestamptz,rejection_reason text
)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select r.id,r.store_id,s.name,s.slug,r.email,r.owner_name,coalesce(r.contact_phone,''),r.business_document,
         r.requested_plan_id,r.requested_plan_code,p.name,r.status,r.trial_granted,r.trial_expires_at,
         s.approval_status,s.access_status,r.created_at,r.reviewed_at,r.rejection_reason
  from public.food_self_service_signup_requests r
  join public.food_stores s on s.id=r.store_id
  join public.food_plans p on p.id=r.requested_plan_id
  where public.food_is_platform_admin()
  order by case r.status when 'pending' then 0 else 1 end,r.created_at desc;
$$;
revoke all on function public.food_platform_list_self_service_signups_v2() from public;
grant execute on function public.food_platform_list_self_service_signups_v2() to authenticated;

create or replace function public.food_platform_approve_self_service_signup_v2(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_req public.food_self_service_signup_requests%rowtype;
  v_sub public.food_store_subscriptions%rowtype;
  v_trial_expires timestamptz;
  v_demo_days integer:=30;
  v_current_plan_code text;
  v_phone text;
  v_cnpj text;
begin
  if not public.food_is_platform_admin() then raise exception 'Acesso restrito ao Admin Master.' using errcode='42501'; end if;
  select * into v_req from public.food_self_service_signup_requests where id=p_request_id for update;
  if v_req.id is null then raise exception 'Solicitacao nao encontrada.'; end if;
  if v_req.status='approved' then return jsonb_build_object('ok',true,'alreadyApproved',true); end if;
  if v_req.status<>'pending' then raise exception 'Somente solicitacoes pendentes podem ser aprovadas.'; end if;

  v_phone:=regexp_replace(coalesce(v_req.contact_phone,''),'\D','','g');
  v_cnpj:=regexp_replace(coalesce(v_req.business_document,''),'\D','','g');

  select * into v_sub from public.food_store_subscriptions where store_id=v_req.store_id order by started_at desc limit 1 for update;
  if v_sub.id is not null then select upper(code) into v_current_plan_code from public.food_plans where id=v_sub.plan_id; end if;

  if v_current_plan_code='DEMO' then
    if exists(select 1 from public.food_trial_claims c where c.email_normalized=lower(trim(v_req.email)) and c.store_id is distinct from v_req.store_id)
       or exists(select 1 from public.food_trial_claim_keys c where c.claim_type='email' and c.claim_hash=public.food_trial_claim_hash_v1('email',v_req.email) and c.store_id is distinct from v_req.store_id)
       or exists(select 1 from public.food_trial_claim_keys c where c.claim_type='phone' and c.claim_hash=public.food_trial_claim_hash_v1('phone',v_phone) and c.store_id is distinct from v_req.store_id)
       or (v_cnpj<>'' and exists(select 1 from public.food_trial_claim_keys c where c.claim_type='cnpj' and c.claim_hash=public.food_trial_claim_hash_v1('cnpj',v_cnpj) and c.store_id is distinct from v_req.store_id)) then
      raise exception 'Cadastro nao elegivel para um novo periodo Demo. Revise o historico do cliente ou altere para um plano comercial.';
    end if;
  end if;

  update public.food_self_service_signup_requests
  set status='approved',reviewed_by=auth.uid(),reviewed_at=now(),rejection_reason=null,updated_at=now()
  where id=v_req.id;
  update public.food_stores
  set approval_status='approved',access_status='online',suspended_at=null,suspension_reason=null,updated_at=now()
  where id=v_req.store_id;

  if v_sub.id is not null and v_current_plan_code='DEMO' then
    select greatest(1,coalesce(demo_duration_days,30)) into v_demo_days from public.food_platform_settings where id=1;
    v_trial_expires:=now()+make_interval(days=>coalesce(v_demo_days,30));
    update public.food_store_subscriptions set status='trial',expires_at=v_trial_expires,updated_at=now() where id=v_sub.id;
    update public.food_self_service_signup_requests set trial_expires_at=v_trial_expires,updated_at=now() where id=v_req.id;
  elsif v_sub.id is not null and v_current_plan_code<>'DEMO' and v_sub.status in ('trial','suspended') then
    update public.food_store_subscriptions
    set status='active',status_before_suspension=null,expires_at=null,
        due_day=coalesce(v_sub.due_day,10),
        next_due_date=public.food_subscription_reference_due_v1(coalesce(v_sub.due_day,10),v_sub.next_due_date),updated_at=now()
    where id=v_sub.id;
  end if;

  -- A partir da aprovacao, o negocio passa a consumir a elegibilidade do primeiro Demo.
  insert into public.food_trial_claims(email_normalized,user_id,store_id)
  values(lower(trim(v_req.email)),v_req.user_id,v_req.store_id)
  on conflict(email_normalized) do nothing;
  insert into public.food_trial_claim_keys(claim_type,claim_hash,user_id,store_id)
  values('email',public.food_trial_claim_hash_v1('email',v_req.email),v_req.user_id,v_req.store_id)
  on conflict(claim_type,claim_hash) do nothing;
  if v_phone<>'' then
    insert into public.food_trial_claim_keys(claim_type,claim_hash,user_id,store_id)
    values('phone',public.food_trial_claim_hash_v1('phone',v_phone),v_req.user_id,v_req.store_id)
    on conflict(claim_type,claim_hash) do nothing;
  end if;
  if v_cnpj<>'' then
    insert into public.food_trial_claim_keys(claim_type,claim_hash,user_id,store_id)
    values('cnpj',public.food_trial_claim_hash_v1('cnpj',v_cnpj),v_req.user_id,v_req.store_id)
    on conflict(claim_type,claim_hash) do nothing;
  end if;

  return jsonb_build_object('ok',true,'storeId',v_req.store_id,'trialExpiresAt',v_trial_expires);
end;
$$;
revoke all on function public.food_platform_approve_self_service_signup_v2(uuid) from public;
grant execute on function public.food_platform_approve_self_service_signup_v2(uuid) to authenticated;

commit;

select pg_notify('pgrst','reload schema');
