@echo off
setlocal EnableExtensions
cd /d "%~dp0"
cls

echo ============================================================
echo FoodWeb v0.4.6 - Validar e publicar
echo ============================================================
echo.
echo Esta versao:
echo - preserva o .env atual
echo - exige a migration v0.4.6 aplicada no Supabase
echo - publica food-platform-manage-store-user
echo - preserva OCR local sem IA
echo - forca favicon FoodWeb v0.4.6 no novo build
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

echo [1/8] Conferindo v0.4.6 e o .env ja existente...
call node scripts\v046-check.mjs
if errorlevel 1 goto :falha

echo.
set /p MIGRATION_OK=Migration v0.4.6 executada e VALIDAR_V046.sql sem falhas? [S/N]: 
if /I not "%MIGRATION_OK%"=="S" goto :migration_pendente

echo.
echo [2/8] Validando variaveis publicas existentes...
call npm run check:env
if errorlevel 1 goto :falha

echo.
echo [3/8] Publicando Edge Function de gestao de acesso...
if defined SUPABASE_PROJECT_REF (
  call npx supabase@2.116.0 functions deploy food-platform-manage-store-user --project-ref "%SUPABASE_PROJECT_REF%"
) else (
  call npx supabase@2.116.0 functions deploy food-platform-manage-store-user
)
if errorlevel 1 goto :falha_edge

echo.
echo [4/8] Instalando/atualizando dependencias...
call npm install
if errorlevel 1 goto :falha

echo.
echo [5/8] Limpando build antigo e validando projeto...
if exist "dist" rmdir /s /q "dist"
call npm run validate
if errorlevel 1 goto :falha

echo.
echo [6/8] Confirmando favicon v0.4.6 no build...
if not exist "dist\favicon-foodweb-v046.svg" goto :icone_falha
findstr /c:"favicon-foodweb-v046.svg" "dist\index.html" >nul 2>&1
if errorlevel 1 goto :icone_falha

echo.
echo [7/8] Conferindo arquivos de banco entregues...
if not exist "supabase\VALIDAR_V046.sql" goto :falha
if not exist "supabase\migrations\202609032230_foodweb_v046_billing_access.sql" goto :falha

echo.
echo [8/8] Publicando Cloudflare Worker...
call npx wrangler deploy
if errorlevel 1 goto :falha

echo.
echo ============================================================
echo SUCESSO - FoodWeb v0.4.6 publicado
echo ============================================================
echo.
echo Testes recomendados:
echo - Admin Master ^> Estabelecimentos ^> Gerenciar ^> alterar e-mail/senha
echo - Admin Master ^> Estabelecimentos ^> conferir coluna Vencimento
echo - Admin Master ^> Pagamentos ^> confirmar e negar renovacao
echo - Admin lojista ^> conferir indicador verde/vermelho no topo
echo - Admin lojista ^> Meu plano ^> conferir ultimo pagamento
echo.
echo O .env existente nao foi substituido.
pause
exit /b 0

:migration_pendente
echo.
echo PUBLICACAO INTERROMPIDA.
echo Execute primeiro no SQL Editor do Supabase:
echo   supabase\migrations\202609032230_foodweb_v046_billing_access.sql
echo e depois:
echo   supabase\VALIDAR_V046.sql
pause
exit /b 1

:falha_edge
echo.
echo FALHA ao publicar food-platform-manage-store-user.
echo O frontend NAO foi publicado para evitar tela de e-mail/senha sem backend.
echo Se necessario, vincule o Supabase CLI ao projeto e tente novamente.
pause
exit /b 1

:icone_falha
echo.
echo ERRO: o build terminou, mas o favicon FoodWeb v0.4.6 nao entrou no dist.
echo O deploy foi interrompido para nao publicar o icone antigo.
pause
exit /b 1

:falha
echo.
echo FALHA. A publicacao foi interrompida.
echo O .env existente nao foi alterado por este BAT.
pause
exit /b 1
