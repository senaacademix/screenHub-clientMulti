@echo off
title Compilando ScreenHub Client
cd /d "%~dp0"

echo ========================================================
echo   Compilando ScreenHub Client Nativo (Cargo Release)
echo ========================================================
echo.

taskkill /F /IM screenhub-client.exe >nul 2>&1

echo Limpiando cache de WebView2 para actualizar interfaz...
rmdir /S /Q "%LOCALAPPDATA%\com.screenhub.kiosk\EBWebView" >nul 2>&1

cargo build --release
if %ERRORLEVEL% NEQ 0 (
    echo Error durante la compilacion.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Copiando ejecutable generado a la raiz del proyecto...
taskkill /F /IM screenhub-client.exe >nul 2>&1
if exist "%~dp0target\release\screenhub-client.exe" (
    copy /Y "%~dp0target\release\screenhub-client.exe" "%~dp0..\screenhub-client.exe" >nul
)

echo ========================================================
echo   Compilacion exitosa.
echo   Ejecutable disponible en: %~dp0..\screenhub-client.exe
echo ========================================================
