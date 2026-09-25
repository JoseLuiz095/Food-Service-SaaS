@echo off
setlocal EnableExtensions EnableDelayedExpansion
for %%I in ("%~dp0..") do set "ROOT=%%~fI"
cd /d "%ROOT%"
set "REPO=https://github.com/JoseLuiz095/Food-Service-SaaS.git"
set "BRANCH=release/foodweb-v0.6.5"
set "CLONE_DIR=%TEMP%\foodweb_qa_promote_%RANDOM%_%RANDOM%"
echo ============================================================
echo FoodWeb 0.6.5 - PROMOVER PARA PRODUCAO
echo ============================================================
git ls-remote --exit-code --heads "%REPO%" "refs/heads/%BRANCH%" >nul 2>&1 || (echo ERRO: release nao existe.& exit /b 1)
git clone --no-recurse-submodules --branch main "%REPO%" "%CLONE_DIR%" || goto fail
pushd "%CLONE_DIR%"
git fetch origin "%BRANCH%" --tags || (popd&goto fail_keep)
git merge-base --is-ancestor origin/main "origin/%BRANCH%" || (echo ERRO: main mudou apos a release. Recrie a release.& popd&goto fail_keep)
git checkout -B main origin/main || (popd&goto fail_keep)
git merge --ff-only "origin/%BRANCH%" || (popd&goto fail_keep)
node "%ROOT%\.automation\clean-main.mjs" || (popd&goto fail_keep)
git add -A
git diff --cached --quiet
if errorlevel 1 (
 git config user.name >nul 2>&1 || git config user.name "Release Automation"
 git config user.email >nul 2>&1 || git config user.email "release@local"
 git commit -m "chore: limpar artefatos legados" || (popd&goto fail_keep)
)
echo Confirme que Preview + QA Lite + checklist manual foram revisados.
set /p "CONF=Digite PRODUCAO para enviar esta versao a main: "
if /I not "!CONF!"=="PRODUCAO" (popd&goto cleanup)
git push origin main || (popd&goto fail_keep)
for /f "tokens=2" %%R in ('git ls-remote --heads origin "refs/heads/release/foodweb-v*"') do (set "RR=%%R"&set "RB=!RR:refs/heads/=!"&git push origin --delete "!RB!")
popd
echo SUCESSO - producao atualizada e branches de release antigas removidas.
goto cleanup
:fail
echo ERRO ao preparar promocao.& exit /b 1
:fail_keep
echo FALHA. Pasta temporaria preservada: %CLONE_DIR%& exit /b 1
:cleanup
if exist "%CLONE_DIR%" rmdir /s /q "%CLONE_DIR%" >nul 2>&1
exit /b 0
