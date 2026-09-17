-- FoodWeb v0.4.6
-- Mensalidade, vencimento, decisao manual do Admin Master e gestao de acesso do lojista.
-- Esta migration toca somente objetos food_*.

begin;

do $$
begin
  if to_regclass('public.food_store_subscriptions') is null
     or to_regclass('public.food_subscription_payments') is null
     or to_regclass('public.food_platform_settings') is null then
    raise exception 'FoodWeb v0.4.6 requer as migrations comerciais anteriores do FoodWeb.';
  end if;
end $$;

alter table public.food_subscription_payments
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

alter table public.food_subscription_payments
  drop constraint if exists food_subscription_payments_status_check;

alter table public.food_subscription_payments
  add constraint food_subscription_payments_status_check
  check(status in('pending','proof_sent','paid','expired','cancelled','refunded','rejected'));

comment on column public.food_subscription_payments.rejected_at is
  'Data/hora em que o Admin Master marcou a cobranca como nao renovada/negada.';
comment on column public.food_subscription_payments.rejection_reason is
  'Motivo informado pelo Admin Master ao negar a renovacao ou alteracao de plano.';

-- Mantem o dia de vencimento definido pelo Admin Master.
-- Se houver referencia, preserva mes/ano e corrige apenas o dia.
-- Sem referencia, retorna a proxima ocorrencia do dia configurado.
create or replace function public.food_subscription_reference_due_v1(
  p_due_day integer,
  p_reference date default null
)
returns date
language plpgsql
stable
set search_path=public,pg_temp
as $$
declare
  v_day integer := greatest(1,least(coalesce(p_due_day,10),28));
  v_due date;
begin
  if p_reference is not null then
    return make_date(
      extract(year from p_reference)::integer,
      extract(month from p_reference)::integer,
      v_day
    );
  end if;

  v_due := make_date(
    extract(year from current_date)::integer,
    extract(month from current_date)::integer,
    v_day
  );

  if v_due < current_date then
    v_due := (v_due + interval '1 month')::date;
  end if;

  return v_due;
end $$;

revoke all on function public.food_subscription_reference_due_v1(integer,date) from public;
grant execute on function public.food_subscription_reference_due_v1(integer,date) to authenticated;

-- Corrige assinaturas pagas existentes cujo next_due_date ficou com dia diferente do due_day.
update public.food_store_subscriptions ss
set due_day = coalesce(ss.due_day,10),
    next_due_date = public.food_subscription_reference_due_v1(
      coalesce(ss.due_day,10),
      ss.next_due_date
    ),
    updated_at = now()
from public.food_plans p
where p.id=ss.plan_id
  and p.code<>'DEMO'
  and ss.status<>'cancelled'
  and (
    ss.due_day is null
    or ss.next_due_date is null
    or extract(day from ss.next_due_date)::integer<>coalesce(ss.due_day,10)
  );

