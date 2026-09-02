@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo Food Service SaaS - Teste Impeccable + Codex
 echo ============================================================
echo.

call npm run design:verify
if errorlevel 1 (
  echo.
  echo FALHA: Impeccable/hook nao estao prontos neste projeto.
  echo Execute: INSTALAR_IMPECCABLE_CODEX.bat
  exit /b 1
)

echo.
where codex >nul 2>nul
if errorlevel 1 (
  echo AVISO: Codex CLI nao foi encontrado no PATH deste terminal.
) else (
  echo Codex encontrado:
  call codex --version
)

echo.
echo INSTALACAO LOCAL OK.
echo.
echo No Codex:
echo   1. use /hooks para aprovar o hook, se solicitado;
echo   2. use $impeccable para chamar a skill;
echo   3. para a rodada completa, cole PROMPT_CODEX_IMPECCABLE_COMPLETO.txt.
echo.
echo NAO use /impeccable.
echo ============================================================
exit /b 0
