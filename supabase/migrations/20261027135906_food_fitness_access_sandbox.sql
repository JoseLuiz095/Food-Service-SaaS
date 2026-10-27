-- shared_future: opt-in Fitness student access. Sandbox ONLY, no pilot seed,
-- no changes to legacy billing, Auth configuration, clinical data or stock.
begin;
create schema food_fitness_private;
revoke all on schema food_fitness_private from public, anon, authenticated;

create table public.food_fitness_settings (
 store_id uuid primary key references public.food_stores(id),
 account text not null check(length(account) between 1 and 100),
 environment text not null default 'sandbox' check(environment='sandbox'),
 enabled boolean not null default false,
 grace_days integer not null default 0 check(grace_days between 0 and 14),
 session_limit integer not null default 0 check(session_limit in (0,1)),
 policy_approved_at timestamptz,
 unique(store_id,account),
 check(not enabled or policy_approved_at is not null)
);
create table public.food_fitness_plans (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.food_fitness_settings,
 code text not null, name text not null, amount_cents integer not null check(amount_cents>0),
 cycle text not null default 'MONTHLY' check(cycle='MONTHLY'),
 entitlement text not null default 'fitness_access' check(entitlement='fitness_access'),
 active boolean not null default false, unique(id,store_id), unique(store_id,code)
);
create table public.food_fitness_enrollments (
 id uuid primary key default gen_random_uuid(), store_id uuid not null,
 account text not null, user_id uuid not null references auth.users(id), plan_id uuid not null,
 amount_cents integer not null check(amount_cents>0),
 external_reference text not null unique,
 provider_customer_id text, provider_subscription_id text,
 checkout_state text not null default 'reserved' check(checkout_state in ('reserved','creating','ready','review')),
 cancelled_at timestamptz, review_reason text,
 created_at timestamptz not null default now(), last_checked_at timestamptz,
 payment_offset integer not null default 0 check(payment_offset>=0),
 foreign key(store_id,account) references public.food_fitness_settings(store_id,account),
 foreign key(plan_id,store_id) references public.food_fitness_plans(id,store_id),
 unique(store_id,user_id), unique(account,provider_subscription_id), unique(id,store_id)
);
create table public.food_fitness_payments (
 account text not null, provider_payment_id text not null,
 enrollment_id uuid not null, store_id uuid not null,
 due_date date not null, amount_cents integer not null,
 coverage_start timestamptz not null, coverage_end timestamptz not null,
 status text not null check(status in ('pending','paid','overdue','refused','revoked','review')),
 provider_status text not null, last_checked_at timestamptz not null default now(),
 primary key(account,provider_payment_id), unique(enrollment_id,due_date),
 foreign key(enrollment_id,store_id) references public.food_fitness_enrollments(id,store_id),
 check(coverage_end>coverage_start)
);
create table public.food_fitness_billing_events (
 account text not null, event_id text not null, event_type text not null,
 resource_type text not null check(resource_type in ('payment','subscription')),
 resource_id text not null, received_at timestamptz not null default now(),
 processed_at timestamptz, outcome text,
 primary key(account,event_id)
);
create table public.food_fitness_billing_leases (
 account text primary key, token uuid not null, expires_at timestamptz not null
);
create table public.food_fitness_sessions (
 store_id uuid not null, user_id uuid not null, session_id uuid not null,
 granted_at timestamptz not null default now(), revoked_at timestamptz,
 primary key(store_id,user_id,session_id),
 foreign key(store_id,user_id) references public.food_fitness_enrollments(store_id,user_id)
);
create unique index food_fitness_one_session on public.food_fitness_sessions(store_id,user_id) where revoked_at is null;
create table public.food_fitness_audit (
 id bigint generated always as identity primary key,
 store_id uuid not null references public.food_stores, user_id uuid references auth.users,
 actor_id uuid, action text not null, reason text not null,
 payment_id text, event_id text, previous_state text, next_state text,
 created_at timestamptz not null default now()
);
create index food_fitness_audit_store_time on public.food_fitness_audit(store_id,created_at desc);
create index food_fitness_events_pending on public.food_fitness_billing_events(account,received_at) where processed_at is null;
create index food_fitness_enrollments_work on public.food_fitness_enrollments(account,last_checked_at);
create index food_fitness_payments_work on public.food_fitness_payments(account,last_checked_at);
do $$declare t text; begin
 foreach t in array array['settings','plans','enrollments','payments','billing_events','billing_leases','sessions','audit'] loop
  execute format('alter table public.food_fitness_%I enable row level security',t);
  execute format('revoke all on public.food_fitness_%I from public,anon,authenticated',t);
  execute format('grant all on public.food_fitness_%I to service_role',t);
 end loop;
