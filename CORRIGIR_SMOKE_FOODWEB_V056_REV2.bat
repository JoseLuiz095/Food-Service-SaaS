@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo FoodWeb v0.5.6 REV2 - Corrigir smoke
echo ============================================================
echo.

if not exist package.json (
  echo ERRO: coloque estes arquivos na raiz do projeto FoodWeb.
  pause
  exit /b 1
)

if not exist scripts\smoke.mjs (
  echo ERRO: scripts\smoke.mjs nao encontrado.
  pause
  exit /b 1
)

node corrigir_smoke_foodweb_v056_rev2.mjs
if errorlevel 1 (
  echo.
  echo FALHA ao corrigir o smoke.
  pause
  exit /b 1
)

echo.
echo Executando validacao completa...
call npm run validate

echo.
if errorlevel 1 (
  echo VALIDACAO AINDA POSSUI FALHAS.
) else (
  echo VALIDACAO CONCLUIDA COM SUCESSO.
)
echo.
pause
