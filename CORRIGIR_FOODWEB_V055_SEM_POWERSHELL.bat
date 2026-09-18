@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo FoodWeb v0.5.5 - CORRIGIR VERSIONAMENTO SEM POWERSHELL
echo ============================================================
echo Pasta: %CD%
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado no PATH.
  goto :fail
)

if not exist "package.json" (
  echo ERRO: package.json nao encontrado.
  echo Coloque este BAT e corrigir_foodweb_v055.mjs na raiz do FoodWeb.
  goto :fail
)

if not exist "scripts\smoke.mjs" (
  echo ERRO: scripts\smoke.mjs nao encontrado.
  goto :fail
)

if not exist "corrigir_foodweb_v055.mjs" (
  echo ERRO: corrigir_foodweb_v055.mjs nao encontrado na mesma pasta deste BAT.
  goto :fail
)

echo [1/3] Corrigindo versao e smoke com Node...
node "corrigir_foodweb_v055.mjs"
if errorlevel 1 goto :fail

echo.
echo [2/3] Conferindo versao...
node -p "'v' + require('./package.json').version"
if errorlevel 1 goto :fail

echo.
echo [3/3] Executando validacao completa...
call npm run validate
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo SUCESSO - FoodWeb v0.5.5 validado.
echo Nenhum push foi executado por este BAT.
echo Agora execute PUBLICAR_FOODWEB_GITHUB_V055_SEM_POWERSHELL.bat
echo ============================================================
pause
exit /b 0

:fail
echo.
echo ============================================================
echo FALHA - processo interrompido com seguranca.
echo Nenhum push para o GitHub foi executado por este BAT.
echo ============================================================
pause
exit /b 1
