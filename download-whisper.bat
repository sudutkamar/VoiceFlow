@echo off
echo ========================================
echo VoiceFlow - Download Whisper Engine
echo ========================================
echo.
echo This script will download whisper-cli.exe + all DLLs
echo (CPU + NVIDIA GPU support)
echo.

if not exist "resources-whisper-clean" mkdir "resources-whisper-clean"

echo Checking for existing whisper-cli.exe...
if exist "resources-whisper-clean\whisper-cli.exe" (
    echo whisper-cli.exe already exists!
    echo.
    set /p REINSTALL="Re-download? (y/N): "
    if /i not "%REINSTALL%"=="y" (
        echo Skipping download.
        goto :done
    )
)

echo.
echo ========================================
echo Download Instructions
echo ========================================
echo.
echo Please download whisper-cli.exe from:
echo.
echo   https://github.com/ggerganov/whisper.cpp/releases
echo.
echo Download these files to resources-whisper-clean\:
echo.
echo REQUIRED (CPU support):
echo   - whisper-cli.exe (or whisper-main.exe)
echo   - whisper.dll
echo   - ggml.dll
echo   - ggml-base.dll
echo   - ggml-cpu-*.dll (all CPU variants)
echo.
echo OPTIONAL (NVIDIA GPU support - for faster transcription):
echo   - ggml-cuda.dll
echo   - cublas64_12.dll
echo   - cublasLt64_12.dll
echo   - cudart64_12.dll
echo.
echo NOTE: GPU DLLs are ~1.1GB but make transcription 5-10x faster!
echo       Without them, the app still works but uses CPU only.
echo.

:done
echo ========================================
echo Done!
echo ========================================
echo.
echo After downloading, run: npm run dev
echo.
pause
