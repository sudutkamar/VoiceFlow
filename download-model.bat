@echo off
echo ========================================
echo VoiceFlow - Download Whisper Models
echo ========================================
echo.
echo This script will download the Whisper model for VoiceFlow.
echo.
echo Available models:
echo   1. ggml-tiny.bin   (75 MB)  - Fast, lower accuracy
echo   2. ggml-base.bin   (142 MB) - Balanced (recommended)
echo   3. ggml-small.bin  (466 MB) - Better accuracy
echo.
echo Downloading ggml-base.bin (default model)...
echo.

if not exist "resources-whisper-clean\models" mkdir "resources-whisper-clean\models"

curl -L -o "resources-whisper-clean\models\ggml-base.bin" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"

if %errorlevel% equ 0 (
    echo.
    echo Model downloaded successfully!
    echo Location: resources-whisper-clean\models\ggml-base.bin
) else (
    echo.
    echo Failed to download model. Please download manually from:
    echo https://huggingface.co/ggerganov/whisper.cpp/tree/main
)

echo.
pause
