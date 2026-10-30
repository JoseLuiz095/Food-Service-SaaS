-- shared_future: conteúdo profissional aprovado e rotinas configuráveis pelo aluno.
-- Conteúdo público e lembretes não armazenam prontuário, prescrição, dieta ou metas clínicas.
-- Revisar histórico e diff no Supabase compartilhado antes de aplicar.
begin;

create table public.food_professional_publications (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id) on delete cascade,
  professional_user_id uuid not null,
  title text not null check (length(trim(title)) between 3 and 120),
  body text not null check (length(trim(body)) between 3 and 3000),
  category text not null check (category in ('commercial','training','nutrition')),
  channel text not null default 'storefront' check (channel in ('storefront','student_message')),
  recipient_student_user_id uuid,
  status text not null default 'draft' check (status in ('draft','scheduled','published','cancelled')),
  scheduled_at timestamptz,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  published_at timestamptz,
  cancelled_at timestamptz,
  author_name text not null,
  author_council text not null check (author_council in ('CREF','CRN','OUTRO')),
  author_registration text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (store_id,professional_user_id) references public.food_service_professionals(store_id,user_id),
  unique (id,store_id),
  check ((status='draft' and approved_by is null and approved_at is null and scheduled_at is null and published_at is null)
    or (status='scheduled' and approved_by=professional_user_id and approved_at is not null and scheduled_at is not null and published_at is null)
    or (status='published' and approved_by=professional_user_id and approved_at is not null and scheduled_at is not null and published_at is not null)
    or (status='cancelled' and cancelled_at is not null)),
  check ((channel='storefront' and recipient_student_user_id is null) or (channel='student_message' and recipient_student_user_id is not null))
);
create index food_professional_publications_calendar_idx on public.food_professional_publications(store_id,professional_user_id,scheduled_at desc);
create index food_professional_publications_public_idx on public.food_professional_publications(store_id,published_at desc) where status='published';
alter table public.food_professional_publications enable row level security;
revoke all on public.food_professional_publications from public,anon,authenticated;
grant select on public.food_professional_publications to authenticated;
create policy food_professional_publications_read on public.food_professional_publications for select to authenticated
using (professional_user_id=(select auth.uid()));

create table public.food_fitness_student_reminders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  student_user_id uuid not null,
  kind text not null check (kind in ('workout','appointment','hydration','routine')),
  label text not null check (length(trim(label)) between 2 and 100),
  reminder_time time not null,
  timezone text not null,
  weekdays smallint[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  channel text not null default 'in_app' check (channel in ('in_app','push')),
  status text not null default 'active' check (status in ('active','paused','cancelled')),
  paused_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  foreign key (store_id,student_user_id) references public.food_fitness_students(store_id,user_id),
  unique (id,store_id),
  check (length(timezone) between 1 and 80),
  check ((status='paused' and paused_until is not null) or status<>'paused'),
  check ((status='cancelled' and cancelled_at is not null) or status<>'cancelled')
);
create index food_fitness_student_reminders_due_idx on public.food_fitness_student_reminders(status,reminder_time,store_id) where status<>'cancelled';
alter table public.food_professional_publications add constraint food_professional_publication_recipient_fk
  foreign key(store_id,recipient_student_user_id) references public.food_fitness_students(store_id,user_id);
alter table public.food_fitness_student_reminders enable row level security;
revoke all on public.food_fitness_student_reminders from public,anon,authenticated;
grant select on public.food_fitness_student_reminders to authenticated;
create policy food_fitness_student_reminders_read on public.food_fitness_student_reminders for select to authenticated
using (student_user_id=(select auth.uid()));

create table public.food_fitness_professional_authorizations (
  store_id uuid not null,
  student_user_id uuid not null,
  professional_user_id uuid not null,
  purpose text not null check (purpose in ('training','nutrition')),
  authorized_at timestamptz not null default now(),
  revoked_at timestamptz,
  active boolean not null default true,
  primary key (store_id,student_user_id,professional_user_id,purpose),
  foreign key (store_id,student_user_id) references public.food_fitness_students(store_id,user_id),
  foreign key (store_id,professional_user_id) references public.food_service_professionals(store_id,user_id),
  check ((active and revoked_at is null) or (not active and revoked_at is not null))
);
alter table public.food_fitness_professional_authorizations enable row level security;
revoke all on public.food_fitness_professional_authorizations from public,anon,authenticated;
grant select on public.food_fitness_professional_authorizations to authenticated;
create policy food_fitness_authorizations_read on public.food_fitness_professional_authorizations for select to authenticated
using (student_user_id=(select auth.uid()) or professional_user_id=(select auth.uid()));

-- Consentimento de comunicação é separado da autorização para ler informação clínica.
create table public.food_fitness_student_message_permissions (
  store_id uuid not null,
  student_user_id uuid not null,
  professional_user_id uuid not null,
  enabled boolean not null default true,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key(store_id,student_user_id,professional_user_id),
  foreign key(store_id,student_user_id) references public.food_fitness_students(store_id,user_id),
  foreign key(store_id,professional_user_id) references public.food_service_professionals(store_id,user_id),
  check((enabled and revoked_at is null) or (not enabled and revoked_at is not null))
);
alter table public.food_fitness_student_message_permissions enable row level security;
revoke all on public.food_fitness_student_message_permissions from public,anon,authenticated;
grant select on public.food_fitness_student_message_permissions to authenticated;
create policy food_fitness_message_permissions_read on public.food_fitness_student_message_permissions for select to authenticated
using(student_user_id=(select auth.uid()) or professional_user_id=(select auth.uid()));

create table public.food_professional_message_deliveries (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null,
  store_id uuid not null,
  student_user_id uuid not null,
  status text not null default 'sent' check(status in ('sent','seen','cancelled')),
  sent_at timestamptz not null default now(),
  seen_at timestamptz,
  unique(publication_id,student_user_id),
  foreign key(publication_id,store_id) references public.food_professional_publications(id,store_id) on delete cascade,
  foreign key(store_id,student_user_id) references public.food_fitness_students(store_id,user_id)
);
create index food_professional_message_inbox_idx on public.food_professional_message_deliveries(student_user_id,sent_at desc);
alter table public.food_professional_message_deliveries enable row level security;
revoke all on public.food_professional_message_deliveries from public,anon,authenticated;
grant select on public.food_professional_message_deliveries to authenticated;
create policy food_professional_message_deliveries_read on public.food_professional_message_deliveries for select to authenticated
using(student_user_id=(select auth.uid()));

