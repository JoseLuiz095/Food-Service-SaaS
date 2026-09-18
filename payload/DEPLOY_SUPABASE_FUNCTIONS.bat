@echo off
setlocal EnableExtensions
cd /d "%~dp0"
cls
echo ============================================================
echo FoodWeb v0.4.6 - Edge Functions Supabase
echo ============================================================
echo.
echo IMPORTANTE:
echo - OCR financeiro continua LOCAL no navegador.
echo - food-platform-manage-store-user e a nova funcao v0.4.6.
echo - Este BAT preserva os secrets existentes do projeto.
echo.
set "PROJECT_REF=%SUPABASE_PROJECT_REF%"
if "%PROJECT_REF%"=="" set /p PROJECT_REF=Informe o Project Ref atual do Supabase: 
if "%PROJECT_REF%"=="" (
  echo ERRO: Project Ref nao informado.
  pause
  exit /b 1
)

echo.
echo [1/4] Criacao automatica de lojas...
call npx supabase@2.116.0 functions deploy food-platform-create-store --project-ref "%PROJECT_REF%"
if errorlevel 1 goto :falha

echo.
echo [2/4] Gestao de e-mail e senha do lojista...
call npx supabase@2.116.0 functions deploy food-platform-manage-store-user --project-ref "%PROJECT_REF%"
if errorlevel 1 goto :falha

echo.
echo [3/4] Checkout publico + Turnstile...
call npx supabase@2.116.0 functions deploy food-public-checkout --project-ref "%PROJECT_REF%" --no-verify-jwt
if errorlevel 1 goto :falha

echo.
echo [4/4] Contato comercial publico protegido...
call npx supabase@2.116.0 functions deploy food-public-contact --project-ref "%PROJECT_REF%" --no-verify-jwt
if errorlevel 1 goto :falha

echo.
call npx supabase@2.116.0 functions list --project-ref "%PROJECT_REF%"
echo.
echo CONCLUIDO.
echo.
echo Secrets existentes continuam em uso. Nenhum .env foi alterado.
pause
exit /b 0

:falha
echo.
echo FALHA ao publicar Edge Functions FoodWeb.
echo Se necessario, execute antes: npx supabase@2.116.0 login
pause
exit /b 1
