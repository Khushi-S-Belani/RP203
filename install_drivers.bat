@echo off
title RP203 Thermal Printer - Windows Driver Setup
color 0b

echo ========================================================
echo   RP203 Thermal Printer - Windows Driver Setup
echo   WCH CH340 / CH341 ^& CP2102 Driver Helper
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_drivers.ps1"

pause
