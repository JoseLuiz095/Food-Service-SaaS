@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
cls

echo ============================================================
echo FoodWeb v0.4.5 - Aplicar patch NA RAIZ DO PROJETO
echo ============================================================
echo.
echo Este patch NAO substitui:
echo - .env / .env.local / .env.production
echo - wrangler.jsonc
echo - supabase\config.toml
echo - .git
echo - configuracoes ja feitas no Supabase/Cloudflare
echo.

if not exist "package.json" (
  echo ERRO: package.json nao encontrado nesta pasta.
  echo Extraia este ZIP DENTRO da pasta raiz atual do FoodWeb.
  pause
  exit /b 1
)

findstr /c:"foodservice-saas" "package.json" >nul 2>&1
if errorlevel 1 (
  echo ERRO: este projeto nao parece ser o FoodWeb.
  pause
  exit /b 1
)

if not exist "src\App.tsx" (
  echo ERRO: src\App.tsx nao encontrado. Esta nao parece ser a raiz do projeto.
  pause
  exit /b 1
)

if not exist "%~dp0payload\src\pages\admin\Finance.tsx" (
  echo ERRO: payload v0.4.5 nao encontrado.
  pause
  exit /b 1
)

echo Projeto detectado:
echo %CD%
echo.

echo [1/6] Criando backup local dos arquivos alterados...
set "BACKUP=_backup_food_v045"
if exist "%BACKUP%" rmdir /s /q "%BACKUP%"
mkdir "%BACKUP%\src\pages\admin" >nul 2>&1
mkdir "%BACKUP%\src\pages\store" >nul 2>&1
mkdir "%BACKUP%\src\layouts" >nul 2>&1
mkdir "%BACKUP%\src\services" >nul 2>&1
mkdir "%BACKUP%\src\utils" >nul 2>&1
mkdir "%BACKUP%\scripts" >nul 2>&1
mkdir "%BACKUP%\public" >nul 2>&1
mkdir "%BACKUP%\config_preservada" >nul 2>&1
if exist "package.json" copy /y "package.json" "%BACKUP%\package.json" >nul
if exist "index.html" copy /y "index.html" "%BACKUP%\index.html" >nul
if exist "src\pages\admin\Finance.tsx" copy /y "src\pages\admin\Finance.tsx" "%BACKUP%\src\pages\admin\Finance.tsx" >nul
if exist "src\pages\store\Landing.tsx" copy /y "src\pages\store\Landing.tsx" "%BACKUP%\src\pages\store\Landing.tsx" >nul
if exist "src\layouts\AdminLayout.tsx" copy /y "src\layouts\AdminLayout.tsx" "%BACKUP%\src\layouts\AdminLayout.tsx" >nul
if exist "src\services\financeApi.ts" copy /y "src\services\financeApi.ts" "%BACKUP%\src\services\financeApi.ts" >nul
if exist "src\utils\localFinancialDocumentReader.ts" copy /y "src\utils\localFinancialDocumentReader.ts" "%BACKUP%\src\utils\localFinancialDocumentReader.ts" >nul
if exist "src\styles.css" copy /y "src\styles.css" "%BACKUP%\src\styles.css" >nul
if exist "scripts\smoke.mjs" copy /y "scripts\smoke.mjs" "%BACKUP%\scripts\smoke.mjs" >nul
if exist "scripts\critical-flow.mjs" copy /y "scripts\critical-flow.mjs" "%BACKUP%\scripts\critical-flow.mjs" >nul
if exist "public\favicon.svg" copy /y "public\favicon.svg" "%BACKUP%\public\favicon.svg" >nul
if exist "public\_headers" copy /y "public\_headers" "%BACKUP%\public\_headers" >nul
if exist "DEPLOY_SUPABASE_FUNCTIONS.bat" copy /y "DEPLOY_SUPABASE_FUNCTIONS.bat" "%BACKUP%\DEPLOY_SUPABASE_FUNCTIONS.bat" >nul
if exist ".env" copy /y ".env" "%BACKUP%\config_preservada\.env" >nul
if exist ".env.local" copy /y ".env.local" "%BACKUP%\config_preservada\.env.local" >nul
if exist ".env.production" copy /y ".env.production" "%BACKUP%\config_preservada\.env.production" >nul
if exist "wrangler.jsonc" copy /y "wrangler.jsonc" "%BACKUP%\config_preservada\wrangler.jsonc" >nul
if exist "supabase\config.toml" copy /y "supabase\config.toml" "%BACKUP%\config_preservada\supabase-config.toml" >nul
if exist "supabase\functions\food-finance-document-extract" xcopy /e /i /y "supabase\functions\food-finance-document-extract" "%BACKUP%\food-finance-document-extract" >nul

