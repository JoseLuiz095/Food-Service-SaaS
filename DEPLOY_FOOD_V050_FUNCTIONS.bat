@echo off
setlocal EnableExtensions
cd /d "%~dp0"
cls

echo ============================================================
echo FoodWeb v0.5.0 - Publicar Edge Function atualizada
echo ============================================================
echo.
echo Atualiza food-platform-manage-store-user para registrar auditoria
ECHO segura das alteracoes de credenciais do lojista.
echo.

if not exist "supabase\functions\food-platform-manage-store-user\index.ts" goto :falha_arquivo

if defined SUPABASE_PROJECT_REF (
  call npx supabase@2.116.0 functions deploy food-platform-manage-store-user --project-ref "%SUPABASE_PROJECT_REF%"
) else (
  call npx supabase@2.116.0 functions deploy food-platform-manage-store-user
)
if errorlevel 1 goto :falha

echo.
echo SUCESSO - food-platform-manage-store-user publicada.
pause
exit /b 0

:falha_arquivo
echo ERRO: Edge Function food-platform-manage-store-user nao encontrada.
pause
exit /b 1

:falha
echo.
echo FALHA ao publicar food-platform-manage-store-user.
echo Se necessario, execute antes:
echo   npx supabase@2.116.0 login
echo   npx supabase@2.116.0 link --project-ref SEU_PROJECT_REF
pause
exit /b 1