create table public.food_fitness_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null,
  store_id uuid not null,
  student_user_id uuid not null,
  planned_for timestamptz not null,
  status text not null default 'queued' check (status in ('queued','sending','sent','seen','failed','cancelled')),
  attempts smallint not null default 0 check (attempts between 0 and 5),
  claimed_at timestamptz,
  delivered_at timestamptz,
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (reminder_id,store_id) references public.food_fitness_student_reminders(id,store_id) on delete cascade,
  foreign key (store_id,student_user_id) references public.food_fitness_students(store_id,user_id),
  unique (reminder_id,planned_for)
);
create index food_fitness_reminder_delivery_inbox_idx on public.food_fitness_reminder_deliveries(student_user_id,planned_for desc);
alter table public.food_fitness_reminder_deliveries enable row level security;
revoke all on public.food_fitness_reminder_deliveries from public,anon,authenticated;
grant select on public.food_fitness_reminder_deliveries to authenticated;
create policy food_fitness_reminder_deliveries_read on public.food_fitness_reminder_deliveries for select to authenticated
using (student_user_id=(select auth.uid()));

-- Assinaturas de alunos ficam em tabela própria: o push geral de pedidos
-- continua endereçado somente às assinaturas da equipe da loja.
create table public.food_fitness_student_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  user_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (store_id,user_id) references public.food_fitness_students(store_id,user_id) on delete cascade,
  unique (store_id,endpoint)
);
create index food_fitness_student_push_active_idx on public.food_fitness_student_push_subscriptions(store_id,user_id,active);
alter table public.food_fitness_student_push_subscriptions enable row level security;
revoke all on public.food_fitness_student_push_subscriptions from public,anon,authenticated;
grant select,insert,update on public.food_fitness_student_push_subscriptions to authenticated;
create policy food_fitness_student_push_select_self on public.food_fitness_student_push_subscriptions for select to authenticated using (user_id=(select auth.uid()));
create policy food_fitness_student_push_insert_self on public.food_fitness_student_push_subscriptions for insert to authenticated with check (user_id=(select auth.uid()) and exists(select 1 from public.food_fitness_students st where st.store_id=food_fitness_student_push_subscriptions.store_id and st.user_id=(select auth.uid())));
create policy food_fitness_student_push_update_self on public.food_fitness_student_push_subscriptions for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()) and exists(select 1 from public.food_fitness_students st where st.store_id=food_fitness_student_push_subscriptions.store_id and st.user_id=(select auth.uid())));

create function public.food_professional_publication_list(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.food_service_professionals p join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active where p.store_id=p_store and p.user_id=auth.uid() and p.active) then
    raise exception 'Acesso negado ao calendário profissional.' using errcode='42501';
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from (
    select id,title,body,category,channel,recipient_student_user_id,status,scheduled_at,approved_at,published_at,cancelled_at,author_name,author_council,author_registration,created_at
    from public.food_professional_publications where store_id=p_store and professional_user_id=auth.uid()
    order by created_at desc limit 100
  ) x);
end; $$;

