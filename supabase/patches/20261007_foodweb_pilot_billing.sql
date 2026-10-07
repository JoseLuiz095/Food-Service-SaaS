-- FoodWeb piloto: cobrança por loja (aplicar somente após revisar no Supabase).
-- Mantém o preço público do plano; a exceção é sempre vinculada a uma assinatura/loja.

begin;

alter table public.food_store_subscriptions
  add column if not exists billing_mode text not null default 'standard';

do $$
declare
  v_constraint text;
begin
  select conname into v_constraint
  from pg_constraint
  where conrelid='public.food_store_subscriptions'::regclass
    and conname='food_store_subscriptions_billing_mode_ck';
  if v_constraint is not null then
    execute format('alter table public.food_store_subscriptions drop constraint %I',v_constraint);
  end if;
end $$;

alter table public.food_store_subscriptions
  add constraint food_store_subscriptions_billing_mode_ck
  check (billing_mode in ('standard','negotiated','complimentary'));

update public.food_store_subscriptions ss
set billing_mode=case
  when coalesce(ss.billing_amount,0)=0 then 'complimentary'
  when exists (select 1 from public.food_plans p where p.id=ss.plan_id and coalesce(ss.billing_amount,0)<>coalesce(p.monthly_price,0)) then 'negotiated'
  else 'standard'
end
where billing_mode is null
   or billing_mode not in ('standard','negotiated','complimentary')
   or (billing_mode='standard' and (
     coalesce(ss.billing_amount,0)=0
     or exists (select 1 from public.food_plans p where p.id=ss.plan_id and coalesce(ss.billing_amount,0)<>coalesce(p.monthly_price,0))
   ));

-- A isenção é explícita. Uma cobrança PIX não pode ser criada para uma loja isenta;
-- o valor negociado, por sua vez, é respeitado em renovações do mesmo plano.
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
  v_amount numeric(12,2);
begin
  if not public.food_is_store_admin(p_store_id) then
    raise exception 'Sem permissao para gerar cobranca desta loja.' using errcode='42501';
  end if;

  select * into v_plan from public.food_plans where id=p_plan_id and active=true;
  if not found or v_plan.code='DEMO' then raise exception 'Plano pago invalido.'; end if;

  select * into v_sub from public.food_store_subscriptions
  where store_id=p_store_id order by started_at desc limit 1 for update;
  if v_sub.id is null then raise exception 'Assinatura da loja nao encontrada.'; end if;
  if coalesce(v_sub.billing_mode,'standard')='complimentary' then
    raise exception 'Esta loja esta isenta por acordo comercial. Somente o Admin Master pode alterar essa regra.' using errcode='P0001';
  end if;

  select * into v_settings from public.food_platform_settings where id=1;
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

  if v_sub.plan_id is distinct from p_plan_id then
    v_intent:='plan_change';
    v_amount:=coalesce(v_plan.monthly_price,0);
  else
    v_amount:=case when coalesce(v_sub.billing_mode,'standard')='negotiated' then coalesce(v_sub.billing_amount,v_plan.monthly_price,0) else coalesce(v_plan.monthly_price,0) end;
  end if;
  if v_amount<=0 then raise exception 'A mensalidade desta loja nao possui um valor valido para cobranca.'; end if;

  if exists(select 1 from public.food_subscription_payments where store_id=p_store_id and provider='manual' and status='proof_sent') then
    raise exception 'Existe um comprovante enviado aguardando conferencia do Admin Master.';
  end if;
  update public.food_subscription_payments set status='cancelled',updated_at=now()
  where store_id=p_store_id and provider='manual' and status='pending';

  v_due:=public.food_subscription_reference_due_v1(coalesce(v_sub.due_day,10),v_sub.next_due_date);
  insert into public.food_subscription_payments(
    store_id,subscription_id,plan_id,previous_plan_id,payment_intent,amount,due_date,provider,status,proof_required,pix_payload
  ) values(
    p_store_id,v_sub.id,p_plan_id,v_sub.plan_id,v_intent,v_amount,v_due,'manual','pending',true,
    nullif(trim(coalesce(v_settings.billing_pix_copy_paste,'')), '')
  ) returning * into v_payment;

  return jsonb_build_object(
    'payment',to_jsonb(v_payment),
    'plan',jsonb_build_object('id',v_plan.id,'code',v_plan.code,'name',v_plan.name,'monthlyPrice',v_plan.monthly_price),
    'billing',jsonb_build_object(
      'provider','manual','pixKeyType',v_settings.billing_pix_key_type,'pixKey',v_settings.billing_pix_key,
      'pixHolderName',v_settings.billing_pix_holder_name,'pixCity',coalesce(v_settings.billing_pix_city,'Linhares'),
      'pixCopyPaste',v_settings.billing_pix_copy_paste,'whatsapp',v_settings.billing_whatsapp,
      'proofRequired',true,'autoRenew',false,'graceDays',v_settings.billing_grace_days
    )
  );
end $$;

revoke all on function public.food_create_manual_subscription_payment(uuid,uuid) from public;
grant execute on function public.food_create_manual_subscription_payment(uuid,uuid) to authenticated;

-- Uma loja isenta permanece elegível; somente débitos reais passam pela suspensão automática.
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
      and coalesce(ss.billing_mode,'standard')<>'complimentary'
      and ss.next_due_date is not null
      and current_date>(ss.next_due_date+v_grace)
    returning ss.store_id
  )
  update public.food_stores s
  set access_status='suspended',suspended_at=coalesce(s.suspended_at,now()),suspension_reason='Mensalidade vencida',updated_at=now()
  where s.id in (select store_id from overdue);
  get diagnostics v_count=row_count;
  return v_count;
end $$;

revoke all on function public.food_suspend_overdue_paid_subscriptions() from public,anon,authenticated;
grant execute on function public.food_suspend_overdue_paid_subscriptions() to service_role;

notify pgrst,'reload schema';
commit;
