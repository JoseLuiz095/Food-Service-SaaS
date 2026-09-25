@echo off
setlocal EnableExtensions EnableDelayedExpansion
for %%I in ("%~dp0..") do set "ROOT=%%~fI"
cd /d "%ROOT%"
set "REPO=https://github.com/JoseLuiz095/Food-Service-SaaS.git"
set "BRANCH=release/foodweb-v0.6.5"
set "TAG=v0.6.5"
set "CLONE_DIR=%TEMP%\foodweb_qa_release_%RANDOM%_%RANDOM%"
echo ============================================================
echo FoodWeb - Publicar RELEASE
echo ============================================================
echo [1/6] Verificando Git e referencias remotas...
where git >nul 2>&1
if errorlevel 1 goto git_missing
set "HAS_BRANCH=0"
set "HAS_TAG=0"
git ls-remote --exit-code --heads "%REPO%" "refs/heads/%BRANCH%" >nul 2>&1 && set "HAS_BRANCH=1"
git ls-remote --exit-code --tags "%REPO%" "refs/tags/%TAG%" >nul 2>&1 && set "HAS_TAG=1"
if "!HAS_BRANCH!!HAS_TAG!"=="00" goto refs_ok
echo AVISO: branch ou tag desta release ja existe no GitHub.
set "RECREATE="
set /p "RECREATE=Digite R para remover SOMENTE esta branch/tag e recriar, ou ENTER para cancelar: "
if /I not "!RECREATE!"=="R" goto cancelled
if "!HAS_BRANCH!"=="1" git push "%REPO%" --delete "%BRANCH%"
if errorlevel 1 goto remote_failed
if "!HAS_TAG!"=="1" git push "%REPO%" ":refs/tags/%TAG%"
if errorlevel 1 goto remote_failed

:refs_ok
echo [2/6] Baixando uma copia limpa da main...
git clone --no-recurse-submodules --branch main "%REPO%" "%CLONE_DIR%"
if errorlevel 1 goto clone_failed
pushd "%CLONE_DIR%"
for /f "delims=" %%V in ('node -p "require('./package.json').version"') do set "BASE=%%V"
echo Base remota encontrada: !BASE!
if not "!BASE!"=="0.5.8" if not "!BASE!"=="0.5.9" if not "!BASE!"=="0.6.0" if not "!BASE!"=="0.6.1" if not "!BASE!"=="0.6.2" if not "!BASE!"=="0.6.3" if not "!BASE!"=="0.6.4" if not "!BASE!"=="0.6.5" goto unsupported_base

echo [3/6] Copiando o estado local atual para a copia limpa...
node "%ROOT%\.automation\prepare-release-snapshot.mjs" "%ROOT%" "%CLONE_DIR%"
if errorlevel 1 goto clone_context_failed

echo [4/6] Instalando dependencias e validando o build...
call "%ROOT%\.automation\install-root.cmd" "%CLONE_DIR%"
if errorlevel 1 goto clone_context_failed
call npm run validate
if errorlevel 1 goto clone_context_failed

echo [5/6] Preparando branch e tag locais...
git checkout -b "%BRANCH%"
if errorlevel 1 goto clone_context_failed
git add -A
git diff --cached --quiet
if not errorlevel 1 goto no_changes
echo.
echo Tudo validado. O proximo passo envia a branch e a tag ao GitHub.
set "CONF="
set /p "CONF=Digite S para publicar a release: "
if /I not "!CONF!"=="S" goto cancelled_from_clone
git config user.name >nul 2>&1 || git config user.name "Release Automation"
git config user.email >nul 2>&1 || git config user.email "release@local"
git commit -m "release: FoodWeb 0.6.5 QA Lite"
if errorlevel 1 goto clone_context_failed
git tag -a "%TAG%" -m "FoodWeb 0.6.5 QA Lite"
if errorlevel 1 goto clone_context_failed

echo [6/6] Enviando branch e tag ao GitHub...
git push --atomic origin "%BRANCH%" "%TAG%"
if errorlevel 1 goto clone_context_failed
popd
echo.
echo SUCESSO - release publicada. MAIN nao alterada.
goto cleanup_success

:unsupported_base
echo ERRO: main em !BASE!. Base nao suportada por este pacote.
goto clone_context_failed

:no_changes
echo ERRO: o estado local e a main remota estao identicos; nenhuma alteracao foi preparada.
goto clone_context_failed

:cancelled_from_clone
popd
:cancelled
echo Publicacao cancelada. Nada foi enviado ao GitHub.
goto cleanup_success

:clone_context_failed
popd
echo.
echo FALHA. A copia de diagnostico foi preservada em:
echo %CLONE_DIR%
goto failure

:git_missing
echo ERRO: Git nao encontrado no Windows.
goto failure

:clone_failed
echo.
echo ERRO: nao foi possivel baixar o repositorio.
echo Verifique internet, GitHub e credenciais do Git no Windows.
goto failure

:remote_failed
echo ERRO: nao foi possivel atualizar a branch/tag remota.
goto failure

:cleanup_success
if exist "%CLONE_DIR%" rmdir /s /q "%CLONE_DIR%" >nul 2>&1
endlocal
exit /b 0

:failure
if not defined FOODWEB_PANEL pause
endlocal
exit /b 1