end$$;
grant usage,select on sequence public.food_fitness_audit_id_seq to service_role;

-- Reuse the platform's effective module/license decision; a paid student cannot
-- turn a disabled training module or expired shop license back on.
create function food_fitness_private.store_enabled(p_store_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.food_business_profiles where store_id=p_store_id and primary_segment='personal')
 and food_business_private.module_enabled(p_store_id,'training')
$$;

-- Worker primitives are SECURITY INVOKER and service_role-only. A lease spans
-- HTTP reads; expired/replaced workers cannot commit stale provider snapshots.
create function public.food_fitness_billing_ingest_v1(p_account text,p_event_id text,p_event_type text,p_resource_type text,p_resource_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare n integer; old public.food_fitness_billing_events%rowtype;
begin
 if length(p_event_id) not between 1 and 255 or length(p_resource_id) not between 1 and 160
 or length(p_event_type) not between 1 and 120 or p_resource_type not in ('payment','subscription') then raise exception 'INVALID_EVENT'; end if;
 if not exists(select 1 from public.food_fitness_settings where account=p_account and enabled) then raise exception 'ACCOUNT_NOT_CONFIGURED'; end if;
 insert into public.food_fitness_billing_events(account,event_id,event_type,resource_type,resource_id)
 values(p_account,p_event_id,p_event_type,p_resource_type,p_resource_id) on conflict do nothing;
 get diagnostics n=row_count;
 select * into old from public.food_fitness_billing_events where account=p_account and event_id=p_event_id;
 if old.event_type<>p_event_type or old.resource_id<>p_resource_id or old.resource_type<>p_resource_type then raise exception 'EVENT_ID_COLLISION'; end if;
 return jsonb_build_object('duplicate',n=0);
end$$;
create function public.food_fitness_billing_lease_v1(p_account text,p_token uuid,p_release boolean default false,p_renew boolean default false)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if p_token is null then raise exception 'INVALID_LEASE'; end if;
 if p_release then
  delete from public.food_fitness_billing_leases where account=p_account and token=p_token; return true;
 end if;
 if p_renew then
  update public.food_fitness_billing_leases set expires_at=clock_timestamp()+interval '60 seconds'
  where account=p_account and token=p_token and expires_at>clock_timestamp();
  get diagnostics n=row_count; return n=1;
 end if;
 insert into public.food_fitness_billing_leases(account,token,expires_at) values(p_account,p_token,clock_timestamp()+interval '60 seconds')
 on conflict(account) do update set token=excluded.token,expires_at=excluded.expires_at
 where food_fitness_billing_leases.token=p_token or food_fitness_billing_leases.expires_at<clock_timestamp();
 get diagnostics n=row_count; return n=1;
end$$;
create function food_fitness_private.require_lease(p_account text,p_token uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.food_fitness_billing_leases where account=p_account and token=p_token and expires_at>clock_timestamp() for update;
 if not found then raise exception 'LEASE_LOST'; end if;
end$$;
create function public.food_fitness_billing_work_v1(p_account text,p_limit integer default 10)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; lim integer:=greatest(1,least(coalesce(p_limit,10),50));
begin
 select jsonb_build_object(
 'events',coalesce((select jsonb_agg(to_jsonb(x)) from (select event_id,event_type,resource_type,resource_id from public.food_fitness_billing_events where account=p_account and processed_at is null order by received_at,event_id limit lim) x),'[]'::jsonb),
 'enrollments',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,provider_customer_id,provider_subscription_id,external_reference,payment_offset from public.food_fitness_enrollments where account=p_account and checkout_state='ready' order by last_checked_at nulls first,id limit lim) x),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(to_jsonb(x)) from (select provider_payment_id from public.food_fitness_payments where account=p_account order by last_checked_at,provider_payment_id limit lim) x),'[]'::jsonb),
 'has_more',(select count(*)>lim from public.food_fitness_billing_events where account=p_account and processed_at is null)
 or (select count(*)>lim from public.food_fitness_enrollments where account=p_account and checkout_state='ready')
 or (select count(*)>lim from public.food_fitness_payments where account=p_account)) into result;
 return result;
