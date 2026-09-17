@echo off
setlocal EnableExtensions
cd /d "%~dp0"
cls

echo ============================================================
echo FoodWeb v0.4.5 - Validar e publicar FRONTEND
echo ============================================================
echo.
echo Esta versao:
echo - preserva o .env atual
echo - nao exige migration nova
echo - nao exige Edge Function para leitura financeira
echo - usa OCR local no navegador
echo - forca um novo caminho de favicon para evitar cache antigo
echo.

if not exist "package.json" (
  echo ERRO: execute este BAT na raiz do FoodWeb.
  pause
  exit /b 1
)

set "HAS_ENV="
if exist ".env" set "HAS_ENV=1"
if exist ".env.local" set "HAS_ENV=1"
if exist ".env.production" set "HAS_ENV=1"
if not defined HAS_ENV (
  echo ERRO: nenhum arquivo .env foi encontrado.
  echo Este BAT NAO cria .env automaticamente para nao substituir suas chaves.
  pause
  exit /b 1
)

echo [1/6] Conferindo v0.4.5 e o .env ja existente...
call node scripts\v045-check.mjs
if errorlevel 1 goto :falha

echo.
echo [2/6] Validando variaveis publicas existentes...
call npm run check:env
if errorlevel 1 goto :falha

echo.
echo [3/6] Instalando/atualizando dependencias do projeto...
call npm install
if errorlevel 1 goto :falha

echo.
echo [4/6] Limpando build antigo e validando projeto...
if exist "dist" rmdir /s /q "dist"
call npm run validate
if errorlevel 1 goto :falha

echo.
echo [5/6] Confirmando favicon novo dentro do build...
if not exist "dist\favicon-foodweb-v045.svg" goto :icone_falha
findstr /c:"favicon-foodweb-v045.svg" "dist\index.html" >nul 2>&1
if errorlevel 1 goto :icone_falha

echo.
echo [6/6] Publicando Cloudflare Worker...
call npx wrangler deploy
if errorlevel 1 goto :falha

echo.
echo ============================================================
echo SUCESSO - FoodWeb v0.4.5 publicado
echo ============================================================
echo.
echo Teste com Ctrl+F5:
echo   https://foodweb.joseluizacama.workers.dev/
echo   /admin/login
echo   /admin/financeiro
echo.
echo Confira tambem:
echo - menu do lojista sem Admin Master
echo - secao de demonstracao com painel operacional
echo - favicon FoodWeb diferente do FloriWeb
echo.
pause
exit /b 0

:icone_falha
echo.
echo ERRO: o build terminou, mas o favicon v0.4.5 nao entrou no dist.
echo O deploy foi interrompido para nao publicar o icone antigo.
pause
exit /b 1

:falha
echo.
echo FALHA. A publicacao foi interrompida.
echo O .env existente nao foi alterado por este BAT.
pause
exit /b 1