create function public.food_professional_publication_save(p_store uuid,p_id uuid,p_title text,p_body text,p_category text,p_channel text,p_recipient uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare profile public.food_service_professionals%rowtype; result public.food_professional_publications%rowtype; target uuid:=coalesce(p_id,gen_random_uuid());
begin
  select p.* into profile from public.food_service_professionals p join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active
    where p.store_id=p_store and p.user_id=auth.uid() and p.active for update;
  if profile.user_id is null then raise exception 'Conta profissional ativa nesta loja é obrigatória.' using errcode='42501'; end if;
  if (p_category='training' and (profile.kind<>'training' or profile.council<>'CREF')) or (p_category='nutrition' and (profile.kind<>'nutrition' or profile.council<>'CRN')) or p_category not in ('commercial','training','nutrition') then
    raise exception 'A categoria exige profissional com registro compatível.' using errcode='42501';
  end if;
  if p_channel not in ('storefront','student_message') or length(trim(p_title)) not between 3 and 120 or length(trim(p_body)) not between 3 and 3000
    or (p_channel='storefront' and p_recipient is not null) or (p_channel='student_message' and p_recipient is null) then raise exception 'A publicação precisa de canal e destinatário válidos.' using errcode='22023'; end if;
  if p_channel='student_message' and not exists(select 1 from public.food_fitness_student_message_permissions mp where mp.store_id=p_store and mp.student_user_id=p_recipient and mp.professional_user_id=auth.uid() and mp.enabled) then
    raise exception 'O aluno não autorizou receber mensagens deste profissional.' using errcode='42501';
  end if;
  if p_channel='student_message' and p_category in ('training','nutrition') and not exists(select 1 from public.food_fitness_professional_authorizations a where a.store_id=p_store and a.student_user_id=p_recipient and a.professional_user_id=auth.uid() and a.purpose=p_category and a.active) then
    raise exception 'Conteúdo de treinamento ou nutrição exige autorização clínica correspondente do aluno.' using errcode='42501';
  end if;
  if (p_category='nutrition' and not food_business_private.module_enabled(p_store,'nutrition')) or (p_category='training' and not food_business_private.module_enabled(p_store,'training')) then
    raise exception 'O módulo profissional correspondente não está habilitado nesta loja.' using errcode='42501';
  end if;
  insert into public.food_professional_publications(id,store_id,professional_user_id,title,body,category,channel,recipient_student_user_id,author_name,author_council,author_registration)
  values(target,p_store,auth.uid(),trim(p_title),trim(p_body),p_category,p_channel,p_recipient,profile.name,profile.council,profile.registration)
  on conflict(id) do update set title=excluded.title,body=excluded.body,category=excluded.category,channel=excluded.channel,recipient_student_user_id=excluded.recipient_student_user_id,updated_at=now()
    where food_professional_publications.store_id=p_store and food_professional_publications.professional_user_id=auth.uid() and food_professional_publications.status='draft'
  returning * into result;
  if result.id is null then raise exception 'Somente rascunho próprio pode ser editado.' using errcode='42501'; end if;
  insert into public.food_business_audit(store_id,actor_id,action,details) values(p_store,auth.uid(),'professional.publication_saved',jsonb_build_object('publication_id',target,'category',p_category));
  return jsonb_build_object('id',result.id,'status',result.status,'channel',result.channel,'recipient_student_user_id',result.recipient_student_user_id,'author_name',result.author_name,'author_council',result.author_council,'author_registration',result.author_registration);
end; $$;

create function public.food_professional_publication_approve(p_store uuid,p_id uuid,p_scheduled_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.food_professional_publications%rowtype;
begin
  if p_scheduled_at is null or p_scheduled_at<now()+interval '1 minute' then raise exception 'Escolha um horário futuro para programar.' using errcode='22023'; end if;
  update public.food_professional_publications p set status='scheduled',scheduled_at=p_scheduled_at,approved_by=auth.uid(),approved_at=now(),updated_at=now()
    where p.id=p_id and p.store_id=p_store and p.professional_user_id=auth.uid() and p.status='draft'
      and exists(select 1 from public.food_service_professionals sp join public.food_store_users u on u.store_id=sp.store_id and u.user_id=sp.user_id and u.active where sp.store_id=p.store_id and sp.user_id=auth.uid() and sp.active and sp.name=p.author_name and sp.council=p.author_council and sp.registration=p.author_registration)
      and (p.channel='storefront' and p.recipient_student_user_id is null or p.channel='student_message' and exists(select 1 from public.food_fitness_student_message_permissions mp where mp.store_id=p_store and mp.student_user_id=p.recipient_student_user_id and mp.professional_user_id=auth.uid() and mp.enabled))
      and (p.channel='storefront' or p.category not in ('training','nutrition') or exists(select 1 from public.food_fitness_professional_authorizations a where a.store_id=p_store and a.student_user_id=p.recipient_student_user_id and a.professional_user_id=auth.uid() and a.purpose=p.category and a.active))
      and (p.category='commercial' or food_business_private.module_enabled(p_store,p.category))
      and ((p.category='training' and exists(select 1 from public.food_service_professionals sp where sp.store_id=p_store and sp.user_id=auth.uid() and sp.kind='training' and sp.council='CREF'))
        or (p.category='nutrition' and exists(select 1 from public.food_service_professionals sp where sp.store_id=p_store and sp.user_id=auth.uid() and sp.kind='nutrition' and sp.council='CRN')) or p.category='commercial')
    returning p.* into result;
  if result.id is null then raise exception 'Revise o rascunho; somente o profissional responsável pode aprovar e programar.' using errcode='42501'; end if;
  insert into public.food_business_audit(store_id,actor_id,action,details) values(p_store,auth.uid(),'professional.publication_approved',jsonb_build_object('publication_id',p_id,'scheduled_at',p_scheduled_at));
  return jsonb_build_object('id',result.id,'status',result.status,'scheduled_at',result.scheduled_at,'approved_by',result.approved_by,'approved_at',result.approved_at,'author_name',result.author_name,'author_council',result.author_council,'author_registration',result.author_registration);
end; $$;

create function public.food_professional_publication_cancel(p_store uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.food_professional_publications%rowtype;
begin
  update public.food_professional_publications p set status='cancelled',cancelled_at=now(),updated_at=now()
    where p.id=p_id and p.store_id=p_store and p.status in ('draft','scheduled') and (p.professional_user_id=auth.uid() or exists(select 1 from public.food_store_users u where u.store_id=p_store and u.user_id=auth.uid() and u.active and u.role in ('owner','admin')))
    returning p.* into result;
  if result.id is null then raise exception 'Publicação não pode mais ser cancelada.' using errcode='42501'; end if;
  insert into public.food_business_audit(store_id,actor_id,action,details) values(p_store,auth.uid(),'professional.publication_cancelled',jsonb_build_object('publication_id',p_id));
  return jsonb_build_object('id',result.id,'status',result.status,'cancelled_at',result.cancelled_at);
end; $$;

create function public.food_professional_publication_publish_due()
returns integer language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  update public.food_professional_publications p set status='cancelled',cancelled_at=now(),updated_at=now()
  where p.status='scheduled' and p.channel='student_message' and p.scheduled_at<=now() and (p.category='commercial' or food_business_private.module_enabled(p.store_id,p.category))
    and (not exists(select 1 from public.food_fitness_student_message_permissions mp where mp.store_id=p.store_id and mp.student_user_id=p.recipient_student_user_id and mp.professional_user_id=p.professional_user_id and mp.enabled)
      or p.category in ('training','nutrition') and not exists(select 1 from public.food_fitness_professional_authorizations a where a.store_id=p.store_id and a.student_user_id=p.recipient_student_user_id and a.professional_user_id=p.professional_user_id and a.purpose=p.category and a.active));
  update public.food_professional_publications p set status='published',published_at=now(),updated_at=now()
  where p.status='scheduled' and p.scheduled_at<=now()
    and exists(select 1 from public.food_service_professionals sp join public.food_store_users u on u.store_id=sp.store_id and u.user_id=sp.user_id and u.active where sp.store_id=p.store_id and sp.user_id=p.professional_user_id and sp.active and sp.name=p.author_name and sp.council=p.author_council and sp.registration=p.author_registration)
    and exists(select 1 from public.food_stores s where s.id=p.store_id and s.active and s.archived_at is null and s.access_status='online')
    and (p.category='commercial' or food_business_private.module_enabled(p.store_id,p.category))
    and (p.channel='storefront' or exists(select 1 from public.food_fitness_student_message_permissions mp where mp.store_id=p.store_id and mp.student_user_id=p.recipient_student_user_id and mp.professional_user_id=p.professional_user_id and mp.enabled)
      and (p.category not in ('training','nutrition') or exists(select 1 from public.food_fitness_professional_authorizations a where a.store_id=p.store_id and a.student_user_id=p.recipient_student_user_id and a.professional_user_id=p.professional_user_id and a.purpose=p.category and a.active)));
  get diagnostics changed=row_count;
  insert into public.food_professional_message_deliveries(publication_id,store_id,student_user_id)
    select p.id,p.store_id,p.recipient_student_user_id from public.food_professional_publications p
    where p.status='published' and p.channel='student_message' and p.published_at>=now()-interval '1 minute'
    on conflict(publication_id,student_user_id) do nothing;
  return changed;
end; $$;

create function public.food_fitness_student_reminders_list(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.food_fitness_students where store_id=p_store and user_id=auth.uid()) then raise exception 'Somente o próprio aluno pode consultar seus lembretes.' using errcode='42501'; end if;
  return jsonb_build_object(
    'reminders',(select coalesce(jsonb_agg(to_jsonb(r) order by r.reminder_time,r.id),'[]'::jsonb) from public.food_fitness_student_reminders r where r.store_id=p_store and r.student_user_id=auth.uid()),
    'inbox',(select coalesce(jsonb_agg(to_jsonb(x) order by x.planned_for desc),'[]'::jsonb) from (
      select d.id,d.reminder_id,d.planned_for,d.status,r.label,r.kind from public.food_fitness_reminder_deliveries d
      join public.food_fitness_student_reminders r on r.id=d.reminder_id and r.store_id=d.store_id
      where d.store_id=p_store and d.student_user_id=auth.uid() and d.planned_for>now()-interval '7 days' and d.status<>'cancelled'
      order by d.planned_for desc limit 50
    ) x)
  );
end; $$;

create function public.food_fitness_student_reminder_save(p_store uuid,p_id uuid,p_kind text,p_label text,p_time time,p_timezone text,p_weekdays smallint[],p_channel text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.food_fitness_student_reminders%rowtype; target uuid:=coalesce(p_id,gen_random_uuid());
begin
  if not exists(select 1 from public.food_fitness_students where store_id=p_store and user_id=auth.uid()) then raise exception 'Somente o próprio aluno pode configurar lembretes.' using errcode='42501'; end if;
  if not food_business_private.module_enabled(p_store,'clients') or p_kind not in ('workout','appointment','hydration','routine') or length(trim(p_label)) not between 2 and 100 or p_time is null or cardinality(p_weekdays) not between 1 and 7 or not (p_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]) or p_timezone not in (select name from pg_timezone_names) or p_channel not in ('in_app','push') then
    raise exception 'Preferência de lembrete inválida ou módulo indisponível.' using errcode='22023';
  end if;
  if p_channel='push' and not exists(select 1 from public.food_fitness_student_push_subscriptions ps where ps.store_id=p_store and ps.user_id=auth.uid() and ps.active) then raise exception 'Ative notificações push neste aparelho antes de escolher esse canal.' using errcode='22023'; end if;
  insert into public.food_fitness_student_reminders(id,store_id,student_user_id,kind,label,reminder_time,timezone,weekdays,channel)
  values(target,p_store,auth.uid(),p_kind,trim(p_label),p_time,p_timezone,p_weekdays,p_channel)
  on conflict(id) do update set kind=excluded.kind,label=excluded.label,reminder_time=excluded.reminder_time,timezone=excluded.timezone,weekdays=excluded.weekdays,channel=excluded.channel,updated_at=now()
    where food_fitness_student_reminders.store_id=p_store and food_fitness_student_reminders.student_user_id=auth.uid() and food_fitness_student_reminders.status<>'cancelled'
  returning * into result;
  if result.id is null then raise exception 'Lembrete não encontrado para esta conta.' using errcode='42501'; end if;
  return jsonb_build_object('id',result.id,'status',result.status,'kind',result.kind,'label',result.label);
end; $$;

create function public.food_fitness_student_reminder_action(p_store uuid,p_id uuid,p_action text,p_paused_until timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.food_fitness_student_reminders%rowtype;
begin
  if not exists(select 1 from public.food_fitness_students where store_id=p_store and user_id=auth.uid()) then raise exception 'Somente o próprio aluno pode alterar seus lembretes.' using errcode='42501'; end if;
  if p_action='pause' then
    if p_paused_until is null or p_paused_until<=now() or p_paused_until>now()+interval '1 year' then raise exception 'Defina uma pausa futura de até um ano.' using errcode='22023'; end if;
    update public.food_fitness_student_reminders set status='paused',paused_until=p_paused_until,updated_at=now() where id=p_id and store_id=p_store and student_user_id=auth.uid() and status<>'cancelled' returning * into result;
  elsif p_action='resume' then
    update public.food_fitness_student_reminders set status='active',paused_until=null,updated_at=now() where id=p_id and store_id=p_store and student_user_id=auth.uid() and status='paused' returning * into result;
  elsif p_action='cancel' then
    update public.food_fitness_student_reminders set status='cancelled',cancelled_at=now(),paused_until=null,updated_at=now() where id=p_id and store_id=p_store and student_user_id=auth.uid() and status<>'cancelled' returning * into result;
  else raise exception 'Ação indisponível.' using errcode='22023'; end if;
  if result.id is null then raise exception 'Lembrete não encontrado ou já desligado.' using errcode='22023'; end if;
  if p_action in ('pause','cancel') then
    update public.food_fitness_reminder_deliveries set status='cancelled',claimed_at=null
      where reminder_id=p_id and store_id=p_store and student_user_id=auth.uid() and status='queued';
  end if;
  return jsonb_build_object('id',result.id,'status',result.status,'paused_until',result.paused_until,'cancelled_at',result.cancelled_at);
end; $$;

create function public.food_fitness_reminder_enqueue_due()
returns integer language plpgsql security definer set search_path='' as $$
declare inserted integer;
begin
  insert into public.food_fitness_reminder_deliveries(reminder_id,store_id,student_user_id,planned_for)
  select r.id,r.store_id,r.student_user_id,date_trunc('minute',now())
  from public.food_fitness_student_reminders r
  where (r.status='active' or r.status='paused' and r.paused_until<=now())
    and extract(dow from (now() at time zone r.timezone))::smallint=any(r.weekdays)
    and extract(hour from (now() at time zone r.timezone))=extract(hour from r.reminder_time)
    and extract(minute from (now() at time zone r.timezone))=extract(minute from r.reminder_time)
    and food_business_private.module_enabled(r.store_id,'clients')
  on conflict(reminder_id,planned_for) do nothing;
  get diagnostics inserted=row_count;
  update public.food_fitness_student_reminders set status='active',paused_until=null,updated_at=now() where status='paused' and paused_until<=now();
  return inserted;
end; $$;

create function public.food_fitness_reminder_claim_push(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rows jsonb;
begin
  if p_limit not between 1 and 200 then raise exception 'Limite inválido.' using errcode='22023'; end if;
  with claimed as (
    select d.id from public.food_fitness_reminder_deliveries d join public.food_fitness_student_reminders r on r.id=d.reminder_id and r.store_id=d.store_id
      join public.food_stores st on st.id=d.store_id and st.active and st.access_status='online'
    where r.channel='push' and r.status='active' and d.planned_for>=now()-interval '2 minutes'
      and (d.status='queued' or d.status='sending' and d.claimed_at<now()-interval '5 minutes') and d.attempts<3
      and exists(select 1 from public.food_fitness_student_push_subscriptions ps where ps.store_id=d.store_id and ps.user_id=d.student_user_id and ps.active)
    order by d.planned_for,d.id for update of d skip locked limit p_limit
  ), updated as (
    update public.food_fitness_reminder_deliveries d set status='sending',attempts=attempts+1,claimed_at=now() from claimed c where d.id=c.id returning d.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('delivery_id',d.id,'store_id',d.store_id,'user_id',d.student_user_id,'kind',r.kind,'title','Lembrete da sua rotina','message',case r.kind when 'hydration' then 'Seu lembrete de hidratação está na VendeWeb.' when 'workout' then 'Seu lembrete de treino está na VendeWeb.' when 'appointment' then 'Seu lembrete de agenda está na VendeWeb.' else 'Seu lembrete está na VendeWeb.' end,'url','/'||st.slug,'subscriptions',(select coalesce(jsonb_agg(jsonb_build_object('id',ps.id,'endpoint',ps.endpoint,'p256dh',ps.p256dh,'auth',ps.auth)),'[]'::jsonb) from public.food_fitness_student_push_subscriptions ps where ps.store_id=d.store_id and ps.user_id=d.student_user_id and ps.active))), '[]'::jsonb)
    into rows from updated d join public.food_fitness_student_reminders r on r.id=d.reminder_id and r.store_id=d.store_id
    join public.food_stores st on st.id=d.store_id and st.active and st.access_status='online';
  return rows;
end; $$;

create function public.food_fitness_reminder_finish_push(p_delivery uuid,p_success boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.food_fitness_reminder_deliveries%rowtype;
begin
  update public.food_fitness_reminder_deliveries set status=case when p_success then 'sent' when attempts<3 then 'queued' else 'failed' end,delivered_at=case when p_success then now() else null end,claimed_at=null
    where id=p_delivery and status='sending' returning * into result;
  if result.id is null then raise exception 'Entrega não está reservada por um worker.' using errcode='42501'; end if;
  return jsonb_build_object('id',result.id,'status',result.status,'attempts',result.attempts);
end; $$;

create function public.food_fitness_reminder_mark_seen(p_store uuid,p_delivery uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.food_fitness_reminder_deliveries%rowtype;
begin
  update public.food_fitness_reminder_deliveries set status='seen',seen_at=now() where id=p_delivery and store_id=p_store and student_user_id=auth.uid() and status in ('queued','sent') returning * into result;
  if result.id is null then raise exception 'Aviso não encontrado.' using errcode='42501'; end if;
  return jsonb_build_object('id',result.id,'status',result.status);
end; $$;

create function public.food_fitness_student_authorize_professional(p_store uuid,p_professional uuid,p_purpose text,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare profile public.food_service_professionals%rowtype;
begin
  if not exists(select 1 from public.food_fitness_students where store_id=p_store and user_id=auth.uid()) then raise exception 'Somente o próprio aluno pode conceder acesso.' using errcode='42501'; end if;
  select p.* into profile from public.food_service_professionals p join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active
    where p.store_id=p_store and p.user_id=p_professional and p.active for update;
  if profile.user_id is null or p_purpose not in ('training','nutrition') or profile.kind<>p_purpose or (p_purpose='training' and profile.council<>'CREF') or (p_purpose='nutrition' and profile.council<>'CRN') then
    raise exception 'Profissional ativo e registro adequado são obrigatórios.' using errcode='42501';
  end if;
  if p_enabled and not exists(select 1 from public.food_business_services s where s.store_id=p_store and s.professional_user_id=p_professional and s.kind=p_purpose and s.active) then
    raise exception 'Este profissional ainda não presta um serviço ativo nesta loja.' using errcode='22023';
  end if;
  insert into public.food_fitness_professional_authorizations(store_id,student_user_id,professional_user_id,purpose,authorized_at,revoked_at,active)
  values(p_store,auth.uid(),p_professional,p_purpose,case when p_enabled then now() else now() end,case when p_enabled then null else now() end,p_enabled)
  on conflict(store_id,student_user_id,professional_user_id,purpose) do update set authorized_at=case when p_enabled then now() else food_fitness_professional_authorizations.authorized_at end,revoked_at=case when p_enabled then null else now() end,active=p_enabled;
  return jsonb_build_object('professional_user_id',p_professional,'purpose',p_purpose,'active',p_enabled);
end; $$;

create function public.food_fitness_student_authorization_list(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.food_fitness_students where store_id=p_store and user_id=auth.uid()) then raise exception 'Acesso restrito à própria conta de aluno.' using errcode='42501'; end if;
  return jsonb_build_object('professionals',(select coalesce(jsonb_agg(jsonb_build_object('user_id',p.user_id,'name',p.name,'kind',p.kind,'council',p.council,'registration',p.registration,'authorized',exists(select 1 from public.food_fitness_professional_authorizations a where a.store_id=p_store and a.student_user_id=auth.uid() and a.professional_user_id=p.user_id and a.purpose=p.kind and a.active),'message_enabled',exists(select 1 from public.food_fitness_student_message_permissions mp where mp.store_id=p_store and mp.student_user_id=auth.uid() and mp.professional_user_id=p.user_id and mp.enabled)) order by p.name),'[]'::jsonb)
    from public.food_service_professionals p join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active
    where p.store_id=p_store and p.active and p.kind in ('training','nutrition') and exists(select 1 from public.food_business_services s where s.store_id=p_store and s.professional_user_id=p.user_id and s.kind=p.kind and s.active)
      and ((p.kind='training' and food_business_private.module_enabled(p_store,'training')) or (p.kind='nutrition' and food_business_private.module_enabled(p_store,'nutrition')))));
end; $$;

create function public.food_fitness_student_message_permission_set(p_store uuid,p_professional uuid,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare profile public.food_service_professionals%rowtype;
begin
  if not exists(select 1 from public.food_fitness_students where store_id=p_store and user_id=auth.uid()) then raise exception 'Somente o próprio aluno pode alterar esta preferência.' using errcode='42501'; end if;
  select p.* into profile from public.food_service_professionals p join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active
    where p.store_id=p_store and p.user_id=p_professional and p.active for update;
  if profile.user_id is null or not exists(select 1 from public.food_business_services s where s.store_id=p_store and s.professional_user_id=p_professional and s.kind=profile.kind and s.active)
    or (profile.kind in ('training','nutrition') and not food_business_private.module_enabled(p_store,profile.kind)) then raise exception 'Profissional com serviço ativo nesta loja é obrigatório.' using errcode='42501'; end if;
  insert into public.food_fitness_student_message_permissions(store_id,student_user_id,professional_user_id,enabled,granted_at,revoked_at)
  values(p_store,auth.uid(),p_professional,p_enabled,now(),case when p_enabled then null else now() end)
  on conflict(store_id,student_user_id,professional_user_id) do update set enabled=p_enabled,granted_at=case when p_enabled then now() else food_fitness_student_message_permissions.granted_at end,revoked_at=case when p_enabled then null else now() end;
  return jsonb_build_object('professional_user_id',p_professional,'enabled',p_enabled);
end; $$;

create function public.food_professional_message_recipients(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.food_service_professionals p join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active where p.store_id=p_store and p.user_id=auth.uid() and p.active) then raise exception 'Conta profissional ativa obrigatória.' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('student_user_id',mp.student_user_id,'name',c.name,'training_authorized',exists(select 1 from public.food_fitness_professional_authorizations a where a.store_id=p_store and a.student_user_id=mp.student_user_id and a.professional_user_id=auth.uid() and a.purpose='training' and a.active),'nutrition_authorized',exists(select 1 from public.food_fitness_professional_authorizations a where a.store_id=p_store and a.student_user_id=mp.student_user_id and a.professional_user_id=auth.uid() and a.purpose='nutrition' and a.active)) order by c.name),'[]'::jsonb)
    from public.food_fitness_student_message_permissions mp join public.food_fitness_students st on st.store_id=mp.store_id and st.user_id=mp.student_user_id
    join public.food_business_clients c on c.store_id=st.store_id and c.id=st.client_id and c.active
    join public.food_service_professionals p on p.store_id=mp.store_id and p.user_id=mp.professional_user_id and p.active
    where mp.store_id=p_store and mp.professional_user_id=auth.uid() and mp.enabled
      and ((p.kind='training' and food_business_private.module_enabled(p_store,'training')) or (p.kind='nutrition' and food_business_private.module_enabled(p_store,'nutrition'))));
end; $$;

create function public.food_fitness_student_messages_list(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.food_fitness_students where store_id=p_store and user_id=auth.uid()) then raise exception 'Somente o próprio aluno pode consultar mensagens profissionais.' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'publication_id',p.id,'title',p.title,'body',p.body,'category',p.category,'status',d.status,'sent_at',d.sent_at,'author_name',p.author_name,'author_council',p.author_council,'author_registration',p.author_registration) order by d.sent_at desc),'[]'::jsonb)
    from public.food_professional_message_deliveries d join public.food_professional_publications p on p.id=d.publication_id and p.store_id=d.store_id
    where d.store_id=p_store and d.student_user_id=auth.uid() and d.status in ('sent','seen'));
end; $$;

create function public.food_fitness_student_message_mark_seen(p_store uuid,p_delivery uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.food_professional_message_deliveries%rowtype;
begin
  update public.food_professional_message_deliveries set status='seen',seen_at=now() where id=p_delivery and store_id=p_store and student_user_id=auth.uid() and status='sent' returning * into result;
  if result.id is null then raise exception 'Mensagem não encontrada.' using errcode='42501'; end if;
  return jsonb_build_object('id',result.id,'status',result.status);
end; $$;

create function public.food_professional_authorized_students(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.food_service_professionals p join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active where p.store_id=p_store and p.user_id=auth.uid() and p.active) then raise exception 'Conta profissional ativa obrigatória.' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('student_user_id',a.student_user_id,'client_id',s.client_id,'name',c.name,'purpose',a.purpose,'authorized_at',a.authorized_at) order by c.name),'[]'::jsonb)
    from public.food_fitness_professional_authorizations a join public.food_fitness_students s on s.store_id=a.store_id and s.user_id=a.student_user_id
    join public.food_business_clients c on c.store_id=s.store_id and c.id=s.client_id and c.active
    where a.store_id=p_store and a.professional_user_id=auth.uid() and a.active);
