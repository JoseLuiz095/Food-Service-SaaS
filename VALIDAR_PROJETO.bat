@echo off
setlocal
cd /d "%~dp0"
title Food Service SaaS - Validacao

echo ============================================================
echo Food Service SaaS MVP v0.1 - Validacao tecnica
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado. Instale Node.js 22.18.0 ou superior.
  pause
  exit /b 1
)

if not exist node_modules\.bin\vite.cmd (
  echo Dependencias nao encontradas. Executando npm install...
  call npm install
  if errorlevel 1 goto :falha
)

echo.
echo Executando smoke, fluxo critico, TypeScript e build...
call npm run validate
if errorlevel 1 goto :falha

if not exist dist goto :falha

echo.
echo ============================================================
echo VALIDACAO CONCLUIDA
echo Build disponivel em: %CD%\dist
echo ============================================================
pause
exit /b 0

:falha
echo.
echo ============================================================
echo FALHA NA VALIDACAO
ECHO Revise a mensagem de erro acima.
echo ============================================================
pause
exit /b 1