create or replace function public.food_get_store_billing_overview_v1(p_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_sub public.food_store_subscriptions%rowtype;
  v_plan public.food_plans%rowtype;
  v_state text := 'none';
  v_days_overdue integer := 0;
  v_last_paid jsonb := null;
begin
  if not (public.food_is_store_admin(p_store_id) or public.food_is_platform_admin()) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

  select ss.* into v_sub
  from public.food_store_subscriptions ss
  where ss.store_id=p_store_id
  order by ss.started_at desc
  limit 1;

  if v_sub.id is not null then
    select p.* into v_plan from public.food_plans p where p.id=v_sub.plan_id;

    if v_plan.code='DEMO' or v_sub.status='trial' then
      v_state := 'trial';
    elsif v_sub.status='cancelled' then
      v_state := 'cancelled';
    elsif v_sub.next_due_date is not null and v_sub.next_due_date < current_date then
      v_state := 'overdue';
      v_days_overdue := current_date-v_sub.next_due_date;
    elsif v_sub.status='suspended' then
      v_state := 'suspended';
    else
      v_state := 'current';
    end if;
  end if;

  select jsonb_build_object(
    'id',sp.id,
    'storeId',sp.store_id,
    'subscriptionId',sp.subscription_id,
    'planId',sp.plan_id,
    'previousPlanId',sp.previous_plan_id,
    'paymentIntent',sp.payment_intent,
    'amount',sp.amount,
    'dueDate',sp.due_date,
    'provider',sp.provider,
    'providerPaymentId',sp.provider_payment_id,
    'status',sp.status,
    'pixPayload',sp.pix_payload,
    'proofRequired',sp.proof_required,
    'proofSentAt',sp.proof_sent_at,
    'paidAt',sp.paid_at,
    'rejectedAt',sp.rejected_at,
    'rejectionReason',sp.rejection_reason,
    'createdAt',sp.created_at,
    'planName',p.name,
    'previousPlanName',pp.name
  ) into v_last_paid
  from public.food_subscription_payments sp
  join public.food_plans p on p.id=sp.plan_id
  left join public.food_plans pp on pp.id=sp.previous_plan_id
  where sp.store_id=p_store_id
    and sp.status='paid'
  order by sp.paid_at desc nulls last,sp.created_at desc
  limit 1;

  return jsonb_build_object(
    'currentPlan',case when v_plan.id is null then null else jsonb_build_object(
      'id',v_plan.id,
      'code',v_plan.code,
      'name',v_plan.name,
      'monthlyPrice',v_plan.monthly_price
    ) end,
    'subscription',case when v_sub.id is null then null else jsonb_build_object(
      'id',v_sub.id,
      'status',v_sub.status,
      'billingAmount',coalesce(v_sub.billing_amount,v_plan.monthly_price,0),
      'dueDay',v_sub.due_day,
      'nextDueDate',v_sub.next_due_date,
      'billingState',v_state,
      'daysOverdue',v_days_overdue,
      'lastPayment',v_last_paid
    ) end,
    'plans',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',p.id,
          'code',p.code,
          'name',p.name,
          'monthlyPrice',p.monthly_price
        ) order by p.sort_order
      )
      from public.food_plans p
      where p.active and p.code<>'DEMO'
    ),'[]'::jsonb),
    'settings',(
      select jsonb_build_object(
        'provider','manual',
        'pixKeyType',ps.billing_pix_key_type,
        'pixKey',ps.billing_pix_key,
        'pixHolderName',ps.billing_pix_holder_name,
        'pixCity',coalesce(ps.billing_pix_city,'Linhares'),
        'pixCopyPaste',ps.billing_pix_copy_paste,
        'whatsapp',ps.billing_whatsapp,
        'proofRequired',true,
        'autoRenew',false,
        'graceDays',ps.billing_grace_days
      )
      from public.food_platform_settings ps
      where ps.id=1
    ),
    'payments',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',sp.id,
          'storeId',sp.store_id,
          'subscriptionId',sp.subscription_id,
          'planId',sp.plan_id,
          'previousPlanId',sp.previous_plan_id,
          'paymentIntent',sp.payment_intent,
          'amount',sp.amount,
          'dueDate',sp.due_date,
          'provider',sp.provider,
          'providerPaymentId',sp.provider_payment_id,
          'status',sp.status,
          'pixPayload',sp.pix_payload,
          'proofRequired',sp.proof_required,
          'proofSentAt',sp.proof_sent_at,
          'paidAt',sp.paid_at,
          'rejectedAt',sp.rejected_at,
          'rejectionReason',sp.rejection_reason,
          'createdAt',sp.created_at,
          'planName',p.name,
          'previousPlanName',pp.name
        ) order by sp.created_at desc
      )
      from public.food_subscription_payments sp
      join public.food_plans p on p.id=sp.plan_id
      left join public.food_plans pp on pp.id=sp.previous_plan_id
      where sp.store_id=p_store_id
    ),'[]'::jsonb)
  );
end $$;

revoke all on function public.food_get_store_billing_overview_v1(uuid) from public;
grant execute on function public.food_get_store_billing_overview_v1(uuid) to authenticated;

-- A cobranca usa o vencimento real da assinatura como referencia.
create or replace function public.food_create_manual_subscription_payment(
  p_store_id uuid,
  p_plan_id uuid
)
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
  v_intent text := 'renewal';
  v_due date;
