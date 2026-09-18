@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo FoodWeb v0.5.1 - Validar e publicar
echo ============================================================
echo.
echo O .env existente sera preservado.
echo.

if not exist package.json (
  echo ERRO: package.json nao encontrado. Execute na raiz do projeto.
  pause
  exit /b 1
)

echo [1/9] Conferindo v0.5.1...
node scripts\v051-check.mjs
if errorlevel 1 goto :fail

set /p MIG=Migration v0.5.1 executada e VALIDAR_V051.sql sem falhas? [S/N]: 
if /I not "%MIG%"=="S" (
  echo Publicacao cancelada. Execute primeiro a migration e a validacao no Supabase.
  pause
  exit /b 2
)

echo [2/9] Instalando/atualizando dependencias...
call npm install
if errorlevel 1 goto :fail
echo OBS: npm warn allow-scripts e apenas aviso se o npm retornar codigo 0.

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

echo [8/9] Conferindo favicon v0.5.1...
if not exist dist\favicon-foodweb-v051.svg (
  echo ERRO: dist\favicon-foodweb-v051.svg nao foi gerado.
  goto :fail
)
findstr /C:"favicon-foodweb-v051.svg" dist\index.html >nul
if errorlevel 1 (
  echo ERRO: dist\index.html nao referencia o favicon v0.5.1.
  goto :fail
)

echo [9/9] Publicando no Cloudflare...
call npx wrangler deploy
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo SUCESSO - FoodWeb v0.5.1 publicado.
echo ============================================================
pause
exit /b 0

:fail
echo.
echo ============================================================
echo FALHA - publicacao interrompida antes do deploy final.
echo A etapa que falhou aparece imediatamente acima.
echo O .env existente nao foi alterado.
echo ============================================================
pause
exit /b 1
