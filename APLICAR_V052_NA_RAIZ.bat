@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo FoodWeb v0.5.2 - Aplicar na raiz para PRODUCAO
echo ============================================================
echo.
echo Preserva .env, wrangler.jsonc, Supabase e .git.
echo Nao executa migration.
echo.
if not exist package.json (
  echo ERRO: package.json nao encontrado. Extraia na raiz atual do FoodWeb.
  pause
  exit /b 1
)
if not exist payload\src\styles.css (
  echo ERRO: pasta payload incompleta.
  pause
  exit /b 1
)
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set STAMP=%%i
set BACKUP=_backup_v052_producao_%STAMP%
echo [1/4] Criando backup em %BACKUP%...
mkdir "%BACKUP%\src\types" >nul 2>&1
mkdir "%BACKUP%\src\utils" >nul 2>&1
mkdir "%BACKUP%\src\components" >nul 2>&1
mkdir "%BACKUP%\src\pages\admin" >nul 2>&1
mkdir "%BACKUP%\src\pages\store" >nul 2>&1
mkdir "%BACKUP%\src\layouts" >nul 2>&1
mkdir "%BACKUP%\public" >nul 2>&1
mkdir "%BACKUP%\scripts" >nul 2>&1
for %%F in (package.json index.html) do if exist "%%F" copy /Y "%%F" "%BACKUP%\%%F" >nul
for %%F in (src\types\index.ts src\utils\storeHours.ts src\components\StoreHeader.tsx src\pages\admin\Settings.tsx src\pages\admin\Finance.tsx src\pages\admin\Orders.tsx src\pages\store\OrderSuccess.tsx src\layouts\MasterLayout.tsx src\styles.css public\favicon.svg scripts\smoke.mjs) do if exist "%%F" copy /Y "%%F" "%BACKUP%\%%F" >nul

echo [2/4] Aplicando v0.5.2...
copy /Y payload\package.json package.json >nul || goto :fail
copy /Y payload\index.html index.html >nul || goto :fail
xcopy /E /I /Y payload\src src >nul || goto :fail
xcopy /E /I /Y payload\public public >nul || goto :fail
xcopy /E /I /Y payload\scripts scripts >nul || goto :fail

echo [3/4] Conferindo marcadores principais...
node scripts\v052-check.mjs
if errorlevel 1 goto :fail

echo [4/4] v0.5.2 aplicada localmente.
echo.
echo ============================================================
echo SUCESSO - arquivos de PRODUCAO preparados.
echo ============================================================
echo Backup: %BACKUP%
echo.
echo Para testar no localhost: TESTAR_LOCALHOST_V052.bat
echo Para publicar direto: PUBLICAR_V052.bat
pause
exit /b 0
:fail
echo.
echo ============================================================
echo FALHA - v0.5.2 nao foi aplicada por completo.
echo O .env, wrangler.jsonc e configuracoes externas nao foram alterados.
echo Backup: %BACKUP%
echo ============================================================
pause
exit /b 1