begin
  if not public.food_is_store_admin(p_store_id) then
    raise exception 'Sem permissao para gerar cobranca desta loja.';
  end if;

  select * into v_plan
  from public.food_plans
  where id=p_plan_id and active=true;

  if not found or v_plan.code='DEMO' then
    raise exception 'Plano pago invalido.';
  end if;

  select * into v_settings
  from public.food_platform_settings
  where id=1;

  if nullif(trim(coalesce(v_settings.billing_pix_key,'')),'') is null
     and nullif(trim(coalesce(v_settings.billing_pix_copy_paste,'')),'') is null then
    raise exception 'O Admin Master precisa configurar uma chave PIX ou PIX copia e cola antes de liberar cobrancas.';
  end if;

  if nullif(trim(coalesce(v_settings.billing_pix_holder_name,'')),'') is null then
    raise exception 'O Admin Master precisa configurar o titular do PIX.';
  end if;

  if nullif(trim(coalesce(v_settings.billing_pix_city,'')),'') is null then
    raise exception 'O Admin Master precisa configurar a cidade do recebedor PIX.';
  end if;

  if nullif(regexp_replace(coalesce(v_settings.billing_whatsapp,''),'\D','','g'),'') is null then
    raise exception 'O Admin Master precisa configurar o WhatsApp que recebera os comprovantes.';
  end if;

  select * into v_sub
  from public.food_store_subscriptions
  where store_id=p_store_id
  order by started_at desc
  limit 1;

  if v_sub.id is null then raise exception 'Assinatura da loja nao encontrada.'; end if;
  if v_sub.plan_id is distinct from p_plan_id then v_intent := 'plan_change'; end if;

  if exists(
    select 1 from public.food_subscription_payments
    where store_id=p_store_id
      and provider='manual'
      and status='proof_sent'
  ) then
    raise exception 'Existe um comprovante enviado aguardando conferencia do Admin Master.';
  end if;

  update public.food_subscription_payments
  set status='cancelled',updated_at=now()
  where store_id=p_store_id
    and provider='manual'
    and status='pending';

  v_due := public.food_subscription_reference_due_v1(
    coalesce(v_sub.due_day,10),
    v_sub.next_due_date
  );

  insert into public.food_subscription_payments(
    store_id,subscription_id,plan_id,previous_plan_id,payment_intent,
    amount,due_date,provider,status,proof_required,pix_payload
  ) values(
    p_store_id,v_sub.id,p_plan_id,v_sub.plan_id,v_intent,
    v_plan.monthly_price,v_due,'manual','pending',true,
    nullif(trim(coalesce(v_settings.billing_pix_copy_paste,'')),'')
  ) returning * into v_payment;

  return jsonb_build_object(
    'payment',to_jsonb(v_payment),
    'plan',jsonb_build_object('id',v_plan.id,'code',v_plan.code,'name',v_plan.name,'monthlyPrice',v_plan.monthly_price),
    'billing',jsonb_build_object(
      'provider','manual',
      'pixKeyType',v_settings.billing_pix_key_type,
      'pixKey',v_settings.billing_pix_key,
      'pixHolderName',v_settings.billing_pix_holder_name,
      'pixCity',coalesce(v_settings.billing_pix_city,'Linhares'),
      'pixCopyPaste',v_settings.billing_pix_copy_paste,
      'whatsapp',v_settings.billing_whatsapp,
      'proofRequired',true,
      'autoRenew',false,
      'graceDays',v_settings.billing_grace_days
    )
  );
end $$;

revoke all on function public.food_create_manual_subscription_payment(uuid,uuid) from public;
grant execute on function public.food_create_manual_subscription_payment(uuid,uuid) to authenticated;

create or replace function public.food_platform_get_billing_dashboard_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
begin
  if not public.food_is_platform_admin() then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

  return jsonb_build_object(
    'payments',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',sp.id,
          'storeId',sp.store_id,
          'subscriptionId',sp.subscription_id,
          'planId',sp.plan_id,
          'previousPlanId',sp.previous_plan_id,
          'paymentIntent',sp.payment_intent,
          'amount',sp.amount,
          'dueDate',sp.due_date,
          'provider',sp.provider,
          'providerPaymentId',sp.provider_payment_id,
          'status',sp.status,
          'proofRequired',sp.proof_required,
          'proofSentAt',sp.proof_sent_at,
          'paidAt',sp.paid_at,
          'rejectedAt',sp.rejected_at,
          'rejectionReason',sp.rejection_reason,
          'createdAt',sp.created_at,
          'storeName',s.name,
          'planName',p.name,
          'previousPlanName',pp.name,
          'dueDay',ss.due_day,
          'nextDueDate',ss.next_due_date,
          'billingState',case
            when pl.code='DEMO' or ss.status='trial' then 'trial'
            when ss.next_due_date is not null and ss.next_due_date<current_date then 'overdue'
            when ss.status='suspended' then 'suspended'
            when ss.status='cancelled' then 'cancelled'
            else 'current'
          end
        ) order by sp.created_at desc
      )
      from public.food_subscription_payments sp
      join public.food_stores s on s.id=sp.store_id
      join public.food_plans p on p.id=sp.plan_id
      left join public.food_plans pp on pp.id=sp.previous_plan_id
      left join lateral (
        select x.* from public.food_store_subscriptions x
        where x.store_id=sp.store_id
        order by x.started_at desc
        limit 1
      ) ss on true
      left join public.food_plans pl on pl.id=ss.plan_id
    ),'[]'::jsonb)
  );
end $$;

revoke all on function public.food_platform_get_billing_dashboard_v1() from public;
grant execute on function public.food_platform_get_billing_dashboard_v1() to authenticated;

