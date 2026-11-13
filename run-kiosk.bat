@echo off
title ScreenHub Client Launcher
cd /d "%~dp0"

echo ========================================================
echo   Iniciando ScreenHub Client Kiosk
echo ========================================================
echo.

set EXE_ROOT=%~dp0screenhub-client.exe
set EXE_LOCAL=%~dp0src-tauri\target\release\screenhub-client.exe

if exist "%EXE_ROOT%" (
    echo Iniciando cliente nativo compilado...
    start "" "%EXE_ROOT%"
    goto END
)

if exist "%EXE_LOCAL%" (
    echo Iniciando cliente nativo compilado desde Target...
    start "" "%EXE_LOCAL%"
    goto END
)

echo Ejecutable nativo no encontrado. Iniciando via Microsoft Edge...
set LOCAL_UI=%~dp0ui\index.html
start "" "msedge.exe" --app="%LOCAL_UI%" --no-first-run --no-default-browser-check --allow-file-access-from-files --autoplay-policy=no-user-gesture-required --disable-features=PreloadMediaEngagementData,AutoplayIgnoreWebAudio --disk-cache-size=2147483648 --media-cache-size=2147483648 --enable-aggressive-domstorage-flushing

:END
echo Cliente iniciado correctamente.