end; $$;

create or replace function food_business_private.public_offers(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare segment_value text; services jsonb:='[]'; links jsonb:='[]'; publications jsonb:='[]';
begin
  if not exists(select 1 from public.food_stores s where s.id=p_store and s.active and s.archived_at is null and s.approval_status='approved' and s.access_status='online') then
    return jsonb_build_object('services','[]'::jsonb,'links','[]'::jsonb,'publications','[]'::jsonb,'primary_segment',null);
  end if;
  select primary_segment into segment_value from public.food_business_profiles where store_id=p_store;
  if food_business_private.module_enabled(p_store,'appointments') then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into services from (
      select s.id,s.name,s.description,s.price_cents,s.duration_minutes,s.kind,
        jsonb_build_object('user_id',p.user_id,'name',p.name,'council',p.council,'registration',p.registration) as professional
      from public.food_business_services s
      join public.food_service_professionals p on p.store_id=s.store_id and p.user_id=s.professional_user_id and p.active
      join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active
      where s.store_id=p_store and s.active and (s.kind='general' or food_business_private.module_enabled(p_store,s.kind))
        and (s.kind='general' or s.kind=p.kind)
        and (segment_value is distinct from 'fitness' or exists (select 1 from public.food_fitness_service_terms t where t.store_id=s.store_id and t.service_id=s.id and t.price_confirmed and t.published_at is not null))
      order by s.name,s.id limit 100
    ) x;
  end if;
  if food_business_private.module_enabled(p_store,'creator') then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into links from (
      select l.id,l.label,l.url from public.food_creator_links l where l.store_id=p_store and l.active
        and (l.campaign_id is null or exists(select 1 from public.food_creator_campaigns c where c.id=l.campaign_id and c.store_id=l.store_id and c.status='active' and (c.starts_at is null or c.starts_at<=now()) and (c.ends_at is null or c.ends_at>=now()))
        ) order by l.label,l.id limit 100
    ) x;
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.published_at desc,x.id),'[]'::jsonb) into publications from (
    select p.id,p.title,p.body,p.category,p.published_at,p.author_name,p.author_council,p.author_registration
    from public.food_professional_publications p join public.food_service_professionals sp on sp.store_id=p.store_id and sp.user_id=p.professional_user_id and sp.active
    join public.food_store_users u on u.store_id=sp.store_id and u.user_id=sp.user_id and u.active
    where p.store_id=p_store and p.status='published' and p.channel='storefront'
      and (p.category='commercial' or p.category='training' and food_business_private.module_enabled(p_store,'training') or p.category='nutrition' and food_business_private.module_enabled(p_store,'nutrition'))
    order by p.published_at desc,p.id limit 50
  ) x;
  return jsonb_build_object('services',services,'links',links,'publications',publications,'primary_segment',segment_value);
