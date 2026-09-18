@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo FoodWeb v0.4.9 - Aplicar na raiz atual
echo ============================================================
echo.

if not exist "package.json" goto :raiz_invalida
if not exist "src\pages\admin\Orders.tsx" goto :raiz_invalida
if not exist "src\services\storeApi.ts" goto :raiz_invalida
if not exist "src\styles.css" goto :raiz_invalida
if not exist "payload\package.json" goto :payload_invalido

set "BACKUP=_backup_food_v049"
if not exist "%BACKUP%" mkdir "%BACKUP%"
if not exist "%BACKUP%\src\pages\admin" mkdir "%BACKUP%\src\pages\admin"
if not exist "%BACKUP%\src\services" mkdir "%BACKUP%\src\services"
if not exist "%BACKUP%\src\contexts" mkdir "%BACKUP%\src\contexts"
if not exist "%BACKUP%\src\types" mkdir "%BACKUP%\src\types"
if not exist "%BACKUP%\scripts" mkdir "%BACKUP%\scripts"

copy /y "package.json" "%BACKUP%\package.json" >nul
if exist "package-lock.json" copy /y "package-lock.json" "%BACKUP%\package-lock.json" >nul
copy /y "src\pages\admin\Orders.tsx" "%BACKUP%\src\pages\admin\Orders.tsx" >nul
copy /y "src\pages\admin\Finance.tsx" "%BACKUP%\src\pages\admin\Finance.tsx" >nul
copy /y "src\services\storeApi.ts" "%BACKUP%\src\services\storeApi.ts" >nul
copy /y "src\contexts\StoreContext.tsx" "%BACKUP%\src\contexts\StoreContext.tsx" >nul
copy /y "src\types\index.ts" "%BACKUP%\src\types\index.ts" >nul
copy /y "src\styles.css" "%BACKUP%\styles.css" >nul
if exist "scripts\smoke.mjs" copy /y "scripts\smoke.mjs" "%BACKUP%\scripts\smoke.mjs" >nul

copy /y "payload\package.json" "package.json" >nul
copy /y "payload\package-lock.json" "package-lock.json" >nul
copy /y "payload\src\pages\admin\Orders.tsx" "src\pages\admin\Orders.tsx" >nul
copy /y "payload\src\pages\admin\Finance.tsx" "src\pages\admin\Finance.tsx" >nul
copy /y "payload\src\services\storeApi.ts" "src\services\storeApi.ts" >nul
copy /y "payload\src\contexts\StoreContext.tsx" "src\contexts\StoreContext.tsx" >nul
copy /y "payload\src\types\index.ts" "src\types\index.ts" >nul
copy /y "payload\scripts\smoke.mjs" "scripts\smoke.mjs" >nul
copy /y "payload\scripts\v049-check.mjs" "scripts\v049-check.mjs" >nul

if not exist "supabase\migrations" mkdir "supabase\migrations"
copy /y "payload\supabase\migrations\202609041610_foodweb_v049_order_payment_finance.sql" "supabase\migrations\202609041610_foodweb_v049_order_payment_finance.sql" >nul
copy /y "payload\supabase\VALIDAR_V049.sql" "supabase\VALIDAR_V049.sql" >nul

findstr /c:"FoodWeb v0.4.9 - confirmacao de recebimento do pedido" "src\styles.css" >nul
if errorlevel 1 (
  echo.>>"src\styles.css"
  type "payload\styles_v049_append.css" >>"src\styles.css"
)

echo [OK] Arquivos v0.4.9 aplicados.
echo [OK] .env, wrangler.jsonc e configuracoes existentes nao foram substituidos.
echo [OK] Backup criado em %BACKUP%.
echo.
node scripts\v049-check.mjs
if errorlevel 1 goto :falha

echo.
echo PROXIMO PASSO:
echo 1. Execute no Supabase SQL Editor:
echo    supabase\migrations\202609041610_foodweb_v049_order_payment_finance.sql
echo 2. Execute:
echo    supabase\VALIDAR_V049.sql
echo 3. Depois execute PUBLICAR_V049.bat
echo.
pause
exit /b 0

:raiz_invalida
echo ERRO: este BAT deve ficar na raiz atual do FoodWeb.
pause
exit /b 1

:payload_invalido
echo ERRO: pasta payload da v0.4.9 nao encontrada.
pause
exit /b 1

:falha
echo.
echo FALHA ao validar os arquivos aplicados. Nenhum deploy foi executado.
pause
exit /b 1
