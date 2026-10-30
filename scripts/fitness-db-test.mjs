import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const db = new PGlite();
const query = async (sql, params=[]) => (await db.query(sql,params)).rows;
const one = async (sql, params=[]) => (await query(sql,params))[0];
const rpc = async (name, params=[]) => (await one(`select public.${name}(${params.map((_,i)=>`$${i+1}`).join(',')}) result`,params)).result;
const authSessionIds = new Map();
const session = async (user,role='authenticated',aal='aal1',sessionId=authSessionIds.get(user)||randomUUID()) => {
  authSessionIds.set(user,sessionId);
  await db.exec('reset role');
  await db.query('insert into auth.sessions(id,user_id,not_after) values($1,$2,null) on conflict(id) do update set not_after=null',[sessionId,user]);
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,role,aal,session_id:sessionId})]);
  await db.exec(`set role ${role}`);
};

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,phone text,phone_confirmed_at timestamptz,raw_app_meta_data jsonb default '{}');
    create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
    create table public.food_stores(id uuid primary key default gen_random_uuid(),slug text unique,name text,active boolean default true,archived_at timestamptz,access_status text default 'online',approval_status text default 'approved',visual_theme jsonb default '{}',updated_at timestamptz default now(),pix_enabled boolean default false,pix_receipt_mode text default 'key',pix_key text,pix_copy_paste text,pix_holder_name text,city text,delivery_enabled boolean default true,pickup_enabled boolean default true,confirmation_payment_enabled boolean default true);
    create table public.food_store_users(store_id uuid references public.food_stores,user_id uuid references auth.users,role text,active boolean default true,must_change_password boolean default false,unique(store_id,user_id));
    create function public.food_is_store_admin(p_store uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.food_store_users where store_id=p_store and user_id=auth.uid() and active and role in ('owner','admin'))$$;
    create table public.food_platform_admins(user_id uuid,active boolean default true);
    create function public.food_is_platform_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.food_platform_admins where user_id=auth.uid() and active)$$;
    create table public.food_plans(id uuid primary key default gen_random_uuid(),code text,name text,active boolean default true,sort_order integer default 0);
    create table public.food_features(code text primary key,name text,description text,scope text,active boolean default true);
    create table public.food_plan_features(plan_id uuid references public.food_plans,feature_code text references public.food_features,enabled boolean default true,updated_at timestamptz default now(),primary key(plan_id,feature_code));
    create table public.food_store_subscriptions(id uuid default gen_random_uuid(),store_id uuid references public.food_stores,plan_id uuid references public.food_plans,status text,expires_at timestamptz,billing_amount numeric,due_day integer,next_due_date date,notes text,started_at timestamptz default now());
    create table public.food_subscription_payments(id uuid primary key default gen_random_uuid(),store_id uuid not null references public.food_stores(id));
    create function public.food_store_has_feature(p_store_id uuid,p_feature_code text) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.food_store_subscriptions ss join public.food_plan_features pf on pf.plan_id=ss.plan_id and pf.enabled where ss.store_id=p_store_id and ss.status in ('trial','active') and (ss.expires_at is null or ss.expires_at>now()) and pf.feature_code=p_feature_code)$$;
    create table public.food_categories(id uuid primary key default gen_random_uuid(),store_id uuid references public.food_stores,name text,slug text,unique(id,store_id),unique(store_id,slug));
    create table public.food_products(id uuid primary key default gen_random_uuid(),store_id uuid references public.food_stores,category_id uuid,name text,slug text,description text,price numeric check(price>=0),active boolean default true,foreign key(category_id,store_id) references public.food_categories(id,store_id),unique(store_id,slug));
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema auth,storage to authenticated,service_role;
    select set_config('request.jwt.claims','{}',false);
  `);
  for (const file of [
    '202610081500_foodweb_pwa_push.sql',
    '20261021143721_foodweb_optional_modules_foundation.sql',
    '20261021143724_foodweb_optional_modules_transactions.sql',
    '20261022215432_food_business_segments.sql',
    '20261027182514_food_fitness_segment_20261027.sql',
    '20261027182656_food_fitness_booking_20261027.sql',
    '20261027182706_food_fitness_workouts_20261027.sql',
    '20261027182716_food_fitness_catalog_drafts_20261027.sql',
    '20261027182721_food_fitness_pilot_waiver_20261027.sql',
    '20261030114215_service_professional_identity.sql',
    '20261030120000_food_fitness_phone_student_sessions.sql',
    '20261030143000_professional_content_student_reminders.sql',
    '20261030150000_food_fitness_phone_session_enforcement.sql',
  ]){
    try { await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8')); }
    catch (error) { throw new Error(`Migração ${file}: ${error.message} (posição ${error.position ?? 'n/a'})`); }
  }

  const owner=randomUUID(), nutritionist=randomUUID(), student=randomUUID(), student2=randomUUID(), stranger=randomUUID(), unverified=randomUUID(), master=randomUUID(), manager=randomUUID(), store=randomUUID(), other=randomUUID(), plan=randomUUID();
  await db.query(`insert into auth.users(id,email,phone,phone_confirmed_at) values
    ($1,'owner@example.invalid',null,null),
    ($2,'nutrition@example.invalid',null,null),
    ($3,null,'+5511999990001',now()),
    ($4,null,'+5511999990002',now()),
    ($5,'stranger@example.invalid',null,null),
    ($6,null,'+5511999990005',null),
    ($7,'master@example.invalid',null,null),
    ($8,'manager@example.invalid',null,null)`,
    [owner,nutritionist,student,student2,stranger,unverified,master,manager]);
  await db.query('insert into food_platform_admins(user_id,active) values($1,true)',[master]);
  await db.query("insert into food_plans(id,code,name) values($1,'demo','Teste')",[plan]);
  for (const [id,slug] of [[store,'fitness-test'],[other,'other-test']]) {
    await db.query('insert into food_stores(id,slug,name) values($1,$2,$2)',[id,slug]);
    await db.query('insert into food_store_users(store_id,user_id,role) values($1,$2,$3)',[id,owner,'owner']);
    await db.query("insert into food_store_subscriptions(store_id,plan_id,status,expires_at) values($1,$2,'trial',now()+interval '14 days')",[id,plan]);
  }
  await db.query("insert into food_store_users(store_id,user_id,role) values($1,$2,'attendant')",[store,nutritionist]);
  await db.query("insert into food_store_users(store_id,user_id,role) values($1,$2,'admin')",[store,manager]);
  await session(owner);
  const profile=await rpc('food_business_initialize',[store,'fitness']);
  assert.equal(profile.profile.primary_segment,'fitness');
  assert.equal(profile.modules.find(x=>x.code==='training').effective,true);
  await rpc('food_fitness_set_professional',[store,owner,true]);
  const otherProfile=await rpc('food_business_initialize',[other,'fitness']);
  assert.equal(otherProfile.profile.primary_segment,'fitness');
  await rpc('food_fitness_set_professional',[other,owner,true]);
  await rpc('food_service_professional_upsert',[store,owner,'Profissional Teste','training','CREF','000001-G/ES',true]);
  await rpc('food_service_professional_upsert',[other,owner,'Profissional Loja 2','training','CREF','000002-G/ES',true]);
  await db.exec('reset role');
  await db.query("update food_store_subscriptions set billing_amount=0,due_day=null,next_due_date=null,expires_at=null,notes='FITNESS_PILOT_WAIVER: piloto sem cobrança' where store_id=$1",[store]);
  await assert.rejects(()=>db.query('insert into food_subscription_payments(store_id) values($1)',[store]));
  try { await db.query('insert into food_subscription_payments(store_id) values($1)',[other]); }
  catch (error) { throw new Error(`Pagamento de outra loja: ${error.message}`); }
  await assert.rejects(()=>db.query("insert into food_products(store_id,name,slug,description,price,active) values($1,'Whey','whey','Rascunho',0,true)",[store]));
  await db.query("insert into food_products(store_id,name,slug,description,price,active) values($1,'Whey','whey','Rascunho',0,false)",[store]);
  await db.exec('reset role');
  assert.equal((await one('select count(*)::int as total from food_store_users where store_id=$1 and user_id=$2',[store,master])).total,0);
  await session(owner);
  const seed=await rpc('food_fitness_seed_workouts',[store]);
  assert.equal(seed.created_ids.length,3);
  await session(owner);
  const workouts=await rpc('food_fitness_list_workouts',[store]);
  assert.equal(workouts.length,3);
  assert.ok(workouts.every(w=>w.status==='draft'&&w.exercises.length===3));
  await rpc('food_fitness_approve_workout',[store,workouts[0].id]);

  const service=(await rpc('food_business_operate',[store,'services.save',JSON.stringify({name:'Acompanhamento de treino',kind:'training',price_cents:5000,duration_minutes:60,active:true})])).item;
  assert.equal((await rpc('food_business_public',[store])).services.length,0,'serviço sem prestador não aparece na vitrine');
  await assert.rejects(()=>rpc('food_fitness_publish_service',[store,service.id,'Cancelamento com antecedência mínima de 24 horas.','Reagendamento com antecedência mínima de 24 horas.',1440,true]),'serviço sem prestador não pode ser publicado');
  await rpc('food_service_professional_upsert',[store,nutritionist,'Nutricionista Teste','nutrition','CRN','000001/ES',true]);
  await assert.rejects(()=>rpc('food_service_professional_upsert',[other,nutritionist,'Nutricionista Teste','nutrition','CRN','000001/ES',true]),'conta não pertence à outra loja');
  await db.exec('reset role');
  await db.query("insert into food_business_entitlements(store_id,module_code,enabled,source,reason,granted_by) values($1,'nutrition',true,'exception','Teste de habilitação Nutrição',$2)",[store,owner]);
  await session(owner);
  await rpc('food_service_professional_assign',[store,service.id,owner]);
  await assert.rejects(()=>rpc('food_service_professional_assign',[store,service.id,nutritionist]),'CRN não pode prestar treino');
  await assert.rejects(()=>rpc('food_service_professional_upsert',[store,owner,'Profissional Teste','nutrition','CRN','000001/ES',true]),'não altera habilitação com treino ativo');
  await session(nutritionist);
  const ownServices=await rpc('food_service_professional_mine');
  assert.equal(ownServices.length,1);
  assert.equal(ownServices[0].store_id,store);
  assert.deepEqual(ownServices[0].services,[]);
  await assert.rejects(()=>rpc('food_service_professional_staff',[store]),'profissional não acessa lista da equipe');
  await session(owner);
  await rpc('food_fitness_publish_service',[store,service.id,'Cancelamento com antecedência mínima de 24 horas.','Reagendamento com antecedência mínima de 24 horas.',1440,true]);
  const publicService=(await rpc('food_business_public',[store])).services[0];
  assert.equal(publicService.professional.name,'Profissional Teste');
  assert.equal(publicService.professional.council,'CREF');
  await rpc('food_professional_publication_save',[store,null,'Dica de treino','Conteúdo educativo aprovado por profissional.','training','storefront']);
  const draft=(await rpc('food_professional_publication_list',[store]))[0];
  assert.equal(draft.author_council,'CREF');
  await session(student);
  await assert.rejects(()=>rpc('food_professional_publication_approve',[store,draft.id,new Date(Date.now()+60_000).toISOString()]),'outro usuário não aprova');
  await session(owner);
  const scheduled=await rpc('food_professional_publication_approve',[store,draft.id,new Date(Date.now()+300_000).toISOString()]);
  assert.equal(scheduled.status,'scheduled');
  assert.equal(scheduled.approved_by,owner,'aprovação explícita fica registrada no profissional autor');
  await rpc('food_professional_publication_cancel',[store,draft.id]);
  const cancelled=await rpc('food_professional_publication_list',[store]);
  assert.equal(cancelled[0].status,'cancelled');
  const nutritionService=(await rpc('food_business_operate',[store,'services.save',JSON.stringify({name:'Consulta de Nutrição',kind:'nutrition',price_cents:10000,duration_minutes:40,active:true})])).item;
  await rpc('food_service_professional_assign',[store,nutritionService.id,nutritionist]);
  const date=new Date(Date.now()+5*86400000);
  const localDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  const weekday=new Date(`${localDate}T12:00:00Z`).getUTCDay();
  await rpc('food_fitness_save_window',[store,null,owner,weekday,'09:00','12:00','America/Sao_Paulo',60,10]);
  const offers=await rpc('food_fitness_list_slots',[store,service.id,localDate,1]);
  assert.ok(offers.slots.length>=2);
  assert.ok(offers.cancel_policy.includes('24 horas'));

  await session(student);
  await assert.rejects(()=>rpc('food_service_professional_assign',[store,service.id,student]),'aluno não atribui prestador');
  await assert.rejects(()=>rpc('food_fitness_book',[store,service.id,offers.slots[0].starts_at,owner,true]));
  const unregistered=await rpc('food_fitness_student_status_v1',[store]);
  assert.equal(unregistered.registered,false);
  assert.deepEqual(await rpc('food_fitness_list_workouts',[store]),[]);
  assert.equal((await query('select * from food_fitness_workouts')).length,0);
  await session(unverified);
  await assert.rejects(()=>rpc('food_fitness_student_status_v1',[store]));
  await assert.rejects(()=>rpc('food_fitness_register_student',[store,'Sem telefone verificado','']));
  await session(student);
  const studentProfile=await rpc('food_fitness_register_student',[store,'Aluno Teste','']);
  assert.equal(studentProfile.professional,false);
  assert.equal((await rpc('food_fitness_student_status_v1',[store])).registered,true);
  const firstClaim=await rpc('food_fitness_student_session_v1',[store,studentProfile.client_id,'claim']);
  assert.equal(firstClaim.authorized,true);
  const authOptions=await rpc('food_fitness_student_authorization_list',[store]);
  assert.ok(authOptions.professionals.some(item=>item.user_id===nutritionist&&item.council==='CRN'));
  await rpc('food_fitness_student_authorize_professional',[store,nutritionist,'nutrition',true]);
  await rpc('food_fitness_student_authorize_professional',[store,owner,'training',true]);
  await session(nutritionist);
  assert.ok((await rpc('food_professional_authorized_students',[store])).some(item=>item.student_user_id===student&&item.purpose==='nutrition'));
  assert.ok((await rpc('food_professional_message_recipients',[store])).length===0,'aluno não entra na lista de envio sem opt-in');
  await session(student);
  await rpc('food_fitness_student_message_permission_set',[store,nutritionist,true]);
  await session(nutritionist);
  const recipients=await rpc('food_professional_message_recipients',[store]);
  assert.ok(recipients.some(item=>item.student_user_id===student&&item.nutrition_authorized),'mensagem clínica só lista aluno que também autorizou leitura clínica');
  const messageDraft=await rpc('food_professional_publication_save',[store,null,'Retorno da consulta','Conteúdo profissional individual, aprovado pela nutricionista.','nutrition','student_message',student]);
  await session(owner);
  await assert.rejects(()=>rpc('food_professional_publication_approve',[store,messageDraft.id,new Date(Date.now()+60_000).toISOString()]),'aprovação não pode vir de outro profissional');
  await session(nutritionist);
  const messageScheduled=await rpc('food_professional_publication_approve',[store,messageDraft.id,new Date(Date.now()+300_000).toISOString()]);
  assert.equal(messageScheduled.status,'scheduled');
  await session(student);
  await assert.rejects(()=>rpc('food_professional_publication_list',[store]),'aluno não lê rascunhos/calendário profissional');
  await db.exec('reset role');
  await db.query("update food_professional_publications set scheduled_at=now()-interval '1 second' where id=$1",[messageDraft.id]);
  await rpc('food_professional_publication_publish_due',[]);
  await session(student);
  const inboxMessages=await rpc('food_fitness_student_messages_list',[store]);
  assert.equal(inboxMessages.length,1);
  assert.equal(inboxMessages[0].author_council,'CRN');
  assert.equal((await query('select * from food_professional_publications where id=$1',[messageDraft.id])).length,0,'aluno recebe conteúdo pelo inbox sem leitura direta da tabela profissional');
  await rpc('food_fitness_student_message_mark_seen',[store,inboxMessages[0].id]);
  await rpc('food_fitness_student_message_permission_set',[store,nutritionist,true]);
  await session(nutritionist);
  const revocableDraft=await rpc('food_professional_publication_save',[store,null,'Aviso comercial','Uma atualização da loja para o aluno.','commercial','student_message',student]);
  await rpc('food_professional_publication_approve',[store,revocableDraft.id,new Date(Date.now()+300_000).toISOString()]);
  await session(student);
  await rpc('food_fitness_student_message_permission_set',[store,nutritionist,false]);
  await db.exec('reset role');
  await db.query("update food_professional_publications set scheduled_at=now()-interval '1 second' where id=$1",[revocableDraft.id]);
  await rpc('food_professional_publication_publish_due',[]);
  await session(nutritionist);
  assert.equal((await rpc('food_professional_publication_list',[store])).find(item=>item.id===revocableDraft.id).status,'cancelled','revogar opt-in impede envio agendado');
  await session(student);
  const hydration=await rpc('food_fitness_student_reminder_save',[store,null,'hydration','Lembrete de hidratação','08:00','America/Sao_Paulo',[1,2,3,4,5],'in_app']);
  assert.equal(hydration.status,'active');
  const preference=await rpc('food_fitness_student_reminders_list',[store]);
  assert.ok(preference.reminders.some(item=>item.id===hydration.id&&item.channel==='in_app'));
  await rpc('food_fitness_student_reminder_action',[store,hydration.id,'pause',new Date(Date.now()+86_400_000).toISOString()]);
  assert.equal((await rpc('food_fitness_student_reminders_list',[store])).reminders.find(item=>item.id===hydration.id).status,'paused');
  await rpc('food_fitness_student_reminder_action',[store,hydration.id,'cancel',null]);
  assert.equal((await rpc('food_fitness_student_reminders_list',[store])).reminders.find(item=>item.id===hydration.id).status,'cancelled');
  await rpc('food_fitness_student_authorize_professional',[store,nutritionist,'nutrition',false]);
  await session(nutritionist);
  assert.equal((await rpc('food_professional_authorized_students',[store])).length,0);
  await session(student);
  const booking=await rpc('food_fitness_book',[store,service.id,offers.slots[0].starts_at,owner,true]);
  assert.equal(booking.status,'scheduled');
  const own=await rpc('food_fitness_my_appointments',[store]);
  assert.equal(own.appointments.length,1);
  assert.ok(own.appointments[0].cancel_policy.includes('24 horas'));
  assert.equal((await query('select * from food_business_appointments where id=$1',[booking.appointment_id])).length,1);
  await assert.rejects(()=>rpc('food_fitness_book',[store,service.id,offers.slots[0].starts_at,owner,true]));
  await assert.rejects(()=>rpc('food_fitness_book',[other,service.id,offers.slots[0].starts_at,owner,true]));
  const afterBooking=await rpc('food_fitness_list_slots',[store,service.id,localDate,1]);
  assert.ok(!afterBooking.slots.some(s=>s.starts_at===booking.starts_at));
  const cancellation=await rpc('food_fitness_cancel',[booking.appointment_id]);
  assert.equal(cancellation.status,'cancelled');
  const events=await one('select count(*)::integer as total from food_fitness_appointment_events where appointment_id=$1',[booking.appointment_id]);
  assert.equal(events.total,2);
  const exposed=await query('select * from food_business_appointments where store_id=$1',[other]);
  assert.equal(exposed.length,0);
  await session(owner);
  const storeWorkouts=await rpc('food_fitness_list_workouts',[store]);
  const approved=storeWorkouts.find(item=>item.status==='approved');
  const secondDraft=storeWorkouts.find(item=>item.status==='draft'&&item.id!==approved.id);
  assert.ok(approved&&secondDraft);
  await rpc('food_fitness_assign_workout',[store,approved.id,studentProfile.client_id]);
  await rpc('food_fitness_approve_workout',[store,secondDraft.id]);
  await session(student);
  assert.equal((await rpc('food_fitness_list_workouts',[store])).length,1);
  assert.equal((await one('select count(*)::integer as total from food_fitness_workouts')).total,1);
  assert.equal((await one('select count(*)::integer as total from food_fitness_exercises')).total,3);
  assert.equal((await one('select count(*)::integer as total from food_fitness_professionals')).total,0);
  await rpc('food_fitness_student_authorize_professional',[store,owner,'training',false]);
  assert.equal((await one('select count(*)::integer as total from food_fitness_workouts')).total,0,'revogação bloqueia leitura direta da ficha');
  assert.equal((await one('select count(*)::integer as total from food_fitness_exercises')).total,0,'revogação bloqueia leitura direta dos exercícios');
  await session(manager);
  assert.deepEqual(await rpc('food_fitness_list_workouts',[store]),[],'admin comercial não lê fichas clínicas');
  await assert.rejects(()=>rpc('food_professional_publication_list',[store]),'admin comercial não lê rascunhos profissionais');
  await assert.rejects(()=>rpc('food_fitness_list_students',[store]),'admin comercial não consulta alunos como prontuário');
  assert.equal((await query('select * from food_fitness_workouts where store_id=$1',[store])).length,0);
  const studentSessionId=authSessionIds.get(student);

  await session(student2);
  const secondProfile=await rpc('food_fitness_register_student',[store,'Outra Aluna','']);
  const secondClaim=await rpc('food_fitness_student_session_v1',[store,secondProfile.client_id,'claim']);
  assert.equal(secondClaim.authorized,true);
  await rpc('food_fitness_student_authorize_professional',[store,owner,'training',true]);
  await session(owner);
  await rpc('food_fitness_assign_workout',[store,secondDraft.id,secondProfile.client_id]);
  await session(student2);
  const onlySecond=await rpc('food_fitness_list_workouts',[store]);
  assert.equal(onlySecond.length,1);
  assert.equal(onlySecond[0].id,secondDraft.id);
  assert.equal((await query('select * from food_business_appointments where id=$1',[booking.appointment_id])).length,0);
  assert.deepEqual(await rpc('food_fitness_list_workouts',[other]),[],'aluno de outra loja não recebe fichas');
  await session(student);
  assert.equal((await rpc('food_fitness_list_workouts',[store])).some(row=>row.id===secondDraft.id),false);
  await session(owner);
  assert.equal((await rpc('food_fitness_list_students',[store])).students.length,1);
  await assert.rejects(()=>rpc('food_fitness_student_session_admin_list_v1',[store]));
  await session(owner,'authenticated','aal2');
  const adminSessions=await rpc('food_fitness_student_session_admin_list_v1',[store]);
  assert.equal(adminSessions.students.length,2);
  assert.ok(adminSessions.students.every(item=>item.session_active));

  await session(student);
  const otherUnregistered=await rpc('food_fitness_student_status_v1',[other]);
  assert.equal(otherUnregistered.registered,false);
  const otherStoreStudentProfile=await rpc('food_fitness_register_student',[other,'Aluno Teste Loja 2','']);
  const otherClaim=await rpc('food_fitness_student_session_v1',[other,otherStoreStudentProfile.client_id,'claim']);
  assert.equal(otherClaim.authorized,true);
  await rpc('food_fitness_student_authorize_professional',[other,owner,'training',true]);
  await session(owner);
  const otherSeed=await rpc('food_fitness_seed_workouts',[other]);
  const otherWorkouts=await rpc('food_fitness_list_workouts',[other]);
  await rpc('food_fitness_approve_workout',[other,otherWorkouts[0].id]);
  await rpc('food_fitness_assign_workout',[other,otherWorkouts[0].id,otherStoreStudentProfile.client_id]);
  await session(student);
  const otherStoreRows=await rpc('food_fitness_list_workouts',[other]);
  const thisStoreRows=await rpc('food_fitness_list_workouts',[store]);
  assert.equal(otherStoreRows.length,1);
  assert.equal(otherStoreRows[0].id,otherWorkouts[0].id);
  assert.equal(thisStoreRows.length,1);
  assert.equal(thisStoreRows[0].id,approved.id);
  assert.equal(thisStoreRows.some(row=>row.id===otherStoreRows[0].id),false);

  const newStudentSessionId=randomUUID();
  await session(student,'authenticated','aal1',newStudentSessionId);
  const otherStoreLimit=await rpc('food_fitness_student_session_v1',[other,otherStoreStudentProfile.client_id,'claim']);
  assert.equal(otherStoreLimit.authorized,false);
  assert.equal(otherStoreLimit.reason,'SESSION_LIMIT');
  const deniedSecondSession=await rpc('food_fitness_student_session_v1',[store,studentProfile.client_id,'claim']);
  assert.equal(deniedSecondSession.authorized,false);
  assert.equal(deniedSecondSession.reason,'SESSION_LIMIT');
  await assert.rejects(()=>rpc('food_fitness_list_workouts',[store]));
  assert.equal((await query('select * from food_business_appointments where id=$1',[booking.appointment_id])).length,0);
  await session(owner,'authenticated','aal2');
  const released=await rpc('food_fitness_student_session_admin_v1',[store,studentProfile.client_id,'lost_device']);
  assert.equal(released.revoked_count,1);
  await session(student,'authenticated','aal1',studentSessionId);
  const oldSessionClaim=await rpc('food_fitness_student_session_v1',[store,studentProfile.client_id,'claim']);
  assert.equal(oldSessionClaim.authorized,false);
  assert.equal(oldSessionClaim.reason,'SESSION_REVOKED');
  await assert.rejects(()=>rpc('food_fitness_list_workouts',[store]));
  await assert.rejects(()=>rpc('food_fitness_student_reminders_list',[store]));
  assert.equal((await query('select * from food_fitness_student_reminders where store_id=$1',[store])).length,0,'sessão revogada não lê lembretes por tabela');
  await session(student,'authenticated','aal1',newStudentSessionId);
  const refreshedClaim=await rpc('food_fitness_student_session_v1',[store,studentProfile.client_id,'claim']);
  assert.equal(refreshedClaim.authorized,true);
  await session(stranger,'authenticated','aal2');
  await assert.rejects(()=>rpc('food_fitness_student_session_admin_list_v1',[store]));
  await assert.rejects(()=>rpc('food_fitness_student_session_admin_v1',[store,studentProfile.client_id,'lost_device']));
  assert.equal((await query('select * from food_fitness_workouts')).length,0);
  console.log('OK Fitness: sessão por aluno/loja, MFA de Admin e isolamento entre alunos e lojas.');
} finally {
  await db.close();
}
