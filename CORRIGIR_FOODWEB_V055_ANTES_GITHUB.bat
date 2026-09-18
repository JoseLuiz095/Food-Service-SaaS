@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo FoodWeb v0.5.5 - CORRIGIR VERSIONAMENTO DO SMOKE
echo ============================================================
echo Pasta: %CD%
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado no PATH.
  pause
  exit /b 1
)

where powershell >nul 2>&1
if errorlevel 1 (
  echo ERRO: PowerShell nao encontrado no PATH.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo ERRO: package.json nao encontrado.
  echo Execute este BAT na raiz do FoodWeb.
  pause
  exit /b 1
)

if not exist "scripts\smoke.mjs" (
  echo ERRO: scripts\smoke.mjs nao encontrado.
  pause
  exit /b 1
)

echo [1/4] Garantindo versao 0.5.5 no package e package-lock...
call npm version 0.5.5 --no-git-tag-version --allow-same-version
if errorlevel 1 goto :falha

echo.
echo [2/4] Corrigindo somente o check de versao do smoke...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='scripts\smoke.mjs'; $c=[IO.File]::ReadAllText($p); $a=\"ok('Pacote FoodWeb v0.5.4',pkg.name==='foodservice-saas'&&pkg.version==='0.5.4');\"; $b=\"ok('Pacote FoodWeb v0.5.5',pkg.name==='foodservice-saas'&&pkg.version==='0.5.5');\"; if(-not $c.Contains($b)){ if(-not $c.Contains($a)){ Write-Error 'Nao encontrei o check exato do pacote v0.5.4 em scripts/smoke.mjs. Nenhuma substituicao foi feita.'; exit 2 }; $utf8=New-Object System.Text.UTF8Encoding($false); [IO.File]::WriteAllText($p,$c.Replace($a,$b).Replace('Smoke FoodWeb v0.5.4','Smoke FoodWeb v0.5.5'),$utf8) }; exit 0"
if errorlevel 1 goto :falha

echo.
echo [3/4] Conferindo ajuste...
findstr /C:"Pacote FoodWeb v0.5.5" "scripts\smoke.mjs" >nul 2>&1
if errorlevel 1 (
  echo ERRO: smoke ainda nao reconhece o pacote v0.5.5.
  goto :falha
)
findstr /C:"\"version\": \"0.5.5\"" "package.json" >nul 2>&1
if errorlevel 1 (
  echo ERRO: package.json nao ficou em 0.5.5.
  goto :falha
)

echo OK - package.json = 0.5.5
echo OK - smoke espera Pacote FoodWeb v0.5.5

echo.
echo [4/4] Executando validacao completa...
call npm run validate
if errorlevel 1 (
  echo.
  echo A correcao de versao foi aplicada, mas existe outra falha na validacao.
  echo Envie o retorno exibido acima antes de publicar no GitHub.
  goto :falha
)

echo.
echo ============================================================
echo SUCESSO - FoodWeb v0.5.5 validado.
echo ============================================================
echo Agora execute novamente o seu BAT de publicacao do GitHub.
echo Nao e necessario apagar a pasta .git criada na tentativa anterior.
echo ============================================================
pause
exit /b 0

:falha
echo.
echo ============================================================
echo FALHA - processo interrompido com seguranca.
echo Nenhum push para o GitHub foi executado por este BAT.
echo ============================================================
pause
exit /b 1
