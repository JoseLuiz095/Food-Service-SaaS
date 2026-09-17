@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo FoodWeb v0.5.1 - Aplicar na raiz
echo Planos alinhados + Business sob medida
echo ============================================================
echo.

if not exist package.json (
  echo ERRO: execute este BAT na raiz atual do FoodWeb.
  echo O arquivo package.json nao foi encontrado.
  pause
  exit /b 1
)
if not exist payload\package.json (
  echo ERRO: a pasta payload do patch nao foi encontrada.
  pause
  exit /b 1
)

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set TS=%%i
set BACKUP=_backup_food_v051_%TS%

echo [1/4] Criando backup em %BACKUP%...
mkdir "%BACKUP%" >nul 2>&1
if exist src xcopy src "%BACKUP%\src\" /E /I /Y /Q >nul
if exist package.json copy /Y package.json "%BACKUP%\package.json" >nul
if exist index.html copy /Y index.html "%BACKUP%\index.html" >nul
if exist public\favicon.svg (
  mkdir "%BACKUP%\public" >nul 2>&1
  copy /Y public\favicon.svg "%BACKUP%\public\favicon.svg" >nul
)

echo [2/4] Aplicando arquivos v0.5.1...
xcopy payload\src src\ /E /I /Y /Q >nul
xcopy payload\scripts scripts\ /E /I /Y /Q >nul
xcopy payload\public public\ /E /I /Y /Q >nul
xcopy payload\supabase supabase\ /E /I /Y /Q >nul
copy /Y payload\package.json package.json >nul
copy /Y payload\index.html index.html >nul

echo [3/4] Conferindo patch...
node scripts\v051-check.mjs
if errorlevel 1 goto :fail

echo [4/4] Patch aplicado.
echo.
echo IMPORTANTE:
echo 1. Execute no Supabase SQL Editor:
echo    supabase\migrations\202609151340_foodweb_v051_plan_alignment.sql
echo 2. Depois execute:
echo    supabase\VALIDAR_V051.sql
echo 3. Por fim execute PUBLICAR_V051.bat
echo.
echo Backup: %BACKUP%
pause
exit /b 0

:fail
echo.
echo ============================================================
echo FALHA - o patch nao passou na verificacao.
echo Backup: %BACKUP%
echo ============================================================
pause
exit /b 1
