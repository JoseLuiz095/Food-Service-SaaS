-- shared_future: fichas genéricas em rascunho; somente profissional aprova e atribui.
begin;

create table public.food_fitness_workouts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.food_stores(id),
  title text not null check (length(trim(title)) between 3 and 120),
  level text not null check (level in ('basic','medium','advanced')),
  source text not null default 'custom' check (source in ('custom','pilot')),
  status text not null default 'draft' check (status in ('draft','approved')),
  description text not null default '' check (length(description)<=1000),
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='draft' and approved_by is null and approved_at is null) or (status='approved' and approved_by is not null and approved_at is not null)),
  unique (id,store_id)
);
create unique index food_fitness_pilot_workout_once on public.food_fitness_workouts(store_id,level) where source='pilot';
create table public.food_fitness_exercises (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  workout_id uuid not null,
  position integer not null check (position between 1 and 30),
  name text not null check (length(trim(name)) between 2 and 120),
  sets integer not null check (sets between 1 and 20),
  repetitions text not null check (length(trim(repetitions)) between 1 and 40),
  rest_seconds integer not null check (rest_seconds between 0 and 1800),
  load_or_effort text not null check (length(trim(load_or_effort)) between 3 and 160),
  instructions text not null check (length(trim(instructions)) between 5 and 1000),
  alternative text not null check (length(trim(alternative)) between 2 and 160),
  unique (workout_id,position),
  foreign key (workout_id,store_id) references public.food_fitness_workouts(id,store_id) on delete cascade
);
create table public.food_fitness_workout_assignments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  workout_id uuid not null,
  client_id uuid not null,
  assigned_by uuid not null references auth.users(id),
  assigned_at timestamptz not null default now(),
  active boolean not null default true,
  foreign key (workout_id,store_id) references public.food_fitness_workouts(id,store_id),
  foreign key (client_id,store_id) references public.food_business_clients(id,store_id),
  unique (store_id,workout_id,client_id)
);

