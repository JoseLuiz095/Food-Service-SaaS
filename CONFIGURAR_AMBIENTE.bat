@echo off
setlocal
cd /d "%~dp0"
if not exist .env (
  copy /Y .env.example .env >nul
  echo Arquivo .env criado a partir de .env.example.
) else (
  echo O arquivo .env ja existe. Nenhum valor foi substituido.
)
echo.
echo A URL e a chave PUBLICA do Supabase ja possuem fallback FoodWeb no codigo.
echo Normalmente voce precisa apenas preencher VITE_TURNSTILE_SITE_KEY para o checkout.
echo O TURNSTILE_SECRET_KEY NAO entra neste arquivo; ele fica nos Secrets do Supabase.
echo.
notepad .env
