@echo off
setlocal EnableExtensions
cd /d "%~dp0"
cls
echo ============================================================
echo FoodWeb v0.4.6 - Publicar funcao de gestao de acesso
echo ============================================================
echo.
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

:falha
echo.
echo FALHA ao publicar food-platform-manage-store-user.
echo Se necessario, execute antes: npx supabase@2.116.0 login
pause
exit /b 1
