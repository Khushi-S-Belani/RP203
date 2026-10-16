#!/bin/bash
# Download ViT ONNX Gender Classification Model (~83MB) for SnapBooth Python AI backend
echo "Downloading gender_model.onnx from HuggingFace..."
curl -L -o gender_model.onnx "https://huggingface.co/onnx-community/gender-classification-ONNX/resolve/main/onnx/model_quantized.onnx"
echo "✅ gender_model.onnx downloaded successfully!"