create or replace function public.food_platform_reject_subscription_payment_v1(
  p_payment_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_payment public.food_subscription_payments%rowtype;
  v_reason text;
begin
  if not public.food_is_platform_admin() then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

  select * into v_payment
  from public.food_subscription_payments
  where id=p_payment_id
  for update;

  if not found then raise exception 'Cobranca nao encontrada.'; end if;
  if v_payment.status='paid' then raise exception 'Pagamento ja confirmado nao pode ser negado.'; end if;
  if v_payment.status in('cancelled','rejected','refunded') then
    return jsonb_build_object('ok',true,'alreadyRejected',true);
  end if;

  v_reason := nullif(trim(coalesce(p_reason,'')),'');

  update public.food_subscription_payments
  set status='rejected',
      rejected_at=now(),
      rejection_reason=coalesce(v_reason,'Pagamento/renovacao nao confirmado pelo Admin Master.'),
      reviewed_by=auth.uid(),
      updated_at=now()
  where id=p_payment_id;

  -- Nao altera next_due_date. O painel fica atrasado assim que a data vencer.
  return jsonb_build_object('ok',true);
end $$;

revoke all on function public.food_platform_reject_subscription_payment_v1(uuid,text) from public;
grant execute on function public.food_platform_reject_subscription_payment_v1(uuid,text) to authenticated;

-- Substitui a regra antiga que deslocava o dia quando o pagamento estava atrasado.
create or replace function public.food_confirm_subscription_payment(
  p_payment_id uuid,
  p_paid_at timestamptz default now(),
  p_provider_event_id text default null
)
returns public.food_subscription_payments
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_payment public.food_subscription_payments%rowtype;
  v_sub public.food_store_subscriptions%rowtype;
  v_reference_due date;
  v_next_due date;
  v_paid_at timestamptz := coalesce(p_paid_at,now());
begin
  if auth.role()<>'service_role' and not public.food_is_platform_admin() then
    raise exception 'Somente a plataforma pode confirmar pagamentos.';
  end if;

  select * into v_payment
  from public.food_subscription_payments
  where id=p_payment_id
  for update;

  if not found then raise exception 'Cobranca nao encontrada.'; end if;
  if v_payment.status='paid' then return v_payment; end if;
  if v_payment.status in('rejected','cancelled','refunded') then
    raise exception 'Esta cobranca foi negada/cancelada e nao pode ser confirmada.';
  end if;
  if v_payment.provider='manual' and v_payment.proof_required and v_payment.proof_sent_at is null then
    raise exception 'O comprovante deve ser enviado antes da confirmacao manual.';
  end if;

  select * into v_sub
  from public.food_store_subscriptions
  where id=v_payment.subscription_id
  for update;

  if v_sub.id is null then
    select * into v_sub
    from public.food_store_subscriptions
    where store_id=v_payment.store_id
    order by started_at desc
    limit 1
    for update;
  end if;

  if v_sub.id is null then raise exception 'Assinatura da loja nao encontrada.'; end if;

  -- O pagamento recebe a data/hora real da confirmacao.
  -- O vencimento seguinte continua no due_day configurado, mesmo se o pagamento estiver atrasado.
  v_reference_due := public.food_subscription_reference_due_v1(
    coalesce(v_sub.due_day,extract(day from v_payment.due_date)::integer,10),
    coalesce(v_payment.due_date,v_sub.next_due_date,v_paid_at::date)
  );
  v_next_due := (v_reference_due + interval '1 month')::date;

  update public.food_store_subscriptions
  set plan_id=v_payment.plan_id,
      status='active',
      status_before_suspension=null,
      expires_at=null,
      billing_amount=v_payment.amount,
      due_day=coalesce(due_day,extract(day from v_reference_due)::integer),
      next_due_date=v_next_due,
      notes=concat_ws(E'\n',notes,
        'Pagamento PIX confirmado em '||to_char(v_paid_at,'DD/MM/YYYY HH24:MI')||
        ' | referencia '||to_char(v_reference_due,'DD/MM/YYYY')||
        ' | proximo vencimento '||to_char(v_next_due,'DD/MM/YYYY')
      ),
      updated_at=now()
  where id=v_sub.id
  returning * into v_sub;

  update public.food_stores
  set access_status='online',
      active=true,
      suspended_at=null,
      suspension_reason=null,
      updated_at=now()
  where id=v_payment.store_id;

  update public.food_subscription_payments
  set status='paid',
      paid_at=v_paid_at,
      subscription_id=v_sub.id,
      due_date=v_reference_due,
      rejected_at=null,
      rejection_reason=null,
      reviewed_by=auth.uid(),
      updated_at=now()
  where id=v_payment.id
  returning * into v_payment;

  if p_provider_event_id is not null then
    update public.food_billing_webhook_events
    set processed_at=now()
    where event_id=p_provider_event_id;
  end if;

  return v_payment;
end $$;

revoke all on function public.food_confirm_subscription_payment(uuid,timestamptz,text) from public;
grant execute on function public.food_confirm_subscription_payment(uuid,timestamptz,text) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
