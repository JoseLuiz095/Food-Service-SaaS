# Atualizar FoodWeb para v0.4.2

A v0.4.2 corrige o erro **Supabase não configurado** após publicação e transforma a URL raiz oficial do FoodWeb em uma landing page comercial, sem alterar o funcionamento das lojas por slug ou domínio próprio.

## 1. Banco

Faça backup do Supabase e execute **somente** a migration incremental:

`supabase/migrations/202609021020_foodweb_v042_public_landing.sql`

Depois execute:

`supabase/VALIDAR_V042.sql`

A migration v0.4/v0.4.1 não deve ser repetida se já tiver sido aplicada.

## 2. Configuração pública do Supabase

A aplicação agora possui fallback para a URL e publishable key públicas do projeto compartilhado. Isso permite que login Admin e Admin Master funcionem mesmo quando um ZIP novo não contém `.env`.

Variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`/`VITE_SUPABASE_PUBLISHABLE_KEY` continuam tendo prioridade quando definidas.

O fallback **não inclui** `service_role`, Turnstile secret ou qualquer segredo de servidor.

## 3. Turnstile

Se `TURNSTILE_REQUIRED=true` estiver ativo nas Edge Functions, configure a Site Key no frontend:

`VITE_TURNSTILE_SITE_KEY=SUA_SITE_KEY`

No Supabase permanecem os secrets:

- `TURNSTILE_REQUIRED=true`
- `TURNSTILE_SECRET_KEY=...`
- `PUBLIC_APP_ORIGINS=https://foodweb.joseluizacama.workers.dev`

## 4. Validar frontend

No diretório do projeto:

```cmd
npm install
npm run check:env
npm run validate
```

`npm run validate` já executa smoke, fluxo crítico, TypeScript e Vite build. Não é necessário executar `npm run build` novamente.

## 5. Publicar

Se as Edge Functions v0.4 já foram publicadas, a v0.4.2 não exige novo deploy delas. A nova funcionalidade de landing está em RPC/migration + frontend.

Publique o frontend:

```cmd
npx wrangler deploy
```

Ou execute `PUBLICAR_V042.bat`.

## 6. Resultado esperado

- `https://foodweb.joseluizacama.workers.dev/` => landing comercial FoodWeb.
- `https://foodweb.joseluizacama.workers.dev/<slug-da-loja>` => loja.
- `/admin/login` e `/admin-master/login` => não devem mais exibir “Supabase não configurado” por ausência de `.env`.
- Landing lista lojas publicadas e planos ativos consultando o banco.

## 7. Git

Em um clone já existente:

```cmd
git status
git add -A
git commit -m "feat: FoodWeb v0.4.2 landing comercial e config Supabase"
git push origin main
```

Evite `git init` e `git push --force` em atualizações normais.
