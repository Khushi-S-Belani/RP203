@echo off
title RP203 Thermal Photo Booth - Prince Tagadiya • The Creato4 Lab
color 0b

echo ========================================================
echo   RP203 Thermal Photo Booth - Windows Plug and Play
echo   Created by Prince Tagadiya • The Creato4 Lab
echo ========================================================
echo.
echo [1/2] Checking Node.js environment...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please download and install Node.js from https://nodejs.org/
    echo Then run this file again.
    pause
    exit /b 1
)

echo [2/2] Launching Photo Booth on http://localhost:8080...
start http://localhost:8080

echo.
echo ========================================================
echo Server running! Keep this window open while using booth.
echo To stop the booth, press Ctrl+C or close this window.
echo ========================================================
echo.

node server.js
pause
