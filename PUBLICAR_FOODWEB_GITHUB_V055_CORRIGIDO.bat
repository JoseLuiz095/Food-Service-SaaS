@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "REMOTE_URL=https://github.com/JoseLuiz095/Food-Service-SaaS.git"
set "VERSION=0.5.5"
set "BRANCH=release/foodweb-v0.5.5"
set "TAG=v0.5.5"
set "COMMIT_MSG=release: FoodWeb v0.5.5"

echo ============================================================
echo FoodWeb - VALIDAR, VERSIONAR E PUBLICAR NO GITHUB
echo ============================================================
echo Pasta: %CD%
echo Versao: %VERSION%
echo Repositorio: %REMOTE_URL%
echo.

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
if not exist "package.json" (
  echo ERRO: package.json nao encontrado. Execute na raiz do FoodWeb.
  pause
  exit /b 1
)
if not exist "scripts\smoke.mjs" (
  echo ERRO: scripts\smoke.mjs nao encontrado.
  pause
  exit /b 1
)

if not exist ".git" (
  echo [1/10] Inicializando Git...
  git init
  if errorlevel 1 goto :falha
) else (
  echo [1/10] Repositorio Git local encontrado.
)

echo [2/10] Configurando origin...
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin "%REMOTE_URL%"
) else (
  git remote set-url origin "%REMOTE_URL%"
)
if errorlevel 1 goto :falha
git remote -v

echo.
echo [3/10] Buscando estado atual do GitHub...
git fetch origin --tags
if errorlevel 1 goto :falha
git rev-parse --verify origin/main >nul 2>&1
if errorlevel 1 (
  echo ERRO: origin/main nao foi encontrado.
  goto :falha
)

echo.
echo [4/10] Ajustando versao e check do smoke...
call npm version %VERSION% --no-git-tag-version --allow-same-version
if errorlevel 1 goto :falha
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='scripts\smoke.mjs'; $c=[IO.File]::ReadAllText($p); $a=\"ok('Pacote FoodWeb v0.5.4',pkg.name==='foodservice-saas'&&pkg.version==='0.5.4');\"; $b=\"ok('Pacote FoodWeb v0.5.5',pkg.name==='foodservice-saas'&&pkg.version==='0.5.5');\"; if(-not $c.Contains($b)){ if(-not $c.Contains($a)){ Write-Error 'Nao encontrei o check esperado do pacote v0.5.4 no smoke.'; exit 2 }; $utf8=New-Object System.Text.UTF8Encoding($false); [IO.File]::WriteAllText($p,$c.Replace($a,$b).Replace('Smoke FoodWeb v0.5.4','Smoke FoodWeb v0.5.5'),$utf8) }; exit 0"
if errorlevel 1 goto :falha
findstr /C:"Pacote FoodWeb v0.5.5" "scripts\smoke.mjs" >nul 2>&1
if errorlevel 1 goto :falha

echo.
echo [5/10] Validando projeto...
call npm run validate
if errorlevel 1 (
  echo VALIDACAO FALHOU. Nada sera enviado.
  goto :falha
)

echo.
echo [6/10] Preparando snapshot local para o GitHub...
git add -A
if exist ".env" git rm --cached --ignore-unmatch ".env" >nul 2>&1
if exist ".env.local" git rm --cached --ignore-unmatch ".env.local" >nul 2>&1
if exist ".env.production" git rm --cached --ignore-unmatch ".env.production" >nul 2>&1
if exist ".env.development" git rm --cached --ignore-unmatch ".env.development" >nul 2>&1

echo.
echo Arquivos que entrarao na release:
git status --short
echo.
choice /C SN /N /M "Continuar com commit e push da v0.5.5? [S/N]: "
if errorlevel 2 (
  echo Operacao cancelada pelo usuario.
  exit /b 0
)

echo.
echo [7/10] Criando commit da release sobre a main remota...
for /f %%T in ('git write-tree') do set "TREE_SHA=%%T"
if not defined TREE_SHA goto :falha
for /f %%P in ('git rev-parse origin/main') do set "PARENT_SHA=%%P"
if not defined PARENT_SHA goto :falha
for /f %%C in ('git commit-tree !TREE_SHA! -p !PARENT_SHA! -m "%COMMIT_MSG%"') do set "COMMIT_SHA=%%C"
if not defined COMMIT_SHA (
  echo ERRO: nao foi possivel criar o commit da release.
  goto :falha
)
git update-ref "refs/heads/%BRANCH%" !COMMIT_SHA!
if errorlevel 1 goto :falha
git checkout -f "%BRANCH%"
if errorlevel 1 goto :falha

echo Commit criado: !COMMIT_SHA!

echo.
echo [8/10] Enviando branch %BRANCH%...
git push -u origin "%BRANCH%"
if errorlevel 1 goto :falha

echo.
echo [9/10] Criando tag %TAG%...
git rev-parse --verify "refs/tags/%TAG%" >nul 2>&1
if not errorlevel 1 (
  for /f %%X in ('git rev-list -n 1 "%TAG%"') do set "EXISTING_TAG_SHA=%%X"
  if /I not "!EXISTING_TAG_SHA!"=="!COMMIT_SHA!" (
    echo ERRO: a tag %TAG% ja existe apontando para outro commit.
    echo Nao alterei a tag existente.
    goto :falha
  )
  echo Tag local %TAG% ja aponta para esta release.
) else (
  git tag -a "%TAG%" !COMMIT_SHA! -m "FoodWeb %TAG%"
  if errorlevel 1 goto :falha
)

echo.
echo [10/10] Enviando tag...
git push origin "%TAG%"
if errorlevel 1 goto :falha

echo.
echo ============================================================
echo SUCESSO - FoodWeb %VERSION% publicado no GitHub.
echo Branch: %BRANCH%
echo Tag:    %TAG%
echo Main NAO foi alterada automaticamente.
echo ============================================================
pause
exit /b 0

:falha
echo.
echo ============================================================
echo FALHA - PROCESSO INTERROMPIDO
echo ============================================================
echo Nenhum force push foi executado.
echo Se a falha ocorreu antes do passo 8, nada foi enviado ao GitHub.
echo ============================================================
pause
exit /b 1
