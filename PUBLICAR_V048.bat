@echo off
setlocal EnableExtensions
cd /d "%~dp0"
cls

echo ============================================================
echo FoodWeb v0.4.8 - Validar e publicar
echo ============================================================
echo.
echo Esta versao:
echo - preserva o .env atual
echo - nao possui migration nova
echo - republica food-platform-manage-store-user
echo - deixa e-mail/senha visiveis no topo do modal Gerenciar
echo - forca favicon FoodWeb v0.4.8 no novo build
echo.

if not exist "package.json" (
  echo ERRO: execute este BAT na raiz do FoodWeb.
  pause
  exit /b 1
)
set "HAS_ENV="
if exist ".env" set "HAS_ENV=1"
if exist ".env.local" set "HAS_ENV=1"
if exist ".env.production" set "HAS_ENV=1"
if not defined HAS_ENV (
  echo ERRO: nenhum arquivo .env foi encontrado.
  echo Este BAT NAO cria .env para nao substituir suas chaves.
  pause
  exit /b 1
)

echo [1/7] Conferindo v0.4.8 e configuracoes existentes...
call node scripts\v048-check.mjs
if errorlevel 1 goto :falha

echo.
echo [2/7] Validando variaveis publicas existentes...
call npm run check:env
if errorlevel 1 goto :falha

echo.
echo [3/7] Republicando Edge Function de gestao de acesso...
if defined SUPABASE_PROJECT_REF (
  call npx supabase@2.116.0 functions deploy food-platform-manage-store-user --project-ref "%SUPABASE_PROJECT_REF%"
) else (
  call npx supabase@2.116.0 functions deploy food-platform-manage-store-user
)
if errorlevel 1 goto :falha_edge

echo.
echo [4/7] Instalando/atualizando dependencias...
call npm install
if errorlevel 1 goto :falha

echo.
echo [5/7] Limpando build antigo e validando projeto...
if exist "dist" rmdir /s /q "dist"
call npm run validate
if errorlevel 1 goto :falha

echo.
echo [6/7] Confirmando favicon v0.4.8 no build...
if not exist "dist\favicon-foodweb-v048.svg" goto :icone_falha
findstr /c:"favicon-foodweb-v048.svg" "dist\index.html" >nul 2>&1
if errorlevel 1 goto :icone_falha

echo.
echo [7/7] Publicando Cloudflare Worker...
call npx wrangler deploy
if errorlevel 1 goto :falha

echo.
echo ============================================================
echo SUCESSO - FoodWeb v0.4.8 publicado
echo ============================================================
echo.
echo Teste recomendado:
echo - Admin Master ^> Estabelecimentos ^> Gerenciar
echo - E-mail de acesso e Nova senha devem aparecer no topo do modal
echo - altere somente o e-mail e salve
echo - depois teste uma nova senha com confirmacao
echo.
echo O .env existente nao foi substituido.
pause
exit /b 0

:falha_edge
echo.
echo FALHA ao publicar food-platform-manage-store-user.
echo O frontend NAO foi publicado para evitar tela de e-mail/senha sem backend.
echo Se necessario, vincule o Supabase CLI ao projeto e tente novamente.
pause
exit /b 1

:icone_falha
echo.
echo ERRO: o build terminou, mas o favicon v0.4.8 nao entrou no dist.
echo O deploy foi interrompido para nao publicar o icone antigo.
pause
exit /b 1

:falha
echo.
echo FALHA. A publicacao foi interrompida.
echo O .env existente nao foi alterado por este BAT.
pause
exit /b 1
