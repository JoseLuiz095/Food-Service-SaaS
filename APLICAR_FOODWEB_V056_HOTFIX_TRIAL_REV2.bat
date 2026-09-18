@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo FoodWeb V0.5.6 - HOTFIX ELEGIBILIDADE DEMO REV2
echo ============================================================
echo Pasta: %CD%
echo.

where node >nul 2>&1
if errorlevel 1 goto :fail
if not exist "package.json" (
  echo ERRO: package.json nao encontrado. Extraia este pacote na raiz do FoodWeb.
  goto :fail
)
if not exist "src\pages\store\SelfSignup.tsx" (
  echo ERRO: Auto cadastro V0.5.6 nao encontrado. Aplique primeiro o pacote base V0.5.6.
  goto :fail
)

echo [1/2] Aplicando hotfix com backup...
node "%~dp0scripts\apply-food-v056-rev2.mjs"
if errorlevel 1 goto :fail

echo.
echo [2/2] Conferindo TypeScript/build local...
call npm run build
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo SUCESSO - HOTFIX REV2 APLICADO

echo Agora execute no Supabase a migration 202609180810 e a validacao REV2.
echo ============================================================
pause
exit /b 0

:fail
echo.
echo ============================================================
echo FALHA - hotfix interrompido. Nenhum push foi executado.
echo ============================================================
pause
exit /b 1
