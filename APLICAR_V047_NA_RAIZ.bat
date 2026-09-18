@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
cls

echo ============================================================
echo FoodWeb v0.4.7 - Aplicar patch NA RAIZ DO PROJETO
echo ============================================================
echo.
echo Este patch NAO substitui:
echo - .env / .env.local / .env.production
echo - wrangler.jsonc
echo - supabase\config.toml
echo - .git
echo - secrets do Supabase/Cloudflare
echo.
echo v0.4.7 NAO possui migration nova nem Edge Function nova.
echo Ele reaproveita a estrutura de mensalidade/acesso da v0.4.6.
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
if not exist "supabase\migrations\202609032230_foodweb_v046_billing_access.sql" (
  echo ERRO: a base v0.4.6 de mensalidade nao foi encontrada.
  echo Aplique primeiro o FoodWeb v0.4.6 e sua migration.
  pause
  exit /b 1
)
if not exist "%~dp0payload\src\utils\localFinancialDocumentReader.ts" (
  echo ERRO: payload v0.4.7 nao encontrado.
  pause
  exit /b 1
)

echo Projeto detectado:
echo %CD%
echo.

echo [1/5] Criando backup local dos arquivos alterados...
set "BACKUP=_backup_food_v047"
if exist "%BACKUP%" rmdir /s /q "%BACKUP%"
mkdir "%BACKUP%\src\layouts" >nul 2>&1
mkdir "%BACKUP%\src\pages\admin" >nul 2>&1
mkdir "%BACKUP%\src\utils" >nul 2>&1
mkdir "%BACKUP%\scripts" >nul 2>&1
mkdir "%BACKUP%\public" >nul 2>&1
mkdir "%BACKUP%\config_preservada" >nul 2>&1
if exist "package.json" copy /y "package.json" "%BACKUP%\package.json" >nul
if exist "package-lock.json" copy /y "package-lock.json" "%BACKUP%\package-lock.json" >nul
if exist "index.html" copy /y "index.html" "%BACKUP%\index.html" >nul
if exist "src\layouts\AdminLayout.tsx" copy /y "src\layouts\AdminLayout.tsx" "%BACKUP%\src\layouts\AdminLayout.tsx" >nul
if exist "src\pages\admin\Plan.tsx" copy /y "src\pages\admin\Plan.tsx" "%BACKUP%\src\pages\admin\Plan.tsx" >nul
if exist "src\utils\localFinancialDocumentReader.ts" copy /y "src\utils\localFinancialDocumentReader.ts" "%BACKUP%\src\utils\localFinancialDocumentReader.ts" >nul
if exist "scripts\smoke.mjs" copy /y "scripts\smoke.mjs" "%BACKUP%\scripts\smoke.mjs" >nul
if exist "src\styles.css" copy /y "src\styles.css" "%BACKUP%\styles.css" >nul
if exist "public\favicon.svg" copy /y "public\favicon.svg" "%BACKUP%\public\favicon.svg" >nul
if exist ".env" copy /y ".env" "%BACKUP%\config_preservada\.env" >nul
if exist ".env.local" copy /y ".env.local" "%BACKUP%\config_preservada\.env.local" >nul
if exist ".env.production" copy /y ".env.production" "%BACKUP%\config_preservada\.env.production" >nul
if exist "wrangler.jsonc" copy /y "wrangler.jsonc" "%BACKUP%\config_preservada\wrangler.jsonc" >nul
if exist "supabase\config.toml" copy /y "supabase\config.toml" "%BACKUP%\config_preservada\supabase-config.toml" >nul

echo [2/5] Aplicando codigo v0.4.7 sem tocar nas configuracoes...
copy /y "%~dp0payload\package.json" "package.json" >nul || goto :falha
copy /y "%~dp0payload\package-lock.json" "package-lock.json" >nul || goto :falha
copy /y "%~dp0payload\index.html" "index.html" >nul || goto :falha
copy /y "%~dp0payload\src\layouts\AdminLayout.tsx" "src\layouts\AdminLayout.tsx" >nul || goto :falha
copy /y "%~dp0payload\src\pages\admin\Plan.tsx" "src\pages\admin\Plan.tsx" >nul || goto :falha
copy /y "%~dp0payload\src\utils\localFinancialDocumentReader.ts" "src\utils\localFinancialDocumentReader.ts" >nul || goto :falha
copy /y "%~dp0payload\scripts\smoke.mjs" "scripts\smoke.mjs" >nul || goto :falha
copy /y "%~dp0payload\scripts\v047-check.mjs" "scripts\v047-check.mjs" >nul || goto :falha

echo [3/5] Aplicando estilos v0.4.7 sem substituir o CSS inteiro...
findstr /c:"FoodWeb v0.4.7: status de vencimento e OCR reforcado" "src\styles.css" >nul 2>&1
if errorlevel 1 type "%~dp0payload\styles_v047_append.css" >> "src\styles.css"

echo [4/5] Forcando novamente o favicon correto do FoodWeb...
if not exist "public" mkdir "public" >nul 2>&1
copy /y "%~dp0payload\public\favicon.svg" "public\favicon.svg" >nul || goto :falha
copy /y "%~dp0payload\public\favicon-foodweb-v047.svg" "public\favicon-foodweb-v047.svg" >nul || goto :falha
if exist "dist" rmdir /s /q "dist"

echo [5/5] Validando patch e configuracao preservada...
call node scripts\v047-check.mjs
if errorlevel 1 goto :falha_verificacao

echo.
echo ============================================================
echo FOODWEB v0.4.7 APLICADO COM SUCESSO
echo ============================================================
echo.
echo Incluido:
echo - status da mensalidade no topo: verde, amarelo ou vermelho
echo - amarelo nos 7 dias anteriores ao vencimento
echo - clique no status abre Meu plano direto no vencimento
echo - OCR local reforcado sem IA, inclusive boleto e cupom
echo - segunda leitura OCR somente quando faltam campos/valor
echo - favicon FoodWeb v0.4.7 forcado novamente
echo.
echo NAO ha migration nova nesta versao.
echo NAO ha Edge Function nova nesta versao.
echo Backup: %BACKUP%
echo.
echo Agora execute PUBLICAR_V047.bat
pause
exit /b 0

:falha_verificacao
echo.
echo ERRO: o patch foi copiado, mas a verificacao v0.4.7 encontrou problema.
echo Nao publique ate corrigir a mensagem acima.
echo Backup: %BACKUP%
pause
exit /b 1

:falha
echo.
echo ERRO ao aplicar o patch v0.4.7.
echo O .env e as configuracoes existentes nao foram substituidos.
echo Backup: %BACKUP%
pause
exit /b 1
