@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo FoodWeb v0.5.2 - Validar e publicar em PRODUCAO
echo ============================================================
echo.
echo Usa o wrangler.jsonc EXISTENTE do projeto.
echo O deploy vai para o Worker de PRODUCAO ja configurado.
echo O .env existente sera preservado.
echo Nao executa migration.
echo.
set /p CONF=Publicar FoodWeb v0.5.2 diretamente em PRODUCAO? [S/N]: 
if /I not "%CONF%"=="S" exit /b 0

if not exist package.json (
  echo ERRO: package.json nao encontrado.
  pause
  exit /b 1
)

echo [1/9] Conferindo v0.5.2...
node scripts\v052-check.mjs
if errorlevel 1 goto :fail

echo [2/9] Instalando/atualizando dependencias...
call npm install
if errorlevel 1 goto :fail
echo OBS: npm warn allow-scripts e aviso se o npm retornar codigo 0.

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
if exist dist rmdir /S /Q dist
call npx vite build
if errorlevel 1 goto :fail

echo [8/9] Conferindo favicon v0.5.2...
if not exist dist\favicon-foodweb-v052.svg (
  echo ERRO: dist\favicon-foodweb-v052.svg nao foi gerado.
  goto :fail
)
findstr /C:"favicon-foodweb-v052.svg" dist\index.html >nul
if errorlevel 1 (
  echo ERRO: dist\index.html nao referencia o favicon v0.5.2.
  goto :fail
)

echo [9/9] Publicando no Worker de PRODUCAO configurado...
call npx wrangler deploy
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo SUCESSO - FoodWeb v0.5.2 publicado em PRODUCAO.
echo ============================================================
pause
exit /b 0
:fail
echo.
echo ============================================================
echo FALHA - publicacao interrompida ANTES do deploy final ou durante ele.
echo Veja a etapa imediatamente acima.
echo O .env existente nao foi alterado.
echo ============================================================
pause
exit /b 1
