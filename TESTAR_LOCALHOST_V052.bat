@echo off
setlocal
cd /d "%~dp0"
echo ============================================================
echo FoodWeb v0.5.2 - Teste local opcional
echo ============================================================
echo.
echo Acesse o endereco que o Vite mostrar no terminal.
echo CTRL+C encerra o servidor.
echo.
call npm install
if errorlevel 1 goto :fail
call npm run typecheck
if errorlevel 1 goto :fail
call npm run dev -- --host 127.0.0.1
exit /b %errorlevel%
:fail
echo Falha antes de iniciar localhost.
pause
exit /b 1
