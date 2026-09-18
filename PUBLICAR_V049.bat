@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo FoodWeb v0.4.9 - Validar e publicar
echo ============================================================
echo.
echo Esta versao adiciona:
echo - botao Confirmar recebimento nos pedidos
echo - entrada automatica e idempotente no Financeiro
echo - receita baseada no pagamento confirmado, nao na entrega
echo.
echo O .env atual sera preservado.
echo.

if not exist "package.json" goto :falha_raiz
if not exist "scripts\v049-check.mjs" goto :falha_raiz
if not exist ".env" if not exist ".env.production" if not exist ".env.local" goto :falha_env

node scripts\v049-check.mjs
if errorlevel 1 goto :falha

echo.
set /p MIG_OK=Migration v0.4.9 executada e VALIDAR_V049.sql sem falhas? [S/N]: 
if /I not "%MIG_OK%"=="S" (
  echo Publicacao cancelada. Execute a migration antes do frontend.
  pause
  exit /b 1
)

echo.
echo [1/7] Validando variaveis publicas existentes...
call npm run check:env
if errorlevel 1 goto :falha

echo.
echo [2/7] Instalando/atualizando dependencias...
call npm install
if errorlevel 1 goto :falha

echo.
echo [3/7] Smoke test...
call npm run smoke
if errorlevel 1 goto :falha

echo.
echo [4/7] Fluxo critico...
call npm run test:critical
if errorlevel 1 goto :falha

echo.
echo [5/7] TypeScript...
call npm run typecheck
if errorlevel 1 goto :falha

echo.
echo [6/7] Build limpo...
if exist "dist" rmdir /s /q "dist"
call npx vite build
if errorlevel 1 goto :falha

echo.
echo [7/7] Publicando no Cloudflare...
call npx wrangler deploy
if errorlevel 1 goto :falha

echo.
echo ============================================================
echo SUCESSO - FoodWeb v0.4.9 publicado
echo ============================================================
echo.
echo Teste sugerido:
echo 1. Abra Pedidos.
echo 2. Clique Confirmar recebimento em um pedido pendente.
echo 3. Abra Financeiro e confirme a entrada Pedido # correspondente.
echo 4. O status operacional do pedido deve continuar independente.
echo 5. Atualize a pagina e confirme que nao houve duplicidade.
echo.
pause
exit /b 0

:falha_raiz
echo ERRO: v0.4.9 nao foi aplicada nesta raiz.
pause
exit /b 1

:falha_env
echo ERRO: nenhum arquivo .env existente foi localizado.
echo O BAT nao cria nem altera credenciais.
pause
exit /b 1

:falha
echo.
echo ============================================================
echo FALHA - publicacao interrompida antes da conclusao
echo ============================================================
echo O .env existente nao foi alterado por este BAT.
pause
exit /b 1
