# Supabase compartilhado — FloriWeb + Food Service

## Objetivo

Usar o mesmo Project Ref sem misturar os dados das duas verticais e sem exigir que o FloriWeb atual seja remodelado agora.

## Topologia

```text
Supabase atual
│
├─ auth.users                         COMPARTILHADO
│
├─ FloriWeb                           INALTERADO
│  ├─ stores
│  ├─ store_users
│  ├─ categories
│  ├─ products
│  ├─ orders
│  ├─ plans
│  └─ store_subscriptions
│
└─ Food Service                       ISOLADO
   ├─ food_platform_admins
   ├─ food_stores
   ├─ food_store_users
   ├─ food_categories
   ├─ food_products
   ├─ food_option_groups
   ├─ food_orders
   ├─ food_plans
   ├─ food_store_subscriptions
   └─ food_analytics_events
```

O mesmo `auth.users.id` pode aparecer em `store_users` e `food_store_users`, porém os papéis e lojas são independentes.


## Atenção ao Supabase Auth compartilhado

Como `auth.users` pertence ao projeto inteiro, algumas configurações de Auth são globais para FloriWeb e Food Service:

- Redirect URLs permitidas;
- provedor SMTP;
- templates nativos de convite/recuperação;
- políticas gerais de autenticação.

**Não substitua a Site URL/Redirect URLs do FloriWeb.** Apenas acrescente os domínios Food em **Authentication → URL Configuration → Redirect URLs**, por exemplo:

```text
https://food.seudominio.com.br/admin/redefinir-senha
https://food.seudominio.com.br/**
```

Se os templates de e-mail atuais possuem marca “FloriWeb”, prefira inicialmente a criação com senha temporária no Admin Master Food ou torne os templates de Auth neutros à plataforma. Uma customização de e-mail por vertical pode ser feita depois com fluxo próprio/hook, sem misturar as tabelas de negócio.

## Objetos criados

A migration `202608280400_foodservice_shared_database.sql` cria somente objetos Food Service no schema público, funções/RPCs prefixadas `food_`, uma tabela privada de rate limit Food e dois buckets de Storage:

```text
food-product-images
food-store-assets
```

A migration lê `public.store_domains` para rejeitar um domínio Food que já pertence ao FloriWeb. Ela **não instala trigger na tabela FloriWeb**, não altera sua RLS e não insere/atualiza registros nela.

## Procedimento seguro no banco atual

1. Registre os contadores atuais de `stores`, `products`, `orders` e `store_subscriptions` do FloriWeb.
2. Faça backup/snapshot do banco.
3. Abra o SQL Editor do projeto Supabase atual.
4. Execute somente `supabase/migrations/202608280400_foodservice_shared_database.sql`.
5. Confirme que a transação concluiu sem erro.
6. Execute as queries de validação abaixo.
7. Cadastre o primeiro `food_platform_admins`.
8. Publique somente `food-platform-create-store` e `food-public-checkout`.
9. Configure o frontend Food com a mesma URL/anon key.
10. Crie uma loja Food teste e faça um pedido ponta a ponta.

## Queries de verificação

```sql
-- FloriWeb continua presente e separado
select count(*) from public.stores;
select count(*) from public.products;
select count(*) from public.orders;

-- Food Service nasce vazio (ou apenas com seed, se aplicado)
select count(*) from public.food_stores;
select count(*) from public.food_products;
select count(*) from public.food_orders;

-- Confirma principais objetos Food
select to_regclass('public.food_stores');
select to_regclass('public.food_orders');
select to_regprocedure('public.food_create_public_order(jsonb)');
```

## Primeiro Master Food

Se a conta já existe no Auth do FloriWeb, reutilize o mesmo `auth.users.id` sem alterar senha:

```sql
insert into public.food_platform_admins (user_id, name)
select id, coalesce(raw_user_meta_data->>'name', email, 'Master Food')
from auth.users
where lower(email) = lower('SEU_EMAIL@EMPRESA.COM')
on conflict (user_id) do update
set active=true, name=excluded.name, updated_at=now();
```

## Domínios

Ao cadastrar um domínio no Food Service, o banco rejeita domínios ativos já existentes em `store_domains` do FloriWeb.

Para não modificar o produto existente, o inverso não foi instalado como trigger no FloriWeb. Portanto, antes de cadastrar manualmente um novo domínio no FloriWeb, confira também:

```sql
select *
from public.food_store_domains
where lower(domain)=lower('pedidos.exemplo.com.br')
  and active=true;
```

## O que não fazer

- Não renomear as tabelas FloriWeb para tentar compartilhá-las agora.
- Não copiar nem executar migrations do repositório FloriWeb como parte do deploy Food.
- Não publicar `public-checkout` ou `platform-create-store` sem prefixo a partir deste repositório.
- Não copiar `service_role` para `.env` do Vite.
- Não cadastrar produtos Food em `public.products`.
