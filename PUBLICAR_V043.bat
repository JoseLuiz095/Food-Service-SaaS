@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo FoodWeb v0.4.3 - Validar e publicar FRONTEND
echo ============================================================
echo.
echo Antes de continuar, confirme que voce ja:
echo   1. aplicou a migration v0.4.3 no SQL Editor;
echo   2. executou supabase\VALIDAR_V043.sql;
echo   3. cadastrou no Admin Master:
echo      - PIX e WhatsApp de comprovantes;
echo      - WhatsApp comercial do teste gratis;
echo      - WhatsApp de suporte/Ajuda.
echo.
set /p OK=Essas etapas ja foram concluidas? [S/N]: 
if /I not "%OK%"=="S" (
  echo Publicacao cancelada.
  pause
  exit /b 1
)

echo.
echo [1/3] Instalando dependencias...
call npm install
if errorlevel 1 goto :fail

echo.
echo [2/3] Validando smoke, fluxo critico, TypeScript e build...
call npm run validate
if errorlevel 1 goto :fail

echo.
echo [3/3] Publicando Cloudflare Worker foodweb...
call npx wrangler deploy
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo SUCESSO - FoodWeb v0.4.3 publicado.
echo ============================================================
echo Teste principalmente:
echo   https://foodweb.joseluizacama.workers.dev/
echo   /central-food-demo
echo   /admin-master/planos
pause
exit /b 0

:fail
echo.
echo FALHA. A publicacao foi interrompida.
pause
exit /b 1