end; $$;

-- Fichas de treino são dados profissionais, não registros comerciais da loja.
-- Proprietários e administradores só leem uma ficha quando também são o
-- profissional responsável; o aluno lê apenas a ficha atribuída após consentir.
create function food_fitness_private.has_training_identity(p_store uuid,p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.food_service_professionals p join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active
    where p.store_id=p_store and p.user_id=p_user and p.active and p.kind='training' and p.council='CREF')
$$;
revoke all on function food_fitness_private.has_training_identity(uuid,uuid) from public,anon,authenticated;
grant execute on function food_fitness_private.has_training_identity(uuid,uuid) to authenticated;
drop policy if exists food_fitness_workouts_read on public.food_fitness_workouts;
create policy food_fitness_workouts_read on public.food_fitness_workouts for select to authenticated using (
  (created_by=(select auth.uid()) or approved_by=(select auth.uid()) or exists(select 1 from public.food_fitness_workout_assignments a where a.store_id=food_fitness_workouts.store_id and a.workout_id=food_fitness_workouts.id and a.assigned_by=(select auth.uid())))
  and food_fitness_private.has_training_identity(food_fitness_workouts.store_id,(select auth.uid()))
  or (status='approved' and exists(
    select 1 from public.food_fitness_workout_assignments a join public.food_fitness_students st on st.store_id=a.store_id and st.client_id=a.client_id
    join public.food_fitness_professional_authorizations au on au.store_id=a.store_id and au.student_user_id=st.user_id and au.professional_user_id=food_fitness_workouts.approved_by and au.purpose='training' and au.active
    where a.store_id=food_fitness_workouts.store_id and a.workout_id=food_fitness_workouts.id and a.active and st.user_id=(select auth.uid())
      and food_fitness_private.has_training_identity(food_fitness_workouts.store_id,food_fitness_workouts.approved_by)
  ))
);
drop policy if exists food_fitness_exercises_read on public.food_fitness_exercises;
create policy food_fitness_exercises_read on public.food_fitness_exercises for select to authenticated using (
  exists(select 1 from public.food_fitness_workouts w
    where food_fitness_private.has_training_identity(w.store_id,(select auth.uid()))
      and w.id=food_fitness_exercises.workout_id and w.store_id=food_fitness_exercises.store_id and (w.created_by=(select auth.uid()) or w.approved_by=(select auth.uid()) or exists(select 1 from public.food_fitness_workout_assignments a where a.store_id=w.store_id and a.workout_id=w.id and a.assigned_by=(select auth.uid()))))
  or exists(select 1 from public.food_fitness_workouts w join public.food_fitness_workout_assignments a on a.store_id=w.store_id and a.workout_id=w.id and a.active
    join public.food_fitness_students st on st.store_id=a.store_id and st.client_id=a.client_id
    join public.food_fitness_professional_authorizations au on au.store_id=a.store_id and au.student_user_id=st.user_id and au.professional_user_id=w.approved_by and au.purpose='training' and au.active
    where w.id=food_fitness_exercises.workout_id and w.store_id=food_fitness_exercises.store_id and w.status='approved' and st.user_id=(select auth.uid())
      and food_fitness_private.has_training_identity(w.store_id,w.approved_by))
);
drop policy if exists food_fitness_assignments_read on public.food_fitness_workout_assignments;
create policy food_fitness_assignments_read on public.food_fitness_workout_assignments for select to authenticated using (
  assigned_by=(select auth.uid()) and food_fitness_private.has_training_identity(food_fitness_workout_assignments.store_id,(select auth.uid()))
  or exists(select 1 from public.food_fitness_students st where st.store_id=food_fitness_workout_assignments.store_id and st.client_id=food_fitness_workout_assignments.client_id and st.user_id=(select auth.uid()))
);

