@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo Food Service SaaS - Instalar Impeccable para Codex
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado.
  echo Instale Node.js 22.18.0 ou superior e execute novamente.
  exit /b 1
)

node -e "const [a,b]=process.versions.node.split('.').map(Number); if(a<22||(a===22&&b<18)){console.error('ERRO: Node '+process.versions.node+'. O Impeccable exige Node 22.18.0 ou superior.');process.exit(1)} console.log('Node OK: '+process.versions.node)"
if errorlevel 1 exit /b 1

echo.
echo Instalando Impeccable CLI 3.6.0 para Codex neste projeto...
echo Comando oficial: impeccable install --providers=codex --scope=project
call npx --yes impeccable@3.6.0 skills install -y --providers=codex --scope=project
if errorlevel 1 (
  echo.
  echo ERRO: a instalacao do Impeccable falhou.
  echo Verifique internet/npm e tente novamente.
  exit /b 1
)

echo.
call npm run design:verify
if errorlevel 1 (
  echo.
  echo ERRO: a instalacao terminou, mas a verificacao local falhou.
  echo Tente: npm run design:update
  exit /b 1
)

echo.
echo ============================================================
echo IMPECCABLE INSTALADO PARA O CODEX
 echo ============================================================
echo 1. Feche e reabra o Codex nesta pasta.
echo 2. No Codex, execute /hooks e aprove o hook do projeto.
echo 3. No Codex, a skill e chamada com: $impeccable
echo 4. Para a passada completa use: RODAR_IMPECCABLE_VISUAL_COMPLETO.bat
echo ============================================================
exit /b 0
