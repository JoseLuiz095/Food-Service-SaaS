@echo off
setlocal EnableExtensions
if not exist "qa\package.json" (echo ERRO: pasta qa ausente.& exit /b 1)
if not exist "qa\node_modules\@playwright\test" (
  echo [QA] Instalando dependencias isoladas...
  call npm --prefix qa install || exit /b 1
)
if not exist "%LOCALAPPDATA%\ms-playwright" (
  echo [QA] Instalando Chromium...
  call npm --prefix qa run browser:install || exit /b 1
) else (
  call npm --prefix qa exec playwright -- install chromium >nul 2>&1
  if errorlevel 1 call npm --prefix qa run browser:install || exit /b 1
)
exit /b 0
