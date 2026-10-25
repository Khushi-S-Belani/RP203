@echo off
title SnapBooth - RP203 Thermal Photo Booth (Windows Ready)
color 0b

echo ========================================================
echo   SnapBooth - RP203 Thermal Photo Booth (Windows Ready)
echo   Hardware: RP203 / MOD-QC0925 (58mm Thermal Printer)
echo ========================================================
echo.

:: 1. Check Node.js
echo [1/4] Checking Node.js environment...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please download and install Node.js from https://nodejs.org/
    echo Then run this file again.
    pause
    exit /b 1
)
echo    Node.js is ready.

:: 2. Check Python environment
echo.
echo [2/4] Checking Python environment...
where python >nul 2>nul
if %errorlevel% equ 0 (
    echo    Python is ready.
) else (
    echo    [NOTE] Python not found in PATH. Server will run with client-side vision fallback.
)

:: 3. Scan Windows Serial COM Ports
echo.
echo [3/4] Scanning for Thermal Printer COM Ports...
powershell -NoProfile -Command "$ports = [System.IO.Ports.SerialPort]::GetPortNames(); if ($ports.Count -gt 0) { Write-Host '   Detected COM Port(s):' -ForegroundColor Green; foreach ($p in $ports) { Write-Host \"     -> $p\" -ForegroundColor Green } } else { Write-Host '   No COM ports detected yet. If your printer USB is plugged in and not detected,' -ForegroundColor Yellow; Write-Host '   run install_drivers.bat to install the CH340/CH341 USB-to-Serial driver.' -ForegroundColor Yellow }"

:: 4. Launch Application in Browser
echo.
echo [4/4] Launching Photo Booth on http://localhost:8080 ...
start http://localhost:8080

echo.
echo ========================================================
echo Server is running! Keep this console window open.
echo In Chrome / Edge: Click 'Printer Settings' -^> 'Connect'
echo To stop the booth, press Ctrl+C or close this window.
echo ========================================================
echo.

node server.js
pause
