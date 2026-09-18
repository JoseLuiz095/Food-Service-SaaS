@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "REPO=https://github.com/JoseLuiz095/Food-Service-SaaS.git"
set "BRANCH=release/foodweb-v0.5.6"

echo ============================================================
echo FoodWeb v0.5.6 - Promover release para main
echo ============================================================
echo.
echo Use SOMENTE depois de testar a release.
echo.

if not exist .git (
  echo ERRO: repositorio Git local nao encontrado.
  pause
  exit /b 1
)

git remote set-url origin "%REPO%" >nul 2>&1

echo [1/4] Atualizando referencias...
git fetch origin main "%BRANCH%"
if errorlevel 1 goto :fail

echo [2/4] Verificando se a release pode avancar a main sem force...
git merge-base --is-ancestor origin/main "origin/%BRANCH%"
if errorlevel 1 (
  echo ERRO: a release nao e descendente da main atual.
  echo A main pode ter mudado. Nao vou usar force push.
  pause
  exit /b 1
)

echo [3/4] Confirmacao manual.
echo.
echo Isto vai atualizar a MAIN e pode disparar o deploy de producao no Cloudflare.
set /p "CONF=Digite S para promover v0.5.6 para main: "
if /I not "%CONF%"=="S" (
  echo Promocao cancelada.
  pause
  exit /b 0
)

echo [4/4] Atualizando main...
git push origin "origin/%BRANCH%:refs/heads/main"
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo SUCESSO - main atualizada para FoodWeb v0.5.6
echo ============================================================
echo Aguarde o build/deploy do Cloudflare e teste em producao.
echo.
pause
exit /b 0

:fail
echo.
echo ============================================================
echo FALHA - promocao interrompida.
echo ============================================================
echo Nao foi usado force push.
pause
exit /b 1
