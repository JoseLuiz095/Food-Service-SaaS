@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "VERSION=0.5.5"
set "BRANCH=release/foodweb-v0.5.5"
set "TAG=v0.5.5"
set "REMOTE_URL=https://github.com/JoseLuiz095/Food-Service-SaaS.git"

echo ============================================================
echo FoodWeb - VALIDAR, VERSIONAR E PUBLICAR NO GITHUB
echo SEM POWERSHELL
echo ============================================================
echo Pasta: %CD%
echo Versao: %VERSION%
echo Repositorio: %REMOTE_URL%
echo Branch: %BRANCH%
echo Tag: %TAG%
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo ERRO: Git nao encontrado no PATH.
  goto :fail
)

where node >nul 2>&1
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado no PATH.
  goto :fail
)

if not exist "package.json" (
  echo ERRO: package.json nao encontrado. Execute este BAT na raiz do FoodWeb.
  goto :fail
)

if not exist "corrigir_foodweb_v055.mjs" (
  echo ERRO: corrigir_foodweb_v055.mjs nao encontrado.
  echo Extraia todos os arquivos do pacote na raiz do projeto.
  goto :fail
)

echo [1/10] Conferindo repositorio Git local...
if not exist ".git" (
  git init
  if errorlevel 1 goto :fail
) else (
  echo Repositorio Git local encontrado.
)

echo.
echo [2/10] Configurando origin...
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin "%REMOTE_URL%"
) else (
  git remote set-url origin "%REMOTE_URL%"
)
if errorlevel 1 goto :fail
git remote -v

echo.
echo [3/10] Buscando estado atual do GitHub...
git fetch origin main --tags
if errorlevel 1 goto :fail

echo.
echo [4/10] Corrigindo versao e smoke sem PowerShell...
node "corrigir_foodweb_v055.mjs"
if errorlevel 1 goto :fail

echo.
echo [5/10] Validando projeto...
call npm run validate
if errorlevel 1 (
  echo.
  echo VALIDACAO FALHOU. Nada sera enviado.
  goto :fail
)

echo.
echo [6/10] Ligando o repositorio local ao historico da main...
git rev-parse --verify HEAD >nul 2>&1
if errorlevel 1 (
  echo Repositorio local ainda nao possui commits. Usando origin/main como base sem alterar seus arquivos.
  git reset origin/main
  if errorlevel 1 goto :fail
)

git checkout -B "%BRANCH%" origin/main
if errorlevel 1 (
  echo.
  echo ERRO ao criar a branch sobre origin/main.
  echo Seus arquivos locais nao foram enviados.
  goto :fail
)

echo.
echo [7/10] Preparando arquivos...
git add -A
if errorlevel 1 goto :fail

rem Nunca enviar arquivos de ambiente reais.
git reset -q HEAD -- ".env" ".env.local" ".env.production" ".env.development" ".env.preview" 2>nul

echo.
echo Arquivos preparados para o commit:
git status --short

git diff --cached --quiet
if not errorlevel 1 (
  echo.
  echo Nao existem alteracoes para commit em relacao a origin/main.
  goto :fail
)

echo.
echo [8/10] Confirmacao manual...
echo.
echo Revise a lista acima.
set /p "CONFIRM=Digite S para criar o commit e enviar a branch/tag ao GitHub: "
if /I not "%CONFIRM%"=="S" (
  echo Publicacao cancelada pelo usuario.
  exit /b 0
)

echo.
echo [9/10] Criando commit...
git commit -m "release: FoodWeb v%VERSION%"
if errorlevel 1 goto :fail

git ls-remote --exit-code --tags origin "refs/tags/%TAG%" >nul 2>&1
if not errorlevel 1 (
  echo.
  echo ERRO: a tag %TAG% ja existe no GitHub.
  echo O commit local foi criado, mas nenhum push foi executado por este BAT.
  echo Verifique a tag antes de continuar.
  goto :fail
)

git tag "%TAG%"
if errorlevel 1 goto :fail

echo.
echo [10/10] Enviando branch e tag...
git push -u origin "%BRANCH%"
if errorlevel 1 goto :fail

git push origin "%TAG%"
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo SUCESSO
echo Branch enviada: %BRANCH%
echo Tag enviada: %TAG%
echo A branch main NAO foi alterada automaticamente.
echo Confira o GitHub antes de promover para main.
echo ============================================================
pause
exit /b 0

:fail
echo.
echo ============================================================
echo FALHA - processo interrompido.
echo Nenhum force push foi executado.
echo Confira a etapa imediatamente acima.
echo ============================================================
pause
exit /b 1