create or replace function public.food_fitness_save_workout(p_store uuid,p_id uuid,p_level text,p_title text,p_description text,p_exercises jsonb,p_source text default 'custom')
returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid:=coalesce(p_id,gen_random_uuid()); old_row public.food_fitness_workouts%rowtype; e jsonb; n integer:=0;
begin
  if not food_fitness_private.is_fitness(p_store) or not food_business_private.module_enabled(p_store,'training') or not exists(select 1 from public.food_service_professionals p join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active where p.store_id=p_store and p.user_id=auth.uid() and p.active and p.kind='training' and p.council='CREF') then raise exception 'Somente profissional CREF ativo pode preparar fichas.' using errcode='42501'; end if;
  if p_source not in ('custom','pilot') or p_level not in ('basic','medium','advanced') or jsonb_typeof(p_exercises) is distinct from 'array' or jsonb_array_length(p_exercises) not between 1 and 30 then raise exception 'Ficha inválida.' using errcode='22023'; end if;
  select * into old_row from public.food_fitness_workouts where id=target for update;
  if old_row.id is not null and (old_row.store_id<>p_store or old_row.status<>'draft' or old_row.created_by<>auth.uid()) then raise exception 'Somente rascunho próprio pode ser editado.' using errcode='42501'; end if;
  insert into public.food_fitness_workouts(id,store_id,title,level,source,description,created_by)
  values(target,p_store,trim(p_title),p_level,p_source,coalesce(p_description,''),auth.uid())
  on conflict(id) do update set title=excluded.title,level=excluded.level,description=excluded.description,updated_at=now()
  where food_fitness_workouts.store_id=excluded.store_id and food_fitness_workouts.status='draft' and food_fitness_workouts.created_by=auth.uid();
  delete from public.food_fitness_exercises where workout_id=target and store_id=p_store;
  for e in select value from jsonb_array_elements(p_exercises) loop
    n:=n+1;
    if jsonb_typeof(e) is distinct from 'object' or (e-array['name','sets','repetitions','rest_seconds','load_or_effort','instructions','alternative'])<>'{}'::jsonb then raise exception 'Campos não permitidos no exercício.' using errcode='22023'; end if;
    insert into public.food_fitness_exercises(store_id,workout_id,position,name,sets,repetitions,rest_seconds,load_or_effort,instructions,alternative)
    values(p_store,target,n,trim(e->>'name'),(e->>'sets')::integer,trim(e->>'repetitions'),(e->>'rest_seconds')::integer,trim(e->>'load_or_effort'),trim(e->>'instructions'),trim(e->>'alternative'));
  end loop;
  return jsonb_build_object('id',target,'store_id',p_store,'status','draft','exercise_count',n);
