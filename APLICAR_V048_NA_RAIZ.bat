@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
cls

echo ============================================================
echo FoodWeb v0.4.8 - Aplicar patch NA RAIZ DO PROJETO
echo ============================================================
echo.
echo Este patch NAO substitui:
echo - .env / .env.local / .env.production
echo - wrangler.jsonc
echo - supabase\config.toml
echo - .git
echo - secrets do Supabase/Cloudflare
echo.
echo v0.4.8 NAO possui migration nova.
echo Ele reaplica e republica a funcao de alteracao de e-mail/senha.
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
if not exist "src\pages\master\Stores.tsx" (
  echo ERRO: src\pages\master\Stores.tsx nao encontrado.
  pause
  exit /b 1
)
if not exist "supabase\migrations\202609032230_foodweb_v046_billing_access.sql" (
  echo ERRO: a base v0.4.6 de mensalidade nao foi encontrada.
  echo Aplique primeiro o FoodWeb v0.4.6 e sua migration.
  pause
  exit /b 1
)
if not exist "%~dp0payload\src\pages\master\Stores.tsx" (
  echo ERRO: payload v0.4.8 nao encontrado.
  pause
  exit /b 1
)

echo Projeto detectado:
echo %CD%
echo.

echo [1/6] Criando backup local dos arquivos alterados...
set "BACKUP=_backup_food_v048"
if exist "%BACKUP%" rmdir /s /q "%BACKUP%"
mkdir "%BACKUP%\src\pages\master" >nul 2>&1
mkdir "%BACKUP%\src\services" >nul 2>&1
mkdir "%BACKUP%\supabase\functions\food-platform-manage-store-user" >nul 2>&1
mkdir "%BACKUP%\scripts" >nul 2>&1
mkdir "%BACKUP%\public" >nul 2>&1
mkdir "%BACKUP%\config_preservada" >nul 2>&1
if exist "package.json" copy /y "package.json" "%BACKUP%\package.json" >nul
if exist "package-lock.json" copy /y "package-lock.json" "%BACKUP%\package-lock.json" >nul
if exist "index.html" copy /y "index.html" "%BACKUP%\index.html" >nul
if exist "src\pages\master\Stores.tsx" copy /y "src\pages\master\Stores.tsx" "%BACKUP%\src\pages\master\Stores.tsx" >nul
if exist "src\services\platformApi.ts" copy /y "src\services\platformApi.ts" "%BACKUP%\src\services\platformApi.ts" >nul
if exist "supabase\functions\food-platform-manage-store-user\index.ts" copy /y "supabase\functions\food-platform-manage-store-user\index.ts" "%BACKUP%\supabase\functions\food-platform-manage-store-user\index.ts" >nul
if exist "scripts\smoke.mjs" copy /y "scripts\smoke.mjs" "%BACKUP%\scripts\smoke.mjs" >nul
if exist "src\styles.css" copy /y "src\styles.css" "%BACKUP%\styles.css" >nul
if exist "public\favicon.svg" copy /y "public\favicon.svg" "%BACKUP%\public\favicon.svg" >nul
if exist ".env" copy /y ".env" "%BACKUP%\config_preservada\.env" >nul
if exist ".env.local" copy /y ".env.local" "%BACKUP%\config_preservada\.env.local" >nul
if exist ".env.production" copy /y ".env.production" "%BACKUP%\config_preservada\.env.production" >nul
if exist "wrangler.jsonc" copy /y "wrangler.jsonc" "%BACKUP%\config_preservada\wrangler.jsonc" >nul
if exist "supabase\config.toml" copy /y "supabase\config.toml" "%BACKUP%\config_preservada\supabase-config.toml" >nul

echo [2/6] Aplicando codigo v0.4.8 sem tocar nas configuracoes...
copy /y "%~dp0payload\package.json" "package.json" >nul || goto :falha
copy /y "%~dp0payload\package-lock.json" "package-lock.json" >nul || goto :falha
copy /y "%~dp0payload\index.html" "index.html" >nul || goto :falha
copy /y "%~dp0payload\src\pages\master\Stores.tsx" "src\pages\master\Stores.tsx" >nul || goto :falha
copy /y "%~dp0payload\src\services\platformApi.ts" "src\services\platformApi.ts" >nul || goto :falha
copy /y "%~dp0payload\scripts\smoke.mjs" "scripts\smoke.mjs" >nul || goto :falha
copy /y "%~dp0payload\scripts\v048-check.mjs" "scripts\v048-check.mjs" >nul || goto :falha

if not exist "supabase\functions\food-platform-manage-store-user" mkdir "supabase\functions\food-platform-manage-store-user" >nul 2>&1
copy /y "%~dp0payload\supabase\functions\food-platform-manage-store-user\index.ts" "supabase\functions\food-platform-manage-store-user\index.ts" >nul || goto :falha

echo [3/6] Colocando acesso do lojista no topo da gestao do cliente...
findstr /c:"master-credential-edit-v048" "src\pages\master\Stores.tsx" >nul 2>&1
if errorlevel 1 goto :falha

echo [4/6] Aplicando estilos v0.4.8 sem substituir o CSS inteiro...
findstr /c:"FoodWeb v0.4.8: acesso do lojista visivel" "src\styles.css" >nul 2>&1
if errorlevel 1 type "%~dp0payload\styles_v048_append.css" >> "src\styles.css"

echo [5/6] Forcando novamente o favicon correto do FoodWeb...
if not exist "public" mkdir "public" >nul 2>&1
copy /y "%~dp0payload\public\favicon.svg" "public\favicon.svg" >nul || goto :falha
copy /y "%~dp0payload\public\favicon-foodweb-v048.svg" "public\favicon-foodweb-v048.svg" >nul || goto :falha
if exist "dist" rmdir /s /q "dist"

echo [6/6] Validando patch e configuracao preservada...
call node scripts\v048-check.mjs
if errorlevel 1 goto :falha_verificacao

echo.
echo ============================================================
echo FOODWEB v0.4.8 APLICADO COM SUCESSO
echo ============================================================
echo.
echo Incluido:
echo - e-mail e senha aparecem logo no topo do modal Gerenciar
echo - nao e mais necessario rolar ate o final para encontrar o acesso
echo - Edge Function de credenciais e reaplicada no projeto
echo - PUBLICAR_V048.bat republica a funcao automaticamente
echo - favicon FoodWeb v0.4.8 forcado novamente
echo.
echo NAO ha migration nova nesta versao.
echo Backup: %BACKUP%
echo.
echo Agora execute PUBLICAR_V048.bat
pause
exit /b 0

:falha_verificacao
echo.
echo ERRO: o patch foi copiado, mas a verificacao v0.4.8 encontrou problema.
echo Nao publique ate corrigir a mensagem acima.
echo Backup: %BACKUP%
pause
exit /b 1

:falha
echo.
echo ERRO ao aplicar o patch v0.4.8.
echo O .env e as configuracoes existentes nao foram substituidos.
echo Backup: %BACKUP%
pause
exit /b 1
