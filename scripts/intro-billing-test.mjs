import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { build } from 'esbuild';

const compiled = await build({entryPoints:['src/utils/introBilling.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {firstChargeAfterFreeMonths}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
test('first payment respects calendar months, anniversary and due day',()=>{
  assert.equal(firstChargeAfterFreeMonths('2026-10-29',2,10),'2027-01-10');
  assert.equal(firstChargeAfterFreeMonths('2026-01-31',1,28),'2026-02-28');
  assert.equal(firstChargeAfterFreeMonths('2026-01-15',1,10),'2026-03-10');
  assert.throws(()=>firstChargeAfterFreeMonths('2026-02-30',1,10));
  assert.throws(()=>firstChargeAfterFreeMonths('2026-01-15',25,10));
});

test('migration preserves negotiated values and blocks charges during the free period',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create schema auth;
      create role anon; create role authenticated; create role service_role;
      create function auth.uid() returns uuid language sql stable as $$select '00000000-0000-4000-8000-000000000001'::uuid$$;
      create function auth.role() returns text language sql stable as $$select 'authenticated'::text$$;
      create table public.food_plans(id uuid primary key,code text,name text,active boolean,monthly_price numeric);
      create table public.food_platform_settings(id integer primary key,billing_pix_key text,billing_pix_copy_paste text,billing_pix_holder_name text,billing_pix_city text,billing_whatsapp text,billing_pix_key_type text,billing_grace_days integer);
      create table public.food_store_subscriptions(id uuid primary key,store_id uuid,plan_id uuid,status text,status_before_suspension text,started_at timestamptz default now(),expires_at timestamptz,billing_amount numeric,due_day integer,next_due_date date,updated_at timestamptz,notes text);
      create table public.food_subscription_payments(id uuid default gen_random_uuid(),store_id uuid,subscription_id uuid,plan_id uuid,previous_plan_id uuid,payment_intent text,amount numeric,due_date date,provider text,status text,proof_required boolean,pix_payload text,proof_sent_at timestamptz,paid_at timestamptz,rejected_at timestamptz,rejection_reason text,reviewed_by uuid,created_at timestamptz default now(),updated_at timestamptz);
      create table public.food_stores(id uuid,access_status text,active boolean,suspended_at timestamptz,suspension_reason text,updated_at timestamptz);
      create table public.food_billing_webhook_events(event_id text,processed_at timestamptz);
      create table public.food_platform_event_log(actor_user_id uuid,store_id uuid,kind text,action text,result text,route text,app_version text,metadata jsonb);
      create function public.food_is_platform_admin() returns boolean language sql as $$select true$$;
      create function public.food_is_store_admin(uuid) returns boolean language sql as $$select true$$;
      create function public.food_subscription_reference_due_v1(integer,date) returns date language sql as $$select coalesce($2,current_date)$$;
      insert into food_plans values('00000000-0000-4000-8000-000000000010','STARTER','Profissional',true,100),('00000000-0000-4000-8000-000000000011','PROFESSIONAL','Premium',true,150);
      insert into food_stores values('00000000-0000-4000-8000-000000000030','online',true,null,null,now());
      insert into food_platform_settings values(1,'test-key',null,'Titular','Linhares','5527999999999','CNPJ',3);
      insert into food_store_subscriptions(id,store_id,plan_id,status,billing_amount,due_day,next_due_date) values
        ('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000010','active',70,10,current_date);
    `);
    await db.exec(readFileSync('supabase/migrations/20261029121944_food_introductory_billing_terms.sql','utf8'));
    const sub=(await db.query('select billing_mode from food_store_subscriptions')).rows[0];
    assert.equal(sub.billing_mode,'negotiated');
    const call=async()=>db.query(`select food_create_manual_subscription_payment('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000010') result`);
    assert.equal((await call()).rows[0].result.payment.amount,70);
    await db.exec(`update food_store_subscriptions set billing_mode='introductory',intro_free_months=2,intro_first_charge_on=current_date+interval '2 months',next_due_date=current_date+interval '2 months';`);
    await assert.rejects(call,/cortesia comercial continua/);
    await assert.rejects(db.exec(`update food_store_subscriptions set intro_free_months=25`),/food_subscriptions_intro_terms_check/);
    await db.exec(`update food_store_subscriptions set intro_first_charge_on=current_date,next_due_date=current_date;`);
    assert.equal((await call()).rows[0].result.payment.amount,70);
    await db.exec(`insert into food_subscription_payments(store_id,subscription_id,plan_id,previous_plan_id,payment_intent,amount,due_date,provider,status,proof_required,proof_sent_at) values('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000010','plan_change',150,current_date,'manual','proof_sent',true,now());`);
    const payment=(await db.query("select id from food_subscription_payments where payment_intent='plan_change'")).rows[0];
    await db.query('select food_confirm_subscription_payment($1)',[payment.id]);
    const changed=(await db.query('select billing_mode,intro_free_months,intro_first_charge_on,billing_amount from food_store_subscriptions')).rows[0];
    assert.equal(changed.billing_mode,'standard');
    assert.equal(changed.intro_free_months,null);
    assert.equal(changed.intro_first_charge_on,null);
    assert.equal(Number(changed.billing_amount),150);
  }finally{await db.close()}
});