end$$;
create function public.food_fitness_billing_cursor_v1(p_account text,p_token uuid,p_enrollment_id uuid,p_offset integer,p_complete boolean default false)
returns void language plpgsql security invoker set search_path='' as $$
begin
 perform food_fitness_private.require_lease(p_account,p_token);
 if p_offset is null or p_offset<0 or p_complete is null then raise exception 'INVALID_CURSOR'; end if;
 update public.food_fitness_enrollments set payment_offset=case when p_complete then 0 else p_offset end,
 last_checked_at=case when p_complete then now() else last_checked_at end
 where id=p_enrollment_id and account=p_account;
 if not found then raise exception 'ENROLLMENT_NOT_FOUND'; end if;
end$$;
create function public.food_fitness_billing_complete_v1(p_account text,p_token uuid,p_event_id text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 perform food_fitness_private.require_lease(p_account,p_token);
 update public.food_fitness_billing_events set processed_at=now(),outcome='unmapped' where account=p_account and event_id=p_event_id and processed_at is null;
end$$;

create function public.food_fitness_billing_apply_v1(p_account text,p_token uuid,p_event_id text,p_event_type text,p_resource_type text,p_snapshot jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.food_fitness_enrollments%rowtype; old public.food_fitness_payments%rowtype;
 ev public.food_fitness_billing_events%rowtype; rid text:=p_snapshot->>'id'; ps text:=p_snapshot->>'status';
 next_status text; due date; starts timestamptz; ends timestamptz; cents numeric; refund boolean;
begin
 perform food_fitness_private.require_lease(p_account,p_token);
 if p_resource_type is null or p_resource_type not in ('payment','subscription') or rid is null then raise exception 'INVALID_RESOURCE'; end if;
 if p_event_id is not null then
  select * into ev from public.food_fitness_billing_events where account=p_account and event_id=p_event_id for update;
  if not found or ev.event_type<>p_event_type or ev.resource_type<>p_resource_type or ev.resource_id<>rid then raise exception 'EVENT_MISMATCH'; end if;
  if ev.processed_at is not null then return jsonb_build_object('duplicate',true); end if;
 end if;
 select * into e from public.food_fitness_enrollments where account=p_account
 and provider_subscription_id=case when p_resource_type='payment' then p_snapshot->>'subscription' else rid end for update;
 if not found then return jsonb_build_object('ignored',true); end if;
 if p_snapshot->>'customer' is distinct from e.provider_customer_id
 or p_snapshot->>'externalReference' is distinct from e.external_reference then raise exception 'BILLING_ASSOCIATION_MISMATCH'; end if;
 if p_resource_type='subscription' then
  if ps not in ('ACTIVE','INACTIVE','EXPIRED') and coalesce((p_snapshot->>'deleted')::boolean,false)=false then raise exception 'UNKNOWN_SUBSCRIPTION_STATUS'; end if;
  update public.food_fitness_enrollments set cancelled_at=case when ps='ACTIVE' and not coalesce((p_snapshot->>'deleted')::boolean,false) then null else coalesce(cancelled_at,now()) end where id=e.id;
  if (e.cancelled_at is null) is distinct from (ps='ACTIVE' and not coalesce((p_snapshot->>'deleted')::boolean,false)) then
   insert into public.food_fitness_audit(store_id,user_id,action,reason,event_id,next_state) values(e.store_id,e.user_id,'subscription_state','provider_snapshot',p_event_id,ps);
  end if;
 else
  cents:=(p_snapshot->>'value')::numeric*100;
  if cents is null or cents<>e.amount_cents or cents<>trunc(cents) then raise exception 'BILLING_AMOUNT_MISMATCH'; end if;
  if (p_snapshot->>'dueDate') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_DUE_DATE'; end if;
  due:=(p_snapshot->>'dueDate')::date;
  if due is null then raise exception 'INVALID_DUE_DATE'; end if;
  starts:=due::timestamp at time zone 'America/Sao_Paulo';
  ends:=(due::timestamp+interval '1 month') at time zone 'America/Sao_Paulo';
  refund:=coalesce((p_snapshot->>'refunded')::boolean,false) or coalesce((p_snapshot->>'refundedValue')::numeric,0)>0;
  next_status:=case
   when coalesce((p_snapshot->>'deleted')::boolean,false) or ps in ('REFUNDED','REFUND_REQUESTED','REFUND_IN_PROGRESS','CHARGEBACK_REQUESTED','CHARGEBACK_DISPUTE','AWAITING_CHARGEBACK_REVERSAL') then 'revoked'
   when refund or p_event_type in ('PAYMENT_PARTIALLY_REFUNDED','PAYMENT_REFUNDED','PAYMENT_REFUND_IN_PROGRESS','PAYMENT_CHARGEBACK_REQUESTED','PAYMENT_CHARGEBACK_DISPUTE','PAYMENT_AWAITING_CHARGEBACK_REVERSAL','PAYMENT_RECEIVED_IN_CASH_UNDONE') then 'review'
   when ps in ('CONFIRMED','RECEIVED') then 'paid'
   when ps='OVERDUE' then 'overdue'
   when ps in ('REPROVED_BY_RISK_ANALYSIS','CREDIT_CARD_CAPTURE_REFUSED') then 'refused'
   else 'pending' end;
  select * into old from public.food_fitness_payments where account=p_account and provider_payment_id=rid for update;
  if found and (old.enrollment_id<>e.id or old.due_date<>due or old.amount_cents<>cents) then raise exception 'PAYMENT_BINDING_IMMUTABLE'; end if;
  -- An inconsistent adverse event is held for explicit review. A later replay
  -- of a positive notification cannot erase that hold.
  if old.status='review' then next_status:='review'; end if;
  if old.status='revoked' and next_status in ('pending','overdue','refused') then next_status:='revoked'; end if;
  insert into public.food_fitness_payments(account,provider_payment_id,enrollment_id,store_id,due_date,amount_cents,coverage_start,coverage_end,status,provider_status)
  values(p_account,rid,e.id,e.store_id,due,cents,starts,ends,next_status,coalesce(ps,'UNKNOWN'))
  on conflict(account,provider_payment_id) do update set status=excluded.status,provider_status=excluded.provider_status,last_checked_at=now();
  if next_status='review' then update public.food_fitness_enrollments set review_reason='payment_review' where id=e.id; end if;
  if old.status is distinct from next_status then
   insert into public.food_fitness_audit(store_id,user_id,action,reason,payment_id,event_id,previous_state,next_state)
   values(e.store_id,e.user_id,'payment_state','provider_snapshot',rid,p_event_id,old.status,next_status);
  end if;
 end if;
 if p_event_id is not null then
  update public.food_fitness_billing_events set processed_at=now(),outcome='applied' where account=p_account and event_id=p_event_id;
 end if;
 return jsonb_build_object('applied',true,'status',next_status);
end$$;

-- Self-service reservation uses verified Auth identity passed only by a server
-- that called getUser(). It never creates users, shops or admin memberships.
-- service_role has no SELECT on auth.users in the shared project. This narrow
-- private lookup avoids granting that role broad access to Auth records.
create function food_fitness_private.email_verified(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=p_user_id and email_confirmed_at is not null)
$$;
create function food_fitness_private.session_live(p_user_id uuid,p_session_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions where id=p_session_id and user_id=p_user_id and (not_after is null or not_after>now()))
$$;
create function public.food_fitness_checkout_reserve_v1(p_store_id uuid,p_user_id uuid,p_plan_id uuid,p_session_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.food_fitness_plans%rowtype; cfg public.food_fitness_settings%rowtype; e public.food_fitness_enrollments%rowtype; target uuid;
begin
 select * into cfg from public.food_fitness_settings where store_id=p_store_id and enabled;
 if not found or not food_fitness_private.store_enabled(p_store_id)
 or not exists(select 1 from public.food_stores where id=p_store_id and active and archived_at is null and access_status='online' and approval_status='approved') then raise exception 'FITNESS_NOT_ENABLED'; end if;
 if not food_fitness_private.email_verified(p_user_id) then raise exception 'VERIFIED_EMAIL_REQUIRED'; end if;
 if not food_fitness_private.session_live(p_user_id,p_session_id) then raise exception 'VALID_SESSION_REQUIRED'; end if;
 select * into p from public.food_fitness_plans where id=p_plan_id and store_id=p_store_id and active;
 if not found then raise exception 'PLAN_NOT_AVAILABLE'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_store_id::text||p_user_id::text,0));
 select * into e from public.food_fitness_enrollments where store_id=p_store_id and user_id=p_user_id;
 if found then
  if e.plan_id<>p_plan_id then raise exception 'EXISTING_ENROLLMENT_REQUIRES_REVIEW'; end if;
  return to_jsonb(e)||jsonb_build_object('created',false);
 end if;
 target:=gen_random_uuid();
 insert into public.food_fitness_enrollments(id,store_id,account,user_id,plan_id,amount_cents,external_reference,checkout_state)
 values(target,p_store_id,cfg.account,p_user_id,p.id,p.amount_cents,'fitness:'||target::text,'creating') returning * into e;
 insert into public.food_fitness_audit(store_id,user_id,actor_id,action,reason) values(p_store_id,p_user_id,p_user_id,'checkout_reserved','self_service');
 return to_jsonb(e)||jsonb_build_object('created',true);
end$$;
create function public.food_fitness_checkout_bind_v1(p_enrollment_id uuid,p_customer_id text,p_subscription_id text)
returns void language plpgsql security invoker set search_path='' as $$
declare e public.food_fitness_enrollments%rowtype;
begin
 select * into e from public.food_fitness_enrollments where id=p_enrollment_id for update;
 if not found or length(p_customer_id)<3 or length(p_subscription_id)<3 or p_customer_id is null or p_subscription_id is null then raise exception 'INVALID_BINDING'; end if;
 if e.provider_subscription_id is not null and (e.provider_subscription_id<>p_subscription_id or e.provider_customer_id<>p_customer_id) then raise exception 'BINDING_IMMUTABLE'; end if;
 update public.food_fitness_enrollments set provider_customer_id=p_customer_id,provider_subscription_id=p_subscription_id,checkout_state='ready' where id=e.id;
 insert into public.food_fitness_audit(store_id,user_id,action,reason) select e.store_id,e.user_id,'checkout_bound','provider_subscription' where e.provider_subscription_id is null;
end$$;

-- No persistent 'active' bit: entitlement is checked against paid coverage and
-- store status on EVERY protected operation. Future training/clinical APIs must
-- call this guard rather than trust the UI or JWT metadata.
create function food_fitness_private.access(p_store_id uuid,p_action text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
 cfg public.food_fitness_settings%rowtype; e public.food_fitness_enrollments%rowtype;
 state text:='pending'; until_at timestamptz; allowed boolean:=false; permitted boolean:=false; current_sid uuid; reason text;
begin
 if u is null or sid is null or not exists(select 1 from auth.sessions where id=sid and user_id=u and (not_after is null or not_after>now())) then raise exception 'VALID_SESSION_REQUIRED' using errcode='42501'; end if;
 if p_action is null or p_action not in ('status','claim','release') then raise exception 'INVALID_ACTION'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_store_id::text||u::text,0));
 select * into cfg from public.food_fitness_settings where store_id=p_store_id;
 select * into e from public.food_fitness_enrollments where store_id=p_store_id and user_id=u;
 if cfg.enabled and e.id is not null and e.review_reason is null
 and exists(select 1 from public.food_stores where id=p_store_id and active and archived_at is null and access_status='online' and approval_status='approved')
 and food_fitness_private.store_enabled(p_store_id) then
  select max(coverage_end) into until_at from public.food_fitness_payments where enrollment_id=e.id and status='paid' and coverage_start<=now();
  if exists(select 1 from public.food_fitness_payments where enrollment_id=e.id and status in ('revoked','review') and coverage_start<=now() and coverage_end>now()) then state:='suspended';
  elsif until_at>now() then state:='active'; allowed:=true;
  elsif e.cancelled_at is not null then state:='cancelled';
  elsif until_at is not null and until_at+cfg.grace_days*interval '1 day'>now() then state:='grace'; allowed:=true;
  elsif until_at is not null then state:='suspended'; end if;
 elsif e.id is not null then state:='suspended'; end if;
 reason:=case when not coalesce(cfg.enabled,false) then 'FITNESS_NOT_ENABLED'
 when e.id is null then 'NO_ENROLLMENT' when e.review_reason is not null then 'PAYMENT_REVIEW'
 when state='suspended' then 'COVERAGE_OR_STORE_BLOCKED' when state='cancelled' then 'SUBSCRIPTION_CANCELLED'
 when not allowed then 'AWAITING_CONFIRMED_PAYMENT' else null end;
 if p_action='release' then
  update public.food_fitness_sessions set revoked_at=now() where store_id=p_store_id and user_id=u and session_id=sid and revoked_at is null;
  if found then insert into public.food_fitness_audit(store_id,user_id,actor_id,action,reason) values(p_store_id,u,u,'session_released','user_logout'); end if;
 end if;
 if allowed and cfg.session_limit=0 then permitted:=true;
 elsif allowed then
  -- Never recycle a revoked session. Expired/deleted Auth sessions may be
  -- replaced, without signing this identity out of any other application.
  with expired as (
   update public.food_fitness_sessions f set revoked_at=now() where f.store_id=p_store_id and f.user_id=u and f.revoked_at is null
   and not exists(select 1 from auth.sessions a where a.id=f.session_id and a.user_id=u and (a.not_after is null or a.not_after>now())) returning f.store_id,f.user_id
  ) insert into public.food_fitness_audit(store_id,user_id,action,reason) select store_id,user_id,'session_revoked','auth_session_expired' from expired;
  select session_id into current_sid from public.food_fitness_sessions where store_id=p_store_id and user_id=u and revoked_at is null;
  if current_sid=sid then permitted:=true;
  elsif p_action='claim' and current_sid is null and not exists(select 1 from public.food_fitness_sessions where store_id=p_store_id and user_id=u and session_id=sid) then
   insert into public.food_fitness_sessions(store_id,user_id,session_id) values(p_store_id,u,sid);
   insert into public.food_fitness_audit(store_id,user_id,actor_id,action,reason) values(p_store_id,u,u,'session_claimed','first_available');
   permitted:=true;
  elsif current_sid is null and not exists(select 1 from public.food_fitness_sessions where store_id=p_store_id and user_id=u and session_id=sid) then reason:='SESSION_UNCLAIMED';
  else reason:='SESSION_LIMIT'; end if;
 end if;
 return jsonb_build_object('store_id',p_store_id,'user_id',u,'state',state,'access',allowed,
 'session_allowed',permitted,'session_limit',coalesce(cfg.session_limit,0),'paid_until',until_at,'reason',reason);
