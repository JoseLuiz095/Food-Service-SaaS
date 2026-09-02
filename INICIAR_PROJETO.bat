@echo off
setlocal
cd /d "%~dp0"
title Food Service SaaS - Desenvolvimento

echo ============================================================
echo Food Service SaaS MVP v0.1 - Ambiente de desenvolvimento
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao foi encontrado.
  echo Instale Node.js 22.18.0 ou superior e tente novamente.
  pause
  exit /b 1
)

node -e "const [a,b]=process.versions.node.split('.').map(Number); if(a<22||(a===22&&b<18)){console.error('ERRO: Node '+process.versions.node+'. Requer Node 22.18.0 ou superior.');process.exit(1)}"
if errorlevel 1 (
  pause
  exit /b 1
)

if not exist node_modules\.bin\vite.cmd (
  echo Dependencias nao encontradas. Executando npm install...
  call npm install
  if errorlevel 1 (
    echo.
    echo ERRO ao instalar dependencias.
    pause
    exit /b 1
  )
)

echo.
if exist .env (
  echo Modo: SUPABASE conforme configuracao .env.
) else (
  echo Modo: DEMO LOCAL. Para Supabase, copie .env.example para .env.
)
echo.
echo Loja Demo:   http://localhost:5173/central-food-demo
echo Admin:       http://localhost:5173/admin/login
echo Admin Master:http://localhost:5173/admin-master/login
echo.
echo Demo Admin:
echo Usuario: admin@foodservice.demo
echo Senha:   Food@2026
echo.
echo Pressione Ctrl+C para encerrar.
echo ============================================================
call npm run dev
