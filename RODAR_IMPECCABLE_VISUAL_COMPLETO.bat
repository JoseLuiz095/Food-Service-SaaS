@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo Food Service SaaS - Impeccable visual completo
 echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado.
  echo Instale Node 22.18.0 ou superior.
  exit /b 1
)

node -e "const [a,b]=process.versions.node.split('.').map(Number); if(a<22||(a===22&&b<18)){console.error('ERRO: Node '+process.versions.node+'. Requer Node 22.18.0 ou superior.');process.exit(1)} console.log('Node OK: '+process.versions.node)"
if errorlevel 1 exit /b 1

if exist ".agents\skills\impeccable\SKILL.md" (
  echo Impeccable ja existe. Atualizando...
  call npx --yes impeccable@3.6.0 skills update -y
) else (
  echo Instalando Impeccable para Codex neste projeto...
  call npx --yes impeccable@3.6.0 skills install -y --providers=codex --scope=project
)
if errorlevel 1 (
  echo.
  echo ERRO: falha ao instalar/atualizar Impeccable.
  exit /b 1
)

echo.
call npm run design:verify
if errorlevel 1 exit /b 1

echo.
echo Validando contexto do Food Service SaaS para a skill...
call node .agents\skills\impeccable\scripts\context.mjs --target src\App.tsx > .impeccable-context-check.txt 2>&1
if errorlevel 1 (
  echo AVISO: context.mjs retornou erro. Consulte .impeccable-context-check.txt
) else (
  echo Contexto OK: PRODUCT.md + DESIGN.md + surface brief detectados.
)

where clip >nul 2>nul
if not errorlevel 1 (
  type PROMPT_CODEX_IMPECCABLE_COMPLETO.txt | clip
  echo Prompt completo copiado para a area de transferencia.
) else (
  echo AVISO: comando clip nao encontrado. Abra PROMPT_CODEX_IMPECCABLE_COMPLETO.txt manualmente.
)

echo.
echo ============================================================
echo PRONTO PARA O CODEX
 echo ============================================================
echo 1. Abra o Codex nesta pasta.
echo 2. Execute /hooks e aprove o hook Impeccable, se solicitado.
echo 3. Cole o prompt que ja esta na area de transferencia.
echo 4. O prompt inicia com $impeccable polish e revisa TODA a UI.
echo.
echo Nao execute SQL e nao publique Edge Functions nesta etapa.
echo ============================================================
echo.

where codex >nul 2>nul
if not errorlevel 1 (
  echo Codex encontrado no PATH. Abrindo uma nova janela...
  start "Food Service Codex Impeccable" cmd /k "cd /d ""%CD%"" ^&^& codex"
) else (
  echo Codex CLI nao foi encontrado no PATH deste terminal.
  echo Abra o Codex manualmente apontando para esta pasta.
)

exit /b 0
