@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo FoodWeb v0.5.4 - Aplicar padrao visual FloriWeb na raiz
echo ============================================================
echo.

if not exist "package.json" (
  echo FALHA: package.json nao encontrado.
  echo Extraia este ZIP diretamente na raiz atual do FoodWeb.
  pause
  exit /b 1
)
if not exist "src\layouts\AdminLayout.tsx" (
  echo FALHA: raiz do FoodWeb nao reconhecida.
  pause
  exit /b 1
)

for /f "tokens=1-4 delims=/ " %%a in ('date /t') do set D=%%d%%c%%b
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set T=%%a%%b
set "BACKUP=_backup_v054_visual_%D%_%T%"
mkdir "%BACKUP%" >nul 2>&1
mkdir "%BACKUP%\src\layouts" >nul 2>&1
mkdir "%BACKUP%\src\pages\master" >nul 2>&1
mkdir "%BACKUP%\supabase\migrations" >nul 2>&1
mkdir "%BACKUP%\supabase" >nul 2>&1
mkdir "%BACKUP%\src" >nul 2>&1
mkdir "%BACKUP%\scripts" >nul 2>&1
mkdir "%BACKUP%\public" >nul 2>&1

copy /y "src\layouts\AdminLayout.tsx" "%BACKUP%\src\layouts\AdminLayout.tsx" >nul
copy /y "src\layouts\MasterLayout.tsx" "%BACKUP%\src\layouts\MasterLayout.tsx" >nul
if exist "src\pages\master\Plans.tsx" copy /y "src\pages\master\Plans.tsx" "%BACKUP%\src\pages\master\Plans.tsx" >nul
if exist "src\pages\master\Diagnostics.tsx" copy /y "src\pages\master\Diagnostics.tsx" "%BACKUP%\src\pages\master\Diagnostics.tsx" >nul
if exist "supabase\migrations\202609171230_foodweb_v054_event_log_repair.sql" copy /y "supabase\migrations\202609171230_foodweb_v054_event_log_repair.sql" "%BACKUP%\supabase\migrations\202609171230_foodweb_v054_event_log_repair.sql" >nul
if exist "supabase\VALIDAR_V054_INTERACOES.sql" copy /y "supabase\VALIDAR_V054_INTERACOES.sql" "%BACKUP%\supabase\VALIDAR_V054_INTERACOES.sql" >nul
copy /y "src\styles.css" "%BACKUP%\src\styles.css" >nul
copy /y "package.json" "%BACKUP%\package.json" >nul
copy /y "index.html" "%BACKUP%\index.html" >nul
if exist "scripts\smoke.mjs" copy /y "scripts\smoke.mjs" "%BACKUP%\scripts\smoke.mjs" >nul
if exist "public\favicon.svg" copy /y "public\favicon.svg" "%BACKUP%\public\favicon.svg" >nul

echo [1/3] Backup criado: %BACKUP%
echo [2/3] Aplicando arquivos visuais...
xcopy /e /i /y "payload\*" "." >nul
if errorlevel 1 goto :fail

echo [3/3] Conferindo v0.5.4...
node scripts\v054-check.mjs
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo SUCESSO - FoodWeb v0.5.4 aplicado localmente.
echo ============================================================
echo O .env e wrangler.jsonc nao foram alterados.
echo A migration de reparo foi apenas copiada; o BAT NAO altera o Supabase automaticamente.
echo Backup: %BACKUP%
echo.
echo Antes de publicar, execute SUPABASE_INTERACOES_V054.sql no SQL Editor do Supabase.
echo Depois valide com VALIDAR_INTERACOES_V054.sql.
echo Para testar localmente: TESTAR_LOCALHOST_V054.bat
echo Para publicar: PUBLICAR_V054.bat
echo ============================================================
pause
exit /b 0

:fail
echo.
echo ============================================================
echo FALHA - aplicacao interrompida.
echo O .env existente nao foi alterado.
echo Backup: %BACKUP%
echo ============================================================
pause
exit /b 1
