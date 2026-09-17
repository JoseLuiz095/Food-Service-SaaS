@echo off
setlocal EnableExtensions
cd /d "%~dp0"
cls

echo ============================================================
echo FoodWeb v0.5.0 - Validar e publicar
echo Estabilidade, cobranca e diagnostico
echo ============================================================
echo.
echo Inclui:
echo - Confirmar renovacao / negar renovacao no Admin Master
echo - Centro de pendencias
echo - Diagnostico de interacoes e erros
echo - Auditoria de acoes criticas
echo - Vencimentos de 1 a 31 com ajuste de fim de mes
echo - OCR com worker reaproveitado e campos identificados
echo - Origem dos lancamentos financeiros
echo.
echo O .env atual sera PRESERVADO.
echo.

if not exist "package.json" goto :falha_raiz
if not exist "scripts\v050-check.mjs" goto :falha_raiz
set "HAS_ENV="
if exist ".env" set "HAS_ENV=1"
if exist ".env.local" set "HAS_ENV=1"
if exist ".env.production" set "HAS_ENV=1"
if not defined HAS_ENV goto :falha_env

echo [1/10] Conferindo v0.5.0 e ambiente existente...
call node scripts\v050-check.mjs
if errorlevel 1 goto :falha

echo.
set /p MIGRATION_OK=Migration v0.5.0 executada e VALIDAR_V050.sql sem falhas? [S/N]: 
if /I not "%MIGRATION_OK%"=="S" goto :migration_pendente

echo.
echo [2/10] Validando variaveis publicas existentes...
call npm run check:env
if errorlevel 1 goto :falha

echo.
echo [3/10] Publicando Edge Function de gestao de acesso/auditoria...
if defined SUPABASE_PROJECT_REF (
  call npx supabase@2.116.0 functions deploy food-platform-manage-store-user --project-ref "%SUPABASE_PROJECT_REF%"
) else (
  call npx supabase@2.116.0 functions deploy food-platform-manage-store-user
)
if errorlevel 1 goto :falha_edge

echo.
echo [4/10] Instalando/atualizando dependencias...
call npm install
if errorlevel 1 goto :falha
ECHO OBS: npm warn allow-scripts e apenas aviso se o npm terminar com codigo 0.

echo.
echo [5/10] Smoke test...
call npm run smoke
if errorlevel 1 goto :falha

echo.
echo [6/10] Fluxo critico...
call npm run test:critical
if errorlevel 1 goto :falha

echo.
echo [7/10] TypeScript...
call npm run typecheck
if errorlevel 1 goto :falha

echo.
echo [8/10] Build Vite limpo...
if exist "dist" rmdir /S /Q "dist"
call npx vite build
if errorlevel 1 goto :falha

echo.
echo [9/10] Confirmando favicon FoodWeb v0.5.0...
if not exist "dist\favicon-foodweb-v050.svg" goto :icone_falha
findstr /C:"favicon-foodweb-v050.svg" "dist\index.html" >nul 2>&1
if errorlevel 1 goto :icone_falha

echo.
echo [10/10] Publicando Cloudflare Worker...
call npx wrangler deploy
if errorlevel 1 goto :falha

echo.
echo ============================================================
echo SUCESSO - FoodWeb v0.5.0 publicado
ECHO ============================================================
echo.
echo TESTES RECOMENDADOS:
echo 1. Admin Master ^> Pagamentos: confirme/negue uma renovacao.
echo 2. Admin Master ^> Visao geral: confira Centro de pendencias.
echo 3. Admin Master ^> Diagnostico: confira auditoria e falhas recentes.
echo 4. Admin Master ^> Lojas: teste vencimento 29, 30 ou 31.
echo 5. Admin lojista: confira verde/amarelo/vermelho da mensalidade.
echo 6. Financeiro: leia dois documentos seguidos e confira o OCR mais rapido.
echo 7. Financeiro: confira origem Pedido automatico nos recebimentos.
echo.
echo O .env existente nao foi substituido.
pause
exit /b 0

:migration_pendente
echo.
echo PUBLICACAO INTERROMPIDA.
echo Execute no SQL Editor do Supabase:
echo   supabase\migrations\202609151040_foodweb_v050_stability_billing_audit.sql
echo Depois:
echo   supabase\VALIDAR_V050.sql
pause
exit /b 1

:falha_edge
echo.
echo FALHA ao publicar food-platform-manage-store-user.
echo O frontend NAO foi publicado para evitar versoes inconsistentes.
pause
exit /b 1

:icone_falha
echo.
echo ERRO: build concluido, mas favicon-foodweb-v050.svg nao entrou no dist.
echo Deploy interrompido para nao publicar o icone antigo.
pause
exit /b 1

:falha_raiz
echo ERRO: v0.5.0 nao foi aplicada nesta raiz.
pause
exit /b 1

:falha_env
echo ERRO: nenhum .env existente foi localizado.
echo Este BAT nao cria ou substitui credenciais.
pause
exit /b 1

:falha
echo.
echo ============================================================
echo FALHA - publicacao interrompida antes do deploy final
ECHO ============================================================
echo A etapa que falhou aparece imediatamente acima.
echo O .env existente nao foi alterado.
pause
exit /b 1
