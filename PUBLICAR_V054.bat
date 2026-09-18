@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo FoodWeb v0.5.4 - Validar e publicar em PRODUCAO
echo ============================================================
echo.
echo O visual do Admin/Admin Master foi alinhado ao FloriWeb.
echo As regras de negocio FoodWeb foram preservadas.
echo Usa o wrangler.jsonc EXISTENTE do projeto.
echo O .env existente sera preservado.
echo Nao executa migration automaticamente.
echo.
set /p DBOK=Integracao de interacoes aplicada no Supabase e VALIDAR_INTERACOES_V054.sql retornou true? [S/N]: 
if /i not "%DBOK%"=="S" goto :migration_pendente
echo.
set /p CONFIRM=Publicar FoodWeb v0.5.4 diretamente em PRODUCAO? [S/N]: 
if /i not "%CONFIRM%"=="S" exit /b 0

echo [1/9] Conferindo v0.5.4...
node scripts\v054-check.mjs
if errorlevel 1 goto :fail

echo [2/9] Instalando/atualizando dependencias...
call npm install
if errorlevel 1 goto :fail

echo [3/9] Conferindo ambiente...
call npm run check:env
if errorlevel 1 goto :fail

echo [4/9] Smoke test...
call npm run smoke
if errorlevel 1 goto :fail

echo [5/9] Fluxo critico...
call npm run test:critical
if errorlevel 1 goto :fail

echo [6/9] TypeScript...
call npm run typecheck
if errorlevel 1 goto :fail

echo [7/9] Build Vite limpo...
if exist dist rmdir /s /q dist
call npx vite build
if errorlevel 1 goto :fail

echo [8/9] Conferindo build e favicon...
if not exist "dist\index.html" (
  echo FALHA: dist\index.html nao encontrado.
  goto :fail
)
if not exist "dist\favicon-foodweb-v054.svg" (
  echo FALHA: favicon-foodweb-v054.svg nao entrou no build.
  goto :fail
)
findstr /C:"favicon-foodweb-v054.svg" "dist\index.html" >nul
if errorlevel 1 (
  echo FALHA: index do build nao referencia favicon v0.5.4.
  goto :fail
)

echo [9/9] Publicando Worker de PRODUCAO...
call npx wrangler deploy
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo SUCESSO - FoodWeb v0.5.4 publicado em PRODUCAO.
echo ============================================================
pause
exit /b 0

:migration_pendente
echo.
echo PUBLICACAO INTERROMPIDA PARA EVITAR FRONTEND SEM A RPC DE INTERACOES.
echo Execute no SQL Editor do Supabase:
echo   SUPABASE_INTERACOES_V054.sql
echo Depois execute:
echo   VALIDAR_INTERACOES_V054.sql
echo Os tres campos da primeira consulta devem retornar true.
pause
exit /b 1

:fail
echo.
echo ============================================================
echo FALHA - publicacao interrompida antes do deploy final ou durante ele.
echo Veja a etapa imediatamente acima.
echo O .env existente nao foi alterado.
echo ============================================================
pause
exit /b 1
