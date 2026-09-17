begin;

-- FoodWeb v0.4.0
-- Cobrança exclusivamente manual por PIX, intenção de renovação/mudança de plano,
-- diagnóstico real do pg_cron e configuração do beneficiário PIX.
-- Esta migration toca somente objetos food_*.

alter table public.food_platform_settings
  add column if not exists billing_pix_city text;

update public.food_platform_settings
set billing_provider='manual',
    billing_proof_required=true,
    billing_auto_renew=false,
    billing_pix_city=coalesce(nullif(trim(billing_pix_city),''),'Linhares'),
    updated_at=now()
where id=1;

alter table public.food_subscription_payments
  add column if not exists payment_intent text not null default 'renewal';

alter table public.food_subscription_payments
  add column if not exists previous_plan_id uuid references public.food_plans(id);

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conname='food_subscription_payments_intent_ck'
  ) then
    alter table public.food_subscription_payments
      add constraint food_subscription_payments_intent_ck
      check(payment_intent in ('renewal','plan_change'));
  end if;
end $$;

create index if not exists food_subscription_payments_previous_plan_idx
  on public.food_subscription_payments(previous_plan_id)
  where previous_plan_id is not null;

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

  if v_sub.id is not null and v_sub.plan_id is distinct from p_plan_id then
    v_intent := 'plan_change';
  end if;

  -- Comprovante já informado pode representar dinheiro efetivamente enviado.
  -- O lojista precisa aguardar a conferência antes de abrir outra mudança.
  if exists(
    select 1
    from public.food_subscription_payments
    where store_id=p_store_id
      and provider='manual'
      and status='proof_sent'
      and plan_id<>p_plan_id
  ) then
    raise exception 'Existe outra cobranca com comprovante enviado aguardando conferencia do Admin Master.';
  end if;

  -- Cobranças ainda não pagas podem ser substituídas pela nova escolha de plano.
  update public.food_subscription_payments
  set status='cancelled',
      updated_at=now()
  where store_id=p_store_id
    and provider='manual'
    and status='pending'
    and plan_id<>p_plan_id;

  select * into v_payment
  from public.food_subscription_payments
  where store_id=p_store_id
    and plan_id=p_plan_id
    and provider='manual'
    and status in ('pending','proof_sent')
    and due_date>=current_date
  order by created_at desc
  limit 1;

  if v_payment.id is null then
    insert into public.food_subscription_payments(
      store_id,
      subscription_id,
      plan_id,
      previous_plan_id,
      payment_intent,
      amount,
      due_date,
      provider,
      status,
      proof_required,
      pix_payload
    )
    values(
      p_store_id,
      v_sub.id,
      p_plan_id,
      v_sub.plan_id,
      v_intent,
      v_plan.monthly_price,
      current_date+interval '3 days',
      'manual',
      'pending',
      true,
      nullif(trim(coalesce(v_settings.billing_pix_copy_paste,'')),'')
    )
    returning * into v_payment;
  end if;

  return jsonb_build_object(
    'payment',to_jsonb(v_payment),
    'plan',jsonb_build_object(
      'id',v_plan.id,
      'code',v_plan.code,
      'name',v_plan.name,
      'monthlyPrice',v_plan.monthly_price
    ),
    'billing',jsonb_build_object(
      'provider','manual',
      'pixKeyType',v_settings.billing_pix_key_type,
      'pixKey',v_settings.billing_pix_key,
      'pixHolderName',v_settings.billing_pix_holder_name,
      'pixCity',coalesce(v_settings.billing_pix_city,'Linhares'),
      'pixCopyPaste',v_settings.billing_pix_copy_paste,
      'whatsapp',v_settings.billing_whatsapp,
      'proofRequired',true,
      'autoRenew',false
    )
  );
end $$;

revoke all on function public.food_create_manual_subscription_payment(uuid,uuid) from public;
grant execute on function public.food_create_manual_subscription_payment(uuid,uuid) to authenticated;