end$$;
create function public.food_fitness_access_v1(p_store_id uuid,p_action text default 'status',p_reason text default null)
returns jsonb language sql security invoker set search_path='' as $$select food_fitness_private.access(p_store_id,p_action,p_reason)$$;
create function food_fitness_private.entitlement(p_store_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=food_fitness_private.access(p_store_id,'status',null);
 if not (result->>'access')::boolean or not (result->>'session_allowed')::boolean then raise exception 'FITNESS_ACCESS_DENIED' using errcode='42501'; end if;
 return jsonb_build_object('store_id',p_store_id,'user_id',auth.uid(),'entitlement','fitness_access','paid_until',result->'paid_until');
end$$;
create function public.food_fitness_entitlement_v1(p_store_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select food_fitness_private.entitlement(p_store_id)$$;

create function food_fitness_private.admin(p_store_id uuid,p_user_id uuid,p_action text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare n integer; sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid; rows jsonb;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'aal','')<>'aal2' or not public.food_is_store_admin(p_store_id)
 or not exists(select 1 from auth.sessions where id=sid and user_id=auth.uid() and (not_after is null or not_after>now())) then raise exception 'ADMIN_MFA_REQUIRED' using errcode='42501'; end if;
 if p_action='audit' then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into rows from (select user_id,actor_id,action,reason,payment_id,event_id,previous_state,next_state,created_at from public.food_fitness_audit where store_id=p_store_id and (p_user_id is null or user_id=p_user_id) order by created_at desc,id desc limit 100) x;
  return jsonb_build_object('events',rows);
 end if;
 if p_action is distinct from 'release_sessions' or p_reason not in ('lost_device','security_review','user_request') or p_reason is null then raise exception 'INVALID_RECOVERY_REASON'; end if;
 if not exists(select 1 from public.food_fitness_enrollments where store_id=p_store_id and user_id=p_user_id) then raise exception 'ENROLLMENT_NOT_FOUND'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_store_id::text||p_user_id::text,0));
 update public.food_fitness_sessions set revoked_at=now() where store_id=p_store_id and user_id=p_user_id and revoked_at is null;
 get diagnostics n=row_count;
 insert into public.food_fitness_audit(store_id,user_id,actor_id,action,reason) values(p_store_id,p_user_id,auth.uid(),'admin_session_release',p_reason);
 return jsonb_build_object('released',n);
