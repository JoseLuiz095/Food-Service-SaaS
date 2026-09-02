@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo Food Service SaaS - Atualizar Impeccable
 echo ============================================================
echo.
call npx --yes impeccable@3.6.0 skills update -y
if errorlevel 1 exit /b 1
call npm run design:verify
exit /b %errorlevel%