create or replace function public.food_get_billing_settings_for_store(p_store_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v public.food_platform_settings%rowtype;
begin
  if not public.food_is_store_member(p_store_id) then
    raise exception 'Sem permissao para esta loja.';
  end if;

  select * into v
  from public.food_platform_settings
  where id=1;

  return jsonb_build_object(
    'provider','manual',
    'pixKeyType',v.billing_pix_key_type,
    'pixKey',v.billing_pix_key,
    'pixHolderName',v.billing_pix_holder_name,
    'pixCity',coalesce(v.billing_pix_city,'Linhares'),
    'pixCopyPaste',v.billing_pix_copy_paste,
    'whatsapp',v.billing_whatsapp,
    'proofRequired',true,
    'autoRenew',false,
    'graceDays',v.billing_grace_days
  );
end $$;

revoke all on function public.food_get_billing_settings_for_store(uuid) from public;
grant execute on function public.food_get_billing_settings_for_store(uuid) to authenticated;

-- Garante novamente os dois jobs quando pg_cron estiver disponível.
do $$
declare
  v_jobid bigint;
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    for v_jobid in select jobid from cron.job where jobname='foodservice-demo-expiration-hourly' loop
      perform cron.unschedule(v_jobid);
    end loop;
    perform cron.schedule(
      'foodservice-demo-expiration-hourly',
      '15 * * * *',
      'select public.food_suspend_expired_trials();'
    );

    for v_jobid in select jobid from cron.job where jobname='foodservice-paid-expiration-hourly' loop
      perform cron.unschedule(v_jobid);
    end loop;
    perform cron.schedule(
      'foodservice-paid-expiration-hourly',
      '25 * * * *',
      'select public.food_suspend_overdue_paid_subscriptions();'
    );
  end if;
exception when others then
  raise notice 'pg_cron indisponivel. Os jobs podem ser executados por agendamento externo. %',sqlerrm;
end $$;

create or replace function public.food_platform_system_check()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_settings public.food_platform_settings%rowtype;
  v_demo_cron_exists boolean := false;
  v_demo_cron_active boolean := false;
  v_demo_cron_schedule text := null;
begin
  if not public.food_is_platform_admin() then
    raise exception 'Acesso negado.';
  end if;

  select * into v_settings
  from public.food_platform_settings
  where id=1;

  if exists(select 1 from pg_extension where extname='pg_cron') then
    begin
      execute $sql$
        select
          count(*)>0,
          coalesce(bool_or(active),false),
          max(schedule)
        from cron.job
        where jobname='foodservice-demo-expiration-hourly'
      $sql$
      into v_demo_cron_exists,v_demo_cron_active,v_demo_cron_schedule;
    exception when others then
      v_demo_cron_exists:=false;
      v_demo_cron_active:=false;
      v_demo_cron_schedule:=null;
    end;
  end if;

  return jsonb_build_object(
    'version','foodweb-shared-0.4.0',
    'platformAdmin',true,
    'stores',(select count(*) from public.food_stores),
    'storesOnline',(select count(*) from public.food_stores where active and access_status='online'),
    'storesSuspended',(select count(*) from public.food_stores where access_status='suspended'),
    'plans',(select count(*) from public.food_plans where active),
    'subscriptions',(select count(*) from public.food_store_subscriptions),
    'users',(select count(*) from public.food_store_users where active),
    'products',(select count(*) from public.food_products),
    'orders',(select count(*) from public.food_orders),
    'deliveryZones',(select count(*) from public.food_delivery_zones),
    'domains',(select count(*) from public.food_store_domains where active),
    'analyticsEvents',(select count(*) from public.food_analytics_events),
    'analyticsReady',true,
    'demoEnabled',coalesce(v_settings.demo_enabled,true),
    'demoTrials',(select count(*) from public.food_store_subscriptions where status='trial' and (expires_at is null or expires_at>now())),
    'demoTrialsExpiringSoon',(
      select count(*)
      from public.food_store_subscriptions
      where status='trial'
        and expires_at between now() and now()+make_interval(days=>coalesce(v_settings.demo_warning_days,3))
    ),
    'demoDurationDays',coalesce(v_settings.demo_duration_days,14),
    'demoWarningDays',coalesce(v_settings.demo_warning_days,3),
    'demoCronScheduled',v_demo_cron_exists and v_demo_cron_active,
    'demoCronExists',v_demo_cron_exists,
    'demoCronActive',v_demo_cron_active,
    'demoCronSchedule',v_demo_cron_schedule
  );
end $$;

revoke all on function public.food_platform_system_check() from public;
grant execute on function public.food_platform_system_check() to authenticated;

commit;
