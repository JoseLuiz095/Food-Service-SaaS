@echo off
setlocal
cd /d "%~dp0"
cls
echo ============================================================
echo FoodWeb v0.4.2 - Validar e publicar FRONTEND
echo ============================================================
echo.
echo [0/4] Validando configuracao publica...
call npm run check:env
if errorlevel 1 goto :falha
echo.
echo [1/4] Instalando dependencias...
call npm install
if errorlevel 1 goto :falha
echo.
echo [2/4] Validando smoke, fluxo critico, TypeScript e build...
call npm run validate
if errorlevel 1 goto :falha
echo.
echo [3/4] Publicando frontend Cloudflare Worker foodweb...
call npx wrangler deploy
if errorlevel 1 goto :falha
echo.
echo [4/4] Concluido.
echo IMPORTANTE: a landing publica v0.4.2 depende da migration
 echo supabase\migrations\202609021020_foodweb_v042_public_landing.sql
 echo e da publicacao das Edge Functions para o checkout.
echo.
pause
exit /b 0
:falha
echo.
echo FALHA. A publicacao foi interrompida.
pause
exit /b 1
