@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "PROJECT_REF=%SUPABASE_PROJECT_REF%"
if "%PROJECT_REF%"=="" set /p PROJECT_REF=Informe o Project Ref atual do Supabase: 
set "OUT=DIAGNOSTICO_SUPABASE_CLI.txt"

echo Coletando diagnostico Supabase do projeto %PROJECT_REF%...
(
  echo ============================================================
  echo Food Service SaaS - Supabase CLI diagnostic
  echo Project ref: %PROJECT_REF%
  echo ============================================================
  echo.
  echo [MIGRATIONS]
  call npx --yes supabase@latest migration list --project-ref %PROJECT_REF%
  echo.
  echo [EDGE FUNCTIONS]
  call npx --yes supabase@latest functions list --project-ref %PROJECT_REF%
) > "%OUT%" 2>&1

echo.
echo Arquivo gerado: %OUT%
echo Revise o arquivo antes de enviar e remova qualquer token/secret caso apareca.
exit /b 0