end$$;
create function public.food_fitness_admin_v1(p_store_id uuid,p_user_id uuid,p_action text,p_reason text default null)
returns jsonb language sql security invoker set search_path='' as $$select food_fitness_private.admin(p_store_id,p_user_id,p_action,p_reason)$$;

create function food_fitness_private.offers(p_store_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('environment','sandbox','plans',coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'amount_cents',p.amount_cents,'cycle',p.cycle) order by p.amount_cents,p.id),'[]'::jsonb))
 from public.food_fitness_plans p join public.food_fitness_settings cfg on cfg.store_id=p.store_id
 join public.food_business_profiles bp on bp.store_id=p.store_id
 join public.food_stores s on s.id=p.store_id
 where p.store_id=p_store_id and p.active and cfg.enabled and bp.primary_segment='personal'
 and food_fitness_private.store_enabled(p_store_id)
 and s.active and s.archived_at is null and s.access_status='online' and s.approval_status='approved'
$$;
create function public.food_fitness_offers_v1(p_store_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select food_fitness_private.offers(p_store_id)$$;

-- Default EXECUTE is PUBLIC in PostgreSQL. Close every entry point, then expose
-- only guarded student/admin APIs or service-only billing APIs explicitly.
revoke all on all functions in schema food_fitness_private from public,anon,authenticated;
grant usage on schema food_fitness_private to anon,authenticated,service_role;
grant execute on function food_fitness_private.offers(uuid) to anon,authenticated;
grant execute on function food_fitness_private.access(uuid,text,text),food_fitness_private.admin(uuid,uuid,text,text),food_fitness_private.entitlement(uuid) to authenticated;
grant execute on all functions in schema food_fitness_private to service_role;
do $$declare f record; begin
 for f in select oid::regprocedure signature,proname from pg_proc where pronamespace='public'::regnamespace and proname like 'food_fitness_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname='food_fitness_offers_v1' then execute format('grant execute on function %s to anon,authenticated',f.signature);
  elsif f.proname in ('food_fitness_access_v1','food_fitness_admin_v1','food_fitness_entitlement_v1') then execute format('grant execute on function %s to authenticated',f.signature);
  else execute format('grant execute on function %s to service_role',f.signature); end if;
 end loop;
end$$;
commit;
