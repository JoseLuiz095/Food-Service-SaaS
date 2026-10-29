-- Core multissetorial: nome visível único; slug e tenant permanecem estáveis.
-- Não corrige nem renomeia dados existentes. Colisões abortam a implantação.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function public.food_normalize_store_name_v1(p_name text)
returns text language sql immutable parallel safe security invoker
set search_path = ''
as $$
 select translate(lower(btrim(regexp_replace(normalize(coalesce(p_name,''),NFKC),'[[:space:]]+',' ','g'))),
   'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc');
$$;
revoke all on function public.food_normalize_store_name_v1(text) from public, anon;
grant execute on function public.food_normalize_store_name_v1(text) to authenticated, service_role;

do $$begin
 if exists(select 1 from public.food_stores group by public.food_normalize_store_name_v1(name) having count(*)>1) then
   raise exception 'Há nomes de lojas equivalentes. Revise as colisões antes de instalar a validação; nenhum nome foi alterado.';
 end if;
end$$;

alter table public.food_stores add constraint food_stores_name_valid
 check (char_length(btrim(regexp_replace(normalize(coalesce(name,''),NFKC),'[[:space:]]+',' ','g'))) between 2 and 120);
create unique index food_stores_name_normalized_uidx
 on public.food_stores(public.food_normalize_store_name_v1(name));

create schema food_store_identity_private;
revoke all on schema food_store_identity_private from public, anon;
grant usage on schema food_store_identity_private to authenticated;

-- O lookup global precisa ignorar RLS somente para responder um booleano.
-- Autorização exige admin da loja alvo; não retorna registros de outro tenant.
create function food_store_identity_private.check_name(p_store_id uuid,p_name text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
begin
 if auth.uid() is null or not coalesce(public.food_is_store_admin(p_store_id),false) or not exists(select 1 from public.food_stores where id=p_store_id) then
   raise exception 'Sem permissão para validar o nome desta loja.' using errcode='42501';
 end if;
 if char_length(btrim(regexp_replace(normalize(coalesce(p_name,''),NFKC),'[[:space:]]+',' ','g'))) not between 2 and 120 then
   raise exception 'Use um nome de loja entre 2 e 120 caracteres.' using errcode='22023';
 end if;
 return not exists(select 1 from public.food_stores s
   where s.id<>p_store_id and public.food_normalize_store_name_v1(s.name)=public.food_normalize_store_name_v1(p_name));
end;
$$;
revoke all on function food_store_identity_private.check_name(uuid,text) from public, anon;
grant execute on function food_store_identity_private.check_name(uuid,text) to authenticated;

create function public.food_check_store_name_v1(p_store_id uuid,p_name text)
returns boolean language sql stable security invoker set search_path = ''
as $$ select food_store_identity_private.check_name(p_store_id,p_name); $$;
revoke all on function public.food_check_store_name_v1(uuid,text) from public, anon;
grant execute on function public.food_check_store_name_v1(uuid,text) to authenticated;
comment on function public.food_check_store_name_v1(uuid,text) is 'Prévia autorizada; a confirmação definitiva usa o índice único na gravação. Não altera slug.';
notify pgrst, 'reload schema';
commit;
