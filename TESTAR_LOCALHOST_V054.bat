@echo off
cd /d "%~dp0"
echo ============================================================
echo FoodWeb v0.5.4 - Teste localhost
echo ============================================================
echo.
call npm install
if errorlevel 1 goto :fail
call npm run typecheck
if errorlevel 1 goto :fail
call npm run dev
exit /b 0
:fail
echo.
echo FALHA - corrija o erro acima antes de publicar.
pause
exit /b 1
