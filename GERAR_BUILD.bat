@echo off
setlocal
cd /d "%~dp0"
title Food Service SaaS - Build

echo ============================================================
echo Food Service SaaS MVP v0.1 - Build
echo ============================================================
call npm run build
if errorlevel 1 (
  echo.
  echo FALHA no build. Revise os erros acima.
  pause
  exit /b 1
)
echo.
echo Build concluido. Pasta gerada: dist
echo Para testar: npm run preview
pause
