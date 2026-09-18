@echo off
setlocal
cd /d "%~dp0"
echo ============================================================
echo FoodWeb v0.4.2 - Verificar ambiente de producao
echo ============================================================
echo.
node scripts\check-env.mjs
if errorlevel 1 (
  echo.
  echo Abra ou crie o arquivo .env nesta pasta.
  echo O .env nao vai para o GitHub porque esta no .gitignore.
  pause
  exit /b 1
)
echo.
echo Ambiente pronto para build/deploy.
pause
