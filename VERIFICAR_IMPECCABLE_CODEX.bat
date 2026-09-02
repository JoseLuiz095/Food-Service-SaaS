@echo off
cd /d "%~dp0"
call TESTAR_IMPECCABLE_CODEX.bat
exit /b %errorlevel%
