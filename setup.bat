@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Orbis Browser - Setup
cd /d "%~dp0"

echo ==========================================
echo   Orbis Browser - instalador automatico
echo ==========================================
echo.

rem ---------- 1. Node.js ----------
where node >nul 2>nul
if not errorlevel 1 goto node_found

echo [1/4] Node.js nao encontrado. Instalando via winget...
where winget >nul 2>nul
if errorlevel 1 goto no_winget
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"
where node >nul 2>nul
if errorlevel 1 goto node_restart
goto node_found

:no_winget
echo.
echo O winget nao esta disponivel neste Windows.
echo Instale o Node.js LTS manualmente em https://nodejs.org e execute este arquivo de novo.
start "" "https://nodejs.org/en/download"
goto fail

:node_restart
echo.
echo Node.js foi instalado, mas este terminal ainda nao o reconhece.
echo Feche esta janela e execute o setup.bat novamente.
goto fail

:node_found
for /f "tokens=1 delims=." %%v in ('node -v') do set "NODEMAJOR=%%v"
set "NODEMAJOR=%NODEMAJOR:v=%"
if %NODEMAJOR% LSS 20 goto node_old
echo [1/4] Node.js OK:
node -v
goto step2

:node_old
echo.
echo Seu Node.js e muito antigo. Atualizando via winget...
winget upgrade -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
echo Feche esta janela e execute o setup.bat novamente.
goto fail

rem ---------- 2. Dependencias ----------
:step2
echo.
echo [2/4] Instalando dependencias do projeto (pode demorar alguns minutos)...
call npm install --no-fund --no-audit
if errorlevel 1 goto fail

rem ---------- 3. Instalador ----------
echo.
echo [3/4] Compilando o Orbis e gerando o instalador...
set "CSC_IDENTITY_AUTO_DISCOVERY=false"
if exist release rmdir /s /q release
call npm run dist
if errorlevel 1 goto fail

rem ---------- 4. Executar instalador ----------
set "INSTALLER="
for %%f in ("release\Orbis-Setup-*.exe") do set "INSTALLER=%%~ff"
if not defined INSTALLER goto no_installer

echo.
echo [4/4] Instalador criado:
echo   !INSTALLER!
echo Abrindo o instalador do Orbis...
start "" "!INSTALLER!"
echo.
echo Pronto! Siga as telas do instalador para concluir.
echo Para testar sem instalar, use: npm start
pause
exit /b 0

:no_installer
echo.
echo O instalador nao foi encontrado na pasta release.
goto fail

:fail
echo.
echo ******** O setup nao foi concluido. Veja as mensagens acima. ********
pause
exit /b 1