do $$ declare t text; begin
  foreach t in array array['food_fitness_workouts','food_fitness_exercises','food_fitness_workout_assignments'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;
create policy food_fitness_workouts_read on public.food_fitness_workouts for select to authenticated
using (food_fitness_private.can_configure(store_id) or (status='approved' and exists (
  select 1 from public.food_fitness_workout_assignments a join public.food_fitness_students s on s.store_id=a.store_id and s.client_id=a.client_id
  where a.store_id=food_fitness_workouts.store_id and a.workout_id=food_fitness_workouts.id and a.active and s.user_id=auth.uid()
)));
create policy food_fitness_exercises_read on public.food_fitness_exercises for select to authenticated
using (food_fitness_private.can_configure(store_id) or exists (
  select 1 from public.food_fitness_workouts w join public.food_fitness_workout_assignments a on a.store_id=w.store_id and a.workout_id=w.id
  join public.food_fitness_students s on s.store_id=a.store_id and s.client_id=a.client_id
  where w.id=food_fitness_exercises.workout_id and w.store_id=food_fitness_exercises.store_id and w.status='approved' and a.active and s.user_id=auth.uid()
));
create policy food_fitness_assignments_read on public.food_fitness_workout_assignments for select to authenticated
using (food_fitness_private.can_configure(store_id) or exists (
  select 1 from public.food_fitness_students s where s.store_id=food_fitness_workout_assignments.store_id and s.client_id=food_fitness_workout_assignments.client_id and s.user_id=auth.uid()
));

create function public.food_fitness_save_workout(p_store uuid,p_id uuid,p_level text,p_title text,p_description text,p_exercises jsonb,p_source text default 'custom')
returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid:=coalesce(p_id,gen_random_uuid()); old_row public.food_fitness_workouts%rowtype; e jsonb; n integer:=0;
begin
  if not food_fitness_private.can_configure(p_store) then raise exception 'Sem acesso às fichas Fitness.' using errcode='42501'; end if;
  if p_source not in ('custom','pilot') or p_level not in ('basic','medium','advanced') or jsonb_typeof(p_exercises) is distinct from 'array' or jsonb_array_length(p_exercises) not between 1 and 30 then raise exception 'Ficha inválida.' using errcode='22023'; end if;
  select * into old_row from public.food_fitness_workouts where id=target for update;
  if old_row.id is not null and (old_row.store_id<>p_store or old_row.status='approved') then raise exception 'Ficha aprovada ou de outra loja não pode ser editada.' using errcode='42501'; end if;
  insert into public.food_fitness_workouts(id,store_id,title,level,source,description,created_by)
  values(target,p_store,trim(p_title),p_level,p_source,coalesce(p_description,''),auth.uid())
  on conflict(id) do update set title=excluded.title,level=excluded.level,description=excluded.description,updated_at=now()
  where food_fitness_workouts.store_id=excluded.store_id and food_fitness_workouts.status='draft';
  delete from public.food_fitness_exercises where workout_id=target and store_id=p_store;
  for e in select value from jsonb_array_elements(p_exercises) loop
    n:=n+1;
    if jsonb_typeof(e) is distinct from 'object' or (e-array['name','sets','repetitions','rest_seconds','load_or_effort','instructions','alternative'])<>'{}'::jsonb then raise exception 'Campos não permitidos no exercício.' using errcode='22023'; end if;
    insert into public.food_fitness_exercises(store_id,workout_id,position,name,sets,repetitions,rest_seconds,load_or_effort,instructions,alternative)
    values(p_store,target,n,trim(e->>'name'),(e->>'sets')::integer,trim(e->>'repetitions'),(e->>'rest_seconds')::integer,trim(e->>'load_or_effort'),trim(e->>'instructions'),trim(e->>'alternative'));
  end loop;
  return jsonb_build_object('id',target,'store_id',p_store,'status','draft','exercise_count',n);
end; $$;

create function public.food_fitness_approve_workout(p_store uuid,p_workout uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.food_fitness_workouts%rowtype;
begin
  if not food_fitness_private.is_professional(p_store,auth.uid()) or not food_business_private.module_enabled(p_store,'training') then raise exception 'Somente profissional ativo pode aprovar fichas.' using errcode='42501'; end if;
  update public.food_fitness_workouts set status='approved',approved_by=auth.uid(),approved_at=now(),updated_at=now()
  where id=p_workout and store_id=p_store and status='draft' and exists(select 1 from public.food_fitness_exercises where workout_id=p_workout and store_id=p_store)
  returning * into result;
  if result.id is null then raise exception 'Ficha em rascunho não encontrada.' using errcode='22023'; end if;
  insert into public.food_business_audit(store_id,actor_id,action,details) values(p_store,auth.uid(),'fitness.workout_approved',jsonb_build_object('workout_id',p_workout));
  return jsonb_build_object('id',result.id,'status',result.status,'approved_at',result.approved_at);
end; $$;

create function public.food_fitness_assign_workout(p_store uuid,p_workout uuid,p_client uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  if not food_fitness_private.is_professional(p_store,auth.uid()) or not food_business_private.module_enabled(p_store,'training') then raise exception 'Somente profissional ativo pode atribuir fichas.' using errcode='42501'; end if;
  if not exists(select 1 from public.food_fitness_workouts where id=p_workout and store_id=p_store and status='approved')
    or not exists(select 1 from public.food_fitness_students where store_id=p_store and client_id=p_client) then raise exception 'Ficha aprovada ou aluno não encontrado nesta loja.' using errcode='22023'; end if;
  insert into public.food_fitness_workout_assignments(store_id,workout_id,client_id,assigned_by)
  values(p_store,p_workout,p_client,auth.uid())
  on conflict(store_id,workout_id,client_id) do update set active=true,assigned_by=auth.uid(),assigned_at=now()
  returning id into target;
  insert into public.food_business_audit(store_id,actor_id,action,details) values(p_store,auth.uid(),'fitness.workout_assigned',jsonb_build_object('workout_id',p_workout,'client_id',p_client));
  return jsonb_build_object('assignment_id',target,'workout_id',p_workout,'client_id',p_client);
end; $$;

create function public.food_fitness_list_workouts(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not food_fitness_private.is_fitness(p_store) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if food_fitness_private.can_configure(p_store) then
    return (select coalesce(jsonb_agg(to_jsonb(w)||jsonb_build_object('exercises',(select coalesce(jsonb_agg(to_jsonb(e) order by e.position),'[]'::jsonb) from public.food_fitness_exercises e where e.workout_id=w.id and e.store_id=w.store_id)) order by w.created_at),'[]'::jsonb) from public.food_fitness_workouts w where w.store_id=p_store);
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(w)||jsonb_build_object('exercises',(select coalesce(jsonb_agg(to_jsonb(e) order by e.position),'[]'::jsonb) from public.food_fitness_exercises e where e.workout_id=w.id and e.store_id=w.store_id)) order by w.created_at),'[]'::jsonb)
    from public.food_fitness_workouts w join public.food_fitness_workout_assignments a on a.workout_id=w.id and a.store_id=w.store_id and a.active
    join public.food_fitness_students s on s.store_id=a.store_id and s.client_id=a.client_id
    where w.store_id=p_store and w.status='approved' and s.user_id=auth.uid());
end; $$;

create function public.food_fitness_list_students(p_store uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not food_fitness_private.can_configure(p_store) then raise exception 'Sem acesso aos alunos Fitness.' using errcode='42501'; end if;
  return jsonb_build_object('students',(
    select coalesce(jsonb_agg(jsonb_build_object('client_id',c.id,'name',c.name) order by c.name),'[]'::jsonb)
    from public.food_fitness_students s join public.food_business_clients c on c.id=s.client_id and c.store_id=s.store_id
    where s.store_id=p_store and c.active
  ));
end; $$;

create function public.food_fitness_seed_workouts(p_store uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare level_value text; exercise_data jsonb; title_value text; created_ids jsonb:='[]'::jsonb; saved jsonb;
begin
  if not food_fitness_private.can_configure(p_store) then raise exception 'Sem acesso às fichas Fitness.' using errcode='42501'; end if;
  for level_value,title_value,exercise_data in
    select * from (values
      ('basic','Básico',jsonb_build_array(
        jsonb_build_object('name','Sentar e levantar de banco','sets',2,'repetitions','8 a 10','rest_seconds',90,'load_or_effort','Esforço a definir pelo profissional','instructions','Use apoio estável e movimento controlado, sem forçar amplitude.','alternative','Agachamento assistido'),
        jsonb_build_object('name','Remada com elástico','sets',2,'repetitions','8 a 12','rest_seconds',90,'load_or_effort','Resistência a definir pelo profissional','instructions','Mantenha postura confortável e puxe de forma controlada.','alternative','Remada sentada em máquina'),
        jsonb_build_object('name','Ponte de quadril','sets',2,'repetitions','8 a 12','rest_seconds',60,'load_or_effort','Esforço a definir pelo profissional','instructions','Eleve o quadril com controle e interrompa se houver desconforto.','alternative','Extensão de quadril em pé')
      )),
      ('medium','Médio',jsonb_build_array(
        jsonb_build_object('name','Agachamento com halter','sets',3,'repetitions','8 a 12','rest_seconds',90,'load_or_effort','Carga a definir pelo profissional','instructions','Mantenha movimento estável e amplitude confortável.','alternative','Agachamento com peso corporal'),
        jsonb_build_object('name','Remada unilateral','sets',3,'repetitions','8 a 12 por lado','rest_seconds',90,'load_or_effort','Carga a definir pelo profissional','instructions','Apoie o tronco e mova o braço sem girar o corpo.','alternative','Remada sentada'),
        jsonb_build_object('name','Levantamento terra romeno com halteres','sets',3,'repetitions','8 a 10','rest_seconds',120,'load_or_effort','Carga a definir pelo profissional','instructions','Mantenha a coluna estável e reduza a amplitude se necessário.','alternative','Ponte de quadril')
      )),
      ('advanced','Avançado',jsonb_build_array(
        jsonb_build_object('name','Agachamento com barra','sets',3,'repetitions','6 a 10','rest_seconds',150,'load_or_effort','Carga e esforço a definir pelo profissional','instructions','Executar somente após revisão técnica e supervisão do profissional.','alternative','Agachamento com halter'),
        jsonb_build_object('name','Remada curvada','sets',3,'repetitions','8 a 10','rest_seconds',120,'load_or_effort','Carga a definir pelo profissional','instructions','Mantenha alinhamento e ritmo controlado; o profissional ajusta a técnica.','alternative','Remada apoiada'),
        jsonb_build_object('name','Avanço com halteres','sets',3,'repetitions','8 a 10 por lado','rest_seconds',120,'load_or_effort','Carga a definir pelo profissional','instructions','Dê passos estáveis e use apoio se a estabilidade exigir.','alternative','Avanço sem carga')
      ))
    ) x(level,title,exercises)
  loop
    if not exists(select 1 from public.food_fitness_workouts where store_id=p_store and level=level_value and source='pilot') then
      saved:=public.food_fitness_save_workout(p_store,null,level_value,title_value,'Modelo genérico para revisão do Personal Trainer. Não é prescrição individualizada.',exercise_data,'pilot');
      created_ids:=created_ids||jsonb_build_array(saved->>'id');
    end if;
  end loop;
  return jsonb_build_object('created_ids',created_ids,'status','draft');
end; $$;

revoke all on function public.food_fitness_save_workout(uuid,uuid,text,text,text,jsonb,text), public.food_fitness_approve_workout(uuid,uuid), public.food_fitness_assign_workout(uuid,uuid,uuid), public.food_fitness_list_workouts(uuid), public.food_fitness_list_students(uuid), public.food_fitness_seed_workouts(uuid) from public,anon,authenticated;
grant execute on function public.food_fitness_save_workout(uuid,uuid,text,text,text,jsonb,text), public.food_fitness_approve_workout(uuid,uuid), public.food_fitness_assign_workout(uuid,uuid,uuid), public.food_fitness_list_workouts(uuid), public.food_fitness_list_students(uuid), public.food_fitness_seed_workouts(uuid) to authenticated;

commit;
