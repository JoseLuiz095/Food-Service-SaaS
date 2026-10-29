-- shared_future: cortesia temporária com primeira cobrança pelo valor negociado.
-- Migration isolada; revisar contra o banco compartilhado antes de aplicar.
begin;
alter table public.food_store_subscriptions
  add column if not exists billing_mode text,
  add column if not exists intro_free_months integer,
  add column if not exists intro_first_charge_on date;
update public.food_store_subscriptions s set billing_mode=case
  when s.billing_amount=0 and exists(select 1 from public.food_plans p where p.id=s.plan_id and p.code<>'DEMO') then 'complimentary'
  when s.billing_amount is distinct from (select p.monthly_price from public.food_plans p where p.id=s.plan_id)
    and exists(select 1 from public.food_plans p where p.id=s.plan_id and p.code<>'DEMO') then 'negotiated'
  else 'standard' end where billing_mode is null;
alter table public.food_store_subscriptions alter column billing_mode set default 'standard';
alter table public.food_store_subscriptions alter column billing_mode set not null;
alter table public.food_store_subscriptions
  add constraint food_subscriptions_intro_terms_check check (
    (billing_mode='introductory' and intro_free_months between 1 and 24
      and intro_first_charge_on is not null and billing_amount>0
      and due_day between 1 and 28 and next_due_date>=intro_first_charge_on)
    or (billing_mode in ('standard','negotiated','complimentary')
      and intro_free_months is null and intro_first_charge_on is null)
  );
-- O banco não cria cobranças antecipadas; a assinatura segue ativa durante a cortesia.
create or replace function public.food_create_manual_subscription_payment(
  p_store_id uuid,
  p_plan_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_plan public.food_plans%rowtype;
  v_settings public.food_platform_settings%rowtype;
  v_sub public.food_store_subscriptions%rowtype;
  v_payment public.food_subscription_payments%rowtype;
  v_intent text := 'renewal';
  v_due date;
begin
  if auth.uid() is null or not public.food_is_store_admin(p_store_id) then
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
  if v_intent = 'renewal' and (v_sub.billing_mode = 'complimentary' or v_sub.billing_amount=0) then
    raise exception 'Esta loja possui isenção comercial e não precisa gerar cobrança.' using errcode='22023';
  end if;
  if v_intent = 'renewal' and v_sub.billing_mode = 'introductory'
     and current_date < v_sub.intro_first_charge_on then
    raise exception 'A cortesia comercial continua até a primeira cobrança programada.' using errcode='22023';
  end if;

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
    case when v_intent='renewal' and v_sub.billing_mode in ('negotiated','introductory')
      then v_sub.billing_amount else v_plan.monthly_price end,v_due,'manual','pending',true,
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

revoke all on function public.food_create_manual_subscription_payment(uuid,uuid) from public,anon;
grant execute on function public.food_create_manual_subscription_payment(uuid,uuid) to authenticated;
-- Uma troca de plano paga encerra o acordo de entrada anterior.
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
  v_paid_at timestamptz:=coalesce(p_paid_at,now());
  v_due_day integer;
begin
  if auth.role()<>'service_role' and not public.food_is_platform_admin() then raise exception 'Somente a plataforma pode confirmar pagamentos.'; end if;
  select * into v_payment from public.food_subscription_payments where id=p_payment_id for update;
  if not found then raise exception 'Cobrança não encontrada.'; end if;
  if v_payment.status='paid' then return v_payment; end if;
  if v_payment.status in('rejected','cancelled','refunded') then raise exception 'Esta cobrança foi negada/cancelada e não pode ser confirmada.'; end if;
  if v_payment.provider='manual' and v_payment.proof_required and v_payment.proof_sent_at is null then raise exception 'O comprovante deve ser enviado antes da confirmação manual.'; end if;

  select * into v_sub from public.food_store_subscriptions where id=v_payment.subscription_id for update;
  if v_sub.id is null then
    select * into v_sub from public.food_store_subscriptions where store_id=v_payment.store_id order by started_at desc limit 1 for update;
  end if;
  if v_sub.id is null then raise exception 'Assinatura da loja não encontrada.'; end if;

  v_due_day:=greatest(1,least(coalesce(v_sub.due_day,extract(day from v_payment.due_date)::integer,10),31));
  v_reference_due:=public.food_subscription_reference_due_v1(v_due_day,coalesce(v_payment.due_date,v_sub.next_due_date,v_paid_at::date));
  v_next_due:=public.food_subscription_reference_due_v1(v_due_day,(date_trunc('month',v_reference_due)+interval '1 month')::date);

  update public.food_store_subscriptions
     set plan_id=v_payment.plan_id,status='active',status_before_suspension=null,expires_at=null,
         billing_amount=v_payment.amount,due_day=v_due_day,next_due_date=v_next_due,
         billing_mode=case when v_payment.payment_intent='plan_change' then 'standard' else v_sub.billing_mode end,
         intro_free_months=case when v_payment.payment_intent='plan_change' then null else v_sub.intro_free_months end,
         intro_first_charge_on=case when v_payment.payment_intent='plan_change' then null else v_sub.intro_first_charge_on end,
         notes=concat_ws(E'\n',notes,'Pagamento PIX confirmado em '||to_char(v_paid_at,'DD/MM/YYYY HH24:MI')||' | referência '||to_char(v_reference_due,'DD/MM/YYYY')||' | próximo vencimento '||to_char(v_next_due,'DD/MM/YYYY')),
         updated_at=now()
   where id=v_sub.id returning * into v_sub;

  update public.food_stores set access_status='online',active=true,suspended_at=null,suspension_reason=null,updated_at=now() where id=v_payment.store_id;

  update public.food_subscription_payments
     set status='paid',paid_at=v_paid_at,subscription_id=v_sub.id,due_date=v_reference_due,rejected_at=null,rejection_reason=null,reviewed_by=auth.uid(),updated_at=now()
   where id=v_payment.id returning * into v_payment;

  if p_provider_event_id is not null then update public.food_billing_webhook_events set processed_at=now() where event_id=p_provider_event_id; end if;

  insert into public.food_platform_event_log(actor_user_id,store_id,kind,action,result,route,app_version,metadata)
  values(auth.uid(),v_payment.store_id,'audit',
    case when v_payment.payment_intent='plan_change' then 'subscription_plan_change_confirmed' else 'subscription_renewal_confirmed' end,
    'success','/admin-master/pagamentos','0.5.0',jsonb_build_object('paymentId',v_payment.id,'amount',v_payment.amount,'referenceDueDate',v_reference_due,'nextDueDate',v_next_due));

  return v_payment;
end $$;

revoke all on function public.food_confirm_subscription_payment(uuid,timestamptz,text) from public;
grant execute on function public.food_confirm_subscription_payment(uuid,timestamptz,text) to authenticated,service_role;

commit;
