@echo off
setlocal EnableExtensions
cd /d "%~dp0"
cls

echo ============================================================
echo FoodWeb v0.5.0 - Aplicar na raiz atual
echo Estabilidade, cobranca e diagnostico
echo ============================================================
echo.
echo Este pacote PRESERVA .env, Wrangler, Supabase config e Git.
echo Requer a base v0.4.9 ja aplicada no projeto.
echo.

if not exist "package.json" goto :raiz_invalida
if not exist "src\pages\master\Payments.tsx" goto :raiz_invalida
if not exist "src\pages\admin\Finance.tsx" goto :raiz_invalida
if not exist "supabase\migrations\202609041610_foodweb_v049_order_payment_finance.sql" goto :base_invalida
if not exist "payload\package.json" goto :payload_invalido
if not exist "payload\scripts\v050-check.mjs" goto :payload_invalido

node -e "const v=require('./package.json').version;process.exit(v==='0.4.9'||v==='0.5.0'?0:1)"
if errorlevel 1 goto :versao_invalida

set "BACKUP=_backup_food_v050"
if not exist "%BACKUP%" mkdir "%BACKUP%"

echo [1/4] Criando backup dos arquivos atuais...
if exist "src" xcopy "src" "%BACKUP%\src" /E /I /Y /Q >nul
if exist "package.json" copy /Y "package.json" "%BACKUP%\package.json" >nul
if exist "index.html" copy /Y "index.html" "%BACKUP%\index.html" >nul
if exist "public\favicon.svg" (
  if not exist "%BACKUP%\public" mkdir "%BACKUP%\public"
  copy /Y "public\favicon.svg" "%BACKUP%\public\favicon.svg" >nul
)
if exist "scripts\smoke.mjs" (
  if not exist "%BACKUP%\scripts" mkdir "%BACKUP%\scripts"
  copy /Y "scripts\smoke.mjs" "%BACKUP%\scripts\smoke.mjs" >nul
)
if exist "supabase\functions\food-platform-manage-store-user\index.ts" (
  if not exist "%BACKUP%\supabase\functions\food-platform-manage-store-user" mkdir "%BACKUP%\supabase\functions\food-platform-manage-store-user"
  copy /Y "supabase\functions\food-platform-manage-store-user\index.ts" "%BACKUP%\supabase\functions\food-platform-manage-store-user\index.ts" >nul
)

echo [2/4] Aplicando v0.5.0 sem tocar nas configuracoes locais...
xcopy "payload\*" "." /E /I /Y /Q >nul
if errorlevel 2 goto :falha_copia

rem Forca novamente o icone FoodWeb correto e o caminho versionado.
copy /Y "payload\public\favicon.svg" "public\favicon.svg" >nul
copy /Y "payload\public\favicon-foodweb-v050.svg" "public\favicon-foodweb-v050.svg" >nul

echo [3/4] Conferindo os arquivos aplicados...
call node scripts\v050-check.mjs
if errorlevel 1 goto :falha

echo [4/4] Conferindo preservacao do ambiente...
if exist ".env" echo OK   .env preservado
if exist ".env.local" echo OK   .env.local preservado
if exist ".env.production" echo OK   .env.production preservado
if exist "wrangler.jsonc" echo OK   wrangler.jsonc preservado
if exist "supabase\config.toml" echo OK   supabase\config.toml preservado

echo.
echo ============================================================
echo FOODWEB v0.5.0 APLICADO COM SUCESSO
ECHO ============================================================
echo Backup: %BACKUP%
echo.
echo PROXIMOS PASSOS NO SUPABASE SQL EDITOR:
echo 1. Execute:
echo    supabase\migrations\202609151040_foodweb_v050_stability_billing_audit.sql
echo 2. Execute:
echo    supabase\VALIDAR_V050.sql
echo 3. Se a validacao passar, execute PUBLICAR_V050.bat
pause
exit /b 0

:raiz_invalida
echo ERRO: extraia este pacote diretamente na raiz atual do FoodWeb.
pause
exit /b 1

:base_invalida
echo ERRO: a base v0.4.9 nao foi encontrada nesta raiz.
echo Aplique primeiro v0.4.9, incluindo a migration de recebimento-financeiro.
pause
exit /b 1

:versao_invalida
echo ERRO: este patch espera FoodWeb 0.4.9.
echo Se estiver em uma versao anterior, aplique as atualizacoes anteriores primeiro.
pause
exit /b 1

:payload_invalido
echo ERRO: pasta payload da v0.5.0 incompleta.
pause
exit /b 1

:falha_copia
echo ERRO: falha ao copiar os arquivos do payload.
echo Consulte o backup em %BACKUP%.
pause
exit /b 1

:falha
echo.
echo FALHA ao validar a v0.5.0 aplicada.
echo Nenhum deploy foi executado e o .env nao foi alterado.
pause
exit /b 1
