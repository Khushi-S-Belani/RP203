@echo off
title SnapBooth - Download AI Models
color 0b

echo ========================================================
echo   SnapBooth - Download AI Models for Windows
echo ========================================================
echo.

if exist "gender_model.onnx" (
    echo [OK] gender_model.onnx already exists.
    goto end
)

echo Downloading ViT ONNX Gender Classification Model (~83MB)...
curl.exe -L -o gender_model.onnx "https://huggingface.co/onnx-community/gender-classification-ONNX/resolve/main/onnx/model_quantized.onnx"

if %errorlevel% equ 0 (
    echo.
    echo [SUCCESS] gender_model.onnx downloaded successfully!
) else (
    echo.
    echo [ERROR] Failed to download model. Please check internet connection.
)

:end
echo.
pause
