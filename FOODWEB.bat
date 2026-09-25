@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"

:title
cls
echo ============================================================
echo FoodWeb v0.6.5 - PAINEL QA LITE
echo ============================================================
echo 1 - Aplicar/validar pacote
echo 2 - Rodar QA Lite
echo 3 - Atualizar baseline visual
echo 4 - Publicar release + testar Preview
echo 5 - Promover release para PRODUCAO
echo 6 - Verificar snapshot da publicacao (sem enviar)
echo 0 - Sair
echo.
set "OPT="
set /p "OPT=Escolha: "
if "%OPT%"=="1" goto validate
if "%OPT%"=="2" goto qa
if "%OPT%"=="3" goto baseline
if "%OPT%"=="4" goto publish
if "%OPT%"=="5" goto promote
if "%OPT%"=="6" goto snapshot_check
if "%OPT%"=="0" goto end
goto title

:validate
where node >nul 2>&1
if errorlevel 1 goto node_missing
where npm >nul 2>&1
if errorlevel 1 goto npm_missing
call ".automation\install-root.cmd" "%CD%"
if errorlevel 1 goto validate_failed
call npm run validate
if errorlevel 1 goto validate_failed
call ".automation\setup-qa.cmd"
if errorlevel 1 goto validate_failed
echo.
echo VALIDACAO OK. Para testar telas publicas, use a opcao 2.
pause
goto title

:snapshot_check
where node >nul 2>&1
if errorlevel 1 goto node_missing
node ".automation\check-release-snapshot.mjs" "%CD%"
if errorlevel 1 goto validate_failed
echo.
echo SNAPSHOT PRONTO. Nenhum arquivo foi enviado ao GitHub.
pause
goto title

:qa
call ".automation\setup-qa.cmd"
if errorlevel 1 goto qa_setup_failed
call npm run qa:lite
if errorlevel 1 goto qa_failed
echo.
echo QA LITE CONCLUIDO SEM FALHAS.
pause
goto title

:baseline
call ".automation\setup-qa.cmd"
if errorlevel 1 goto qa_setup_failed
echo ATENCAO: baseline significa aceitar o visual publico atual como referencia correta.
set "BASELINE_CONFIRM="
set /p "BASELINE_CONFIRM=Digite BASELINE para confirmar: "
if /I not "%BASELINE_CONFIRM%"=="BASELINE" goto baseline_cancelled
call npm run qa:update
if errorlevel 1 goto baseline_failed
echo.
echo BASELINE VISUAL ATUALIZADA COM SUCESSO.
pause
goto title

:publish
echo.
echo A publicacao sera executada em etapas e pode levar alguns minutos.
echo Esta janela permanecera aberta se ocorrer uma falha.
echo.
set "FOODWEB_PANEL=1"
call ".automation\publish.cmd"
set "PUBLISH_STATUS=%ERRORLEVEL%"
set "FOODWEB_PANEL="
if not "%PUBLISH_STATUS%"=="0" goto publish_failed
echo.
set "PREVIEW_URL="
set /p "PREVIEW_URL=Se o Preview do Cloudflare ja estiver pronto, cole a URL para QA Lite. ENTER para pular: "
if "%PREVIEW_URL%"=="" goto publish_done
call ".automation\setup-qa.cmd"
if errorlevel 1 goto qa_setup_failed
set "QA_BASE_URL=%PREVIEW_URL%"
call npm run qa:lite
set "PREVIEW_STATUS=%ERRORLEVEL%"
set "QA_BASE_URL="
if not "%PREVIEW_STATUS%"=="0" goto preview_failed

:publish_done
echo.
echo PUBLICACAO DA RELEASE CONCLUIDA.
pause
goto title

:promote
call ".automation\promote.cmd"
if errorlevel 1 goto promote_failed
echo.
echo PROMOCAO CONCLUIDA.
pause
goto title

:offer_report
if not exist "qa\playwright-report\index.html" (
  echo Relatorio HTML ainda nao foi gerado em qa\playwright-report.
  exit /b 0
)
set "OPEN_REPORT="
set /p "OPEN_REPORT=Digite S para abrir o relatorio correto agora, ou ENTER para voltar: "
if /I "%OPEN_REPORT%"=="S" start "FoodWeb QA Report" /D "%CD%\qa" "%ComSpec%" /k node "node_modules\@playwright\test\cli.js" show-report "playwright-report"
exit /b 0

:qa_failed
echo.
echo QA Lite encontrou falhas. O relatorio correto fica em qa\playwright-report.
call :offer_report
pause
goto title

:baseline_failed
echo.
echo A baseline NAO foi concluida porque os detectores encontraram falhas.
call :offer_report
pause
goto title

:baseline_cancelled
echo Atualizacao da baseline cancelada.
pause
goto title

:preview_failed
echo.
echo A release foi publicada, mas o QA Lite do Preview encontrou falhas.
call :offer_report
pause
goto title

:publish_failed
echo.
echo FALHA NA PUBLICACAO. Leia a ultima etapa exibida acima.
echo Nenhuma promocao para PRODUCAO foi executada.
pause
goto title

:promote_failed
echo.
echo FALHA NA PROMOCAO. Leia a mensagem exibida acima.
pause
goto title

:qa_setup_failed
echo.
echo FALHA AO PREPARAR O QA.
pause
goto title

:validate_failed
echo.
echo FALHA NA APLICACAO OU VALIDACAO.
pause
goto title

:node_missing
echo ERRO: Node nao encontrado.
pause
goto title

:npm_missing
echo ERRO: npm nao encontrado.
pause
goto title

:end
endlocal
exit /b 0