end; $$;

create or replace function public.food_fitness_approve_workout(p_store uuid,p_workout uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.food_fitness_workouts%rowtype;
begin
  if not food_fitness_private.is_fitness(p_store) or not food_business_private.module_enabled(p_store,'training') or not exists(select 1 from public.food_service_professionals p join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active where p.store_id=p_store and p.user_id=auth.uid() and p.active and p.kind='training' and p.council='CREF') then raise exception 'Somente profissional com CREF pode aprovar fichas.' using errcode='42501'; end if;
  update public.food_fitness_workouts set status='approved',approved_by=auth.uid(),approved_at=now(),updated_at=now()
    where id=p_workout and store_id=p_store and created_by=auth.uid() and status='draft' and exists(select 1 from public.food_fitness_exercises where workout_id=p_workout and store_id=p_store)
    returning * into result;
  if result.id is null then raise exception 'Rascunho próprio não encontrado.' using errcode='22023'; end if;
  insert into public.food_business_audit(store_id,actor_id,action,details) values(p_store,auth.uid(),'fitness.workout_approved',jsonb_build_object('workout_id',p_workout));
  return jsonb_build_object('id',result.id,'status',result.status,'approved_at',result.approved_at,'professional',jsonb_build_object('name',(select name from public.food_service_professionals where store_id=p_store and user_id=auth.uid()),'council','CREF','registration',(select registration from public.food_service_professionals where store_id=p_store and user_id=auth.uid())));
end; $$;

create or replace function public.food_fitness_assign_workout(p_store uuid,p_workout uuid,p_client uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  if not food_fitness_private.is_fitness(p_store) or not food_business_private.module_enabled(p_store,'training') or not exists(select 1 from public.food_service_professionals p join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active where p.store_id=p_store and p.user_id=auth.uid() and p.active and p.kind='training' and p.council='CREF') then raise exception 'Profissional CREF ativo obrigatório.' using errcode='42501'; end if;
  if not exists(select 1 from public.food_fitness_workouts where id=p_workout and store_id=p_store and status='approved' and approved_by=auth.uid())
    or not exists(select 1 from public.food_fitness_students st where st.store_id=p_store and st.client_id=p_client and exists(select 1 from public.food_fitness_professional_authorizations a where a.store_id=st.store_id and a.student_user_id=st.user_id and a.professional_user_id=auth.uid() and a.purpose='training' and a.active)) then
    raise exception 'Ficha própria aprovada e autorização ativa do aluno são obrigatórias.' using errcode='42501';
  end if;
  insert into public.food_fitness_workout_assignments(store_id,workout_id,client_id,assigned_by) values(p_store,p_workout,p_client,auth.uid())
  on conflict(store_id,workout_id,client_id) do update set active=true,assigned_by=auth.uid(),assigned_at=now() returning id into target;
  insert into public.food_business_audit(store_id,actor_id,action,details) values(p_store,auth.uid(),'fitness.workout_assigned',jsonb_build_object('workout_id',p_workout,'client_id',p_client));
  return jsonb_build_object('assignment_id',target,'workout_id',p_workout,'client_id',p_client,'professional_user_id',auth.uid());
end; $$;

create or replace function public.food_fitness_list_workouts(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare is_professional boolean;
begin
  if auth.uid() is null or not food_fitness_private.is_fitness(p_store) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  is_professional:=exists(select 1 from public.food_service_professionals p join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active where p.store_id=p_store and p.user_id=auth.uid() and p.active and p.kind='training' and p.council='CREF');
  if is_professional then
    return (select coalesce(jsonb_agg(to_jsonb(w)||jsonb_build_object('professional',jsonb_build_object('user_id',sp.user_id,'name',sp.name,'council',sp.council,'registration',sp.registration),'exercises',(select coalesce(jsonb_agg(to_jsonb(e) order by e.position),'[]'::jsonb) from public.food_fitness_exercises e where e.workout_id=w.id and e.store_id=w.store_id)) order by w.created_at),'[]'::jsonb)
      from public.food_fitness_workouts w join public.food_service_professionals sp on sp.store_id=w.store_id and sp.user_id=coalesce(w.approved_by,w.created_by) and sp.active
      where w.store_id=p_store and (w.created_by=auth.uid() or w.approved_by=auth.uid() or exists(select 1 from public.food_fitness_workout_assignments a where a.store_id=w.store_id and a.workout_id=w.id and a.assigned_by=auth.uid())));
  end if;
  if not exists(select 1 from public.food_fitness_students where store_id=p_store and user_id=auth.uid()) then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(to_jsonb(w)||jsonb_build_object('professional',jsonb_build_object('user_id',sp.user_id,'name',sp.name,'council',sp.council,'registration',sp.registration),'exercises',(select coalesce(jsonb_agg(to_jsonb(e) order by e.position),'[]'::jsonb) from public.food_fitness_exercises e where e.workout_id=w.id and e.store_id=w.store_id)) order by w.created_at),'[]'::jsonb)
    from public.food_fitness_workouts w join public.food_fitness_workout_assignments a on a.workout_id=w.id and a.store_id=w.store_id and a.active
    join public.food_fitness_students st on st.store_id=a.store_id and st.client_id=a.client_id and st.user_id=auth.uid()
    join public.food_fitness_professional_authorizations au on au.store_id=st.store_id and au.student_user_id=st.user_id and au.professional_user_id=w.approved_by and au.purpose='training' and au.active
    join public.food_service_professionals sp on sp.store_id=w.store_id and sp.user_id=w.approved_by and sp.active and sp.kind='training' and sp.council='CREF'
    where w.store_id=p_store and w.status='approved');
end; $$;

create or replace function public.food_fitness_list_students(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.food_service_professionals p join public.food_store_users u on u.store_id=p.store_id and u.user_id=p.user_id and u.active where p.store_id=p_store and p.user_id=auth.uid() and p.active and p.kind='training' and p.council='CREF') then raise exception 'Somente profissional CREF ativo pode consultar alunos autorizados.' using errcode='42501'; end if;
  return jsonb_build_object('students',(select coalesce(jsonb_agg(jsonb_build_object('client_id',c.id,'name',c.name) order by c.name),'[]'::jsonb)
    from public.food_fitness_professional_authorizations a join public.food_fitness_students st on st.store_id=a.store_id and st.user_id=a.student_user_id
    join public.food_business_clients c on c.id=st.client_id and c.store_id=st.store_id and c.active
    where a.store_id=p_store and a.professional_user_id=auth.uid() and a.purpose='training' and a.active));
end; $$;

revoke all on function public.food_professional_publication_list(uuid),public.food_professional_publication_save(uuid,uuid,text,text,text,text,uuid),public.food_professional_publication_approve(uuid,uuid,timestamptz),public.food_professional_publication_cancel(uuid,uuid),public.food_professional_publication_publish_due(),public.food_fitness_student_reminders_list(uuid),public.food_fitness_student_reminder_save(uuid,uuid,text,text,time,text,smallint[],text),public.food_fitness_student_reminder_action(uuid,uuid,text,timestamptz),public.food_fitness_reminder_enqueue_due(),public.food_fitness_reminder_claim_push(integer),public.food_fitness_reminder_finish_push(uuid,boolean),public.food_fitness_reminder_mark_seen(uuid,uuid),public.food_fitness_student_authorize_professional(uuid,uuid,text,boolean),public.food_fitness_student_authorization_list(uuid),public.food_fitness_student_message_permission_set(uuid,uuid,boolean),public.food_professional_message_recipients(uuid),public.food_fitness_student_messages_list(uuid),public.food_fitness_student_message_mark_seen(uuid,uuid),public.food_professional_authorized_students(uuid) from public,anon,authenticated;
grant execute on function public.food_professional_publication_list(uuid),public.food_professional_publication_save(uuid,uuid,text,text,text,text,uuid),public.food_professional_publication_approve(uuid,uuid,timestamptz),public.food_professional_publication_cancel(uuid,uuid),public.food_fitness_student_reminders_list(uuid),public.food_fitness_student_reminder_save(uuid,uuid,text,text,time,text,smallint[],text),public.food_fitness_student_reminder_action(uuid,uuid,text,timestamptz),public.food_fitness_reminder_mark_seen(uuid,uuid),public.food_fitness_student_authorize_professional(uuid,uuid,text,boolean),public.food_fitness_student_authorization_list(uuid),public.food_fitness_student_message_permission_set(uuid,uuid,boolean),public.food_professional_message_recipients(uuid),public.food_fitness_student_messages_list(uuid),public.food_fitness_student_message_mark_seen(uuid,uuid),public.food_professional_authorized_students(uuid) to authenticated;
grant execute on function public.food_professional_publication_publish_due(),public.food_fitness_reminder_enqueue_due(),public.food_fitness_reminder_claim_push(integer),public.food_fitness_reminder_finish_push(uuid,boolean) to service_role;

do $$ declare v_job bigint; begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    for v_job in select jobid from cron.job where jobname='food-professional-publications-minute' loop perform cron.unschedule(v_job); end loop;
    perform cron.schedule('food-professional-publications-minute','* * * * *','select public.food_professional_publication_publish_due();');
    for v_job in select jobid from cron.job where jobname='food-fitness-reminders-minute' loop perform cron.unschedule(v_job); end loop;
    perform cron.schedule('food-fitness-reminders-minute','* * * * *','select public.food_fitness_reminder_enqueue_due();');
  end if;
exception when others then raise notice 'pg_cron indisponível; configure os jobs food-professional-publications-minute e food-fitness-reminders-minute externamente. %',sqlerrm;
end $$;

commit;
