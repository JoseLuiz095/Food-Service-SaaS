@echo off
setlocal EnableExtensions
cd /d "%~dp0"
cls

echo ============================================================
echo FoodWeb v0.4.5 - Hotfix PDF.js
echo ============================================================
echo.
echo Este hotfix corrige somente a chamada render do pdfjs-dist.
echo O .env, Supabase, Wrangler, Turnstile e demais configuracoes
echo existentes NAO sao alterados.
echo.

if not exist "package.json" goto :raiz_invalida
if not exist "src\utils" mkdir "src\utils" >nul 2>&1

if not exist "_backup_hotfix_v045_pdfjs" mkdir "_backup_hotfix_v045_pdfjs" >nul 2>&1
if exist "src\utils\localFinancialDocumentReader.ts" (
  copy /y "src\utils\localFinancialDocumentReader.ts" "_backup_hotfix_v045_pdfjs\localFinancialDocumentReader.ts" >nul
  if errorlevel 1 goto :falha
)

echo [1/3] Aplicando correcao PDF.js...
copy /y "%~dp0payload\src\utils\localFinancialDocumentReader.ts" "src\utils\localFinancialDocumentReader.ts" >nul
if errorlevel 1 goto :falha

findstr /c:"canvas, canvasContext: context, viewport" "src\utils\localFinancialDocumentReader.ts" >nul 2>&1
if errorlevel 1 goto :falha_validacao
echo OK   RenderParameters agora recebe canvas explicitamente.
echo.

echo [2/3] Hotfix aplicado.
if not exist "PUBLICAR_V045.bat" goto :sem_publicador
echo.
echo [3/3] Iniciando publicacao existente...
call "PUBLICAR_V045.bat"
exit /b %errorlevel%

:raiz_invalida
echo FALHA. Extraia este ZIP diretamente na raiz atual do projeto,
echo na mesma pasta em que existe package.json.
goto :fim_erro

:sem_publicador
echo FALHA. O arquivo PUBLICAR_V045.bat nao foi encontrado.
echo O hotfix JA FOI aplicado. Execute manualmente o BAT de publicacao
echo da versao atual ou restaure o arquivo de publicacao.
goto :fim_erro

:falha_validacao
echo FALHA. A correcao foi copiada, mas nao passou na verificacao.
goto :fim_erro

:falha
echo FALHA ao copiar os arquivos do hotfix.
goto :fim_erro

:fim_erro
echo.
echo Nenhum .env foi alterado.
pause
exit /b 1
