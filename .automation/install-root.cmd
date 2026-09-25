@echo off
setlocal EnableExtensions
set "ROOT=%~1"
if "%ROOT%"=="" set "ROOT=%CD%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-project-node.ps1" "%ROOT%" >nul 2>&1
for /L %%I in (1,1,3) do (
  echo [DEPENDENCIAS] npm ci - tentativa %%I de 3...
  call npm ci
  if not errorlevel 1 goto :ok
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-project-node.ps1" "%ROOT%" >nul 2>&1
  timeout /t 2 /nobreak >nul
)
echo ERRO: npm ci falhou apos 3 tentativas.
exit /b 1
:ok
if not exist "node_modules\.bin\tsc.cmd" (
  echo ERRO: TypeScript local nao foi instalado corretamente.
  exit /b 1
)
exit /b 0
