@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "APP=FoodWeb"
set "VERSION=0.5.5"
set "TAG=v0.5.5"
set "REPO=https://github.com/JoseLuiz095/Food-Service-SaaS.git"
set "MAIN_BRANCH=main"
set "RELEASE_BRANCH=release/foodweb-v0.5.5"

echo ============================================================
echo %APP% - VALIDAR, VERSIONAR E PUBLICAR NO GITHUB
echo ============================================================
echo Pasta: %CD%
echo Versao: %VERSION%
echo Repositorio: %REPO%
echo.

where git >nul 2>&1 || (echo ERRO: Git nao encontrado.& goto :fail)
where node >nul 2>&1 || (echo ERRO: Node.js nao encontrado.& goto :fail)
where npm >nul 2>&1 || (echo ERRO: npm nao encontrado.& goto :fail)

if not exist "package.json" (
  echo ERRO: package.json nao encontrado.
  echo Coloque este BAT na raiz do projeto.
  goto :fail
)

echo [1/10] Inicializando Git...
if not exist ".git" (
  git init
  if errorlevel 1 goto :fail
)
git branch -M %MAIN_BRANCH% >nul 2>&1

echo [2/10] Configurando origin...
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin "%REPO%"
) else (
  git remote set-url origin "%REPO%"
)
if errorlevel 1 goto :fail
git remote -v
echo.

echo [3/10] Buscando estado atual do GitHub...
git fetch origin --prune --tags
if errorlevel 1 goto :fail
echo.

echo [4/10] Ajustando versao...
call npm version "%VERSION%" --no-git-tag-version --allow-same-version=true
if errorlevel 1 goto :fail
echo.

echo [5/10] Validando projeto...
call npm run validate
if errorlevel 1 (
  echo VALIDACAO FALHOU. Nada sera enviado.
  goto :fail
)
echo.

echo [6/10] Preparando commit...
git add -A
git status --short
git diff --cached --quiet
if errorlevel 1 (
  git config user.name >nul 2>&1
  if errorlevel 1 (
    echo Configure antes: git config --global user.name "Seu Nome"
    goto :fail
  )
  git config user.email >nul 2>&1
  if errorlevel 1 (
    echo Configure antes: git config --global user.email "seu-email@exemplo.com"
    goto :fail
  )
  git commit -m "release: %APP% %TAG%"
  if errorlevel 1 goto :fail
) else (
  echo Nenhuma alteracao nova para commit.
)
echo.

echo [7/10] Criando tag...
git rev-parse "%TAG%" >nul 2>&1
if errorlevel 1 (
  git tag -a "%TAG%" -m "%APP% %TAG%"
  if errorlevel 1 goto :fail
) else (
  for /f "delims=" %%A in ('git rev-list -n 1 "%TAG%"') do set "TAG_SHA=%%A"
  for /f "delims=" %%A in ('git rev-parse HEAD') do set "HEAD_SHA=%%A"
  if /I not "!TAG_SHA!"=="!HEAD_SHA!" (
    echo ERRO: a tag %TAG% ja existe em outro commit.
    goto :fail
  )
)
echo.

echo [8/10] Enviando branch de seguranca...
git push -u origin HEAD:"%RELEASE_BRANCH%"
if errorlevel 1 goto :fail
echo.

echo [9/10] Enviando tag...
git push origin "%TAG%"
if errorlevel 1 goto :fail
echo.

echo [10/10] Tentando atualizar main SEM FORCE...
git rev-parse --verify origin/%MAIN_BRANCH% >nul 2>&1
if errorlevel 1 (
  git push -u origin HEAD:%MAIN_BRANCH%
  if errorlevel 1 goto :manual
  goto :success
)

git merge-base --is-ancestor origin/%MAIN_BRANCH% HEAD >nul 2>&1
if errorlevel 1 goto :manual

git push -u origin HEAD:%MAIN_BRANCH%
if errorlevel 1 goto :manual
goto :success

:manual
echo.
echo ============================================================
echo MAIN NAO FOI SUBSTITUIDA
echo ============================================================
echo A versao foi enviada com seguranca para:
echo   %RELEASE_BRANCH%
echo Tag:
echo   %TAG%
echo.
echo Confira essa branch no GitHub.
echo Se ela estiver correta, execute o BAT PROMOVER correspondente.
echo NAO use git push --force manualmente.
echo.
pause
exit /b 2

:success
echo.
echo ============================================================
echo SUCESSO
echo ============================================================
echo Main atualizada sem force.
echo Branch de seguranca: %RELEASE_BRANCH%
echo Tag: %TAG%
git log -1 --oneline
echo.
pause
exit /b 0

:fail
echo.
echo ============================================================
echo FALHA - PROCESSO INTERROMPIDO
echo ============================================================
echo Nenhum force push foi executado.
echo.
pause
exit /b 1
