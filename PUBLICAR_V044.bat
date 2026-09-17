@echo off
setlocal
cd /d "%~dp0"
cls
echo ============================================================
echo FoodWeb v0.4.4 - Validar e publicar FRONTEND
echo ============================================================
echo.
echo Antes de continuar, confirme:
echo   1. migration 202609031500_foodweb_v044_security_contact.sql aplicada;
echo   2. supabase\VALIDAR_V044.sql executado sem erro;
echo   3. DEPLOY_SUPABASE_FUNCTIONS.bat executado;
echo   4. VITE_TURNSTILE_SITE_KEY preenchido no .env;
echo   5. CAPTCHA Cloudflare Turnstile ativado no Supabase Auth.
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
echo SUCESSO - FoodWeb v0.4.4 publicado.
echo ============================================================
echo Teste:
echo   https://foodweb.joseluizacama.workers.dev/
echo   /central-food-demo/finalizar
echo   /admin/login
echo   /admin/financeiro
echo.
pause
exit /b 0

:fail
echo.
echo FALHA. A publicacao foi interrompida.
pause
exit /b 1
