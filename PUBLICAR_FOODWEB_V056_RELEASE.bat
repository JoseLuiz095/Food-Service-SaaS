@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "REPO=https://github.com/JoseLuiz095/Food-Service-SaaS.git"
set "BRANCH=release/foodweb-v0.5.6"
set "TAG=v0.5.6"

echo ============================================================
echo FoodWeb v0.5.6 - Publicar branch de release no GitHub
echo ============================================================
echo.
echo Este BAT NAO altera a main.
echo Publica:
echo   Branch: %BRANCH%
echo   Tag:    %TAG%
echo.

if not exist package.json (
  echo ERRO: coloque este BAT na raiz do projeto FoodWeb.
  pause
  exit /b 1
)

where git >nul 2>&1
if errorlevel 1 (
  echo ERRO: Git nao encontrado no PATH.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado no PATH.
  pause
  exit /b 1
)

for /f "delims=" %%V in ('node -p "require('./package.json').version"') do set "VERSION=%%V"
if not "%VERSION%"=="0.5.6" (
  echo ERRO: package.json esta na versao %VERSION%, esperado 0.5.6.
  pause
  exit /b 1
)

if not exist .git (
  echo [1/9] Inicializando repositorio Git local...
  git init
  if errorlevel 1 goto :fail
) else (
  echo [1/9] Repositorio Git local encontrado.
)

echo [2/9] Configurando origin...
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin "%REPO%"
) else (
  git remote set-url origin "%REPO%"
)
if errorlevel 1 goto :fail

echo [3/9] Buscando main e tags atuais...
git fetch origin main --tags
if errorlevel 1 goto :fail

echo [4/9] Conferindo se branch/tag v0.5.6 ja existem remotamente...
git ls-remote --exit-code --heads origin "refs/heads/%BRANCH%" >nul 2>&1
if not errorlevel 1 (
  echo ERRO: a branch remota %BRANCH% ja existe.
  echo Nao vou sobrescrever automaticamente.
  pause
  exit /b 1
)

git ls-remote --exit-code --tags origin "refs/tags/%TAG%" >nul 2>&1
if not errorlevel 1 (
  echo ERRO: a tag remota %TAG% ja existe.
  echo Nao vou sobrescrever automaticamente.
  pause
  exit /b 1
)

echo [5/9] Criando branch local sobre origin/main sem substituir seus arquivos...
git checkout -B "%BRANCH%"
if errorlevel 1 goto :fail
git reset --mixed origin/main
if errorlevel 1 goto :fail

echo [6/9] Preparando snapshot do projeto...
git add -A
if errorlevel 1 goto :fail

rem Nunca publicar arquivos locais de ambiente.
for %%F in (.env .env.local .env.production .env.development .env.preview) do (
  git reset HEAD -- "%%F" >nul 2>&1
)
git reset HEAD -- ".wrangler" >nul 2>&1
git reset HEAD -- "node_modules" >nul 2>&1

echo.
echo Arquivos preparados:
git status --short
echo.

git diff --cached --quiet
if not errorlevel 1 (
  echo ERRO: nao ha alteracoes preparadas para publicar.
  pause
  exit /b 1
)

echo [7/9] Confirmacao manual.
echo.
echo Revise a lista acima.
set /p "CONF=Digite S para criar o commit e publicar a release: "
if /I not "%CONF%"=="S" (
  echo Publicacao cancelada. Nada foi enviado.
  pause
  exit /b 0
)

echo [8/9] Criando commit e tag...
git commit -m "release: FoodWeb v0.5.6"
if errorlevel 1 goto :fail

git tag -a "%TAG%" -m "FoodWeb v0.5.6"
if errorlevel 1 goto :fail

echo [9/9] Enviando branch e tag...
git push -u origin "%BRANCH%"
if errorlevel 1 goto :fail

git push origin "%TAG%"
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo SUCESSO
echo ============================================================
echo Branch publicada: %BRANCH%
echo Tag publicada:    %TAG%
echo.
echo A main NAO foi alterada.
echo Se o Cloudflare gera Preview por branch, aguarde o deploy e teste.
echo Se ele publica somente a main, use depois:
echo   PROMOVER_FOODWEB_V056_PARA_MAIN.bat
echo.
pause
exit /b 0

:fail
echo.
echo ============================================================
echo FALHA - publicacao interrompida.
echo ============================================================
echo Verifique a mensagem imediatamente acima.
echo Nao use force push.
pause
exit /b 1
