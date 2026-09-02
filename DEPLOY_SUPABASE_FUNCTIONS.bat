@echo off
setlocal
cd /d "%~dp0"
cls
echo ============================================================
echo Food Service SaaS v0.3 - Edge Functions
echo ============================================================
echo.
echo Publica SOMENTE funcoes food-* no Supabase compartilhado.
echo Nenhuma Edge Function do FloriWeb sera sobrescrita.
echo.
set "PROJECT_REF=%SUPABASE_PROJECT_REF%"
if "%PROJECT_REF%"=="" set /p PROJECT_REF=Informe o Project Ref atual do Supabase: 
if "%PROJECT_REF%"=="" (
  echo ERRO: Project Ref nao informado.
  pause
  exit /b 1
)

echo.
call npx supabase@2.116.0 functions deploy food-platform-create-store --project-ref "%PROJECT_REF%"
if errorlevel 1 goto :falha
call npx supabase@2.116.0 functions deploy food-public-checkout --project-ref "%PROJECT_REF%" --no-verify-jwt
if errorlevel 1 goto :falha
call npx supabase@2.116.0 functions deploy food-billing-create-pix --project-ref "%PROJECT_REF%"
if errorlevel 1 goto :falha
call npx supabase@2.116.0 functions deploy food-billing-asaas-webhook --project-ref "%PROJECT_REF%" --no-verify-jwt
if errorlevel 1 goto :falha
call npx supabase@2.116.0 functions deploy food-finance-document-extract --project-ref "%PROJECT_REF%"
if errorlevel 1 goto :falha

echo.
call npx supabase@2.116.0 functions list --project-ref "%PROJECT_REF%"
echo.
echo CONCLUIDO. Teste checkout, cobranca e financeiro.
pause
exit /b 0

:falha
echo.
echo FALHA ao publicar Edge Functions Food.
echo Se necessario, execute antes: npx supabase@2.116.0 login
pause
exit /b 1
