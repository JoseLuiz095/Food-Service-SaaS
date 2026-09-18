@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo FoodWeb v0.5.6 - AUTO CADASTRO + APROVACAO MASTER
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado no PATH.
  goto :fail
)

if not exist "package.json" (
  echo ERRO: package.json nao encontrado.
  echo Extraia este pacote diretamente na RAIZ do FoodWeb atual.
  goto :fail
)
if not exist "scripts\apply-food-v056.mjs" (
  echo ERRO: scripts\apply-food-v056.mjs nao encontrado.
  goto :fail
)

echo [1/3] Aplicando arquivos e criando backup...
node "scripts\apply-food-v056.mjs"
if errorlevel 1 goto :fail

echo.
echo [2/3] Executando smoke e fluxo critico...
call npm run smoke
if errorlevel 1 goto :fail
call npm run test:critical
if errorlevel 1 goto :fail

echo.
echo [3/3] Conferencia local concluida.
echo.
echo IMPORTANTE - BANCO AINDA NAO FOI ALTERADO POR ESTE BAT.
echo Execute no SQL Editor do Supabase, nesta ordem:
echo   1. supabase\migrations\202609171935_foodweb_v056_self_service_signup.sql
echo   2. supabase\VALIDAR_V056_SELF_SERVICE.sql
echo.
echo Depois execute npm run validate antes de publicar.
echo ============================================================
pause
exit /b 0

:fail
echo.
echo ============================================================
echo FALHA - aplicacao interrompida.
echo O backup dos arquivos alterados foi preservado quando criado.
echo ============================================================
pause
exit /b 1