echo [2/6] Aplicando codigo v0.4.5 sem tocar no .env...
for %%F in (
  "package.json"
  "index.html"
  "src\pages\admin\Finance.tsx"
  "src\pages\store\Landing.tsx"
  "src\layouts\AdminLayout.tsx"
  "src\services\financeApi.ts"
  "src\utils\localFinancialDocumentReader.ts"
  "scripts\smoke.mjs"
  "scripts\critical-flow.mjs"
  "scripts\v045-check.mjs"
  "public\_headers"
  "DEPLOY_SUPABASE_FUNCTIONS.bat"
) do (
  if not exist "%%~dpF" mkdir "%%~dpF" >nul 2>&1
  copy /y "%~dp0payload\%%~F" "%%~F" >nul
  if errorlevel 1 goto :falha
)

echo [3/6] Aplicando estilos v0.4.5 sem substituir o CSS inteiro...
findstr /c:"FoodWeb v0.4.5: operacao da landing + leitura local de documentos" "src\styles.css" >nul 2>&1
if errorlevel 1 type "%~dp0payload\styles_v045_append.css" >> "src\styles.css"

echo [4/6] Forcando os icones locais do FoodWeb...
if not exist "public" mkdir "public" >nul 2>&1
copy /y "%~dp0payload\public\favicon.svg" "public\favicon.svg" >nul
if errorlevel 1 goto :falha
copy /y "%~dp0payload\public\favicon-foodweb-v045.svg" "public\favicon-foodweb-v045.svg" >nul
if errorlevel 1 goto :falha
if exist "dist" rmdir /s /q "dist"

echo [5/6] Removendo somente o OCR/IA antigo do financeiro...
if exist "supabase\functions\food-finance-document-extract" rmdir /s /q "supabase\functions\food-finance-document-extract"

echo [6/6] Validando patch e configuracao preservada...
node scripts\v045-check.mjs
if errorlevel 1 goto :falha_verificacao

echo.
echo ============================================================
echo FOODWEB v0.4.5 APLICADO COM SUCESSO
ECHO ============================================================
echo.
echo Confirmado:
echo - .env e configuracoes existentes NAO foram substituidos
echo - leitura de foto/PDF agora e local, sem IA
echo - CSP/Permissions-Policy ajustados para Worker, WebAssembly e camera local
echo - Admin Master foi removido do menu dos lojistas
echo - landing agora mostra uma visao da operacao, nao a imagem antiga
echo - favicon local foi copiado e ganhou URL nova para quebrar cache
echo - Edge Function antiga de OCR/IA foi removida do projeto local
echo.
echo Backup: %BACKUP%
echo.
echo PROXIMO PASSO:
echo   execute PUBLICAR_V045.bat
echo.
pause
exit /b 0

:falha_verificacao
echo.
echo ERRO: o patch foi copiado, mas a verificacao v0.4.5 encontrou problema.
echo Nao publique ate corrigir a mensagem acima.
echo Backup: %BACKUP%
pause
exit /b 1

:falha
echo.
echo ERRO ao aplicar o patch FoodWeb v0.4.5.
echo O .env nao foi substituido.
echo Backup: %BACKUP%
pause
exit /b 1
